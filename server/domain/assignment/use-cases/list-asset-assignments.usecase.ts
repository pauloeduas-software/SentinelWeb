import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';

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
    // `createdAt` como desempate: numa carga inicial várias entregas nascem com
    // o MESMO `checkoutAt` (a data que veio da planilha), e sem o segundo
    // critério o Postgres não promete ordem nenhuma entre elas — a lista
    // trocaria de ordem entre dois refreshes iguais.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }],
  });
}
