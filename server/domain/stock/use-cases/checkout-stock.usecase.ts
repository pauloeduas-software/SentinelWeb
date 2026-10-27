import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { assertPostoRecebe } from '../../catalog/helpers/catalog-lock.helper';
import { travarPessoaOuFalhar, type ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import { instanteDoDia } from '../../shared/hoje.helper';
import {
  assertDisponivel, contarUsoDe, travarItemOuFalhar, type ClienteEstoque,
} from '../helpers/stock-balance.helper';
import { STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { CheckoutStockInput } from '../schemas/stock.schema';

// A ENTREGA — `qty` unidades de um item para UMA pessoa ou UM posto, num dia.
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
// ─────────────────────────────────────────────────────────────────────────────

const FK_DO_ALVO = { PERSON: 'targetPersonId', WORKSTATION: 'targetWorkstationId' } as const;
const ROTULO_DO_ALVO = {
  PERSON: 'um colaborador (targetPersonId)',
  WORKSTATION: 'um posto (targetWorkstationId)',
} as const;

/**
 * Coerência do alvo: exatamente UMA das duas FKs preenchida, e a que casa com o
 * `targetType`. O banco também garante (`stock_movements_forma`); esta função
 * existe para dar 422 com o nome do campo que falta.
 */
function assertAlvoCoerente(data: CheckoutStockInput): string {
  const alvoId = data[FK_DO_ALVO[data.targetType]];
  const intrusa = data.targetType === 'PERSON' ? data.targetWorkstationId : data.targetPersonId;

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
 * O alvo existe e pode receber? Devolve o NOME dele, que a auditoria grava.
 *
 * Pessoa sai por `findFirst`, que o escopo da lixeira alcança: não se entrega
 * nada a um cadastro na lixeira. Posto sai travado, pela marca de
 * desativado.
 * DESATIVADO é diferente de APAGADO, e os dois são recusados — entregar a quem
 * saiu reabriria, uma linha depois, a pendência que a entrega da empresa fechou.
 * 409 e não 404: a pessoa existe, o estado dela é que recusa.
 */
async function assertAlvoApto(client: ClienteEstoque & ClienteQueTrava, tipo: 'PERSON' | 'WORKSTATION', alvoId: string): Promise<string> {
  if (tipo === 'WORKSTATION') {
    // Desativado não recebe entrega nova. `FOR SHARE` depois do item — a aresta
    // `item → posto` que o grafo já tinha (`lock-asset.usecase.ts`).
    return assertPostoRecebe(client, alvoId, 'entrega de estoque');
  }

  const pessoa = await client.person.findFirst({ where: { id: alvoId }, select: { id: true, name: true, isActive: true } });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desativado(a) e não pode receber equipamento.`, 409);
  }
  return pessoa.name;
}

export async function checkoutStock(itemId: string, data: CheckoutStockInput, ator: Ator) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco.
  const alvoId = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: colaborador antes do item — a regra do grafo de
    // travas (`lock-asset.usecase.ts`). Só no alvo PERSON, e pelo motivo da
    // invariante 6: sem a trava, a entrega nasce no intervalo entre o `DELETE`
    // ler a pessoa e apagá-la, e o cadastro na lixeira fica com unidade no nome.
    if (data.targetType === 'PERSON') await travarPessoaOuFalhar(tx, alvoId);

    // A TRAVA DA LINHA DO ITEM — o mutex do saldo. Contar não é travar: duas
    // requisições podem contar "4 de 5 em uso" e as duas inserirem, dando 6 de 5.
    await travarItemOuFalhar(tx, itemId);
    const item = await tx.stockItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { id: true, name: true, qty: true, isActive: true },
    });

    // O alvo antes do item, como na licença: o colaborador na lixeira é 404
    // mesmo com o item desativado.
    const nomeDoAlvo = await assertAlvoApto(tx, data.targetType, alvoId);

    // O DESATIVADO é o encerrado da licença: não recebe entrega nova.
    if (!item.isActive) {
      throw new AppError(
        `O item "${item.name}" está desativado e não recebe entrega. Se ele voltou a ser usado, reative-o antes.`,
        409,
      );
    }

    // A conta, DEPOIS da trava. Antes dela seria a mesma leitura suja que o
    // `if` sozinho faz.
    const { emUso } = await contarUsoDe(tx, itemId);
    assertDisponivel(item, data.qty, emUso);

    // Ausente, quem preenche é o `@default(now())`.
    const checkoutAt = data.checkoutAt ? instanteDoDia(data.checkoutAt) : undefined;

    // UMA ida ao banco para as N linhas, com as duas travas seguradas o menor
    // tempo possível — e as N com o MESMO `createdAt` (o `now()` da transação),
    // que é o que faz delas uma entrega de N, e não N entregas.
    const unidades = await tx.stockMovement.createManyAndReturn({
      data: Array.from({ length: data.qty }, () => ({
        itemId,
        targetType: data.targetType,
        targetPersonId: data.targetType === 'PERSON' ? alvoId : null,
        targetWorkstationId: data.targetType === 'WORKSTATION' ? alvoId : null,
        notes: data.notes ?? null,
        checkoutAt,
      })),
      select: STOCK_MOVEMENT_SELECT,
    });

    const disponivel = item.qty - emUso - data.qty;

    // No histórico do ITEM: é onde alguém abre para perguntar "para onde foram
    // os 5 mouses". O alvo vai também POR ESCRITO: a pessoa ou o posto podem ser
    // excluídos depois, e o id sozinho deixaria de dizer para quem as unidades
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
      },
    }, ator);

    return { unidades, disponivel };
  });
}
