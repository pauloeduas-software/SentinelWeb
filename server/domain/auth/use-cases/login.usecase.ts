import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { conferirSenha, conferirSenhaInexistente, hashSenha, precisaRehash } from '../helpers/password.helper';
import type { ContextoDaRequisicao } from '../helpers/request-context.helper';
import type { SessaoEmitida } from '../auth.types';
import { carregarSessaoParaValidacao } from './current-user.usecase';
import { conferirSegundoFator } from './manage-totp.usecase';
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
  /**
   * O código de seis dígitos do aplicativo autenticador (F11, Etapa H).
   *
   * OPCIONAL NO TIPO porque a maioria das contas não tem segundo fator, e
   * obrigatório na PRÁTICA para quem tem: sem ele, a conta com 2FA ativo recebe
   * 401 com `etapa: 'TOTP'`, que é o que manda a tela pedir o código.
   */
  totp?: string;
  /** Um dos oito códigos de recuperação. Caminho de quem perdeu o celular. */
  recoveryCode?: string;
}

export async function login(
  { username, password, totp, recoveryCode }: LoginInput,
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
      username: true,
      // AS TRÊS COLUNAS DO SEGUNDO FATOR, na consulta que já estava acontecendo
      // (F11, Etapa H). É o mesmo argumento do D136 um nível abaixo: ler o fator
      // à parte dobraria as idas ao banco no caminho do login para buscar duas
      // datas e um array que caberiam neste `select`.
      totpSecret: true,
      totpEnabledAt: true,
      totpRecoveryCodes: true,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // O SEGUNDO FATOR (F11, Etapa H) — depois da senha, e depois do desligamento.
  //
  // A ORDEM É DELIBERADA, e cada vizinho explica um pedaço:
  //
  //   depois da SENHA        — pedir o código antes dela diria "esta conta tem
  //                            2FA" a quem só chutou um nome de usuário. O fator
  //                            é só exigido de quem já provou saber a senha.
  //   depois do DESLIGAMENTO — quem saiu da empresa recebe o 403 de sempre, não
  //                            um pedido de código que ele conseguiria atender.
  //   antes do REHASH        — nada é gravado na linha de quem não completou o
  //                            login. O rehash é um `UPDATE`, e ele é consequência
  //                            de ter entrado.
  //
  // E O 401 CARREGA `etapa: 'TOTP'` no corpo: é o único jeito de a tela saber que
  // deve mostrar o campo do código em vez de dizer "senha inválida" para quem
  // digitou a senha certa. O `AppError` leva `details`, e o error-handler os
  // espalha no corpo — o mesmo caminho do `hwid` do agente offline.
  // ═══════════════════════════════════════════════════════════════════════════
  const fator = await conferirSegundoFator(
    usuario.id,
    {
      totpSecret: usuario.totpSecret,
      totpEnabledAt: usuario.totpEnabledAt,
      totpRecoveryCodes: usuario.totpRecoveryCodes,
    },
    { totp, recoveryCode },
  );

  if (!fator.ok) {
    if (fator.motivo === 'AUSENTE') {
      // NÃO CONTA COMO TENTATIVA ERRADA: a tela pede a senha e o código em dois
      // momentos, e o primeiro envio legítimo de quem tem 2FA chega aqui. Contar
      // isso travaria a conta de quem acertou a senha cinco vezes seguidas.
      await registrarEventoAuth({ type: 'TOTP_REQUIRED', userId: usuario.id, username, ctx });
      throw new AppError(
        'Informe o código do aplicativo autenticador para entrar.',
        401,
        { etapa: 'TOTP' },
      );
    }

    // CÓDIGO ERRADO CONTA NO MESMO CONTADOR DA SENHA, e por isso trava a conta
    // igual. Sem isso, o segundo fator seria o único campo do sistema com
    // tentativa ilimitada — são seis dígitos, e três códigos válidos por vez
    // dentro da janela de ±1 passo. O teto por IP sozinho não fecha a conta de
    // quem já tem a senha.
    const tentativas = usuario.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: usuario.id },
      data: {
        failedLoginCount: tentativas,
        lockedUntil:
          tentativas >= MAX_TENTATIVAS
            ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000)
            : null,
      },
    });
    await registrarEventoAuth({ type: 'TOTP_FAIL', userId: usuario.id, username, ctx });
    // A MESMA `etapa` do caso de cima: a tela continua no passo do código, com a
    // senha que já conferiu. Mandá-la de volta ao começo faria a pessoa digitar a
    // senha outra vez por ter errado o número.
    throw new AppError('Código inválido. Confira o aplicativo e tente novamente.', 401, { etapa: 'TOTP' });
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
      // O CÓDIGO DE RECUPERAÇÃO QUEIMA AQUI, no mesmo `UPDATE` que carimba a
      // entrada — e não dentro de `conferirSegundoFator`. Em dois `update`
      // haveria uma janela entre "o código já não vale" e "a sessão existe": se o
      // segundo falhasse, a pessoa perderia um dos oito códigos sem ter entrado.
      ...(fator.ok && fator.via === 'RECUPERACAO' ? { totpRecoveryCodes: fator.restantes } : {}),
    },
  });

  // Relê pelo `USER_PUBLIC_SELECT`, o mesmo caminho de toda requisição
  // autenticada: o login não pode ter uma allowlist própria, senão é por ela
  // que o `passwordHash` escapa um dia.
  //
  // É `carregarSessaoParaValidacao` e não `carregarUsuarioDaSessao` porque ela
  // traz TAMBÉM a geração da sessão e as permissões, na MESMA consulta (F11).
  // Duas razões:
  //
  // 1. o `tokenVersion` passa a vir da releitura, não da leitura de cima. É o
  //    mesmo número em condições normais, e o certo quando não é: entre as duas
  //    consultas cabe uma redefinição de senha, e assinar o número velho
  //    emitiria um token que a próxima requisição recusaria — login "bem-sucedido"
  //    que não funciona;
  //
  // 2. as permissões chegam na resposta do login. Sem isso o painel se desenha
  //    com o menu completo até a primeira releitura de `/api/auth/me`, e a
  //    pessoa vê por um instante itens que não alcança.
  const sessao = await carregarSessaoParaValidacao(usuario.id);
  if (!sessao) throw new AppError(CREDENCIAL_INVALIDA, 401);

  await registrarEventoAuth({ type: 'LOGIN_OK', userId: usuario.id, username, ctx });

  // E UM SEGUNDO EVENTO quando a entrada foi por código de recuperação. Dois
  // eventos para um login é de propósito: `LOGIN_OK` é a resposta de "ela
  // entrou?", e este é a de "como?" — perder o celular é fato raro, e uma
  // sequência deles na mesma conta é o sinal que ninguém quer descobrir tarde.
  if (fator.ok && fator.via === 'RECUPERACAO') {
    await registrarEventoAuth({ type: 'TOTP_RECOVERY_USED', userId: usuario.id, username, ctx });
  }

  // Os três saem daqui juntos porque quem ASSINA o token é o controller
  // (transporte), e ele não pode ir ao banco buscar o número por conta própria —
  // seria uma segunda leitura, capaz de divergir desta.
  return { usuario: sessao.usuario, tokenVersion: sessao.tokenVersion, permissoes: sessao.permissoes };
}
