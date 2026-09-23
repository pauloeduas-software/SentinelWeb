import type { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import { diaEmPortugues } from '../helpers/asset-dates.helper';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertSemPosseParaDescomissionar } from './assert-retire-posse.usecase';

// DESCOMISSIONAR — o ativo saiu do PATRIMÔNIO: foi vendido, descartado, doado,
// extraviado, roubado ou trocado em garantia.
//
// NÃO é arquivar e NÃO é apagar. São três colunas, três perguntas e nenhuma
// substitui a outra (D19, docs/FASE-2-PLANO-ITAM.md):
//
//   `status.type = ARCHIVED`  saiu da OPERAÇÃO   — classificação, reversível
//   `retiredAt`               saiu do PATRIMÔNIO — fato datado, contábil
//   `deletedAt`               foi cadastrado ERRADO — lixeira
//
// Por isso esta operação NÃO mexe no status. Quem vende um notebook pode querer
// arquivá-lo também, e é uma segunda decisão, com uma segunda linha no
// histórico — encadear as duas aqui tiraria do operador a escolha e esconderia
// metade do que aconteceu.

export interface RetireAssetData {
  retiredReason: $Enums.RetiredReason;
  /** Ausente = agora. A saída pode ter acontecido antes de alguém registrar. */
  retiredAt?: Date | null;
  /** A justificativa. Vai para o `ActivityLog`, não para a tabela — ver abaixo. */
  notes?: string | null;
}

export async function retireAsset(id: string, data: RetireAssetData, actorId: string | null = null) {
  // Transação porque são duas escritas que descrevem o MESMO fato: o ativo
  // descomissionado e a linha de histórico que diz por quê. Uma sem a outra é
  // um equipamento que sumiu do inventário sem explicação.
  return prisma.$transaction(async (tx) => {
    const antes = await tx.asset.findFirst({
      where: { id },
      select: { id: true, assetTag: true, retiredAt: true, retiredReason: true },
    });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // Descomissionar duas vezes reescreveria a data da primeira saída — e é a
    // data que o relatório de depreciação (F8) usa para parar de contar.
    if (antes.retiredAt) {
      throw new AppError(
        `${antes.assetTag} já foi descomissionado em ${diaEmPortugues(antes.retiredAt)}.`,
        409,
        { retiredAt: antes.retiredAt.toISOString(), retiredReason: antes.retiredReason },
      );
    }

    // A amarra da etapa: ativo entregue não sai do patrimônio. DENTRO da
    // transação porque lê a posse aberta — fora dela, um checkout concorrente
    // entre a checagem e o UPDATE passaria.
    await assertSemPosseParaDescomissionar(tx, id, antes.assetTag);

    const retiredAt = data.retiredAt ?? new Date();

    const depois = await tx.asset.update({
      where: { id },
      data: { retiredAt, retiredReason: data.retiredReason },
      select: ASSET_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: id,
      action: 'RETIRE',
      changes: {
        ...buildChanges(antes, depois, ['retiredAt', 'retiredReason']),
        // A justificativa NÃO vira coluna: ela descreve o EVENTO, não o ativo.
        // No `changes` ela fica presa à linha do histórico que a explica e
        // aparece na aba Histórico; numa coluna `retiredNotes`, um segundo
        // descomissionamento a sobrescreveria (D18 — uma trilha só).
        ...(data.notes ? { notes: data.notes } : {}),
      },
    }, actorId);

    return depois;
  });
}
