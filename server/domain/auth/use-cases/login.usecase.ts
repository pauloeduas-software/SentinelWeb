import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { conferirSenha, conferirSenhaInexistente, hashSenha, precisaRehash } from '../helpers/password.helper';
import type { ContextoDaRequisicao } from '../helpers/request-context.helper';
import type { SessaoEmitida } from '../auth.types';
import { carregarUsuarioDaSessao } from './current-user.usecase';
import { registrarEventoAuth } from './record-auth-event.usecase';

// O login. Três recusas, e só duas frases.

/**
 * A MESMA mensagem para "esse usuário não existe" e para "a senha está errada".
 *
 * Duas frases diferentes seriam um oráculo de quem trabalha aqui: bastaria
 * varrer nomes até uma delas mudar. E o mesmo raciocínio vale para quem está na
 * lixeira e para quem nunca teve senha — todos caem aqui.
 */
const CREDENCIAL_INVALIDA = 'Usuário ou senha inválidos.';

/**
 * Quantos erros até travar, e por quanto tempo.
 *
 * O bloqueio por conta é uma negação de serviço contra um usuário conhecido:
 * quem sabe o login de alguém trava a conta em cinco tentativas. Por isso a
 * janela é de MINUTOS e o desbloqueio é automático — bloqueio permanente com
 * desbloqueio manual troca um ataque barato por um chamado garantido. Quem
 * segura a varredura em massa é o rate limit por IP da F0, que é a outra metade
 * da defesa.
 */
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

export interface LoginInput {
  username: string;
  password: string;
}

export async function login(
  { username, password }: LoginInput,
  ctx?: ContextoDaRequisicao,
): Promise<SessaoEmitida> {
  // `findFirst`, não `findUnique`: `username` não é @unique no Prisma — a
  // unicidade é índice PARCIAL (`WHERE deletedAt IS NULL`), para um usuário na
  // lixeira não travar o recadastro do mesmo login. O efeito colateral é
  // exatamente o desejado: `findFirst` passa pelo escopo da lixeira, então
  // quem está apagado não encontra conta nenhuma para entrar.
  const usuario = await prisma.user.findFirst({
    where: { username },
    select: {
      id: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  // Usuário inexistente, ou colaborador cadastrado só para RECEBER equipamento
  // (sem `passwordHash`). Os dois gastam o mesmo tempo de um argon2 de verdade:
  // sem isto, o caminho do usuário inexistente volta em 1 ms contra os 50 ms do
  // usuário real, e o relógio entrega a lista que a mensagem esconde.
  //
  // O EVENTO também não distingue os dois: `userId` nulo quando não há conta é
  // o fato, mas o TIPO é o mesmo `LOGIN_FAIL` da senha errada. Registrar
  // "usuário não existe" separado seria construir dentro de casa o oráculo de
  // enumeração que a resposta HTTP esconde.
  if (!usuario?.passwordHash) {
    await conferirSenhaInexistente(password);
    await registrarEventoAuth({ type: 'LOGIN_FAIL', userId: usuario?.id, username, ctx });
    throw new AppError(CREDENCIAL_INVALIDA, 401);
  }

  // Trava antes de conferir a senha: com a janela aberta, a senha CERTA também
  // é recusada — é isso que faz o bloqueio significar alguma coisa.
  if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
    await registrarEventoAuth({ type: 'LOGIN_BLOCKED', userId: usuario.id, username, ctx });
    throw new AppError(
      `Conta bloqueada por excesso de tentativas. Tente de novo em até ${BLOQUEIO_MINUTOS} minutos.`,
      423,
    );
  }

  if (!(await conferirSenha(usuario.passwordHash, password))) {
    const tentativas = usuario.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: usuario.id },
      data: {
        failedLoginCount: tentativas,
        // A trava nasce no ERRO que atinge o teto, não na tentativa seguinte:
        // o bloqueio precisa valer para a sexta, não para a sétima.
        lockedUntil:
          tentativas >= MAX_TENTATIVAS
            ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000)
            : null,
      },
    });
    await registrarEventoAuth({ type: 'LOGIN_FAIL', userId: usuario.id, username, ctx });
    throw new AppError(CREDENCIAL_INVALIDA, 401);
  }

  // Desligado (F11) é diferente de apagado: a pessoa existe, o histórico dela
  // continua, ela só não opera mais. A frase é PRÓPRIA porque quem chegou aqui
  // já provou que sabe a senha — não há nada a enumerar, e "usuário ou senha
  // inválidos" mandaria essa pessoa procurar um erro de digitação que não há.
  //
  // O evento tem tipo PRÓPRIO pelo mesmo motivo: alguém que saiu da empresa
  // ainda sabendo a senha e ainda tentando entrar é um fato que merece ser
  // visto, não mais uma falha no meio das outras.
  if (!usuario.isActive) {
    await registrarEventoAuth({ type: 'LOGIN_DISABLED', userId: usuario.id, username, ctx });
    throw new AppError('Acesso desativado. Procure o administrador do sistema.', 403);
  }

  // O REHASH TRANSPARENTE: hash gerado com parâmetros antigos é regravado agora,
  // que é o único momento em que a senha em texto existe legitimamente. Fica
  // FORA do `update` abaixo quando não é preciso — o custo só aparece na
  // primeira entrada de quem tinha hash velho.
  const novoHash = precisaRehash(usuario.passwordHash) ? await hashSenha(password) : undefined;

  // O acerto zera os dois: o contador é de tentativas SEGUIDAS, e uma trava
  // sobrevivente recusaria a próxima entrada de quem acabou de provar quem é.
  await prisma.user.update({
    where: { id: usuario.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(novoHash ? { passwordHash: novoHash } : {}),
    },
  });

  // Relê pelo `USER_PUBLIC_SELECT`, o mesmo caminho do `/api/auth/me`: o login
  // não pode ter uma allowlist própria, senão é por ela que o `passwordHash`
  // escapa um dia.
  const sessao = await carregarUsuarioDaSessao(usuario.id);
  if (!sessao) throw new AppError(CREDENCIAL_INVALIDA, 401);

  await registrarEventoAuth({ type: 'LOGIN_OK', userId: usuario.id, username, ctx });

  // O `tokenVersion` sai daqui junto com o usuário porque quem ASSINA o token é
  // o controller (transporte), e ele não pode ir ao banco buscar o número por
  // conta própria — seria uma segunda leitura, capaz de divergir desta.
  return { usuario: sessao, tokenVersion: usuario.tokenVersion };
}
