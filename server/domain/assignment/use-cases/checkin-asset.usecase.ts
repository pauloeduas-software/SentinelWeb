import { prisma } from '../../../core/database/prismaClient';
import { avisarDevolucao, dispararAviso } from '../helpers/notificacao.helper';
import { rotuloDoAlvoOuPadrao } from '../helpers/target-label.helper';
import { AppError } from '../../../core/errors/app-error';
import { assertStatusExiste, escolherStatusPorTipo } from './checkout-asset.usecase';
import { fecharPosse } from './close-assignment.usecase';

// A DEVOLUÇÃO — o fechamento da posse aberta.
//
// APPEND-ONLY: fechar é preencher `checkinAt`, NUNCA apagar a linha. "Quem
// estava com este notebook em março?" só continua respondível enquanto a
// entrega devolvida seguir na tabela — e é essa pergunta que transforma o
// inventário em prova, num inquérito trabalhista ou num sinistro.

export interface CheckinData {
  statusId?: string | null;
  checkinNotes?: string | null;
}

export async function checkinAsset(assetId: string, data: CheckinData, actorId: string | null) {
  const resultado = await executarCheckin(assetId, data, actorId);

  // DEPOIS do commit, como na entrega. Aqui o destinatário é quem DEIXOU de
  // responder pelo equipamento — a posse já está fechada quando o e-mail sai, e
  // é por isso que os destinatários saem da `assignment` devolvida e não de uma
  // consulta nova: uma consulta agora não acharia mais ninguém.
  dispararAviso(avisarDevolucao({
    assetId,
    assetTag: resultado.asset.assetTag,
    assetName: resultado.asset.name,
    targetType: resultado.assignment.targetType,
    targetUserId: resultado.assignment.targetUserId,
    targetLocationId: resultado.assignment.targetLocationId,
    targetLabel: rotuloDoAlvoOuPadrao(resultado.assignment),
    notes: resultado.assignment.checkinNotes,
    expectedCheckinAt: null,
  }));

  return resultado;
}

async function executarCheckin(assetId: string, data: CheckinData, actorId: string | null) {
  // Transação pelo mesmo motivo da entrega: `assignments`, `assets` e
  // `activity_logs` descrevem UM evento. Uma posse fechada com o ativo ainda
  // apontando para o responsável é o equipamento devolvido que continua
  // contando como "com a Laura" em todo relatório.
  return prisma.$transaction(async (tx) => {
    // `findFirst` pelo escopo da lixeira. Ativo apagado precisa ser restaurado
    // antes — devolver o que saiu do inventário escreveria histórico em cima de
    // uma linha que nenhuma tela mais enxerga.
    const ativo = await tx.asset.findFirst({
      where: { id: assetId },
      select: { id: true, statusId: true },
    });
    if (!ativo) throw new AppError('Registro não encontrado', 404);

    const aberta = await tx.assignment.findFirst({
      where: { assetId, checkinAt: null },
      select: { id: true, targetType: true },
    });
    // 409 e não 404: o ativo existe, quem não existe é a posse — é conflito de
    // estado, e a mesma família do "já está entregue" da outra ponta.
    if (!aberta) throw new AppError('Este ativo não está entregue.', 409);

    if (data.statusId) await assertStatusExiste(tx, data.statusId);
    // Sem escolha explícita, o equipamento volta para o estoque. O caminho
    // anormal — voltou quebrado, foi direto para a assistência — é que merece o
    // `statusId` no corpo, e a tela de devolução oferece a lista.
    const statusId = data.statusId ?? (await escolherStatusPorTipo(tx, 'DEPLOYABLE', 'Disponível'));

    // As três escritas da devolução (fechar a posse, mexer no ativo, gravar o
    // log) moram em `fecharPosse` porque o desligamento (D32) fecha N posses de
    // uma pessoa com exatamente a mesma mecânica — e uma segunda cópia delas
    // divergiria no primeiro ajuste.
    return fecharPosse(
      tx,
      { id: aberta.id, assetId, targetType: aberta.targetType, statusAnteriorId: ativo.statusId },
      { statusId, checkinNotes: data.checkinNotes },
      actorId,
    );
  });
}
