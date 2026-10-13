import { z } from 'zod';
import { nomeObrigatorio, textoOpcional, uuidObrigatorio, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada do ESTOQUE.
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez
// de gravação silenciosa. Aqui isso fecha uma porta específica — `qty` NÃO
// está no schema de EDIÇÃO: quantidade muda por ENTRADA e BAIXA, que deixam
// linha de movimento; um `PUT` que a aceitasse seria o segundo caminho, sem
// histórico.

const quantidade = (rotulo: string, max: number) =>
  z.coerce.number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser um número inteiro`)
    .min(1, `${rotulo}: mínimo de 1`)
    .max(max, `${rotulo}: máximo de ${max}`);

export const createStockItemSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  // A quantidade INICIAL — vira a primeira ENTRADA, para a movimentação contar
  // a história desde o cadastro. Zero é legítimo: o item existe e ainda não
  // chegou.
  qty: z.coerce.number('quantidade deve ser um número')
    .int('quantidade deve ser um número inteiro')
    .min(0, 'quantidade: mínimo de 0')
    .max(1_000_000, 'quantidade: máximo de 1.000.000')
    .default(0),
  notes: textoOpcional('notas', 2_000),
});

export const updateStockItemSchema = z.strictObject({
  name: nomeObrigatorio('nome').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  notes: textoOpcional('notas', 2_000),
});

/** ENTRADA soma ao total; BAIXA subtrai, nunca abaixo do que está fora. */
export const adjustStockSchema = z.strictObject({
  kind: z.enum(['ENTRADA', 'BAIXA'], 'tipo inválido: use ENTRADA ou BAIXA'),
  qty: quantidade('quantidade', 1_000_000),
  notes: textoOpcional('observação', 2_000),
});

/**
 * A SAÍDA: `qty` unidades a UM alvo. Cada unidade vira uma linha; o teto por
 * requisição existe porque são N `INSERT`s numa transação, e ninguém entrega
 * mil mouses de uma vez pela tela.
 *
 * As duas FKs são opcionais aqui e a obrigatoriedade de UMA fica no use-case
 * (`assertAlvoCoerente`), pelo mesmo motivo do checkout de ativo: a regra é
 * "exatamente uma, e a que casa com o `targetType`", e no use-case ela vira
 * `AppError(…, 422)` com o texto que ensina o modelo.
 */
export const checkoutStockSchema = z.strictObject({
  targetType: z.enum(['USER', 'LOCATION'], 'tipo de alvo inválido: use USER ou LOCATION'),
  targetUserId: uuidOpcional('colaborador'),
  targetLocationId: uuidOpcional('localização'),
  qty: quantidade('quantidade', 100).default(1),
  notes: textoOpcional('observações da saída', 2_000),
});

export const checkinStockSchema = z.strictObject({
  notes: textoOpcional('observações da devolução', 2_000),
});

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type CheckoutStockInput = z.infer<typeof checkoutStockSchema>;
export type CheckinStockInput = z.infer<typeof checkinStockSchema>;
