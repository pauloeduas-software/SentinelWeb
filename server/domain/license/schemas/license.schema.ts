import { z } from 'zod';
import {
  dataOpcional, diaNaoFuturo, emailOpcional, nomeObrigatorio, textoOpcional,
  uuidObrigatorio, uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';

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
};

/** O texto de uma chave: uma linha, nunca vazia. */
const textoDaChave = z.string('chave: informe a chave')
  .trim()
  .min(1, 'chave: não pode ser vazia')
  .max(500, 'chave: máximo de 500 caracteres')
  .refine((valor) => !/[\r\n]/.test(valor), 'chave: uma linha só');

/** Quantas licenças a chave cobre: 1 na chave individual, mais na de volume. */
const coberturaDaChave = z.number('chave: informe quantas licenças ela cobre')
  .int('chave: cobre um número inteiro de licenças')
  .min(1, 'chave: cobre ao menos 1 licença')
  .max(MAX_LICENCAS, `chave: cobre no máximo ${MAX_LICENCAS}`);

/**
 * AS CHAVES DA LICENÇA (AC) — a lista inteira, como ficará. No cadastro, só
 * chaves novas. Na edição, a que traz `id` é uma que já existe (o texto ou o
 * "cobre" podem mudar), a sem `id` é nova, e a que ficou fora da lista sai.
 * Ausente na edição é "mantém as chaves como estão".
 */
const chavesNovas = z.array(
  z.strictObject({ productKey: textoDaChave, seats: coberturaDaChave }),
  'chaves: envie uma lista',
).max(MAX_LICENCAS, `chaves: no máximo ${MAX_LICENCAS}`);

const chavesDaEdicao = z.array(
  z.strictObject({ id: uuidObrigatorio('chave').optional(), productKey: textoDaChave, seats: coberturaDaChave }),
  'chaves: envie uma lista',
).max(MAX_LICENCAS, `chaves: no máximo ${MAX_LICENCAS}`);

export const createLicenseSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  categoryId: uuidObrigatorio('categoria'),
  seatsTotal: quantidadeObrigatoria,
  ...camposComuns,
  keys: chavesNovas.optional(),
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
  keys: chavesDaEdicao.optional(),
});

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
  /**
   * Uma das chaves da licença (AC). Obrigatória quando a licença tem chaves —
   * quem confere é o use-case, que sabe se ela tem.
   */
  licenseKeyId: uuidObrigatorio('chave').optional(),
});

/**
 * Trocar a chave de uma entrega ABERTA — e só a chave — por outra da lista. Sem
 * "limpar": a licença que tem chaves pede uma em toda entrega.
 */
export const checkoutKeySchema = z.strictObject({
  licenseKeyId: uuidObrigatorio('chave'),
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
  /**
   * Um dos quatro status. Sem abas (AF): a encerrada fica na mesma lista, e
   * `ENCERRADA` é o filtro que a separa. `EXPIRADA` é a que a tela chama de
   * vencida.
   */
  status: z.enum(
    ['ATIVA', 'VENCENDO', 'EXPIRADA', 'ENCERRADA'],
    'status inválido: use ATIVA, VENCENDO, EXPIRADA ou ENCERRADA',
  ).optional(),
  /** `sim`: só as que alguém ainda usa — a encerrada em uso, do alerta. */
  emUso: z.enum(['sim'], 'emUso inválido: use sim').optional(),
});

export type CreateLicenseData = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseData = z.infer<typeof updateLicenseSchema>;
export type CheckoutLicenseData = z.infer<typeof checkoutLicenseSchema>;
export type CheckinLicenseData = z.infer<typeof checkinLicenseSchema>;
export type CheckoutKeyData = z.infer<typeof checkoutKeySchema>;
export type ChaveNoCorpo = NonNullable<UpdateLicenseData['keys']>[number];
export type LicenseFilters = z.infer<typeof licenseFiltersSchema>;
export type StatusDoFiltro = NonNullable<LicenseFilters['status']>;
