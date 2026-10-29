import { z } from 'zod';
import {
  diaNaoFuturo, nomeObrigatorio, textoOpcional, uuidObrigatorio, uuidOpcional, versaoLida
} from '../../shared/fields.schema';

// Contrato de entrada do ESTOQUE — a mesma forma do da licença
// (`license.schema.ts`), porque a lógica é a mesma (AE).
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez
// de gravação silenciosa.

/** Teto do total — o mesmo da quantidade comprada da licença. */
const MAX_UNIDADES = 100_000;

/**
 * `z.number` e não `z.coerce.number`, como na licença: o `coerce` roda
 * `Number(null)`, `Number(true)` e `Number([5])`, e um `{"qty": null}` virava 0
 * — 422 de "mínimo" em vez de "todas" na devolução. A tela manda número.
 */
const quantidade = (rotulo: string, max: number, min = 1) =>
  z.number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser um número inteiro`)
    .min(min, `${rotulo}: mínimo de ${min}`)
    .max(max, `${rotulo}: máximo de ${max}`);

/**
 * O TOTAL é o que existe (AJ). O cadastro pede ao menos UM, como a quantidade
 * comprada da licença; depois ele chega a 0 quando acaba — pela entrega do
 * consumível ou pela edição. Negativo nunca (CHECK
 * `stock_items_qty_nao_negativa`).
 */
const totalDoCadastro = quantidade('quantidade', MAX_UNIDADES);
const totalDaEdicao = quantidade('quantidade', MAX_UNIDADES, 0);

export const createStockItemSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  qty: totalDoCadastro,
  // Onde o que sobra fica guardado — o Depósito de TI. Opcional.
  locationId: uuidOpcional('localização'),
  notes: textoOpcional('notas', 2_000),
});

/**
 * Edição: todo campo é opcional — ausente significa "mantém o valor atual". A
 * tela manda o formulário inteiro (AF); o Desativar manda só `isActive`.
 *
 * `qty` ESTÁ AQUI, como o `seatsTotal` da licença: chegou mais, a recontagem
 * deu outro número — digitar o total É a correção. Aumentar sempre pode;
 * reduzir não passa do que está em uso (`update-stock-item`).
 *
 * `isActive` é o Desativar e o Reativar da tela.
 */
export const updateStockItemSchema = z.strictObject({
  name: nomeObrigatorio('nome').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  qty: totalDaEdicao.optional(),
  locationId: uuidOpcional('localização'),
  notes: textoOpcional('notas', 2_000),
  isActive: z.boolean('ativo: use true ou false').optional(),
  updatedAt: versaoLida,
});

/**
 * A ENTREGA: `qty` unidades a UM alvo, num dia. Cada unidade vira uma linha; o
 * teto por requisição existe porque são N `INSERT`s numa transação, e ninguém
 * entrega mil mouses de uma vez pela tela.
 *
 * O alvo `ASSET` é só do componente (AI) — quem confere é o use-case, que lê a
 * categoria do item.
 *
 * As três FKs são opcionais aqui e a obrigatoriedade de UMA fica no use-case
 * (`assertAlvoCoerente`), pelo mesmo motivo do checkout de ativo: a regra é
 * "exatamente uma, e a que casa com o `targetType`", e no use-case ela vira
 * `AppError(…, 422)` com o texto que ensina o modelo.
 */
export const checkoutStockSchema = z.strictObject({
  targetType: z.enum(['PERSON', 'WORKSTATION', 'ASSET'], 'tipo de alvo inválido: use PERSON, WORKSTATION ou ASSET'),
  targetPersonId: uuidOpcional('colaborador'),
  targetWorkstationId: uuidOpcional('posto'),
  targetAssetId: uuidOpcional('computador'),
  qty: quantidade('quantidade', 100).default(1),
  notes: textoOpcional('observações', 2_000),
  /** Ausente é hoje. Passado é o caso real: registrar a entrega que já aconteceu. */
  checkoutAt: diaNaoFuturo('data da entrega'),
});

/**
 * A DEVOLUÇÃO de uma entrega: quantas voltam e o dia. `qty` ausente é TODAS as
 * que ainda estão com o alvo nesta entrega — a devolução dela inteira, como
 * na licença. O dia ausente é hoje; nunca futuro, e nunca antes do dia da
 * entrega — esta conta precisa da entrega, e mora no use-case.
 */
export const checkinStockSchema = z.strictObject({
  qty: quantidade('quantidade', 100).optional(),
  checkinAt: diaNaoFuturo('data da devolução'),
});

/**
 * Os filtros da LISTAGEM que não são do `parseListQuery`. O controller separa a
 * query antes de qualquer `parse`, como no `license.controller.ts`: os dois
 * schemas são estritos e cada um recebe só o que é seu.
 */
export const stockFiltersSchema = z.strictObject({
  categoryId: z.uuid('categoria: identificador inválido').optional(),
});

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;
export type CheckoutStockInput = z.infer<typeof checkoutStockSchema>;
export type CheckinStockInput = z.infer<typeof checkinStockSchema>;
export type StockFilters = z.infer<typeof stockFiltersSchema>;
