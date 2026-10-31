import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
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

/**
 * A falha numa conta que EXISTE (AB). Sem sessão: quem digitou não provou ser a
 * conta, então a linha fica no registro dela com o autor em branco e o número
 * da requisição. E-mail que não existe não grava nada — não há registro.
 */
async function registrarFalha(
  client: Parameters<typeof recordAudit>[0],
  usuario: { id: string; email: string },
  requestId: string,
  changes: { motivo: 'senha' | 'bloqueada' | 'desativada'; tentativas?: number; bloqueadaAte?: string | null },
): Promise<void> {
  await recordAudit(client, {
    entityType: 'User', entityId: usuario.id, entityLabel: usuario.email, action: 'LOGIN_FAILED', changes,
  }, { tipo: 'ANONYMOUS', requestId });
}

/**
 * A tentativa DURANTE o bloqueio, uma vez por bloqueio.
 *
 * Na janela a senha nem é conferida: cada tentativa custaria só uma leitura e
 * uma linha numa tabela que não se apaga, e qualquer um que soubesse o e-mail
 * a encheria. A primeira basta para dizer que alguém insistiu — o bloqueio em
 * si já está na falha que o causou, com `bloqueadaAte`.
 *
 * A conta travada antes de procurar: sem a trava, uma rajada de tentativas
 * simultâneas procuraria toda antes de qualquer uma gravar, e cada uma
 * acharia "ainda não registrada".
 */
async function registrarTentativaBloqueada(usuario: { id: string; email: string }, lockedUntil: Date, requestId: string) {
  const inicioDoBloqueio = new Date(lockedUntil.getTime() - BLOQUEIO_MINUTOS * 60_000);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${usuario.id}::uuid FOR NO KEY UPDATE`;
    const jaRegistrada = await tx.auditLog.findFirst({
      where: {
        entityId: usuario.id,
        action: 'LOGIN_FAILED',
        createdAt: { gte: inicioDoBloqueio },
        changes: { path: ['motivo'], equals: 'bloqueada' },
      },
      select: { id: true },
    });
    if (!jaRegistrada) await registrarFalha(tx, usuario, requestId, { motivo: 'bloqueada' });
  });
}

export async function login(
  { email, password }: LoginInput,
  requestId: string,
): Promise<SessaoEmitida> {
  // O LOGIN É O E-MAIL do cadastro: não existe "nome de usuário" à parte. Quem
  // foi excluído não tem mais linha (W), então não encontra conta para entrar.
  const usuario = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
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
    await registrarTentativaBloqueada(usuario, usuario.lockedUntil, requestId);
    throw new AppError(
      `Conta bloqueada por excesso de tentativas. Tente de novo em até ${BLOQUEIO_MINUTOS} minutos.`,
      423,
    );
  }

  if (!(await conferirSenha(usuario.passwordHash, password))) {
    await prisma.$transaction(async (tx) => {
      // A trava que VENCEU zera a contagem antes de somar: sem isto o contador
      // seguia em 5 e o primeiro erro depois do desbloqueio, o sexto, travava de
      // novo, e assim a cada erro até alguém acertar. A janela recomeça do zero.
      // Condicional no próprio UPDATE, e não um `if` sobre a leitura de cima: ela
      // é de antes do argon2, e na rajada só o primeiro UPDATE vê a trava vencida —
      // os outros a encontram já limpa e não zeram de novo o que o primeiro somou.
      await tx.user.updateMany({
        where: { id: usuario.id, lockedUntil: { lte: new Date() } },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      // `increment`, e não a leitura de cima mais um: ela é de antes do argon2,
      // e vinte tentativas em rajada leriam todas o mesmo número — o contador
      // ficaria em 1, a auditoria diria "1" vinte vezes, e o bloqueio de cinco
      // erros viraria cinco rajadas.
      const { failedLoginCount: tentativas } = await tx.user.update({
        where: { id: usuario.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      // A trava nasce no ERRO que atinge o teto, não na tentativa seguinte:
      // o bloqueio precisa valer para a sexta, não para a sétima.
      const lockedUntil = tentativas >= MAX_TENTATIVAS
        ? new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000)
        : null;
      if (lockedUntil) await tx.user.update({ where: { id: usuario.id }, data: { lockedUntil } });
      await registrarFalha(tx, usuario, requestId, {
        motivo: 'senha', tentativas, bloqueadaAte: lockedUntil?.toISOString() ?? null,
      });
    });
    throw new AppError(CREDENCIAL_INVALIDA, 401);
  }

  // Desativado é diferente de apagado: a pessoa existe, o histórico dela
  // continua, ela só não opera mais. A frase é PRÓPRIA porque quem chegou aqui
  // já provou que sabe a senha — não há nada a enumerar, e "e-mail ou senha
  // inválidos" mandaria essa pessoa procurar um erro de digitação que não há.
  if (!usuario.isActive) {
    await registrarFalha(prisma, usuario, requestId, { motivo: 'desativada' });
    throw new AppError('Acesso desativado. Procure o administrador do sistema.', 403);
  }

  // O REHASH TRANSPARENTE: hash gerado com parâmetros antigos é regravado agora,
  // que é o único momento em que a senha em texto existe legitimamente. Fica
  // FORA do `update` abaixo quando não é preciso — o custo só aparece na
  // primeira entrada de quem tinha hash velho.
  const novoHash = precisaRehash(usuario.passwordHash) ? await hashSenha(password) : undefined;

  // A escrita, a releitura e a linha LOGIN numa transação só: a conta excluída
  // no meio desfaz o acerto inteiro, em vez de deixar o contador zerado sem
  // entrada nenhuma na auditoria.
  const sessao = await prisma.$transaction(async (tx) => {
    // O acerto zera os dois: o contador é de tentativas SEGUIDAS, e uma trava
    // sobrevivente recusaria a próxima entrada de quem acabou de provar quem é.
    await tx.user.update({
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
    const relida = await carregarSessaoParaValidacao(usuario.id, tx);
    if (!relida) throw new AppError(CREDENCIAL_INVALIDA, 401);

    // A entrada provou a senha: aqui a conta é o autor.
    await recordAudit(tx, {
      entityType: 'User', entityId: usuario.id, entityLabel: relida.usuario.email, action: 'LOGIN',
    }, { tipo: 'USER', id: usuario.id, nome: relida.usuario.name, email: relida.usuario.email, requestId });

    return relida;
  });

  // Os três saem daqui juntos porque quem ASSINA o token é o controller
  // (transporte), e ele não pode ir ao banco buscar o número por conta própria —
  // seria uma segunda leitura, capaz de divergir desta.
  return {
    usuario: sessao.usuario,
    tokenVersion: sessao.tokenVersion,
    cargo: sessao.cargo,
    mustChangePassword: sessao.mustChangePassword,
  };
}
