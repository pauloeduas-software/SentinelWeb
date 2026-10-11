import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { travarUsuarioOuFalhar } from '../../user/use-cases/lock-user.usecase';
import {
  assertDisponivel, contarForaDe, travarItemOuFalhar, type ClienteEstoque,
} from '../helpers/stock-balance.helper';
import { STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { CheckoutStockInput } from '../schemas/stock.schema';

// A SAÍDA — `qty` unidades de um item para UMA pessoa ou UM posto.
//
// ─────────────────────────────────────────────────────────────────────────────
// O ALVO PODE SER UM POSTO, e é a mesma razão da posse de ativo: entregar 5
// mouses à Mesa 1 é o caso real do modelo de posse, e forçar a escolha de uma
// pessoa faria o estoque mentir do mesmo jeito que `Asset.assignedToId`
// mentiria. A unidade entregue ao posto é UMA, qualquer que seja o número de
// ocupantes — o saldo do almoxarifado não pode depender da escala do RH. Quem
// responde por ela são os ocupantes ABERTOS do posto, resolvidos na leitura, e
// posto sem ocupante resolve para ninguém — não é erro, é a mesa preparada
// antes de a pessoa chegar.
//
// CADA UNIDADE É UMA LINHA. `qty: 5` grava cinco movimentos de SAIDA de 1: a
// devolução é de uma unidade identificada, sem quantidade parcial para
// dividir, e o saldo é um `COUNT`.
// ─────────────────────────────────────────────────────────────────────────────

const FK_DO_ALVO = { USER: 'targetUserId', LOCATION: 'targetLocationId' } as const;
const ROTULO_DO_ALVO = {
  USER: 'um colaborador (targetUserId)',
  LOCATION: 'uma localização (targetLocationId)',
} as const;

/**
 * Coerência do alvo: exatamente UMA das duas FKs preenchida, e a que casa com o
 * `targetType`. O banco também garante (`stock_movements_forma`); esta função
 * existe para dar 422 com o nome do campo que falta.
 */
function assertAlvoCoerente(data: CheckoutStockInput): string {
  const alvoId = data[FK_DO_ALVO[data.targetType]];
  const intrusa = data.targetType === 'USER' ? data.targetLocationId : data.targetUserId;

  if (intrusa) {
    throw new AppError(
      'Uma saída tem UM alvo: preencha só a chave que corresponde ao targetType.',
      422,
      { targetType: data.targetType, sobrando: FK_DO_ALVO[data.targetType === 'USER' ? 'LOCATION' : 'USER'] },
    );
  }
  if (!alvoId) {
    throw new AppError(`Saída do tipo "${data.targetType}" exige ${ROTULO_DO_ALVO[data.targetType]}.`, 422);
  }
  return alvoId;
}

/**
 * O alvo existe e pode receber?
 *
 * Pessoa sai por `findFirst`, que o escopo da lixeira alcança: não se entrega
 * nada a um cadastro apagado. Localização não tem lixeira, então `findUnique`.
 * DESATIVADO é diferente de APAGADO, e os dois são recusados — entregar a quem
 * saiu reabriria, uma linha depois, a pendência que a saída da empresa fechou.
 * 409 e não 404: a pessoa existe, o estado dela é que recusa.
 */
async function assertAlvoApto(client: ClienteEstoque, tipo: 'USER' | 'LOCATION', alvoId: string): Promise<void> {
  if (tipo === 'LOCATION') {
    const local = await client.location.findUnique({ where: { id: alvoId }, select: { id: true } });
    if (!local) throw new AppError('Localização não encontrada.', 404);
    return;
  }

  const pessoa = await client.user.findFirst({ where: { id: alvoId }, select: { id: true, name: true, isActive: true } });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desativado(a) e não pode receber equipamento.`, 409);
  }
}

export async function checkoutStock(itemId: string, data: CheckoutStockInput, actorId: string | null) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco.
  const alvoId = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: usuário antes do item — a regra do grafo de travas
    // (`lock-asset.usecase.ts`). Só no alvo USER, e pelo motivo da invariante 6:
    // sem a trava, a saída nasce no intervalo entre o `DELETE` ler a pessoa e
    // apagá-la, e o cadastro na lixeira fica com unidade no nome.
    if (data.targetType === 'USER') await travarUsuarioOuFalhar(tx, alvoId);

    // A TRAVA DA LINHA DO ITEM — o mutex do saldo. Contar não é travar: duas
    // requisições podem contar "4 de 5 fora" e as duas inserirem, dando 6 de 5.
    await travarItemOuFalhar(tx, itemId);

    // `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
    // `findUnique`, e item na lixeira não sai.
    const item = await tx.stockItem.findFirst({ where: { id: itemId }, select: { id: true, name: true, qty: true } });
    if (!item) throw new AppError('Item de estoque não encontrado.', 404);

    await assertAlvoApto(tx, data.targetType, alvoId);

    // A conta, DEPOIS da trava. Antes dela seria a mesma leitura suja que o
    // `if` sozinho faz.
    const fora = await contarForaDe(tx, itemId);
    assertDisponivel(item, data.qty, fora);

    // UMA ida ao banco para as N linhas, com as duas travas seguradas o menor
    // tempo possível — e as N unidades com o MESMO `createdAt`, que é o que
    // deixa a linha do tempo mostrá-las como uma saída de N, não N saídas.
    const unidades = await tx.stockMovement.createManyAndReturn({
      data: Array.from({ length: data.qty }, () => ({
        itemId,
        kind: 'SAIDA' as const,
        qty: 1,
        targetType: data.targetType,
        targetUserId: data.targetType === 'USER' ? alvoId : null,
        targetLocationId: data.targetType === 'LOCATION' ? alvoId : null,
        notes: data.notes ?? null,
        createdById: actorId,
      })),
      select: STOCK_MOVEMENT_SELECT,
    });

    // No histórico do ITEM: é onde alguém abre para perguntar "para onde foram
    // os 5 mouses". O `disponivel` DEPOIS da saída explica o evento sem obrigar
    // quem lê a recontar as linhas daquele dia.
    await recordActivity(tx, {
      entityType: 'StockItem',
      entityId: itemId,
      action: 'CHECKOUT',
      changes: { targetType: data.targetType, targetId: alvoId, qty: data.qty, disponivel: item.qty - fora - data.qty },
    }, actorId);

    return { unidades, disponivel: item.qty - fora - data.qty };
  });
}
