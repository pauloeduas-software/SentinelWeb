// Formatação compartilhada entre as telas — funções puras, fora do JSX
// (docs/referencia/arquitetura.md: "cálculo sai do JSX").
//
// Idioma pt-BR, moeda BRL, data DD/MM/YYYY: fixos, sem configuração de tela
// nem leitura do servidor (o F10 saiu — não há mais o que trocar).

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
 * Data ISO como dia de calendário, em DD/MM/YYYY.
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

  return `${dia}/${mes}/${ano}`;
}

/** O que o `<input type="date">` espera: 'AAAA-MM-DD'. */
export function paraCampoDeData(valor: unknown): string {
  return typeof valor === 'string' && valor !== '' ? valor.slice(0, 10) : '';
}
