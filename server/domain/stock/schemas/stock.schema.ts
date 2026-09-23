import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  dataOpcional, nomeObrigatorio, textoOpcional, uuidObrigatorio,
  uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';

// Contrato de entrada das rotas de estoque. Os três tipos compartilham quase
// tudo — o que varia mora em `accessory.schema.ts`, `consumable.schema.ts` e
// `component.schema.ts`, que são três arquivos de poucas linhas cada.
//
// `strictObject` em tudo: campo desconhecido é 422, não silêncio. É o que fecha
// o mass assignment — e é também o que implementa o D34 no formulário, como a
// próxima constante explica.

/** Teto de unidades por operação. Acima disso é carga, não operação de tela. */
const MAX_UNIDADES = 100_000;

export const quantidadeObrigatoria = (rotulo: string) =>
  z.coerce.number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser um número inteiro`)
    .min(0, `${rotulo} não pode ser negativa`)
    .max(MAX_UNIDADES, `${rotulo}: máximo de ${MAX_UNIDADES}`);

/**
 * `minQty` opcional.
 *
 * O `preprocess` não é zelo: `z.coerce.number()` roda `Number('')`, que é **0**
 * — e `minQty = 0` significa "alerte quando o disponível ficar abaixo de zero",
 * ou seja, nunca. Deixar o campo em branco no formulário gravaria um piso mudo
 * em vez de `null`. É a mesma armadilha do `mesesOpcional` da F1.
 */
export const minimoOpcional = z.preprocess(
  (valor) => (valor === '' ? null : valor),
  z.coerce.number('estoque mínimo deve ser um número')
    .int('estoque mínimo deve ser um número inteiro')
    .min(0, 'estoque mínimo não pode ser negativo')
    .max(MAX_UNIDADES, `estoque mínimo: máximo de ${MAX_UNIDADES}`)
    .nullish(),
);

/**
 * Os campos que os três tipos têm em comum.
 *
 * `qty` NÃO está aqui — ele entra só no schema de CRIAÇÃO, e por isso está
 * declarado à parte em `camposDeCriacao`.
 */
export const camposComunsDoItem = {
  minQty: minimoOpcional,
  modelNumber: textoOpcional('número do modelo', 150),

  manufacturerId: uuidOpcional('fabricante'),
  supplierId: uuidOpcional('fornecedor'),
  locationId: uuidOpcional('localização'),

  orderNumber: textoOpcional('número do pedido', 100),
  purchaseDate: dataOpcional('data de compra'),
  purchaseCost: valorMonetarioOpcional('valor de compra'),

  notes: textoOpcional('notas', 2_000),
};

/** Criação: nome, categoria e a quantidade inicial são obrigatórios. */
export const camposDeCriacao = {
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  qty: quantidadeObrigatoria('quantidade'),
  ...camposComunsDoItem,
};

/**
 * Edição: todo campo é opcional — ausente significa "mantém o valor atual".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `qty` NÃO EXISTE AQUI, e essa ausência é a regra inteira.
 *
 * Quantidade é CONSEQUÊNCIA de movimentação, não atributo digitável — o mesmo
 * argumento do D17 para `Asset.assignedToId`. Com a chave declarada, existiriam
 * dois caminhos para mudar a quantidade e só um gravaria `StockLog`: o
 * histórico de estoque teria buracos que ninguém consegue explicar depois, e o
 * `PUT` do formulário seria justamente o caminho silencioso.
 *
 * NÃO é uma validação que recusa `qty` — é a chave não estar declarada. O
 * `strictObject` devolve 422 "campo não reconhecido" sozinho, e não há checagem
 * que alguém possa esquecer de escrever no próximo schema. Mesmo princípio do
 * D37: a segurança vem da ausência do nome.
 *
 * Quem muda quantidade é `POST /api/<tipo>/:id/adjust-quantity`, na mesma
 * transação que grava o log.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const camposDeEdicao = {
  name: nomeObrigatorio('nome').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  ...camposComunsDoItem,
};

// ---------------------------------------------------------------------------
// AJUSTE DE ESTOQUE — a única porta para `qty` (Etapa D)
// ---------------------------------------------------------------------------

/**
 * POR QUE O MOTIVO É ENUM, e não texto livre: é campo de relatório, e texto
 * livre aqui vira "compra", "Compra" e "comprado" na mesma coluna. É o D5
 * aplicado a mais uma coluna — o mesmo argumento do `RetiredReason`.
 *
 * O valor vem do enum do BANCO, não de uma lista reescrita aqui: um valor a
 * mais passa a ser aceito sem ninguém lembrar deste arquivo, e um valor
 * removido vira erro de compilação em vez de 500 na gravação.
 */
export const adjustQuantitySchema = z.strictObject({
  /**
   * Quanto SOMAR. Negativo é baixa.
   *
   * Delta, e não o valor final, de propósito: o valor final é ler-e-depois-
   * escrever com outro nome — duas recontagens simultâneas gravariam a mesma
   * `qty` e uma das duas sumiria sem erro. O delta é aplicado com `increment`,
   * que o Postgres resolve na linha travada.
   */
  delta: z.coerce.number('o ajuste deve ser um número')
    .int('o ajuste deve ser um número inteiro')
    .refine((valor) => valor !== 0, 'um ajuste de zero não muda nada')
    .refine((valor) => Math.abs(valor) <= MAX_UNIDADES, `ajuste: máximo de ${MAX_UNIDADES} unidades`),

  reason: z.enum($Enums.StockAdjustReason, 'motivo do ajuste inválido'),

  notes: textoOpcional('observações', 2_000),
});

export type AdjustQuantityData = z.infer<typeof adjustQuantitySchema>;
