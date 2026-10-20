import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { conferirSenha, conferirSenhaInexistente, hashSenha, precisaRehash } from '../helpers/password.helper';
import type { SessaoEmitida } from '../auth.types';
import { carregarSessaoParaValidacao } from './current-user.usecase';

// O login. Quatro recusas, e três frases.

/**
 * A MESMA mensagem para "esse e-mail não tem conta" e para "a senha está errada".
 *
 * Duas frases diferentes seriam um oráculo de quem trabalha aqui: bastaria
 * varrer e-mails até uma delas mudar. E o mesmo raciocínio vale para quem foi
 * excluído — todos caem aqui.
 */
const CREDENCIAL_INVALIDA = 'E-mail ou senha inválidos.';

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

interface LoginInput {
  email: string;
  password: string;
}

export async function login(
  { email, password }: LoginInput,
): Promise<SessaoEmitida> {
  // O LOGIN É O E-MAIL do cadastro: não existe "nome de usuário" à parte. Quem
  // foi excluído não tem mais linha (W), então não encontra conta para entrar.
  const usuario = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  // Usuário inexistente gasta o mesmo tempo de um argon2 de verdade: sem isto,
  // o caminho dele volta em 1 ms contra os 50 ms do usuário real, e o relógio
  // entrega a lista que a mensagem esconde.
  if (!usuario) {
    await conferirSenhaInexistente(password);
    throw new AppError(CREDENCIAL_INVALIDA, 401);
  }

  // Trava antes de conferir a senha: com a janela aberta, a senha CERTA também
  // é recusada — é isso que faz o bloqueio significar alguma coisa.
  if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
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
    throw new AppError(CREDENCIAL_INVALIDA, 401);
  }

  // Desativado é diferente de apagado: a pessoa existe, o histórico dela
  // continua, ela só não opera mais. A frase é PRÓPRIA porque quem chegou aqui
  // já provou que sabe a senha — não há nada a enumerar, e "e-mail ou senha
  // inválidos" mandaria essa pessoa procurar um erro de digitação que não há.
  if (!usuario.isActive) {
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
      ...(novoHash ? { passwordHash: novoHash } : {}),
    },
  });

  // Relê pelo `USER_PUBLIC_SELECT`, o mesmo caminho de toda requisição
  // autenticada: o login não pode ter uma allowlist própria, senão é por ela
  // que o `passwordHash` escapa um dia.
  //
  // É `carregarSessaoParaValidacao` porque ela traz TAMBÉM a geração da sessão
  // e o cargo, na MESMA consulta. Duas razões:
  //
  // 1. o `tokenVersion` passa a vir da releitura, não da leitura de cima. É o
  //    mesmo número em condições normais, e o certo quando não é: entre as duas
  //    consultas cabe uma redefinição de senha, e assinar o número velho
  //    emitiria um token que a próxima requisição recusaria — login "bem-sucedido"
  //    que não funciona;
  //
  // 2. o cargo chega na resposta do login. Sem isso o painel se desenha com o
  //    menu completo até a primeira releitura de `/api/auth/me`, e a pessoa vê
  //    por um instante itens que não alcança.
  const sessao = await carregarSessaoParaValidacao(usuario.id);
  if (!sessao) throw new AppError(CREDENCIAL_INVALIDA, 401);

  // Os três saem daqui juntos porque quem ASSINA o token é o controller
  // (transporte), e ele não pode ir ao banco buscar o número por conta própria —
  // seria uma segunda leitura, capaz de divergir desta.
  return { usuario: sessao.usuario, tokenVersion: sessao.tokenVersion, cargo: sessao.cargo };
}
