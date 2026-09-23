// Formatação compartilhada entre as telas — funções puras, fora do JSX
// (docs/ARQUITETURA.md: "cálculo sai do JSX").

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

  return tipo === 'PERCENT'
    ? `${numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
    : numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Data ISO como dia de calendário.
 *
 * Fatiar a string em vez de `new Date(...).toLocaleDateString()` é de propósito:
 * o servidor grava a data de compra à meia-noite UTC, e num fuso a oeste de
 * Greenwich o `Date` local devolveria o dia anterior.
 */
export function formatarData(valor: unknown): string {
  if (typeof valor !== 'string' || valor === '') return '—';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : '—';
}

/** O que o `<input type="date">` espera: 'AAAA-MM-DD'. */
export function paraCampoDeData(valor: unknown): string {
  return typeof valor === 'string' && valor !== '' ? valor.slice(0, 10) : '';
}
