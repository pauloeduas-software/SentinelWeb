import { z } from 'zod';
import {
  dataOpcional, emailOpcional, nomeObrigatorio, textoOpcional,
  uuidObrigatorio, uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';
import { hojeNoBrasil } from '../../shared/hoje.helper';

// Contrato de entrada das rotas de licença.
//
// `strictObject` em tudo: campo desconhecido é 422, não silêncio. É o que fecha
// o mass assignment.

/** Teto da quantidade comprada. Acima disso é carga, não operação de tela. */
const MAX_LICENCAS = 100_000;

/**
 * A quantidade comprada, ao menos UMA: zero não é contrato, e a licença que
 * acabou se encerra. `z.number` e não `z.coerce.number`: o `coerce` roda
 * `Number(null)` e `Number('')`, que são **0** — um `{"seatsTotal": null}`
 * zerava o contrato em vez de responder 422. A tela manda número.
 */
const quantidadeObrigatoria = z.number('quantidade comprada deve ser um número')
  .int('quantidade comprada deve ser um número inteiro')
  .min(1, 'quantidade comprada: mínimo de 1')
  .max(MAX_LICENCAS, `quantidade comprada: máximo de ${MAX_LICENCAS}`);

/**
 * O dia de uma entrega ou de uma devolução: hoje ou antes, contra o dia de
 * BRASÍLIA. Não é o `dataNaoFutura` de `fields.schema.ts`, que compara com a
 * meia-noite UTC e recusaria "hoje" depois das 21h — o defeito que ainda está
 * pendente lá (`hoje.helper.ts`).
 */
const diaNaoFuturo = (rotulo: string) =>
  dataOpcional(rotulo).refine(
    (valor) => !valor || valor <= hojeNoBrasil(),
    `${rotulo} não pode ser uma data futura`,
  );

const camposComuns = {
  expirationDate: dataOpcional('data de vencimento'),
  terminationDate: dataOpcional('data de encerramento'),

  licensedToName: textoOpcional('licenciado para', 200),
  licensedToEmail: emailOpcional,

  manufacturerId: uuidOpcional('fabricante'),

  orderNumber: textoOpcional('número do pedido', 100),
  purchaseDate: dataOpcional('data de compra'),
  purchaseCost: valorMonetarioOpcional('valor de compra'),

  notes: textoOpcional('notas', 2_000),

  /**
   * A chave de volume, ou a lista das chaves compradas — uma por linha. Vazio ou
   * só espaço vira nulo (`textoOpcional`).
   */
  productKey: textoOpcional('chave do produto', 20_000),
};

export const createLicenseSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  seatsTotal: quantidadeObrigatoria,
  ...camposComuns,
});

/**
 * Edição: todo campo é opcional — ausente significa "mantém o valor atual". A
 * tela manda só o que mudou, para um formulário aberto há tempo não desfazer a
 * edição que outra pessoa salvou no meio.
 */
export const updateLicenseSchema = z.strictObject({
  name: nomeObrigatorio('nome').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  seatsTotal: quantidadeObrigatoria.optional(),
  ...camposComuns,
});

/**
 * A chave de UMA entrega: uma linha só. Vazio ou só espaço vira nulo — é a
 * entrega de uma licença de volume, que não tem chave própria.
 */
const chaveDaEntrega = textoOpcional('chave', 500).refine(
  (valor) => !valor || !/[\r\n]/.test(valor),
  'chave: uma linha só',
);

/**
 * A ENTREGA de uma licença.
 *
 * O ALVO É PESSOA **XOR** ATIVO (D39). SEM discriminante: com só dois alvos
 * possíveis, a chave preenchida já diz qual é. O use-case recusa as duas e
 * recusa nenhuma, com 422 e a frase que ensina; o CHECK do banco é a rede.
 *
 * NÃO EXISTE `assignedWorkstationId`, e essa ausência é o D39: posto não é
 * alvo. O `strictObject` responde 422 sozinho.
 */
export const checkoutLicenseSchema = z.strictObject({
  assignedPersonId: uuidObrigatorio('colaborador').optional(),
  assignedAssetId: uuidObrigatorio('ativo').optional(),
  notes: textoOpcional('observações', 2_000),
  /** Ausente é hoje. Passado é o caso real: registrar a entrega que já aconteceu. */
  checkoutAt: diaNaoFuturo('data da entrega'),
  productKey: chaveDaEntrega,
});

/** Trocar a chave de uma entrega ABERTA — e só a chave. */
export const checkoutKeySchema = z.strictObject({
  productKey: chaveDaEntrega,
}).refine((corpo) => corpo.productKey !== undefined, {
  // Sem a chave no corpo, o `?? null` da gravação apagaria a que está lá. Limpar
  // é mandar `null` ou vazio.
  message: 'chave: informe a chave, ou vazio para limpar',
  path: ['productKey'],
});

/**
 * A DEVOLUÇÃO: só a data. Ausente é hoje; nunca futura, e nunca antes do dia da
 * entrega — esta conta precisa da entrega, e mora no use-case.
 */
export const checkinLicenseSchema = z.strictObject({
  checkinAt: diaNaoFuturo('data da devolução'),
});

/**
 * Os filtros da LISTAGEM que não são do `parseListQuery`. O controller separa a
 * query antes de qualquer `parse`, como no `endpoint.controller.ts`: os dois
 * schemas são estritos e cada um recebe só o que é seu.
 */
export const licenseFiltersSchema = z.strictObject({
  categoryId: z.uuid('categoria: identificador inválido').optional(),
  /** As abas: `atuais` (o que não encerrou) e `encerradas`. */
  view: z.enum(['atuais', 'encerradas'], 'view inválida: use atuais ou encerradas').default('atuais'),
  /** Um dos três status da aba Atuais. `EXPIRADA` é a que a tela chama de vencida. */
  status: z.enum(['ATIVA', 'VENCENDO', 'EXPIRADA'], 'status inválido: use ATIVA, VENCENDO ou EXPIRADA').optional(),
  /** `sim`: só as que alguém ainda usa — a encerrada em uso, do alerta. */
  emUso: z.enum(['sim'], 'emUso inválido: use sim').optional(),
}).refine((filtros) => !(filtros.status && filtros.view === 'encerradas'), {
  // 422 e não silêncio: ignorar o filtro mostraria a aba inteira como se fosse
  // o recorte pedido.
  message: 'status: o filtro de status vale só para a aba atuais',
  path: ['status'],
});

export type CreateLicenseData = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseData = z.infer<typeof updateLicenseSchema>;
export type CheckoutLicenseData = z.infer<typeof checkoutLicenseSchema>;
export type CheckinLicenseData = z.infer<typeof checkinLicenseSchema>;
export type CheckoutKeyData = z.infer<typeof checkoutKeySchema>;
export type LicenseFilters = z.infer<typeof licenseFiltersSchema>;
export type RecorteDaLicenca = LicenseFilters['view'];
export type StatusDoFiltro = NonNullable<LicenseFilters['status']>;
