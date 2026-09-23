import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { travarUsuarioOuFalhar } from '../../user/use-cases/lock-user.usecase';
import {
  assertDisponivel, contarEmUsoDe, travarItemOuFalhar,
} from '../helpers/stock-balance.helper';
import { accessorySpec, type ClienteEstoque } from '../helpers/stock-kind.helper';
import { ACCESSORY_CHECKOUT_SELECT } from '../helpers/stock-select.helper';
import type { CheckoutAccessoryData } from '../schemas/accessory.schema';

// A ENTREGA DE UMA UNIDADE DE ACESSÓRIO.
//
// ─────────────────────────────────────────────────────────────────────────────
// A NOVIDADE SOBRE O SNIPE-IT: o alvo pode ser um POSTO (D33).
//
// Entregar 5 mouses à Mesa 1 é o caso real do docs/MODELO-POSSE.md, e forçar a
// escolha de uma pessoa faria o acessório mentir do mesmo jeito que
// `Asset.assignedToId` mentiria (D17).
//
// E a unidade entregue ao posto é UMA, qualquer que seja o número de ocupantes.
// A alternativa — "posto de N ocupantes conta como N entregas" — faria o saldo
// do almoxarifado depender do RH: o posto ganharia uma terceira ocupante e, sem
// ninguém tocar em uma unidade física, o disponível cairia de 2 para 0.
// Quantidade é fato do almoxarifado; número de ocupantes é fato da escala.
//
// Quem responde pela unidade são os ocupantes ABERTOS daquele posto, resolvidos
// na LEITURA. Posto sem ocupante resolve para `[]` — não é bug, é o *posto
// vago* aplicado ao estoque, e entra em `/api/stock/alerts`.
// ─────────────────────────────────────────────────────────────────────────────

const FK_DO_ALVO = { USER: 'targetUserId', LOCATION: 'targetLocationId' } as const;
const ROTULO_DO_ALVO = {
  USER: 'um colaborador (targetUserId)',
  LOCATION: 'uma localização (targetLocationId)',
} as const;

/**
 * Coerência do alvo: exatamente UMA das duas FKs preenchida, e a que casa com o
 * `targetType`.
 *
 * O BANCO TAMBÉM GARANTE, e esta é a diferença desta fase para o `Assignment`:
 * lá a guarda é só da aplicação porque CHECK constraint não é expressável no
 * schema do Prisma; aqui o CHECK `accessory_checkout_alvo_xor` foi escrito à
 * mão na migration. Esta função continua existindo para dar 422 com o nome do
 * campo que falta — o P2002 do CHECK viraria uma mensagem sobre constraint, que
 * não ensina nada a quem preencheu o formulário.
 *
 * Devolve o id do alvo já escolhido: o resto do use-case grava a partir dele, e
 * nunca mais lê as duas chaves do corpo. É o que garante que a outra fique
 * nula, em vez de depender de o cliente ter mandado só uma.
 */
function assertAlvoCoerente(data: CheckoutAccessoryData): string {
  const alvoId = data[FK_DO_ALVO[data.targetType]];
  const intrusa = data.targetType === 'USER' ? data.targetLocationId : data.targetUserId;

  if (intrusa) {
    throw new AppError(
      'Uma entrega tem UM alvo: preencha só a chave que corresponde ao targetType.',
      422,
      { targetType: data.targetType, sobrando: FK_DO_ALVO[data.targetType === 'USER' ? 'LOCATION' : 'USER'] },
    );
  }

  if (!alvoId) {
    throw new AppError(`Entrega do tipo "${data.targetType}" exige ${ROTULO_DO_ALVO[data.targetType]}.`, 422);
  }

  return alvoId;
}

/**
 * O alvo existe e pode receber?
 *
 * Pessoa sai por `findFirst`, que o escopo da lixeira alcança: não se entrega
 * nada a um cadastro apagado. Localização não tem lixeira (D8), então
 * `findUnique`.
 *
 * POSTO SEM OCUPANTE NÃO É ERRO e não é conferido aqui. Recusar quebraria o
 * caso real de preparar a mesa antes de a pessoa chegar — a unidade fica
 * entregue ao posto, resolve para "ninguém" e aparece no alerta de posto vago,
 * que é onde ela tem que aparecer.
 */
async function assertAlvoApto(
  client: ClienteEstoque,
  tipo: 'USER' | 'LOCATION',
  alvoId: string,
): Promise<void> {
  if (tipo === 'LOCATION') {
    const local = await client.location.findUnique({ where: { id: alvoId }, select: { id: true } });
    if (!local) throw new AppError('Localização não encontrada.', 404);
    return;
  }

  const pessoa = await client.user.findFirst({
    where: { id: alvoId },
    select: { id: true, name: true, isActive: true },
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  // DESLIGADO é diferente de APAGADO, e os dois precisam ser recusados (D32).
  // Entregar a quem saiu reabriria, uma linha depois do desligamento,
  // exatamente a pendência que o desligamento fechou. 409 e não 404: a pessoa
  // existe, o estado dela é que recusa.
  if (!pessoa.isActive) {
    throw new AppError(`${pessoa.name} está desligado(a) e não pode receber equipamento.`, 409);
  }
}

export async function checkoutAccessory(
  accessoryId: string,
  data: CheckoutAccessoryData,
  actorId: string | null,
) {
  // Fora da transação: é validação de FORMATO do corpo, não lê o banco, e abrir
  // transação para recusar um payload incoerente é segurar conexão à toa.
  const alvoId = assertAlvoCoerente(data);

  return prisma.$transaction(async (tx) => {
    // ORDEM DE TRAVAMENTO: **usuário antes do item**, a mesma regra que a F4
    // fixou para usuário antes de ativo (`user/use-cases/lock-user.usecase.ts`).
    // Duas transações que travam os mesmos dois recursos em ordens opostas
    // travam uma à outra, e o Postgres mata uma delas.
    //
    // Só no alvo `USER`, e pelo motivo que o desligamento explica: o `offboard`
    // fecha os checkouts de alvo USER desta pessoa, e sem a trava uma entrega
    // simultânea nasceria DEPOIS da leitura dele — o desligado terminaria com
    // unidade na mão e nada acusaria.
    if (data.targetType === 'USER') await travarUsuarioOuFalhar(tx, alvoId);

    // A TRAVA DA LINHA-PAI — o mutex do saldo (D34).
    //
    // CONTAR NÃO É TRAVAR: duas requisições podem contar "4 de 5 ocupados" e as
    // duas inserirem, dando 6 de 5. Em READ COMMITTED nenhuma enxerga o
    // checkout que a outra ainda não confirmou, e nenhum `if` pega isso.
    // Precisa ser DENTRO da transação: um lock em autocommit é um lock que dura
    // zero milissegundo.
    await travarItemOuFalhar(tx, 'ACCESSORY', accessorySpec.rotulo, accessoryId);

    // `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
    // `findUnique`, e acessório na lixeira não se entrega.
    const acessorio = await tx.accessory.findFirst({
      where: { id: accessoryId },
      select: { id: true, name: true, qty: true },
    });
    if (!acessorio) throw new AppError('Nenhum acessório com este identificador.', 404);

    await assertAlvoApto(tx, data.targetType, alvoId);

    // A conta, DEPOIS da trava. Antes dela seria a mesma leitura suja que o
    // `if` sozinho faz.
    const emUso = await contarEmUsoDe(tx, 'ACCESSORY', accessoryId);
    assertDisponivel(accessorySpec.rotulo, 1, acessorio.qty, emUso);

    const checkout = await tx.accessoryCheckout.create({
      data: {
        accessoryId,
        targetType: data.targetType,
        targetUserId: data.targetType === 'USER' ? alvoId : null,
        targetLocationId: data.targetType === 'LOCATION' ? alvoId : null,
        expectedCheckinAt: data.expectedCheckinAt ?? null,
        checkoutNotes: data.notes ?? null,
        checkoutById: actorId,
      },
      select: ACCESSORY_CHECKOUT_SELECT,
    });

    // No histórico do ACESSÓRIO, que é onde alguém abre para perguntar "para
    // onde foram os 5 mouses". O `StockLog` NÃO recebe nada: a quantidade
    // nominal não mudou, e ele só responde por ela (Etapa D).
    await recordActivity(tx, {
      entityType: accessorySpec.entityType,
      entityId: accessoryId,
      action: 'CHECKOUT',
      changes: {
        checkoutId: checkout.id,
        targetType: data.targetType,
        targetId: alvoId,
        // O saldo DEPOIS desta entrega: é o número que explica o evento sem
        // obrigar quem lê o histórico a recontar as linhas de saída daquele dia.
        disponivel: acessorio.qty - emUso - 1,
      },
    }, actorId);

    return checkout;
  });
}
