import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  booleano, dataOpcional, mesesOpcional, nomeObrigatorio, textoOpcional,
  uuidObrigatorio, uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';
import { MAX_VALOR } from '../../custom-field/helpers/field-validator.helper';

// Contrato de entrada das rotas de ativo.
//
// `strictObject` recusa campo desconhecido em vez de ignorar em silêncio — é o
// que fecha o mass assignment.
//
// NÃO existe `categoryId` aqui: a categoria do ativo é a do modelo. Aceitar uma
// categoria digitada permitiria um ativo de categoria "Monitor" apontando para
// um modelo de categoria "Notebook".
//
// NÃO existe `quantity`: um ativo é UM equipamento (D3).
//
// NÃO existe mais `assignedToId`: a operação foi para o CHECKOUT/CHECKIN
// (docs/referencia/modelo-de-posse.md). A coluna continua no banco e continua saindo na
// resposta (`ASSET_SELECT`), mas virou cache do caso `targetType: USER` da
// `Assignment` — quem escreve nela é só a entrega e a devolução. Um campo
// editável à mão ao lado de uma tabela de posse são duas fontes de verdade para
// o mesmo fato, e nada impede divergirem. Como `strictObject` recusa chave
// desconhecida, mandar `assignedToId` para /api/assets agora responde 422, que
// é a resposta certa: a operação existe, só não é esta.

/**
 * Etiqueta do ativo. Chave AUSENTE **ou** valor vazio significam a mesma coisa:
 * "gere a partir do contador de `AppSetting`".
 *
 * O `preprocess` não é zelo. `.optional()` sozinho só aceita a chave ausente, e
 * o formulário sempre manda a chave — `assetTag: ''` quando o usuário não digita
 * nada e deixa a etiqueta automática fazer o trabalho. Sem isto o `''` cai no
 * `.min(1)` e a etiqueta automática fica INALCANÇÁVEL pela tela, respondendo
 * 422 "etiqueta não pode ser vazio". É a mesma armadilha do `mesesOpcional`, e
 * a solução é a mesma: normalizar antes de validar.
 */
const etiquetaOpcional = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
  nomeObrigatorio('etiqueta').optional(),
);

const camposComuns = {
  serial: textoOpcional('número de série', 150),
  name: textoOpcional('nome', 200),
  notes: textoOpcional('notas', 2_000),

  byod: booleano('equipamento do colaborador').optional(),
  requestable: booleano('pode ser solicitado').optional(),

  locationId: uuidOpcional('localização'),
  supplierId: uuidOpcional('fornecedor'),

  orderNumber: textoOpcional('número do pedido', 100),
  purchaseDate: dataOpcional('data de compra'),
  purchaseCost: valorMonetarioOpcional('valor de compra'),

  warrantyMonths: mesesOpcional('garantia'),
  eolMonths: mesesOpcional('vida útil'),
  eolDate: dataOpcional('fim de vida'),
  eolExplicit: booleano('fim de vida definido à mão').optional(),

  // ── OS CAMPOS CUSTOMIZADOS (F9, Etapa B) ─────────────────────────────────
  //
  // UM campo do schema, com o conteúdo opaco aqui de propósito — e isso não é
  // preguiça, é a única forma de manter as duas garantias da borda.
  //
  // O `strictObject` acima recusa chave desconhecida (é o que fecha o mass
  // assignment da F0) e ele NÃO PODE conhecer campos criados em runtime. As duas
  // saídas ruins eram montar o schema por requisição — o controller passaria a
  // consultar o banco antes do `parse`, e a allowlist estática viraria uma
  // allowlist vinda do banco — ou aceitar `z.any()`, que é o mass assignment de
  // volta pela brecha.
  //
  // Então a borda valida a FORMA (é um objeto raso de chave para valor?) e o
  // conteúdo é validado onde o conjunto resolvido é conhecido:
  // `custom-field/use-cases/validate-custom-fields.usecase.ts`. O 422 de lá sai
  // com o `slug` em `fields`, no mesmo formato do `formatZodError` — é assim que
  // a tela sabe em qual input pintar a mensagem.
  //
  // `z.unknown()` no valor e não `z.string()`: o formulário manda booleano de
  // verdade num `CHECKBOX` e número num campo numérico. Normalizar isso é
  // trabalho do motor (`normalizarValor`), num lugar só.
  customFields: z.record(z.string(), z.unknown()).optional(),
};

export const createAssetSchema = z.strictObject({
  // Ausente ou vazia, a etiqueta é gerada pelo contador de `AppSetting`. É por
  // isso que o campo é opcional aqui e obrigatório no banco.
  assetTag: etiquetaOpcional,
  statusId: uuidObrigatorio('status'),
  modelId: uuidObrigatorio('modelo'),
  ...camposComuns,
});

// Edição: todo campo é opcional — ausente significa "mantém o valor atual".
// Etiqueta apagada no formulário também significa isso: a coluna é obrigatória
// no banco, então "limpar" não é uma operação que exista.
export const updateAssetSchema = z.strictObject({
  assetTag: etiquetaOpcional,
  statusId: uuidObrigatorio('status').optional(),
  modelId: uuidObrigatorio('modelo').optional(),
  ...camposComuns,
});

export const serialParamSchema = z.strictObject({
  serial: z.string().trim().min(1, 'número de série é obrigatório').max(150),
});

// ---------------------------------------------------------------------------
// DESCOMISSIONAR
// ---------------------------------------------------------------------------

/**
 * O motivo vem do enum do banco, e não de uma lista escrita de novo aqui: um
 * valor a mais em `RetiredReason` passa a ser aceito sem ninguém lembrar deste
 * arquivo, e um valor removido vira erro de compilação em vez de 500 na
 * gravação.
 */
export const retireAssetSchema = z.strictObject({
  retiredReason: z.enum($Enums.RetiredReason, 'motivo da saída inválido'),
  // Ausente = agora. A venda pode ter sido na semana passada e o registro hoje.
  retiredAt: dataOpcional('data da saída'),
  // A justificativa do evento. Vai para o `ActivityLog`, não para uma coluna
  // (ver retire-asset.usecase.ts).
  notes: textoOpcional('observações', 2_000),
});

// ---------------------------------------------------------------------------
// AÇÃO EM MASSA
// ---------------------------------------------------------------------------

/**
 * Teto de ids por lote.
 *
 * Não é número redondo por acaso: são ~201 statements dentro de uma
 * `$transaction` nas três operações de coluna, e ~401 na de campo customizado
 * (que grava linha a linha, porque o JsonB de cada ativo é diferente) — o que
 * cabe com folga no timeout explícito do use-case.
 * Sem teto, `ids` com 50 mil uuids é uma negação de serviço de uma linha só.
 */
export const BULK_MAX_IDS = 200;

const idsDoLote = z
  .array(z.uuid('ativo: identificador inválido'))
  .min(1, 'selecione ao menos um ativo')
  .max(BULK_MAX_IDS, `máximo de ${BULK_MAX_IDS} ativos por lote`);

/**
 * A OPERAÇÃO É DECLARADA, e o que ela exige vem junto — `discriminatedUnion`
 * sobre `op`, não um objeto com três campos opcionais.
 *
 * É a allowlist de operação escrita no lugar onde ela é verificada: `op:
 * 'status'` sem `statusId` responde 422 dizendo o campo que falta, e
 * `op: 'delete'` com `statusId` junto responde 422 pelo `strictObject` — em vez
 * de apagar 200 ativos ignorando em silêncio o campo que sugeria outra coisa.
 */
export const bulkAssetsSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('status'),
    ids: idsDoLote,
    statusId: uuidObrigatorio('status'),
  }),
  z.strictObject({
    op: z.literal('location'),
    ids: idsDoLote,
    // Nulável de propósito: "tirar a localização" é uma operação em massa tão
    // legítima quanto mover — o campo é opcional na tabela.
    locationId: uuidObrigatorio('localização').nullable(),
  }),
  z.strictObject({
    op: z.literal('delete'),
    ids: idsDoLote,
  }),
  // ── PREENCHER UM CAMPO CUSTOMIZADO EM MASSA (F9, o backfill do D61) ──────
  //
  // Pelo `fieldId` e não pelo `slug`, como toda referência do lote: um id errado
  // responde 404 "campo não encontrado", enquanto um slug errado só se descobre
  // como "o conjunto deste modelo não tem esse campo" — mensagem sobre a seleção
  // para um erro que é do seletor.
  //
  // `value` NULÁVEL de propósito: `null` (e `''`, que o use-case normaliza para
  // o mesmo) é LIMPAR o campo nos N ativos, e limpar REMOVE a chave. É operação
  // legítima — e é recusada quando o campo é obrigatório em algum dos conjuntos
  // alcançados, porque aí ela deixaria N ativos num estado que a edição de um só
  // não produz.
  //
  // O conteúdo é conferido contra o FORMATO do campo no use-case, não aqui: é o
  // mesmo motivo de `customFields` ser opaco no schema do ativo — a borda não
  // pode conhecer campo criado em runtime.
  z.strictObject({
    op: z.literal('custom-field'),
    ids: idsDoLote,
    fieldId: uuidObrigatorio('campo customizado'),
    value: z.string().max(MAX_VALOR, `valor: máximo de ${MAX_VALOR} caracteres`).nullable(),
  }),
], 'operação inválida: use status, location, delete ou custom-field');

// O `historyQuerySchema` da aba Histórico mudou para `shared/history.schema.ts`
// quando a pessoa ganhou o dela — o ativo não é mais o único a ter histórico.
