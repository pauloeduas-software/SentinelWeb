// O SLUG DE UM CAMPO CUSTOMIZADO — função pura, sem I/O.
//
// ═════════════════════════════════════════════════════════════════════════════
// ELE É A CHAVE DENTRO DE `assets.customFields`, E POR ISSO É IMUTÁVEL (D60).
//
// Não é um detalhe de URL: o slug de um campo é o nome da propriedade em N mil
// linhas de JsonB. Renomeá-lo é um `UPDATE` sobre a tabela inteira que teria que
// ser transacional com a linha do campo — e um meio-caminho deixa valores órfãos
// sem ninguém saber que existem.
//
// A consequência de ser imutável é que ele precisa nascer previsível e legível:
// quem escreve um filtro `?cf[ip_fixo]=10.0.0.7` à mão tem que conseguir adivinhá-lo
// a partir do nome do campo. Daí a derivação, e daí ela ser determinística.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto do slug. Curto o bastante para caber num query string legível. */
export const MAX_SLUG = 60;

/**
 * `"IP Fixo"` → `"ip_fixo"`; `"Nº do Patrimônio"` → `"n_do_patrimonio"`.
 *
 * `normalize('NFD')` + remoção dos diacríticos é o que faz "Patrimônio" virar
 * `patrimonio` em vez de `patrim_nio`: sem isto, todo campo com acento — que em
 * português é a maioria — ganharia um underscore no meio da palavra e o slug
 * deixaria de ser adivinhável, que é a única razão de ele ser derivado.
 *
 * Underscore e não hífen: o slug viaja como NOME DE PROPRIEDADE em JavaScript
 * (`row.customFields.ip_fixo`), e `ip-fixo` só se alcança por colchetes.
 */
export function slugificar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_SLUG)
    // O `slice` pode ter cortado no meio de um separador.
    .replace(/_+$/g, '');
}
