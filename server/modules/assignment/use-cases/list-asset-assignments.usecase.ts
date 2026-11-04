import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import { ocupantesDoPeriodo } from '../helpers/ocupantes-do-periodo.helper';
import { PERSON_PUBLIC_SELECT } from '../../person/helpers/person-select.helper';

/**
 * O histórico de posse de UM ativo — aberta e fechadas, mais recente primeiro.
 *
 * Devolve ARRAY, e não o envelope `{ total, rows }` das listagens: não é uma
 * grade paginada, é a linha do tempo de um ativo, e ela é curta por natureza
 * (uma linha por entrega na vida do equipamento). Paginar aqui obrigaria a tela
 * a ter controle de página para mostrar três itens.
 *
 * Confere o ativo antes de listar porque array vazio responde a duas perguntas
 * diferentes — "nunca foi entregue" e "esse id não existe" — e quem chama
 * precisa distinguir as duas.
 */
export async function listAssetAssignments(assetId: string) {
  // `findFirst` pelo escopo da lixeira: o histórico do ativo apagado só volta
  // com ele, pela restauração.
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  return prisma.assignment.findMany({
    where: { assetId },
    select: ASSIGNMENT_SELECT,
    // `createdAt` como desempate: entre entregas com o MESMO `checkoutAt`, sem
    // o segundo critério o Postgres não promete ordem nenhuma — a lista
    // trocaria de ordem entre dois refreshes iguais.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * O mesmo histórico, e em cada entrega a um posto quem o ocupou naquele
 * período (AW) — é o que a aba Posse mostra. Separado do de cima porque o
 * histórico do ativo (`asset-history.usecase.ts`) lê as posses e não usa os
 * ocupantes: seria uma consulta a mais em cada abertura da aba Histórico.
 */
export async function listAssetAssignmentsWithOccupants(assetId: string) {
  const posses = await listAssetAssignments(assetId);

  // QUEM OCUPOU O POSTO EM CADA ENTREGA (AW), inclusive na aberta: uma mesa de
  // dois anos troca de gente no meio. Uma consulta para todos os postos do
  // histórico, e não uma por linha; o posto excluído entra pelo id que a
  // exclusão guardou (`workstationSpec.beforeDelete`), nunca pelo nome.
  const postos = [...new Set(
    posses.flatMap((posse) => posse.targetWorkstationId ?? posse.targetWorkstationFormerId ?? []),
  )];
  const ocupacoes = postos.length === 0 ? [] : await prisma.workstationOccupant.findMany({
    where: { OR: [{ workstationId: { in: postos } }, { workstationFormerId: { in: postos } }] },
    select: {
      id: true, workstationId: true, workstationFormerId: true, shift: true, startedAt: true, endedAt: true,
      person: { select: PERSON_PUBLIC_SELECT },
    },
    // A ordem da escala, como a de quem responde hoje: turno, depois antiguidade.
    orderBy: [{ shift: 'asc' }, { startedAt: 'asc' }],
  });

  return posses.map((posse) => ({ ...posse, ocupantesDoPeriodo: ocupantesDoPeriodo(posse, ocupacoes) }));
}
