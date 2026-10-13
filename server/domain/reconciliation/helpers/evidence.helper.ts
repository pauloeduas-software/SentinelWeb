import { createHash } from 'crypto';

// A EVIDÊNCIA E A CHAVE DELA — funções puras.
//
// O D97 em código. A fila de sugestões precisa distinguir duas frases que
// parecem a mesma:
//
//   "já me disseram não sobre ISTO"                    → não reoferecer
//   "já me disseram não sobre este par, faça o que fizer" → enterrar para sempre
//
// A segunda é o que uma recusa sem chave significa, e ela custa caro: recusar
// "este endpoint é o ATV-00012" porque o serial estava em branco é CORRETO, e
// quando a máquina passar a mandar o serial de verdade é OUTRA afirmação.
// Enterrá-la junto seria perder exatamente os casos que a fase existe para achar.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE SÃO DOIS CONCEITOS, E NÃO UM (a correção do D109)
//
// A primeira versão desta fase hasheava a EVIDÊNCIA INTEIRA, e isso desfazia a
// memória da recusa sempre que a evidência carregava algo que muda sozinho.
// Então a EVIDÊNCIA é o que vai para a TELA, e a AFIRMAÇÃO é o que vai para o
// HASH — e só muda quando a frase muda.
//
// Hoje a única sugestão que existe não tem evidência que cresça por conta
// própria (sinal, valor, hostname e hwid são estáveis), e a separação continua
// valendo mesmo assim: ela é o que faz o hash descrever a AFIRMAÇÃO em vez do
// que a sustenta, e é essa promessa que o próximo tipo de sugestão herda em vez
// de ter que redescobrir.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A evidência que vai para a tela.
 *
 * É `Record` aberto de propósito: o que a sugestão mostra é o que a sustenta
 * (qual sinal casou, com que valor, em que hostname), e isso cresce com o
 * próximo tipo sem mexer no tipo daqui.
 * O que não varia é que ela é SEMPRE visível — sugestão sem evidência é palpite,
 * e ninguém deveria aceitar um palpite que reescreve o inventário.
 */
export type Evidencia = Record<string, unknown>;

/**
 * O que a sugestão AFIRMA, reduzido ao que a identifica.
 *
 * Regra para montar uma: se o valor mudar sozinho com o tempo, ele NÃO entra.
 * Data do último contato e qualquer contador ficam de fora; qual é o ativo, qual
 * foi o sinal e qual o valor que casou ficam dentro.
 */
export type Afirmacao = Record<string, unknown>;

/**
 * Serializa com as chaves em ordem, recursivamente.
 *
 * `JSON.stringify` preserva a ordem de inserção das chaves, então dois objetos
 * com o mesmo conteúdo montado em ordem diferente dariam hashes diferentes — e
 * a sugestão recusada voltaria na rodada seguinte só porque o use-case montou o
 * objeto por outro caminho. O hash tem que descrever o CONTEÚDO.
 */
function estavel(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estavel);
  if (valor && typeof valor === 'object') {
    const ordenado: Record<string, unknown> = {};
    for (const chave of Object.keys(valor as Record<string, unknown>).sort()) {
      ordenado[chave] = estavel((valor as Record<string, unknown>)[chave]);
    }
    return ordenado;
  }
  // BigInt não tem JSON, e as specs coletadas são BigInt: sem isto o hash
  // estouraria em qualquer afirmação que carregasse RAM ou disco.
  if (typeof valor === 'bigint') return valor.toString();
  return valor;
}

/**
 * sha256 da afirmação normalizada. Hex, porque vai para uma coluna de texto.
 *
 * É ESTE valor que mora em `ReconciliationSuggestion.evidenceHash` e que decide
 * se uma recusa continua valendo. O nome da coluna ficou do desenho antigo; o
 * que entra nela é a afirmação.
 */
export function hashDaAfirmacao(afirmacao: Afirmacao): string {
  return createHash('sha256').update(JSON.stringify(estavel(afirmacao))).digest('hex');
}
