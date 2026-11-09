import { prisma } from '../../../infra/database/prismaClient';
import type { Ator } from '../../audit/audit.types';
import { AppError } from '../../../infra/errors/app-error';
import { escolherStatusPorTipo } from './checkout-asset.usecase';
import { fecharPosse } from './close-assignment.usecase';
import { lerStatusTravado } from '../../catalog/helpers/catalog-lock.helper';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';

// A DEVOLUÇÃO — o fechamento da posse aberta.
//
// APPEND-ONLY: fechar é preencher `checkinAt`, NUNCA apagar a linha. "Quem
// estava com este notebook em março?" só continua respondível enquanto a
// entrega devolvida seguir na tabela — e é essa pergunta que transforma o
// inventário em prova, num inquérito trabalhista ou num sinistro.

interface CheckinData {
  statusId?: string | null;
  checkinNotes?: string | null;
  /** O dia (AM). Ausente é hoje. */
  checkinAt?: Date | null;
}

export async function checkinAsset(assetId: string, data: CheckinData, ator: Ator) {
  // Transação pelo mesmo motivo da entrega: `assignments`, `assets` e
  // `audit_logs` descrevem UM evento. Uma posse fechada com o ativo ainda
  // "Em uso" é o equipamento devolvido que continua contando como entregue em
  // todo relatório.
  return prisma.$transaction(async (tx) => {
    // A TRAVA DO ATIVO, antes de ler a posse — a mesma da entrega, da edição e
    // da baixa (`lock-asset.usecase.ts`). Sem ela, duas devoluções simultâneas
    // liam a mesma posse aberta e passavam as duas; e uma devolução atrasada,
    // depois de uma devolução e de uma entrega nova, fechava a posse VELHA e
    // gravava "Disponível" num ativo entregue a outra pessoa.
    await travarAtivoOuFalhar(tx, assetId);

    // `findFirst` pelo escopo da lixeira. Ativo apagado precisa ser restaurado
    // antes — devolver o que saiu do inventário escreveria histórico em cima de
    // uma linha que nenhuma tela mais enxerga.
    const ativo = await tx.asset.findFirst({
      where: { id: assetId },
      select: { id: true, statusId: true },
    });
    if (!ativo) throw new AppError('Computador não encontrado.', 404);

    const aberta = await tx.assignment.findFirst({
      where: { assetId, checkinAt: null },
      select: { id: true, targetType: true, checkoutAt: true },
    });
    // 409 e não 404: o ativo existe, quem não existe é a posse — é conflito de
    // estado, e a mesma família do "já está entregue" da outra ponta.
    if (!aberta) throw new AppError('Este computador não está entregue.', 409);

    // O status escolhido à mão existe? Lido travado: a troca de tipo dele espera.
    if (data.statusId) await lerStatusTravado(tx, data.statusId);
    // Sem escolha explícita, o equipamento volta para o estoque. O caminho
    // anormal — voltou quebrado, foi direto para a assistência — é que merece o
    // `statusId` no corpo, e a tela de devolução oferece a lista.
    const statusId = data.statusId ?? (await escolherStatusPorTipo(tx, 'DEPLOYABLE', 'Disponível'));

    // O DIA da devolução não antecede o DIA da entrega (AM) — os dois no
    // calendário de Brasília, como na licença. No mesmo dia, o meio-dia do dia
    // passado pode cair antes da hora real da entrega, e a devolução nunca fica
    // antes dela: é o CHECK `assignments_devolucao_nao_antecede_entrega`.
    const dia = data.checkinAt ?? hojeNoBrasil();
    const diaDaEntrega = hojeNoBrasil(aberta.checkoutAt);
    if (dia < diaDaEntrega) {
      throw new AppError(
        `A devolução (${diaEmPortugues(dia)}) não pode ser antes da entrega (${diaEmPortugues(diaDaEntrega)}).`,
        422,
      );
    }
    const instante = instanteDoDia(dia);
    const checkinAt = instante < aberta.checkoutAt ? aberta.checkoutAt : instante;

    // As três escritas da devolução (fechar a posse, mexer no ativo, gravar o
    // log) moram em `fecharPosse`: é onde a próxima porta de devolução entra
    // sem copiar nada.
    return fecharPosse(
      tx,
      { id: aberta.id, assetId, targetType: aberta.targetType, statusAnteriorId: ativo.statusId },
      { statusId, checkinNotes: data.checkinNotes, checkinAt },
      ator,
    );
  });
}
