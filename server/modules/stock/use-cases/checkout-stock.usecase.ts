import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { travarAtivo } from '../../asset/use-cases/lock-asset.usecase';
import { lerPostoTravado } from '../../catalog/helpers/catalog-lock.helper';
import { travarPessoaOuFalhar, type ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';
import {
  assertDisponivel, contarUsoDe, travarItemOuFalhar, type ClienteEstoque,
} from '../helpers/stock-balance.helper';
import { rotuloDoComputador, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { CheckoutStockInput } from '../schemas/stock.schema';

// A ENTREGA — `qty` unidades de um item para UMA pessoa, UM posto ou UM
// computador, num dia.
//
// ─────────────────────────────────────────────────────────────────────────────
// A CATEGORIA DECIDE PARA ONDE (AI). O item de categoria ESTOQUE — mouse,
// monitor, cabo — vai a colaborador ou a posto, nunca a computador. O de
// categoria COMPONENTE — memória, SSD — vai SÓ a computador: ele fica dentro da
// máquina, e é lá que está "em uso". Sai pelo Retirar (a devolução), na troca
// de peça, na máquina que vai ser descartada e no lançamento errado.
//
// ─────────────────────────────────────────────────────────────────────────────
// O ALVO PODE SER UM POSTO, e é a mesma razão da posse de ativo: entregar 5
// mouses à Mesa 1 é o caso real do modelo de posse, e forçar a escolha de uma
// pessoa faria o estoque mentir do mesmo jeito que mentiria na posse de ativo.
// A unidade entregue ao posto é UMA, qualquer que seja o número de
// ocupantes — o saldo do almoxarifado não pode depender da escala do RH. Quem
// responde por ela são os ocupantes ABERTOS do posto, resolvidos na leitura, e
// posto sem ocupante resolve para ninguém — não é erro, é a mesa preparada
// antes de a pessoa chegar.
//
// CADA UNIDADE É UMA LINHA. `qty: 5` grava cinco linhas, no mesmo INSERT: o
// `createdAt` igual é o que faz delas UMA entrega nas listas, e o saldo é um
// `COUNT`.
//
// O DIA, como na entrega de licença: hoje por padrão, e o passado pode — o
// registro da entrega que já aconteceu. A QUANTIDADE no passado não é
// conferida; a conta é sempre a de agora. Sem a recusa "antes da compra" da
// licença: o item não tem data de compra, e o dia do cadastro dele é do
// sistema, não do almoxarifado — o mouse entregue no mês passado se registra
// num item cadastrado hoje. Nem a do "mesmo alvo depois da devolução": o mesmo
// alvo fica com várias unidades ao mesmo tempo.
//
// O COMPONENTE tem a recusa "antes da compra" — a do COMPUTADOR, como a
// licença instalada nele: a peça não entra numa máquina que ainda não tinha
// sido comprada.
//
// O CONSUMÍVEL (AJ) vai a colaborador ou posto, como o estoque, mas não volta:
// as linhas nascem FECHADAS — devolvidas no próprio instante da entrega, marcadas
// `CONSUMED` — e o total diminui na mesma transação. Fechadas, elas ficam
// fora de toda conta de "em uso" e de posse sem que nenhuma delas mude: o
// colaborador que recebeu toner se desativa, e o posto se exclui.
// ─────────────────────────────────────────────────────────────────────────────

const FK_DO_ALVO = {
  PERSON: 'targetPersonId', WORKSTATION: 'targetWorkstationId', ASSET: 'targetAssetId',
} as const;
const ROTULO_DO_ALVO = {
  PERSON: 'um colaborador (targetPersonId)',
  WORKSTATION: 'um posto (targetWorkstationId)',
  ASSET: 'um computador (targetAssetId)',
} as const;

type TipoDoAlvo = CheckoutStockInput['targetType'];

/**
 * Coerência do alvo: exatamente UMA das três FKs preenchida, e a que casa com o
 * `targetType`. O banco também garante (`stock_movements_forma`); esta função
 * existe para dar 422 com o nome do campo que falta.
 */
function assertAlvoCoerente(data: CheckoutStockInput): string {
  const alvoId = data[FK_DO_ALVO[data.targetType]];
  const intrusa = (Object.keys(FK_DO_ALVO) as TipoDoAlvo[])
    .some((tipo) => tipo !== data.targetType && data[FK_DO_ALVO[tipo]]);

  if (intrusa) {
    throw new AppError(
      `Uma entrega tem UM alvo: preencha só a chave que corresponde ao targetType (${data.targetType}).`,
      422,
    );
  }
  if (!alvoId) {
    throw new AppError(`Entrega do tipo "${data.targetType}" exige ${ROTULO_DO_ALVO[data.targetType]}.`, 422);
  }
  return alvoId;
}

/**
 * A categoria do item contra o alvo (AI): o componente vai só a computador, e
 * o resto do estoque nunca vai. 422, como o alvo incoerente: o pedido é que
 * não faz sentido, e nada no estado do banco mudaria isso.
 */
function assertAlvoDaCategoria(item: { name: string; category: { type: string } }, tipo: TipoDoAlvo): void {
  const componente = item.category.type === 'COMPONENT';
  if (componente && tipo !== 'ASSET') {
    throw new AppError(`"${item.name}" é componente e vai só para um computador.`, 422);
  }
  if (!componente && tipo === 'ASSET') {
    throw new AppError(
      `"${item.name}" não é componente: vai para um colaborador ou um posto, não para um computador.`,
      422,
    );
  }
}

/**
 * O alvo existe e pode receber? Devolve o NOME dele, que a auditoria grava, e
 * a data de compra do computador, que o dia da entrega não antecede.
 *
 * Pessoa e computador saem por `findFirst`, que o escopo da lixeira alcança:
 * não se entrega nada a um cadastro na lixeira. Posto sai travado, pela marca
 * de desativado.
 * DESATIVADO é diferente de APAGADO, e os dois são recusados — entregar a quem
 * saiu reabriria, uma linha depois, a pendência que a entrega da empresa fechou.
 * 409 e não 404: a pessoa existe, o estado dela é que recusa. O computador
 * BAIXADO, pelo mesmo motivo: a peça iria para uma máquina que saiu do
 * patrimônio.
 */
async function assertAlvoApto(
  client: ClienteEstoque & ClienteQueTrava,
  tipo: TipoDoAlvo,
  alvoId: string,
): Promise<{ nome: string; compra: Date | null }> {
  if (tipo === 'WORKSTATION') {
    // O posto não se desativa (AN): basta existir. `FOR SHARE` depois do item — a aresta
    // `item → posto` que o grafo já tinha (`lock-asset.usecase.ts`).
    return { nome: await lerPostoTravado(client, alvoId), compra: null };
  }

  if (tipo === 'ASSET') {
    const ativo = await client.asset.findFirst({
      where: { id: alvoId },
      select: { assetTag: true, name: true, retiredAt: true, purchaseDate: true },
    });
    if (!ativo) throw new AppError('Ativo não encontrado.', 404);
    if (ativo.retiredAt) {
      throw new AppError(`O ativo ${ativo.assetTag} teve baixa e não pode receber componente.`, 409);
    }
    return { nome: rotuloDoComputador(ativo), compra: ativo.purchaseDate };
  }

  const pessoa = await client.person.findFirst({ where: { id: alvoId }, select: { id: true, name: true, isActive: true } });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desativado(a) e não pode receber equipamento.`, 409);
  }
  return { nome: pessoa.name, compra: null };
}

export async function checkoutStock(itemId: string, data: CheckoutStockInput, ator: Ator) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco.
  const alvoId = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: colaborador antes do item — a regra do grafo de
    // travas (`lock-asset.usecase.ts`). No alvo PERSON, pelo motivo da
    // invariante 6: sem a trava, a entrega nasce no intervalo entre o `DELETE`
    // ler a pessoa e apagá-la, e o cadastro na lixeira fica com unidade no nome.
    // No alvo ASSET, o computador antes do item, pelo mesmo motivo: a baixa e a
    // lixeira dele travam a linha e contam os componentes (AI).
    if (data.targetType === 'PERSON') await travarPessoaOuFalhar(tx, alvoId);
    else if (data.targetType === 'ASSET' && !(await travarAtivo(tx, alvoId))) {
      throw new AppError('Ativo não encontrado.', 404);
    }

    // A TRAVA DA LINHA DO ITEM — o mutex do saldo. Contar não é travar: duas
    // requisições podem contar "4 de 5 em uso" e as duas inserirem, dando 6 de 5.
    await travarItemOuFalhar(tx, itemId);
    const item = await tx.stockItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { id: true, name: true, qty: true, isActive: true, category: { select: { type: true } } },
    });
    assertAlvoDaCategoria(item, data.targetType);

    // O alvo antes do item, como na licença: o colaborador na lixeira é 404
    // mesmo com o item desativado.
    const { nome: nomeDoAlvo, compra: compraDoAlvo } = await assertAlvoApto(tx, data.targetType, alvoId);

    // O DESATIVADO é o encerrado da licença: não recebe entrega nova.
    if (!item.isActive) {
      throw new AppError(
        `O item "${item.name}" está desativado e não recebe entrega. Se ele voltou a ser usado, reative-o antes.`,
        409,
      );
    }

    // A conta, DEPOIS da trava. Antes dela seria a mesma leitura suja que o
    // `if` sozinho faz.
    const consumivel = item.category.type === 'CONSUMABLE';
    const { emUso } = await contarUsoDe(tx, itemId);
    assertDisponivel(item, data.qty, emUso, consumivel);

    const dia = data.checkoutAt ?? hojeNoBrasil();
    if (compraDoAlvo && dia < compraDoAlvo) {
      throw new AppError(
        `A entrega (${diaEmPortugues(dia)}) não pode ser antes da compra de ${nomeDoAlvo} (${diaEmPortugues(compraDoAlvo)}).`,
        422,
      );
    }

    // Ausente, quem preenche é o `@default(now())` — menos no consumível, que
    // fecha a linha no mesmo instante e precisa dele escrito nas duas colunas.
    const checkoutAt = data.checkoutAt
      ? instanteDoDia(data.checkoutAt)
      : consumivel ? new Date() : undefined;
    const consumida = consumivel
      ? { returnedAt: checkoutAt, returnRecordedAt: new Date(), returnKind: 'CONSUMED' as const }
      : {};

    // UMA ida ao banco para as N linhas, com as duas travas seguradas o menor
    // tempo possível — e as N com o MESMO `createdAt` (o `now()` da transação),
    // que é o que faz delas uma entrega de N, e não N entregas.
    const unidades = await tx.stockMovement.createManyAndReturn({
      data: Array.from({ length: data.qty }, () => ({
        itemId,
        targetType: data.targetType,
        targetPersonId: data.targetType === 'PERSON' ? alvoId : null,
        targetWorkstationId: data.targetType === 'WORKSTATION' ? alvoId : null,
        targetAssetId: data.targetType === 'ASSET' ? alvoId : null,
        notes: data.notes ?? null,
        checkoutAt,
        ...consumida,
      })),
      select: STOCK_MOVEMENT_SELECT,
    });

    // O consumível sai do TOTAL, que é o que existe (AJ). Pelo client, para o
    // `updatedAt` subir e a edição aberta em outra tela receber o 409.
    if (consumivel) {
      await tx.stockItem.update({ where: { id: itemId }, data: { qty: { decrement: data.qty } } });
    }

    const disponivel = item.qty - emUso - data.qty;

    // No histórico do ITEM: é onde alguém abre para perguntar "para onde foram
    // os 5 mouses". O alvo vai também POR ESCRITO: a pessoa, o posto ou o
    // computador podem ser excluídos depois, e o id sozinho deixaria de dizer para quem as unidades
    // saíram. E os ids das N linhas, como o `checkoutId` da licença: é o que liga
    // cada unidade à conta que a entregou.
    await recordAudit(tx, {
      entityType: 'StockItem',
      entityId: itemId,
      entityLabel: item.name,
      action: 'CHECKOUT',
      changes: {
        targetType: data.targetType,
        targetId: alvoId,
        targetName: nomeDoAlvo,
        qty: data.qty,
        checkoutAt: unidades[0].checkoutAt.toISOString(),
        disponivel,
        movementIds: unidades.map((unidade) => unidade.id),
        ...(consumivel ? { consumivel: true, totalDoItem: { de: item.qty, para: item.qty - data.qty } } : {}),
      },
    }, ator);

    return { unidades, disponivel };
  });
}
