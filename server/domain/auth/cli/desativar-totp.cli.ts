import { pathToFileURL } from 'node:url';
import { prisma, closeDatabase } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { registrarEventoAuth } from '../use-cases/record-auth-event.usecase';

// O DESTRAVAMENTO DO SEGUNDO FATOR — comando de linha, nunca rota (F11, Etapa H).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ISTO NÃO É UM BOTÃO NA TELA DE PESSOAS.
//
// Uma rota de "desligar o 2FA de outra pessoa" é a porta que o 2FA veio fechar:
// bastaria comprometer uma conta com `access.manage` para esvaziar o segundo
// fator de todo mundo, e quem fizesse isso usaria a tela que existe para o
// suporte. Com o destravamento aqui, quem o executa precisa de acesso ao SERVIDOR
// e à `DATABASE_URL` — um conjunto de pessoas muito menor, e que não se alcança
// por sessão roubada nem por XSS.
//
// É a mesma forma do `prisma/seed.ts`: um arquivo que só age quando é o PONTO DE
// ENTRADA. Importado como módulo, ele não faz nada — então um teste que o importe
// não apaga o segundo fator de ninguém.
//
// USO:
//   npm run totp:desativar -- maria.silva
//   npm run totp:desativar -- maria@empresa.com
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('cli:totp');

/**
 * Apaga as três colunas do segundo fator de quem casar com o identificador.
 *
 * `username` OU `email`, e não um uuid: quem roda isto está atendendo um chamado
 * ("perdi o celular"), e o que essa pessoa sabe dizer é o nome de acesso ou o
 * e-mail — não o id interno dela. Procurar pelos dois num `OR` evita a pergunta
 * "qual dos dois você quer?" num comando de emergência.
 */
export async function desativarTotpPorIdentificador(identificador: string): Promise<void> {
  const alvo = identificador.trim().toLowerCase();

  const pessoa = await prisma.user.findFirst({
    where: { OR: [{ username: alvo }, { email: alvo }] },
    select: { id: true, name: true, username: true, email: true, totpEnabledAt: true },
  });

  if (!pessoa) {
    throw new Error(
      `Nenhum colaborador com nome de acesso ou e-mail "${identificador}". `
      + 'Confira em Usuários — e lembre que quem está na lixeira não é encontrado.',
    );
  }

  if (!pessoa.totpEnabledAt) {
    // NÃO é erro: o estado desejado já é o atual. Sair com 0 é o que permite
    // rodar o comando duas vezes num chamado confuso sem parecer que falhou.
    logger.info(`[TOTP] ${pessoa.name} não tem segundo fator ativo. Nada a fazer.`);
    return;
  }

  await prisma.user.update({
    where: { id: pessoa.id },
    // AS TRÊS JUNTAS, como no `desativarTotp` da rota: deixar os códigos de
    // recuperação para trás guardaria credencial válida de um mecanismo desligado.
    data: { totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
  });

  // O EVENTO FICA NA TRILHA, e sem `ip`/`userAgent` — não houve requisição. É
  // justamente essa ausência que identifica a operação como feita no servidor:
  // um `TOTP_DISABLED` sem IP é o destravamento manual, e ele tem de ser
  // distinguível do dia em que a própria pessoa desativou pela tela.
  await registrarEventoAuth({
    type: 'TOTP_DISABLED',
    userId: pessoa.id,
    username: pessoa.username,
  });

  logger.warn(
    `[TOTP] Segundo fator DESATIVADO para ${pessoa.name} (${pessoa.username ?? pessoa.email}). `
    + 'Peça que ela cadastre outro aplicativo no primeiro acesso.',
  );
}

const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  const identificador = process.argv[2];

  if (!identificador) {
    logger.error('[TOTP] Uso: npm run totp:desativar -- <nome-de-acesso|e-mail>');
    process.exitCode = 1;
  } else {
    desativarTotpPorIdentificador(identificador)
      .catch((erro: unknown) => {
        logger.error(`[TOTP] ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exitCode = 1;
      })
      .finally(closeDatabase);
  }
}
