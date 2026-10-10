import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { computadorDoPosto, jaTemComputador } from '../../workstation/helpers/computador-do-posto.helper';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';

export async function restoreAsset(id: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const naLixeira = await tx.asset.findFirst({
      where: { id, deletedAt: { not: null } },
      select: {
        assetTag: true,
        serial: true,
        // Os dois lados da pergunta da quarta porta, abaixo: o ativo é
        // computador, e está entregue a um posto?
        endpoint: { select: { id: true } },
        assignments: {
          where: { checkinAt: null, targetLocationId: { not: null } },
          select: { targetLocationId: true },
        },
      },
    });

    if (!naLixeira) throw new AppError('Ativo não está na lixeira.', 404);

    // O índice único é PARCIAL (só entre os vivos), então a etiqueta pode ter
    // sido reaproveitada enquanto este ativo estava na lixeira. Restaurar às
    // cegas estouraria uma violação de unicidade crua vinda do banco.
    await assertEtiquetaESerieLivres(tx, {
      assetTag: naLixeira.assetTag,
      serial: naLixeira.serial,
      ignorarId: id,
    });

    // A QUARTA PORTA DA INVARIANTE 19 — no máximo um computador por posto.
    //
    // O `delete-asset` só carimba `deletedAt`: a posse aberta FICA, e as três
    // outras portas (entrega, vínculo e marca) a ignoram de propósito, porque um
    // ativo que nenhuma tela mostra não pode trancar a mesa. É isso que abre o
    // caminho: entregue o computador A à mesa, mande A para a lixeira, entregue
    // B — e restaure A. Sem esta guarda a mesa marcada ficava com dois
    // computadores sem nenhuma porta ter sido consultada, e a ficha do posto
    // era quem avisava, depois.
    //
    // Mesma frase e mesmo helper das portas de entrega e vínculo, inclusive a
    // trava: o helper tranca o ativo e depois o posto, que é a ordem do grafo
    // (`lock-asset.usecase.ts`), e a trava do ativo não filtra a lixeira — é
    // sobre a LINHA, e a linha existe.
    const postoAtual = naLixeira.assignments[0]?.targetLocationId;
    if (naLixeira.endpoint && postoAtual) {
      const ocupante = await computadorDoPosto(tx, postoAtual, id);
      if (ocupante) throw new AppError(jaTemComputador(ocupante), 409, { assetId: ocupante.id });
    }

    await tx.asset.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'RESTORE' }, actorId);

    return tx.asset.findFirstOrThrow({ where: { id }, select: ASSET_SELECT });
  });
}
