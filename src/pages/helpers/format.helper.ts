// Formatação compartilhada entre as telas — funções puras, fora do JSX
// (docs/referencia/arquitetura.md: "cálculo sai do JSX").
//
// Idioma pt-BR, moeda BRL, data DD/MM/YYYY: fixos, sem configuração de tela
// nem leitura do servidor (a configuração de formato saiu no corte de escopo —
// não há mais o que trocar).

/** Nome de uma relação embutida (`manufacturer.name`, `category.name`). */
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
 * Os dígitos de um campo de dinheiro, lidos como CENTAVOS — "123456" vira
 * "1234.56", a string que o servidor recebe. Sem dígito, ''.
 *
 * Cada dígito entra pelos centavos, como numa maquininha: não há vírgula nem
 * ponto de milhar para digitar, e o "1.234,56" que o servidor recusaria nunca
 * sai da tela. Doze dígitos no máximo, os dez inteiros da coluna e os centavos.
 */
export function centavosDigitados(texto: string): string {
  const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  if (digitos === '') return '';
  const comCentavos = digitos.padStart(3, '0');
  return `${comCentavos.slice(0, -2)}.${comCentavos.slice(-2)}`;
}

/** O que o campo de dinheiro mostra: "1234.56" vira "R$ 1.234,56"; vazio fica vazio. */
export function dinheiroNoCampo(valor: string): string {
  return valor === '' ? '' : formatarMoeda(valor);
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

// O calendário de Brasília, o mesmo `FUSO_DO_NEGOCIO` do servidor
// (`server/domain/shared/hoje.helper.ts`). Nem UTC — às 22h de Brasília já é o
// dia seguinte em Greenwich — nem o relógio do navegador, que num computador em
// outro fuso escolheria um dia que o servidor recusa.
const CALENDARIO_DE_BRASILIA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function diaEmBrasilia(instante: Date): string {
  const partes = Object.fromEntries(
    CALENDARIO_DE_BRASILIA.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** O dia de HOJE em Brasília, em 'AAAA-MM-DD' — o que o `<input type="date">` espera. */
export function hojeNoCampoDeData(): string {
  return diaEmBrasilia(new Date());
}

/**
 * O DIA de um instante em Brasília, em 'AAAA-MM-DD' — o `min` do campo da
 * devolução é o dia da entrega.
 */
export function diaDoInstante(iso: string): string {
  return diaEmBrasilia(new Date(iso));
}

/**
 * O dia de um instante, em DD/MM/YYYY e SEM a hora — para a entrega e a
 * devolução de licença, que a tela registra por dia: a hora de um dia passado
 * é a que o servidor escolheu (meio-dia), e mostrá-la seria inventar.
 */
export function formatarDiaDoInstante(iso: string): string {
  return formatarData(diaDoInstante(iso));
}
