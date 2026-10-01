import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  booleano, corOpcional, emailOpcional, mesesObrigatorio, mesesOpcional,
  nomeObrigatorio, textoOpcional, urlOpcional, uuidObrigatorio, uuidOpcional,
  valorMonetario,
} from '../../shared/fields.schema';
import { MAX_SLUG, slugificar } from '../../custom-field/helpers/slug.helper';

// Contrato de entrada das sete tabelas de catálogo, num lugar só.
//
// `strictObject` em tudo: campo desconhecido é recusado em vez de ignorado em
// silêncio — é o que fecha o mass assignment (docs/FASE-0-PLANO-ITAM.md).
//
// Os enums vêm de `$Enums`, gerado pelo Prisma a partir do schema: a lista de
// valores válidos tem UMA fonte, o banco. É o fim do texto livre que a Fase 1
// existe para promover (D5/D10).

// ---------------------------------------------------------------- Category
const camposCategoria = {
  color: corOpcional,
  requireAcceptance: booleano('exigir aceite').optional(),
  eulaText: textoOpcional('termo de uso', 5_000),
  checkinEmail: booleano('avisar na devolução').optional(),
  // A ÂNCORA PADRÃO do conjunto de campos customizados (F9, D58). O modelo
  // sobrepõe quando também tem uma; a resolução mora em
  // `custom-field/use-cases/resolve-fieldset.usecase.ts`.
  customFieldsetId: uuidOpcional('conjunto de campos'),
};

export const createCategorySchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido'),
  ...camposCategoria,
});

export const updateCategorySchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido').optional(),
  ...camposCategoria,
});

// ------------------------------------------------------------- StatusLabel
export const createStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido'),
  color: corOpcional,
  showInNav: booleano('mostrar no menu').optional(),
  notes: textoOpcional('notas', 2_000),
});

export const updateStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido').optional(),
  color: corOpcional,
  showInNav: booleano('mostrar no menu').optional(),
  notes: textoOpcional('notas', 2_000),
});

// ------------------------------------------------------------ Manufacturer
const camposFabricante = {
  url: urlOpcional,
  supportPhone: textoOpcional('telefone de suporte', 50),
  supportEmail: emailOpcional,
  supportUrl: urlOpcional,
};

export const createManufacturerSchema = z.strictObject({ name: nomeObrigatorio(), ...camposFabricante });
export const updateManufacturerSchema = z.strictObject({ name: nomeObrigatorio().optional(), ...camposFabricante });

// -------------------------------------------------------------- AssetModel
const camposModelo = {
  modelNumber: textoOpcional('número do modelo', 100),
  eolMonths: mesesOpcional('vida útil'),
  notes: textoOpcional('notas', 2_000),
  // A REGRA DE DEPRECIAÇÃO (F8, Etapa C). Ancora no MODELO e não no ativo porque
  // `Asset` não tem `categoryId` — a categoria vem daqui — e porque vida útil
  // contábil é característica do equipamento: todo notebook daquele modelo
  // deprecia igual. Nulável: a maioria dos modelos nunca terá regra, e valor
  // contábil sem regra é `null`, nunca zero (D55).
  depreciationId: uuidOpcional('regra de depreciação'),

  // A ÂNCORA QUE SOBREPÕE A CATEGORIA (F9, D58). É o único jeito de expressar o
  // campo que só existe num modelo — o IMEI do tablet 4G.
  customFieldsetId: uuidOpcional('conjunto de campos'),
};

export const createAssetModelSchema = z.strictObject({
  name: nomeObrigatorio(),
  manufacturerId: uuidObrigatorio('fabricante'),
  categoryId: uuidObrigatorio('categoria'),
  ...camposModelo,
});

export const updateAssetModelSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  manufacturerId: uuidObrigatorio('fabricante').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  ...camposModelo,
});

// ---------------------------------------------------------------- Supplier
const camposFornecedor = {
  contactName: textoOpcional('contato', 200),
  phone: textoOpcional('telefone', 50),
  email: emailOpcional,
  url: urlOpcional,
  address: textoOpcional('endereço', 300),
  city: textoOpcional('cidade', 100),
  state: textoOpcional('estado', 100),
  zip: textoOpcional('CEP', 20),
  notes: textoOpcional('notas', 2_000),
};

export const createSupplierSchema = z.strictObject({ name: nomeObrigatorio(), ...camposFornecedor });
export const updateSupplierSchema = z.strictObject({ name: nomeObrigatorio().optional(), ...camposFornecedor });

// ---------------------------------------------------------------- Location
const camposLocalizacao = {
  parentId: uuidOpcional('localização pai'),
  managerId: uuidOpcional('gestor'),

  // Marca a folha da árvore que é MESA, e não filial: é o que separa "Mesa 1"
  // de "Filial São Paulo" nas telas e o que alimenta /postos. De APRESENTAÇÃO,
  // não de regra — nenhuma invariante depende dela, e um local sem a marca
  // continua podendo receber ativo e ocupante (prisma/schema.prisma, D15).
  isWorkstation: booleano('é posto de trabalho').optional(),
  address: textoOpcional('endereço', 300),
  city: textoOpcional('cidade', 100),
  state: textoOpcional('estado', 100),
  zip: textoOpcional('CEP', 20),
  phone: textoOpcional('telefone', 50),
  notes: textoOpcional('notas', 2_000),
};

export const createLocationSchema = z.strictObject({ name: nomeObrigatorio(), ...camposLocalizacao });
export const updateLocationSchema = z.strictObject({ name: nomeObrigatorio().optional(), ...camposLocalizacao });

// ------------------------------------------------------------ Depreciation
const camposDepreciacao = {
  floorValue: valorMonetario('valor residual'),
  floorType: z.enum($Enums.DepreciationFloorType, 'tipo de residual inválido'),
};

export const createDepreciationSchema = z.strictObject({
  name: nomeObrigatorio(),
  months: mesesObrigatorio('meses de depreciação'),
  ...camposDepreciacao,
});

export const updateDepreciationSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  months: mesesObrigatorio('meses de depreciação').optional(),
  floorValue: valorMonetario('valor residual').optional(),
  floorType: z.enum($Enums.DepreciationFloorType, 'tipo de residual inválido').optional(),
});

// ------------------------------------------------------- CustomField (F9/A)
//
// A PARTE PLANA de um campo customizado é CRUD de catálogo (D64): listar,
// buscar, ordenar, `ActivityLog` e 409-por-uso é o que o motor genérico já faz.
// O que NÃO cabe na spec — ordem, obrigatoriedade por vínculo e validação de
// valor — mora em `server/domain/custom-field/`.
//
// O que este schema NÃO decide, e é de propósito:
//   - se `format = REGEX` tem padrão, e se `LISTBOX` tem valores: precisa do
//     estado ATUAL da linha na edição (`format` pode vir sem `regexPattern`
//     porque ele já está gravado). Mora no `beforeWrite` da spec.
//   - se o `slug` pode mudar: é o D60, e depende de a linha já existir.
//   - se `encrypted` pode virar: depende de haver valor gravado. Mesma coisa.

/**
 * Um valor da lista de `LISTBOX`/`RADIO`.
 *
 * O teto de 200 entradas não é decoração: a lista viaja inteira em toda leitura
 * do conjunto resolvido, que é o que o formulário de ativo pede a cada abertura.
 */
const valoresDaLista = z
  .array(z.string().trim().min(1, 'valor da lista não pode ser vazio').max(200, 'valor da lista: máximo de 200 caracteres'))
  .max(200, 'lista: máximo de 200 valores');

/**
 * O `slug`. Aceito na entrada, mas quase nunca digitado: ausente, ele é
 * DERIVADO do nome (`slugificar`), e é essa derivação que o torna adivinhável
 * para quem escreve `?cf[ip_fixo]=` à mão.
 *
 * O formato é fechado em `[a-z0-9_]` porque ele é nome de propriedade de JSON e
 * chave de query string ao mesmo tempo — qualquer coisa fora disso exigiria
 * escape num dos dois lugares.
 */
const slugDeCampo = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'identificador não pode ser vazio')
  .max(MAX_SLUG, `identificador: máximo de ${MAX_SLUG} caracteres`)
  .regex(/^[a-z][a-z0-9_]*$/, 'identificador: use letras minúsculas, números e _ (começando por letra)');

const camposDeCampoCustomizado = {
  element: z.enum($Enums.CustomFieldElement, 'elemento de formulário inválido').optional(),
  format: z.enum($Enums.CustomFieldFormat, 'formato de validação inválido').optional(),
  regexPattern: textoOpcional('expressão regular', 200),
  listValues: valoresDaLista.optional(),
  helpText: textoOpcional('texto de ajuda', 500),
  encrypted: booleano('cifrar em repouso').optional(),
  showInListView: booleano('mostrar na listagem').optional(),
  displayInUserView: booleano('mostrar para o colaborador').optional(),
  showInEmail: booleano('mostrar no e-mail').optional(),
};

/**
 * O `slug` NASCE do nome quando não vem no corpo.
 *
 * `transform` no objeto inteiro, e não `default` no campo: o padrão depende de
 * OUTRO campo do mesmo objeto, o que um `default` por campo não alcança.
 */
export const createCustomFieldSchema = z.strictObject({
  name: nomeObrigatorio(),
  slug: slugDeCampo.optional(),
  ...camposDeCampoCustomizado,
}).transform((entrada) => ({
  ...entrada,
  slug: entrada.slug ?? slugificar(entrada.name),
}));

/**
 * O `slug` continua aceito na edição — e o `beforeWrite` o RECUSA quando difere
 * do gravado (D60).
 *
 * Aceitar e recusar, em vez de simplesmente não aceitar: o formulário reenvia
 * todo campo a cada salvamento, então `slug` chega em toda edição. Fora do
 * schema, ele viraria 422 "campo não reconhecido" pelo `strictObject` em toda
 * edição de campo — e a mensagem falaria de mass assignment onde o assunto é
 * imutabilidade.
 */
export const updateCustomFieldSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  slug: slugDeCampo.optional(),
  ...camposDeCampoCustomizado,
});

// ---------------------------------------------------- CustomFieldset (F9/A)
//
// O conjunto é só um NOME: a composição dele (quais campos, em que ordem, quais
// obrigatórios) mora em `CustomFieldsetField` e tem rota própria, porque ordem e
// obrigatoriedade têm regra — e regra mora em use-case, não em spec (D64).
export const createCustomFieldsetSchema = z.strictObject({ name: nomeObrigatorio() });
export const updateCustomFieldsetSchema = z.strictObject({ name: nomeObrigatorio().optional() });
