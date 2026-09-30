import { prisma } from '../../../core/database/prismaClient';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import {
  MAINTENANCE_AUDITED, MAINTENANCE_SELECT, paraResposta,
  type LinhaDeManutencao, type ManutencaoNaResposta,
} from '../helpers/maintenance-select.helper';
import type { CreateMaintenanceData } from '../schemas/maintenance.schema';
import {
  assertAtivoDaManutencao, assertDatasDaManutencao, assertFornecedorDaManutencao,
} from './assert-maintenance-references.usecase';

/**
 * ABRE UMA MANUTENÇÃO — e NÃO MEXE NO STATUS DO ATIVO.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ABRIR MANUTENÇÃO NÃO É TIRAR O EQUIPAMENTO DO CHÃO.
 *
 * Um contrato de `SUPORTE` anual e um `UPGRADE` agendado para o mês que vem são
 * manutenções que não tiram nada de ninguém: a máquina continua na mesa, com a
 * mesma pessoa, no mesmo status. Mudar `statusId` aqui faria a lista de "Pronto
 * p/ Uso" encolher porque alguém cadastrou um contrato — e a operação erraria
 * sozinha, sem ninguém ter pedido.
 *
 * Quem quiser o ativo em Manutenção troca o `StatusLabel` pela tela de sempre,
 * que é uma ação com autor, diff e linha no histórico. São dois fatos, e são
 * dois cliques de propósito.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * VÁRIAS ABERTAS POR ATIVO CONVIVEM: não há índice parcial nem 409 aqui. É a
 * simetria invertida de `assignments_um_aberto_por_ativo`, onde a unicidade É a
 * regra.
 */
export async function createMaintenance(
  assetId: string,
  data: CreateMaintenanceData,
  actorId: string | null,
): Promise<ManutencaoNaResposta> {
  const criada = await prisma.$transaction(async (tx) => {
    await assertAtivoDaManutencao(tx, assetId);
    await assertFornecedorDaManutencao(tx, data.supplierId);
    assertDatasDaManutencao(data.startDate, data.completionDate);

    const manutencao = await tx.maintenance.create({
      data: { ...data, assetId, createdById: actorId, updatedById: actorId },
      select: MAINTENANCE_SELECT,
    }) as LinhaDeManutencao;

    // DUAS LINHAS DE LOG, e nenhuma é cópia da outra (ver o comentário do
    // `INSTALL` em record-activity): esta responde "o que mudou nesta
    // manutenção"...
    await recordActivity(tx, {
      entityType: 'Maintenance',
      entityId: manutencao.id,
      action: 'CREATE',
      changes: buildSnapshot(manutencao, MAINTENANCE_AUDITED),
    }, actorId);

    // ...e esta responde "o que aconteceu com este ativo", que é a pergunta da
    // aba Histórico — a única tela que alguém abre para saber disso.
    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: assetId,
      action: 'SERVICE',
      changes: { maintenanceId: manutencao.id, type: data.type, title: data.title },
    }, actorId);

    return manutencao;
  });

  return paraResposta(criada);
}
