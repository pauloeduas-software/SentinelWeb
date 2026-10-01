import { z, type ZodType } from 'zod';
import { $Enums } from '@prisma/client';

// O MOTOR DE VALIDAÇÃO POR FORMATO — função pura, sem I/O (F9, Etapa B).
//
// ═════════════════════════════════════════════════════════════════════════════
// TODO VALOR É GUARDADO COMO TEXTO (ou `null`), INCLUSIVE O BOOLEANO.
//
// É a escolha que mantém UMA forma de ler o JsonB, e ela paga em três lugares:
//
//   - o filtro `?cf[slug]=valor` chega da query string como texto e é comparado
//     com `equals`. Se `CHECKBOX` guardasse `true` (booleano JSON) e `TEXT`
//     guardasse `"10.0.0.7"`, o mesmo filtro precisaria adivinhar o tipo do
//     campo antes de montar a comparação — e adivinharia errado no dia em que o
//     formato mudasse.
//   - `customFields->>'x'` do Postgres devolve TEXTO de qualquer jeito. Guardar
//     número como número não compraria ordenação: ela está fora desta fase
//     porque o GIN não a serve (D63), não porque o tipo não deixa.
//   - o índice GIN com `jsonb_ops` indexa contenção de PARES chave/valor. Um
//     valor de tipo instável produz entradas de índice de forma instável.
//
// Então `normalizarValor` abaixo converte booleano e número em texto ANTES de
// validar, e o formato `BOOLEAN` valida exatamente `"true"`/`"false"`. O
// formulário continua mandando um booleano de verdade — a conversão é aqui, num
// lugar só, e não em cada tela.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto de um valor guardado. Ele mora inline no JsonB da linha do ativo. */
export const MAX_VALOR = 1_000;

/**
 * Teto do PADRÃO de um `format: REGEX`. Primeira das três guardas do D63.
 *
 * Também fica declarado no schema de entrada (`regexPattern`), e as duas cópias
 * são de propósito: aquela recusa o cadastro, esta protege o motor de um padrão
 * que tenha entrado por outro caminho (um `psql` à mão, um seed).
 */
export const MAX_PADRAO_REGEX = 200;

/**
 * Teto da ENTRADA quando o formato é `REGEX`. Segunda guarda do D63.
 *
 * Muito abaixo do `MAX_VALOR` de propósito: o custo de um backtracking
 * catastrófico cresce exponencialmente no TAMANHO DA ENTRADA, não no do padrão.
 * `(a+)+$` contra 40 caracteres já trava; contra 1.000, trava por horas.
 */
export const MAX_ENTRADA_REGEX = 120;

/**
 * Quantificador aninhado — `(a+)+`, `(a*)*`, `(a{2,})+`. Terceira guarda do D63.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ELA REDUZ O RISCO, NÃO O ELIMINA — E ISSO ESTÁ ACEITO.
 *
 * O Node é single-threaded: um backtracking catastrófico não é um erro 500, é o
 * SERVIDOR INTEIRO FORA DO AR enquanto o motor de regex não desiste. Validar no
 * cliente não protege nada (protege a mensagem).
 *
 * Esta heurística pega a forma clássica e mais fácil de escrever por acidente.
 * Ela não pega alternância sobreposta (`(a|a)*`) nem aninhamento mais fundo. O
 * risco residual está declarado no plano da fase, e a saída nomeada é
 * `node:worker_threads` com timeout — que custa um processo por validação e não
 * se paga enquanto o padrão é digitado por um administrador do sistema, não por
 * um anônimo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const QUANTIFICADOR_ANINHADO = /\([^()]*(?:[*+]|\{\d+,\d*\})[^()]*\)\s*(?:[*+]|\{\d+,\d*\})/;

/** MAC com separador, os dois que se veem na prática: `:` e `-`. */
const MAC = /^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
/** Número com sinal e casas decimais, vírgula ou ponto. */
const NUMERICO = /^-?\d+(?:[.,]\d+)?$/;
/** Letras e espaço. `\p{L}` com `u` para "José" não ser alfanumérico só por ter acento. */
const ALFABETICO = /^[\p{L} ]+$/u;
const ALFANUMERICO = /^[\p{L}\p{N} ]+$/u;

/**
 * O padrão de um `REGEX` serve? Devolve o MOTIVO em texto quando não, `null`
 * quando sim — a mesma forma do `conferirCanario`: quem chama não reinterpreta
 * um booleano para montar a frase.
 *
 * Chamada em DOIS momentos, e os dois importam: no cadastro do campo (é ali que
 * a mensagem ensina) e na validação de valor (é ali que um padrão que entrou por
 * outro caminho seria executado).
 */
export function motivoParaRecusarPadrao(padrao: string): string | null {
  if (padrao.length > MAX_PADRAO_REGEX) {
    return `a expressão passa de ${MAX_PADRAO_REGEX} caracteres`;
  }

  if (QUANTIFICADOR_ANINHADO.test(padrao)) {
    return 'ela tem quantificador aninhado (como "(a+)+"), que pode travar o servidor inteiro '
      + 'numa entrada de poucas dezenas de caracteres';
  }

  try {
    new RegExp(padrao);
  } catch {
    return 'ela não é uma expressão regular válida';
  }

  return null;
}

/** O que o motor precisa saber de um campo para validar o valor dele. */
export interface FormatoDoCampo {
  format: $Enums.CustomFieldFormat;
  regexPattern: string | null;
  listValues: string[];
  element: $Enums.CustomFieldElement;
}

/**
 * Converte o que chegou do JSON no TEXTO que vai ser guardado.
 *
 * `undefined`/`null`/`''` todos viram `null` — as três formas de "não
 * preenchido" que chegam do formulário (chave ausente, `null` explícito, input
 * limpo) têm que significar a mesma coisa, senão "obrigatório" passaria a
 * depender de como a tela serializa o vazio.
 *
 * Objeto e array são RECUSADOS devolvendo `undefined`: quem chama transforma
 * isso em 422. Aceitá-los poria estrutura aninhada dentro de um valor que a tela
 * desenha como `<input>`, e o filtro por igualdade nunca a acharia.
 */
export function normalizarValor(bruto: unknown): string | null | undefined {
  if (bruto === undefined || bruto === null) return null;
  if (typeof bruto === 'boolean') return bruto ? 'true' : 'false';
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? String(bruto) : undefined;
  if (typeof bruto !== 'string') return undefined;

  const limpo = bruto.trim();
  return limpo === '' ? null : limpo;
}

/**
 * Formato → `ZodType`. É o coração da Etapa B, e é PURO: ele não sabe o que é um
 * ativo, não consulta nada e não conhece o `slug` do campo.
 *
 * O `rotulo` entra nas mensagens porque é o nome que o usuário vê na tela — o
 * `slug` vai no CAMINHO do erro (é ele que a tela usa para pintar o input
 * certo), e o nome vai no texto.
 */
export function validadorDoFormato(campo: FormatoDoCampo, rotulo: string): ZodType {
  const texto = z.string().max(MAX_VALOR, `${rotulo}: máximo de ${MAX_VALOR} caracteres`);

  // A LISTA VENCE O FORMATO, e os dois convivem de propósito: um `LISTBOX` de
  // IPs é uma lista fechada, e validar o formato IP dentro dela seria conferir
  // duas vezes a mesma coisa (os valores da lista já foram cadastrados).
  //
  // ⚠️ Valor FORA da lista é recusado na ESCRITA e NÃO é apagado do que já está
  // gravado: mudar `listValues` depois pode deixar valores órfãos, e apagá-los
  // seria o D60 outra vez. A tela mostra o valor fora da lista marcado.
  if ((campo.element === 'LISTBOX' || campo.element === 'RADIO') && campo.listValues.length > 0) {
    return z.enum(campo.listValues as [string, ...string[]], `${rotulo}: valor fora da lista`);
  }

  switch (campo.format) {
    case 'NUMERIC':
      return texto.regex(NUMERICO, `${rotulo}: use um número, como 1234 ou 12.5`);

    case 'ALPHA':
      return texto.regex(ALFABETICO, `${rotulo}: só letras e espaço`);

    case 'ALPHANUMERIC':
      return texto.regex(ALFANUMERICO, `${rotulo}: só letras, números e espaço`);

    // `z.email()` e `z.url()` de topo: em zod 4 os validadores de string saíram
    // dos métodos (`.string().email()` não existe mais).
    case 'EMAIL':
      return texto.pipe(z.email(`${rotulo}: e-mail inválido`));

    case 'URL':
      return texto.pipe(z.url(`${rotulo}: endereço de site inválido`));

    // `IP` aceita as duas famílias; `IPV4`/`IPV6` existem separados porque
    // "este campo é o IP da rede interna" é uma restrição que o operador quer
    // poder declarar — e um IPv6 num campo de IPv4 é erro de cadastro, não
    // flexibilidade.
    case 'IP':
      return texto.pipe(z.union(
        [z.ipv4(), z.ipv6()],
        `${rotulo}: use um endereço IP (IPv4 ou IPv6)`,
      ));

    case 'IPV4':
      return texto.pipe(z.ipv4(`${rotulo}: use um endereço IPv4, como 10.0.0.7`));

    case 'IPV6':
      return texto.pipe(z.ipv6(`${rotulo}: use um endereço IPv6`));

    // Regex própria: `zod` não tem validador de MAC.
    case 'MAC':
      return texto.regex(MAC, `${rotulo}: use um MAC como 00:1B:44:11:3A:B7`);

    case 'DATE':
      return texto.pipe(z.iso.date(`${rotulo}: use uma data no formato AAAA-MM-DD`));

    // Guardado como texto (ver o bloco do topo do arquivo). O formulário manda
    // booleano e `normalizarValor` já o converteu.
    case 'BOOLEAN':
      return z.enum(['true', 'false'], `${rotulo}: use verdadeiro ou falso`);

    case 'REGEX':
      return validadorDeRegex(campo.regexPattern, rotulo);

    case 'ANY':
    default:
      return texto;
  }
}

/**
 * O validador de `REGEX`, com as três guardas aplicadas.
 *
 * Padrão ausente ou recusado devolve um validador que SEMPRE FALHA, em vez de
 * cair para `ANY`: um campo configurado para validar e que passa a aceitar
 * qualquer coisa é pior do que um campo que recusa tudo — o primeiro grava lixo
 * em silêncio, o segundo aparece na primeira tentativa.
 */
function validadorDeRegex(padrao: string | null, rotulo: string): ZodType {
  if (!padrao) {
    return z.never(`${rotulo}: o campo exige uma expressão regular que não está configurada`);
  }

  const problema = motivoParaRecusarPadrao(padrao);
  if (problema) {
    return z.never(`${rotulo}: a expressão regular deste campo foi recusada porque ${problema}`);
  }

  return z
    .string()
    // O TETO DA ENTRADA VEM ANTES DO `.regex()`, e a ordem é a guarda: o zod
    // para na primeira falha de uma cadeia, então uma entrada de 5.000
    // caracteres é rejeitada por tamanho SEM nunca chegar ao motor de regex.
    // Invertida, esta linha não protegeria nada.
    .max(MAX_ENTRADA_REGEX, `${rotulo}: máximo de ${MAX_ENTRADA_REGEX} caracteres`)
    .regex(new RegExp(padrao), `${rotulo}: valor fora do formato esperado`);
}
