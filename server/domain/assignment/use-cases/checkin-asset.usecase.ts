import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { rotuloDoAlvo } from '../helpers/target-label.helper';
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
  /**
   * O ESCOPO da devolução: só fecha a posse se ela aponta para ESTA
   * localização. Sem ele, fecha a posse aberta que o ativo tiver, seja com quem
   * for — é o caminho da tela de Ativos, onde a pessoa está olhando a posse.
   *
   * Existe para a ficha do posto. Ela lista os ativos entregues à mesa e tem o
   * botão Devolver em cada linha; entre a ficha carregar e o clique, o ativo
   * pode ter sido devolvido e entregue a outra pessoa, e o clique fecharia a
   * posse da Laura achando que tirava um mouse da Mesa 1. Com o escopo, o
   * servidor recusa: a ficha estava velha, e é isso que a resposta diz.
   */
  targetLocationId?: string | null;
}

export async function checkinAsset(assetId: string, data: CheckinData, actorId: string | null) {
  const resultado = await executarCheckin(assetId, data, actorId);

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
      select: {
        id: true,
        targetType: true,
        targetLocationId: true,
        // Os dois alvos, para a recusa do escopo dizer COM QUEM o ativo está.
        targetUser: { select: { name: true } },
        targetLocation: { select: { name: true } },
      },
    });
    // 409 e não 404: o ativo existe, quem não existe é a posse — é conflito de
    // estado, e a mesma família do "já está entregue" da outra ponta.
    if (!aberta) throw new AppError('Este ativo não está entregue.', 409);

    // O ESCOPO (ver `CheckinData`). Também 409: a posse existe, só não é a que
    // quem clicou tinha na tela. A mensagem nomeia o alvo de verdade porque a
    // pessoa precisa decidir se devolve mesmo assim — e isso ela faz na ficha
    // do ativo, olhando a posse certa.
    if (data.targetLocationId && aberta.targetLocationId !== data.targetLocationId) {
      const alvo = rotuloDoAlvo(aberta);
      throw new AppError(
        `Este ativo não está entregue a este posto${alvo ? `: a posse aberta dele é com ${alvo}` : ''}. `
          + 'Releia a ficha; para devolver mesmo assim, use a ficha do ativo.',
        409,
        { assignmentId: aberta.id },
      );
    }

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
