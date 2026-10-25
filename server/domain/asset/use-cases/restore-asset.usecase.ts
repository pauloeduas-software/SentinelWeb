import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { ativoDoPosto, jaTemAtivo } from '../../workstation/helpers/ativo-do-posto.helper';
import { ASSET_WRITE_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

export async function restoreAsset(id: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    // A trava ANTES de ler: sem ela, um duplo clique restaurava duas vezes e o
    // histórico ganhava dois RESTORE para um fato só. A trava é sobre a LINHA
    // e não filtra a lixeira (`lock-asset.usecase.ts`).
    await travarAtivoOuFalhar(tx, id);

    const naLixeira = await tx.asset.findFirst({
      where: { id, deletedAt: { not: null } },
      select: {
        assetTag: true,
        serial: true,
        // A pergunta da porta abaixo: o ativo está entregue a um posto?
        assignments: {
          where: { checkinAt: null, targetWorkstationId: { not: null } },
          select: { targetWorkstationId: true },
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

    // A PORTA DA RESTAURAÇÃO na invariante 19 — no máximo um ativo por posto.
    //
    // O `delete-asset` só carimba `deletedAt`: a posse aberta FICA, e as outras
    // porta (a entrega) a ignora de propósito, porque um ativo que
    // nenhuma tela mostra não pode trancar a mesa. É isso que abre o caminho:
    // entregue o ativo A à mesa, mande A para a lixeira, entregue B — e restaure
    // A. Sem esta guarda a mesa ficava com dois ativos sem nenhuma porta
    // ter sido consultada, e a ficha do posto era quem avisava, depois.
    //
    // Mesma frase e mesmo helper da porta de entrega, inclusive a trava: o
    // helper tranca o ativo e depois o posto, que é a ordem do grafo
    // (`lock-asset.usecase.ts`), e a trava do ativo não filtra a lixeira — é
    // sobre a LINHA, e a linha existe.
    const postoAtual = naLixeira.assignments[0]?.targetWorkstationId;
    if (postoAtual) {
      const ocupante = await ativoDoPosto(tx, postoAtual, id);
      if (ocupante) throw new AppError(jaTemAtivo(ocupante), 409);
    }

    const { count } = await tx.asset.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    if (count === 0) throw new AppError('Ativo não está na lixeira.', 404);
    await recordAudit(tx, { entityType: 'Asset', entityId: id, entityLabel: naLixeira.assetTag, action: 'RESTORE' }, ator);

    return tx.asset.findFirstOrThrow({ where: { id }, select: ASSET_WRITE_SELECT });
  });
}
