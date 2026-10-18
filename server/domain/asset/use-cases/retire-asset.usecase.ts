import type { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import { diaEmPortugues } from '../helpers/asset-dates.helper';
import { ASSET_WRITE_SELECT } from '../helpers/asset-select.helper';
import { assertSemPosseParaBaixa } from './assert-retire-posse.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';
import { contarAssentosDoAtivo } from '../../license/use-cases/count-user-seats.usecase';

// DAR BAIXA — o ativo saiu do PATRIMÔNIO: foi vendido, descartado, doado,
// extraviado, roubado ou trocado em garantia.
//
// NÃO é apagar. São duas colunas, duas perguntas, e uma não substitui a outra
// (D19, docs/historico/fase-02-ativos.md):
//
//   `retiredAt`  saiu do PATRIMÔNIO — fato datado, contábil
//   `deletedAt`  foi cadastrado ERRADO — lixeira
//
// Esta operação NÃO mexe no status: o status diz em que estado o equipamento
// estava quando saiu, e trocá-lo é uma segunda decisão, com linha própria no
// histórico.

interface RetireAssetData {
  retiredReason: $Enums.RetiredReason;
  /** Ausente = agora. A saída pode ter acontecido antes de alguém registrar. */
  retiredAt?: Date | null;
  /** A justificativa. Vai para o `ActivityLog`, não para a tabela — ver abaixo. */
  notes?: string | null;
}

export async function retireAsset(id: string, data: RetireAssetData, actorId: string | null = null) {
  // Transação porque são duas escritas que descrevem o MESMO fato: o ativo
  // baixado e a linha de histórico que diz por quê. Uma sem a outra é
  // um equipamento que sumiu do inventário sem explicação.
  return prisma.$transaction(async (tx) => {
    // A TRAVA DO ATIVO, antes de qualquer leitura — a mesma da entrega e da
    // edição (`lock-asset.usecase.ts`). Sem ela, a baixa e uma entrega
    // simultânea liam as duas "sem posse" e "sem baixa", e o ativo terminava
    // vendido E entregue a alguém.
    await travarAtivoOuFalhar(tx, id);

    const antes = await tx.asset.findFirst({
      where: { id },
      select: { id: true, assetTag: true, retiredAt: true, retiredReason: true },
    });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // Dar baixa duas vezes reescreveria a data da primeira saída — e é a
    // data em que o ativo parou de ser patrimônio.
    if (antes.retiredAt) {
      throw new AppError(
        `${antes.assetTag} já teve baixa em ${diaEmPortugues(antes.retiredAt)}.`,
        409,
      );
    }

    // A amarra da etapa: ativo entregue não sai do patrimônio. Com o ativo já
    // travado, a entrega simultânea espera esta transação terminar.
    await assertSemPosseParaBaixa(tx, id, antes.assetTag);

    // E o ASSENTO DE LICENÇA, pelo mesmo motivo da exclusão (`delete-asset`): o
    // assento continuaria descontado do contrato, preso a uma máquina vendida —
    // e a entrega de assento já recusa o baixado (`checkout-seat`), então ele
    // nunca mais sairia por um caminho normal.
    const assentos = await contarAssentosDoAtivo(tx, id);
    if (assentos > 0) {
      throw new AppError(
        `${antes.assetTag} ainda ocupa ${assentos} ${assentos === 1 ? 'assento' : 'assentos'} de licença. `
        + 'Devolva os assentos pela aba Licenças antes de dar baixa.',
        409,
      );
    }

    const retiredAt = data.retiredAt ?? new Date();

    const depois = await tx.asset.update({
      where: { id },
      data: { retiredAt, retiredReason: data.retiredReason },
      select: ASSET_WRITE_SELECT,
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
        // baixa a sobrescreveria (D18 — uma trilha só). Chave `observacao`, e
        // não `notes`: na tela, `notes` é o rótulo "Notas" das notas do ATIVO.
        ...(data.notes ? { observacao: data.notes } : {}),
      },
    }, actorId);

    return depois;
  });
}
