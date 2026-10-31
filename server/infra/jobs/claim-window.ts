import { prisma } from '../database/prismaClient';
import { createLogger } from '../logger/logger';

// A JANELA DE EXECUÇÃO DE UM JOB — o D79 em código.
//
// Infraestrutura: recebe o NOME do job por parâmetro e não sabe o que é uma
// reconciliação ou um expurgo. É por isso que mora em `core`.
//
// O QUE ELA RESOLVE: `setInterval` sozinho não sobrevive a deploy. O
// `zombie-cleaner.job.ts` reinicia o contador a cada `npm start`, e para um job
// que roda a cada minuto isso é inofensivo. Para um que roda UMA VEZ POR
// JANELA (a varredura de reconciliação, de hora em hora), não é: ela roda já no
// boot, e subir o servidor três vezes na mesma hora varreria o parque três
// vezes.
//
// A resposta é o banco, não o relógio do processo: antes de executar, o job
// tenta TOMAR a janela corrente com um `UPDATE` condicional. Um só ganha.

const logger = createLogger('jobs');

/**
 * Tenta tomar a janela atual para este job.
 *
 * O `updateMany` com a condição no `where` é o que torna a operação ATÔMICA:
 * ler `lastRunAt` e decidir depois deixa dois processos (ou duas subidas
 * simultâneas) passarem os dois. Aqui o Postgres resolve — um `UPDATE` que casa
 * devolve `count: 1`, o outro devolve `count: 0`.
 *
 * `count === 0` significa "outro já tomou", e NÃO é erro: é o caminho normal de
 * quem sobe duas vezes na mesma janela.
 *
 * A linha é criada na primeira tentativa. `upsert` não serve aqui — ele não tem
 * como expressar "só atualize se a condição bater", e o `create` dele venceria
 * a corrida sem checar a janela.
 */
export async function tomarJanela(nome: string, inicioDaJanela: Date): Promise<boolean> {
  const agora = new Date();

  const { count } = await prisma.jobRun.updateMany({
    where: {
      name: nome,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: inicioDaJanela } }],
    },
    data: { lastRunAt: agora },
  });

  if (count === 1) return true;

  // `count: 0` tem DUAS causas e só uma delas significa "já rodou": a linha
  // pode simplesmente não existir ainda (primeira execução na vida do sistema).
  const existe = await prisma.jobRun.findUnique({ where: { name: nome }, select: { name: true } });
  if (existe) return false;

  try {
    await prisma.jobRun.create({ data: { name: nome, lastRunAt: agora } });
    return true;
  } catch {
    // Outro processo criou a linha entre o `findUnique` e o `create`. O P2002
    // é a resposta certa: quem criou primeiro ganhou a janela.
    return false;
  }
}

/**
 * Meia-noite de hoje, hora local do PROCESSO.
 *
 * ⚠️ "Hoje" aqui é o dia do SERVIDOR: ele roda em UTC em produção e no fuso de
 * quem desenvolve na máquina local.
 *
 * É a janela do expurgo diário da telemetria (`reconcile.job.ts`). A janela de
 * HORA da reconciliação usa a própria (`inicioDaHora`).
 */
export function inicioDoDia(): Date {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

/**
 * Roda `tarefa` no máximo uma vez por janela.
 *
 * O `catch` é aqui de propósito: job que estoura não pode derrubar o
 * `setInterval` que o chama, senão uma falha transitória (banco reiniciando)
 * desliga o agendamento até o próximo deploy.
 *
 * A janela FICA TOMADA mesmo quando a tarefa falha. É deliberado: a rodada que
 * caiu no meio já fez parte do trabalho, e reexecutá-la na mesma janela (a cada
 * boot) repetiria essa parte. Quem tenta de novo é a próxima janela — na
 * reconciliação, uma hora depois.
 */
export async function executarUmaVezPorJanela(
  nome: string,
  inicioDaJanela: Date,
  tarefa: () => Promise<void>,
): Promise<void> {
  let ganhou = false;
  try {
    ganhou = await tomarJanela(nome, inicioDaJanela);
  } catch (error) {
    logger.error(`[Job] ${nome}: falha ao tomar a janela.`, error);
    return;
  }

  if (!ganhou) return;

  try {
    await tarefa();
  } catch (error) {
    logger.error(`[Job] ${nome}: falhou durante a execução.`, error);
  }
}
