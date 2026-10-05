import type { FormatoDeData } from '../../domain/shared/settings.types';

// Formatação compartilhada entre as telas — funções puras, fora do JSX
// (docs/referencia/arquitetura.md: "cálculo sai do JSX").
//
// ═════════════════════════════════════════════════════════════════════════════
// O IDIOMA, A MOEDA E O FORMATO DE DATA VÊM DO `AppSetting` (F10, Etapa A) —
// E POR QUE ELES MORAM NUM VALOR DE MÓDULO, NÃO NUM HOOK NEM NUM PARÂMETRO.
//
// São 99 chamadas em 29 arquivos, e nem todas estão dentro de componente:
// `pages/helpers/ocupantes.helper.ts`, `pages/ativos/helpers/descomissionamento.helper.ts`
// e dois arquivos de `domain/shared/*.types.ts` chamam estas funções de fora do
// React. Um hook não alcança nenhum dos quatro — hook só existe dentro de
// render —, e um parâmetro obrigaria 99 lugares a carregar um valor que é o
// MESMO para a sessão inteira.
//
// NÃO É UMA SEGUNDA FONTE DE VERDADE (D16). A fonte é o servidor; isto é um
// espelho de leitura com UM ÚNICO ESCRITOR — `useFormatoDoSistema()`, montado
// acima do roteador, que copia para cá o que a query trouxe. Nada aqui é lido
// de volta para gravar, nada é persistido, e o padrão abaixo é exatamente o
// comportamento que a tela tinha antes de a configuração existir: quem nunca
// salvar nada não vê diferença nenhuma.
//
// O `formatarData` CONTINUA FATIANDO A STRING. Trocar a fatia por
// `Intl.DateTimeFormat` seria o caminho óbvio e reintroduziria o defeito que o
// comentário dela documenta: o servidor grava data de compra à meia-noite UTC,
// e num fuso a oeste de Greenwich o `Date` local devolve o dia anterior. O
// formato escolhido reordena os pedaços; ele não constrói `Date` nenhum.
// ═════════════════════════════════════════════════════════════════════════════

interface FormatoCorrente {
  locale: string;
  dateFormat: FormatoDeData;
  currency: string;
}

/** O que a tela usava antes de a configuração existir. */
const PADRAO: FormatoCorrente = { locale: 'pt-BR', dateFormat: 'DD/MM/YYYY', currency: 'BRL' };

let formato: FormatoCorrente = PADRAO;

/**
 * O único escritor. Chamado por `useFormatoDoSistema()` quando a configuração
 * chega do servidor — e por nada mais.
 */
export function aplicarFormato(parcial: Partial<FormatoCorrente>): void {
  formato = { ...formato, ...parcial };
}

/** Para o teste puro voltar ao estado conhecido entre casos. */
export function reiniciarFormato(): void {
  formato = PADRAO;
}

/**
 * `toLocaleString` com locale inválido LANÇA `RangeError`, e isto roda no meio
 * do render de uma tabela: a lista inteira ficaria em branco por causa de um
 * campo de configuração. O servidor já recusa locale e moeda que o `Intl` não
 * conhece (settings.schema.ts), e este `catch` é a rede de baixo — para o
 * banco restaurado de um dump antigo, ou o `UPDATE` feito à mão.
 */
function comFallback(formatar: (f: FormatoCorrente) => string, valor: number): string {
  try {
    return formatar(formato);
  } catch {
    return String(valor);
  }
}

/**
 * Valor residual da depreciação.
 *
 * `valor` chega como STRING porque a coluna é `Decimal` no Postgres e o JSON
 * o serializa assim — inclusive perdendo o zero à direita ("1234.50" volta
 * "1234.5"). Por isso formatar é trabalho daqui, não do banco.
 */
export function formatarResidual(valor: unknown, tipo: unknown): string {
  if (valor == null || valor === '') return '—';

  const numero = Number(valor);
  if (Number.isNaN(numero)) return String(valor);

  return comFallback(
    (f) =>
      tipo === 'PERCENT'
        ? `${numero.toLocaleString(f.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
        : numero.toLocaleString(f.locale, { style: 'currency', currency: f.currency }),
    numero,
  );
}

export function formatarMeses(valor: unknown): string {
  if (valor == null || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return String(valor);
  return `${numero} ${numero === 1 ? 'mês' : 'meses'}`;
}

/** Nome de uma relação embutida (`manufacturer.name`, `parent.name`). */
export function nomeDaRelacao(valor: unknown): string {
  if (valor && typeof valor === 'object' && 'name' in valor) {
    return String((valor as { name: unknown }).name ?? '—');
  }
  return '—';
}

/** Rótulo em português de um valor de enum, a partir da lista da spec. */
export function rotuloDoEnum(
  valor: unknown,
  opcoes: readonly { value: string; label: string }[] = [],
): string {
  return opcoes.find((opcao) => opcao.value === valor)?.label ?? String(valor ?? '—');
}

/**
 * Dinheiro vindo de uma coluna `Decimal`.
 *
 * Chega STRING e é assim que fica até aqui: converter para `number` cedo demais
 * é como o erro de centavo entra. `Number()` só no último instante, para
 * formatar.
 */
export function formatarMoeda(valor: unknown): string {
  if (valor == null || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return String(valor);
  return comFallback((f) => numero.toLocaleString(f.locale, { style: 'currency', currency: f.currency }), numero);
}

/**
 * Data ISO como dia de calendário, no formato configurado.
 *
 * Fatiar a string em vez de `new Date(...).toLocaleDateString()` é de propósito:
 * o servidor grava a data de compra à meia-noite UTC, e num fuso a oeste de
 * Greenwich o `Date` local devolveria o dia anterior. O formato escolhido
 * REORDENA os três pedaços — nenhum `Date` é construído aqui.
 */
export function formatarData(valor: unknown): string {
  if (typeof valor !== 'string' || valor === '') return '—';

  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  if (!dia || !mes || !ano) return '—';

  if (formato.dateFormat === 'YYYY-MM-DD') return `${ano}-${mes}-${dia}`;
  if (formato.dateFormat === 'MM/DD/YYYY') return `${mes}/${dia}/${ano}`;
  return `${dia}/${mes}/${ano}`;
}

/** O que o `<input type="date">` espera: 'AAAA-MM-DD'. */
export function paraCampoDeData(valor: unknown): string {
  return typeof valor === 'string' && valor !== '' ? valor.slice(0, 10) : '';
}
