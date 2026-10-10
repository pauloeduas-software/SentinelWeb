import { z } from 'zod';
import {
  booleano, dataOpcional, emailOpcional, nomeObrigatorio, textoOpcional,
  uuidObrigatorio, uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';

// Contrato de entrada das rotas de licença.
//
// `strictObject` em tudo: campo desconhecido é 422, não silêncio. É o que fecha
// o mass assignment.

/** Teto de assentos por contrato. Acima disso é carga, não operação de tela. */
const MAX_ASSENTOS = 100_000;

const assentosObrigatorios = z.coerce.number('total de assentos deve ser um número')
  .int('total de assentos deve ser um número inteiro')
  .min(0, 'total de assentos não pode ser negativo')
  .max(MAX_ASSENTOS, `total de assentos: máximo de ${MAX_ASSENTOS}`);

/**
 * `minSeats` opcional.
 *
 * O `preprocess` não é zelo: `z.coerce.number()` roda `Number('')`, que é **0**
 * — e `minSeats = 0` significa "alerte quando os livres ficarem abaixo de
 * zero", ou seja, nunca. Deixar o campo em branco gravaria um piso mudo em vez
 * de `null`. É a mesma armadilha do `minQty` da F5.
 */
const minimoOpcional = z.preprocess(
  (valor) => (valor === '' ? null : valor),
  z.coerce.number('mínimo de assentos deve ser um número')
    .int('mínimo de assentos deve ser um número inteiro')
    .min(0, 'mínimo de assentos não pode ser negativo')
    .max(MAX_ASSENTOS, `mínimo de assentos: máximo de ${MAX_ASSENTOS}`)
    .nullish(),
);

const camposComuns = {
  reassignable: booleano('reatribuível').optional(),
  maintained: booleano('com manutenção').optional(),

  expirationDate: dataOpcional('data de vencimento'),
  terminationDate: dataOpcional('data de encerramento'),

  licensedToName: textoOpcional('licenciado para', 200),
  licensedToEmail: emailOpcional,

  minSeats: minimoOpcional,

  manufacturerId: uuidOpcional('fabricante'),

  orderNumber: textoOpcional('número do pedido', 100),
  purchaseDate: dataOpcional('data de compra'),
  purchaseCost: valorMonetarioOpcional('valor de compra'),

  notes: textoOpcional('notas', 2_000),
};

export const createLicenseSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  seatsTotal: assentosObrigatorios,
  ...camposComuns,
});

/**
 * Edição: todo campo é opcional — ausente significa "mantém o valor atual".
 *
 * `seatsTotal` ESTÁ AQUI, ao contrário do `qty` do estoque, e a diferença é
 * real: `qty` é consequência de movimentação (entrou nota, quebrou), enquanto
 * `seatsTotal` é o NÚMERO DO CONTRATO — alguém comprou mais assentos, e digitar
 * isso é a operação. O que não pode é ele mudar sem as linhas mudarem junto, e
 * disso cuida `reconcile-seats.usecase.ts`, na MESMA transação.
 */
export const updateLicenseSchema = z.strictObject({
  name: nomeObrigatorio('nome').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  seatsTotal: assentosObrigatorios.optional(),
  ...camposComuns,
});

/**
 * A ENTREGA de UM assento.
 *
 * O ALVO É PESSOA **XOR** ATIVO (D39). SEM discriminante: com só dois alvos
 * possíveis, a chave preenchida já diz qual é — um `targetType` aqui seria uma
 * terceira coisa capaz de discordar das outras duas, que é exatamente o estado
 * que o CHECK do `Assignment` existe para impedir. O use-case recusa as duas e
 * recusa nenhuma, com 422 e a frase que ensina; o CHECK do banco é a rede.
 *
 * NÃO EXISTE `seatId` AQUI, e a ausência é a regra: quem escolhe o assento é o
 * servidor, com `FOR UPDATE … SKIP LOCKED`. Deixar o cliente escolher reabriria
 * a corrida inteira — duas telas mostrando "assento 3 livre" mandariam as duas
 * o mesmo número.
 *
 * NÃO EXISTE `assignedLocationId`, e essa ausência é o D39: posto não é alvo. O
 * `strictObject` responde 422 sozinho, sem uma validação que alguém possa
 * remover depois.
 */
export const checkoutSeatSchema = z.strictObject({
  assignedUserId: uuidObrigatorio('colaborador').optional(),
  assignedAssetId: uuidObrigatorio('ativo').optional(),
  notes: textoOpcional('observações', 2_000),
});

export const checkinSeatSchema = z.strictObject({
  notes: textoOpcional('observações', 2_000),
});

export type CreateLicenseData = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseData = z.infer<typeof updateLicenseSchema>;
export type CheckoutSeatData = z.infer<typeof checkoutSeatSchema>;
export type CheckinSeatData = z.infer<typeof checkinSeatSchema>;
