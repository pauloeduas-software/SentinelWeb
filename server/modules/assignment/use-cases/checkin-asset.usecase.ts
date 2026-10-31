import { prisma } from '../../../infra/database/prismaClient';
import type { Ator } from '../../audit/audit.types';
import { AppError } from '../../../infra/errors/app-error';
import { rotuloDoAlvo } from '../helpers/target-label.helper';
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
  /**
   * O ESCOPO da devolução: só fecha a posse se ela aponta para ESTE
   * posto. Sem ele, fecha a posse aberta que o ativo tiver, seja com quem
   * for — é o caminho da tela Computadores, onde a pessoa está olhando a posse.
   *
   * Existe para a ficha do posto. Ela lista os ativos entregues à mesa e tem o
   * botão Devolver em cada linha; entre a ficha carregar e o clique, o ativo
   * pode ter sido devolvido e entregue a outra pessoa, e o clique fecharia a
   * posse da Laura achando que tirava um mouse da Mesa 1. Com o escopo, o
   * servidor recusa: a ficha estava velha, e é isso que a resposta diz.
   */
  targetWorkstationId?: string | null;
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
    if (!ativo) throw new AppError('Registro não encontrado', 404);

    const aberta = await tx.assignment.findFirst({
      where: { assetId, checkinAt: null },
      select: {
        id: true,
        targetType: true,
        targetWorkstationId: true,
        checkoutAt: true,
        // Os dois alvos, para a recusa do escopo dizer COM QUEM o ativo está.
        targetPerson: { select: { name: true } },
        targetWorkstation: { select: { name: true } },
      },
    });
    // 409 e não 404: o ativo existe, quem não existe é a posse — é conflito de
    // estado, e a mesma família do "já está entregue" da outra ponta.
    if (!aberta) throw new AppError('Este ativo não está entregue.', 409);

    // O ESCOPO (ver `CheckinData`). Também 409: a posse existe, só não é a que
    // quem clicou tinha na tela. A mensagem nomeia o alvo de verdade porque a
    // pessoa precisa decidir se devolve mesmo assim — e isso ela faz na ficha
    // do ativo, olhando a posse certa.
    if (data.targetWorkstationId && aberta.targetWorkstationId !== data.targetWorkstationId) {
      const alvo = rotuloDoAlvo(aberta);
      throw new AppError(
        `Este ativo não está entregue a este posto${alvo ? `: a posse aberta dele é com ${alvo}` : ''}. `
          + 'Releia a ficha; para devolver mesmo assim, use a ficha do ativo.',
        409,
      );
    }

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
