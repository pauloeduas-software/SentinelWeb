// Contrato dos campos customizados com a API (F9).
//
// Espelha `server/domain/custom-field/`. Os rótulos em português dos enums ficam
// na tela (`pages/configuracoes/specs/`), não aqui: este arquivo é o CONTRATO, e
// o contrato são os valores que viajam.

/** Como o campo se desenha. É apresentação — quem valida é o `format`. */
export type ElementoDeCampo =
  | 'TEXT' | 'TEXTAREA' | 'LISTBOX' | 'CHECKBOX' | 'RADIO' | 'DATE';

/** O que o valor precisa ser para entrar. */
export type FormatoDeCampo =
  | 'ANY' | 'NUMERIC' | 'ALPHA' | 'ALPHANUMERIC' | 'EMAIL' | 'URL'
  | 'IP' | 'IPV4' | 'IPV6' | 'MAC' | 'DATE' | 'BOOLEAN' | 'REGEX';

/**
 * A máscara que a API devolve no lugar de um valor cifrado.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ELA É UM SENTINELA DE IDA E VOLTA, e por isso é uma CONSTANTE e não um texto
 * solto no JSX.
 *
 * O formulário de ativo reenvia todo campo a cada salvamento, então esta string
 * chega de volta ao servidor em toda edição de um ativo com campo cifrado — e lá
 * ela significa "não mexi neste campo" (`validate-custom-fields.usecase.ts`).
 *
 * Trocar este valor sem trocar o do servidor faria a tela gravar a máscara nova
 * por cima do segredo, em silêncio. Os dois lados têm que dizer a mesma coisa, e
 * é por isso que aqui ela tem nome.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MASCARA_DE_CAMPO = '••••••';

/** Um campo do conjunto resolvido — `GET /api/assets/fieldset?modelId=`. */
export interface CampoDoConjunto {
  fieldId: string;
  slug: string;
  name: string;
  element: ElementoDeCampo;
  format: FormatoDeCampo;
  regexPattern: string | null;
  listValues: string[];
  helpText: string | null;
  encrypted: boolean;
  showInListView: boolean;
  /** Do VÍNCULO, não do campo: o mesmo campo é obrigatório num conjunto e não noutro (D61). */
  required: boolean;
  defaultValue: string | null;
  ordem: number;
}

/**
 * O conjunto que o modelo escolhido pede.
 *
 * `origem` sai na resposta para a tela poder dizer DE ONDE os campos vieram — a
 * categoria ou o modelo (D58). Sem isso, um campo que aparece sozinho ao trocar
 * o modelo parece defeito.
 */
export interface ConjuntoResolvido {
  fieldsetId: string | null;
  fieldsetName: string | null;
  origem: 'MODEL' | 'CATEGORY' | null;
  campos: CampoDoConjunto[];
}

/** Um campo que virou COLUNA da listagem — `GET /api/custom-fields/list-view`. */
export interface CampoDeColuna {
  slug: string;
  name: string;
  element: ElementoDeCampo;
  format: FormatoDeCampo;
}

/** Um vínculo na tela de administração de conjuntos. */
export interface VinculoDoConjunto {
  fieldId: string;
  slug: string;
  name: string;
  element: ElementoDeCampo;
  format: FormatoDeCampo;
  listValues: string[];
  helpText: string | null;
  encrypted: boolean;
  ordem: number;
  required: boolean;
  defaultValue: string | null;
  /** Quantos ativos ficariam inválidos se o campo virasse obrigatório (D61). */
  quebrariam: number;
}

export interface ComposicaoDoConjunto {
  id: string;
  name: string;
  /** Quantos modelos o conjunto alcança — o ESCOPO de `quebrariam`. */
  modelosAlcancados: number;
  fields: VinculoDoConjunto[];
}

/** O corpo do `PUT /api/custom-fieldsets/:id/fields`. A ordem é a do array. */
export interface ComposicaoInput {
  fields: { fieldId: string; required: boolean; defaultValue: string | null }[];
}

/** O que a rota de revelar devolve. Ela grava `ActivityLog` a cada chamada. */
export interface CampoRevelado {
  assetId: string;
  slug: string;
  value: string;
}
