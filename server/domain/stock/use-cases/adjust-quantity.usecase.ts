import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { comSaldo, contarEmUsoDe, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import type { AdjustQuantityData } from '../schemas/stock.schema';
import type { ItemComSaldo, ItemDeEstoque } from './list-stock.usecase';

// O AJUSTE DE ESTOQUE — a ÚNICA porta para `qty` (Etapa D).
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE A QUANTIDADE NÃO É CAMPO DO FORMULÁRIO
//
// Mesmo argumento do D17 para `Asset.assignedToId`: quantidade é CONSEQUÊNCIA
// de movimentação, não atributo digitável. Com a chave declarada no schema de
// edição existiriam dois caminhos para mudá-la e só um gravaria `StockLog` — e
// o caminho silencioso seria justamente o `PUT` do formulário, o mais usado.
//
// E a defesa NÃO é uma checagem neste arquivo: é a chave não existir em
// `camposDeEdicao`. O `strictObject` devolve 422 sozinho, sem `if` que alguém
// possa esquecer de copiar para o próximo schema (o mesmo princípio do D37).
// ─────────────────────────────────────────────────────────────────────────────
//
// DELTA, E NÃO O VALOR FINAL. "A quantidade agora é 42" é ler-e-depois-escrever
// com outro nome: duas recontagens simultâneas gravariam números calculados a
// partir do mesmo estado antigo e uma sumiria sem erro. O delta é aplicado com
// `increment`, que o Postgres resolve dentro da linha já travada.

export interface ResultadoDoAjuste {
  item: ItemComSaldo;
  /** A linha de `stock_logs` que este ajuste escreveu. */
  log: { id: string; delta: number; reason: string; createdAt: Date };
}

export async function adjustQuantity(
  spec: StockKindSpec,
  id: string,
  data: AdjustQuantityData,
  actorId: string | null,
): Promise<ResultadoDoAjuste> {
  const { item, log } = await prisma.$transaction(async (tx) => {
    // A TRAVA antes de qualquer leitura, como em toda operação que compara um
    // número lido com o que vai gravar.
    await travarItemOuFalhar(tx, spec.kind, spec.rotulo, id);

    const antes = await spec.delegate(tx).findFirst({
      where: { id },
      select: spec.select,
    }) as ItemDeEstoque | null;
    if (!antes) throw new AppError(`Nenhum ${spec.rotulo} com este identificador.`, 404);

    const emUso = await contarEmUsoDe(tx, spec.kind, id);
    const novaQty = antes.qty + data.delta;

    // BAIXA ABAIXO DO QUE JÁ SAIU É RECUSADA, e este é o único `if` que o
    // ajuste tem.
    //
    // Sem ele, dar baixa de 10 num acessório com 8 unidades na rua gravaria
    // `qty = 2` e `disponivel = −6`. O negativo não quebra nada — o helper de
    // saldo o devolve de propósito, porque é o sinal de contagem física e
    // nominal brigando —, mas CRIÁ-LO de dentro de uma operação que se sabe
    // fazendo isso é outra coisa: seria o sistema escrevendo a inconsistência
    // que o alerta existe para denunciar.
    //
    // A saída que a frase ensina é a certa: devolver as unidades primeiro.
    if (novaQty < emUso) {
      throw new AppError(
        `Não é possível baixar para ${novaQty}: ${emUso} unidade(s) deste ${spec.rotulo} ` +
          'estão fora do estoque. Faça a devolução antes.',
        409,
        { qty: antes.qty, delta: data.delta, novaQty, emUso },
      );
    }

    // `novaQty < 0` já é impossível depois do `if` acima (`emUso` nunca é
    // negativo), e o CHECK `qty >= 0` do banco é a rede embaixo disso.

    const depois = await spec.delegate(tx).update({
      where: { id },
      // `increment` e não `qty: novaQty`: o valor calculado aqui é o mesmo,
      // mas o `increment` deixa a intenção no SQL — e é o que continua correto
      // se um dia a trava sair daqui por engano.
      data: { qty: { increment: data.delta }, updatedById: actorId },
      select: spec.select,
    }) as ItemDeEstoque;

    // O LOG DE ESTOQUE, na MESMA transação. Ele responde *por que a quantidade
    // nominal mudou* — não para onde a unidade foi, que já está na tabela de
    // saída. A "movimentação completa" da tela é a união das duas fontes na
    // leitura (`list-item-movements.usecase.ts`), nunca uma terceira tabela.
    const log = await tx.stockLog.create({
      data: {
        itemType: spec.kind,
        itemId: id,
        delta: data.delta,
        reason: data.reason,
        notes: data.notes ?? null,
        actorId,
      },
      select: { id: true, delta: true, reason: true, createdAt: true },
    });

    // E a trilha geral, ao lado das edições do item — é onde alguém procura
    // "o que aconteceu com este acessório" sem saber que existe um log próprio.
    await recordActivity(tx, {
      entityType: spec.entityType,
      entityId: id,
      action: 'ADJUST',
      changes: {
        qty: { de: antes.qty, para: depois.qty },
        delta: data.delta,
        reason: data.reason,
        notes: data.notes ?? null,
      },
    }, actorId);

    return { item: comSaldo(depois, emUso), log };
  });

  return { item, log };
}
