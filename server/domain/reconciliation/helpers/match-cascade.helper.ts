import type { MatchSignal } from '@prisma/client';
import { normalizeHostname, normalizeSerial, normalizeUuid } from './normalize-identity.helper';

// A CASCATA E A PONTUAÇÃO — funções puras. Recebem a identidade de um endpoint e
// a dos candidatos, devolvem o que casou e quanto vale.
//
// Nenhuma consulta aqui dentro, de propósito: a regra que decide o que é um
// vínculo confiável é a coisa desta fase que mais vai mudar com dado real, e ela
// é testável linha a linha sem banco nenhum.
//
// ─────────────────────────────────────────────────────────────────────────────
// O PLANO DA FASE LISTAVA QUATRO SINAIS, E UM DELES NÃO CABIA AQUI
//
// `serial → uuid → MAC → hostname`, contra o ativo. Escrevendo contra a árvore,
// o MAC nunca cabia: **`Asset` não tem coluna de endereço MAC** — ele tem
// `assetTag`, `serial` e `name`, todos digitados por gente. Não existe MAC do
// lado cadastrado para comparar, e pontuar um sinal que nunca casa faria a
// pontuação descrever uma coisa que não acontece.
// ─────────────────────────────────────────────────────────────────────────────

/** Quanto vale cada sinal. Ver o D46 para por que hostname não vale 100. */
export const PONTOS: Record<MatchSignal, number> = {
  SERIAL: 100,
  UUID: 100,
  // Renomeável, e volta atrás: "PC-ANA" vira "PC-ANA-NOVO" e depois "PC-ANA".
  HOSTNAME: 60,
};

/** O piso para um vínculo AUTOMÁTICO, e só em `discoveryMode = ON` (D51). */
export const PONTOS_PARA_VINCULO_AUTOMATICO = 100;

export interface IdentidadeDoEndpoint {
  biosSerial: string | null;
  systemUuid: string | null;
  hostname: string;
}

export interface CandidatoAtivo {
  id: string;
  assetTag: string;
  serial: string | null;
  name: string | null;
}

export interface Casamento {
  /** O id do ativo que casou. */
  alvoId: string;
  signal: MatchSignal;
  score: number;
  /** O valor que casou, para a evidência da sugestão mostrar. */
  valor: string;
}

export interface ColisaoDeEvidencia {
  signal: MatchSignal;
  valor: string;
  alvoIds: string[];
}

export interface ResultadoDaCascata {
  /** No máximo um por alvo: o sinal de maior pontuação que casou com ele. */
  casamentos: Casamento[];
  /**
   * Evidência que casou com MAIS DE UM candidato. Não é casamento fraco: é
   * evidência ZERO, e vira alerta.
   */
  colisoes: ColisaoDeEvidencia[];
}

type Extrator<T> = (candidato: T) => string | null;

/** Indexa os candidatos por um valor normalizado, para achar colisão em O(n). */
function indexar<T extends { id: string }>(candidatos: T[], extrair: Extrator<T>): Map<string, string[]> {
  const indice = new Map<string, string[]>();
  for (const candidato of candidatos) {
    const chave = extrair(candidato);
    if (!chave) continue;
    const lista = indice.get(chave);
    if (lista) lista.push(candidato.id);
    else indice.set(chave, [candidato.id]);
  }
  return indice;
}

/**
 * Indexa por VÁRIOS valores do mesmo candidato, sob a mesma chave.
 *
 * Serve ao sinal que pode casar por mais de uma coluna do lado cadastrado — o
 * hostname contra `name` e contra `assetTag`. Índices separados esconderiam a
 * ambiguidade entre eles; aqui, dois ativos alcançados pela mesma grafia caem na
 * mesma lista e a regra da colisão os pega.
 *
 * O `Set` por candidato existe porque um ativo cujo `name` é igual ao `assetTag`
 * não deve aparecer duas vezes e simular uma colisão consigo mesmo.
 */
function indexarPorVarios<T extends { id: string }>(candidatos: T[], extratores: Extrator<T>[]): Map<string, string[]> {
  const indice = new Map<string, string[]>();
  for (const candidato of candidatos) {
    const chaves = new Set<string>();
    for (const extrair of extratores) {
      const chave = extrair(candidato);
      if (chave) chaves.add(chave);
    }
    for (const chave of chaves) {
      const lista = indice.get(chave);
      if (lista) lista.push(candidato.id);
      else indice.set(chave, [candidato.id]);
    }
  }
  return indice;
}

/**
 * Acumulador da cascata: aplica um sinal e guarda o melhor por alvo.
 *
 * **A REGRA QUE JUSTIFICA O ARQUIVO:** evidência que casa com mais de um
 * candidato **não é evidência** — pontua zero e vira colisão, nunca "pega o
 * primeiro". Pegar o primeiro é pior do que não vincular: cria um vínculo errado
 * que ninguém revisa, porque o sistema disse que estava certo (D46).
 */
function novaCascata() {
  const casamentos = new Map<string, Casamento>();
  const colisoes: ColisaoDeEvidencia[] = [];

  return {
    aplicar(signal: MatchSignal, valorDoEndpoint: string | null, indice: Map<string, string[]>): void {
      if (!valorDoEndpoint) return;

      const alvos = indice.get(valorDoEndpoint);
      if (!alvos || alvos.length === 0) return;

      if (alvos.length > 1) {
        colisoes.push({ signal, valor: valorDoEndpoint, alvoIds: alvos });
        return;
      }

      const alvoId = alvos[0];
      const score = PONTOS[signal];
      const jaCasado = casamentos.get(alvoId);
      // Um alvo só aparece uma vez, com o MELHOR sinal: serial e hostname
      // casando com o mesmo ativo é uma sugestão, não duas.
      if (!jaCasado || jaCasado.score < score) {
        casamentos.set(alvoId, { alvoId, signal, score, valor: valorDoEndpoint });
      }
    },
    resultado(): ResultadoDaCascata {
      return { casamentos: [...casamentos.values()], colisoes };
    },
  };
}

/**
 * ENDPOINT × ATIVO — a cascata do vínculo (`LINK`).
 *
 * `valoresRepetidosNoParque` são os valores que aparecem em mais de uma MÁQUINA:
 * um serial em branco repetido em vinte endpoints é lixo mesmo que case com um
 * único ativo, e a lista estática do `normalize-identity` nunca vai conter todos
 * os textos que uma fábrica inventa. Quem os descobre é o banco, e é por isso
 * que eles entram por parâmetro em vez de virarem mais uma constante aqui.
 */
export function casarEndpointComAtivos(
  identidade: IdentidadeDoEndpoint,
  candidatos: CandidatoAtivo[],
  valoresRepetidosNoParque: Set<string> = new Set(),
): ResultadoDaCascata {
  const cascata = novaCascata();

  const util = (valor: string | null): string | null =>
    valor && !valoresRepetidosNoParque.has(valor) ? valor : null;

  const serial = util(normalizeSerial(identidade.biosSerial));
  const uuid = util(normalizeUuid(identidade.systemUuid));
  const hostname = normalizeHostname(identidade.hostname);

  // O `serial` do ativo é digitado por gente, e um UUID de sistema colado ali é
  // o caso real de quem cadastrou a máquina lendo a tela do agente. Por isso os
  // dois primeiros sinais olham a MESMA coluna do ativo.
  cascata.aplicar('SERIAL', serial, indexar(candidatos, (a) => normalizeSerial(a.serial)));
  cascata.aplicar('UUID', uuid, indexar(candidatos, (a) => normalizeUuid(a.serial)));

  // UM ÍNDICE SÓ PARA `name` E `assetTag`, e não uma chamada para cada.
  //
  // Com dois índices separados, a regra da colisão — que é por índice — não via
  // a ambiguidade ENTRE eles: um hostname que casava com o `name` de um ativo e
  // com o `assetTag` de outro produzia DUAS sugestões de 60 pontos em vez de
  // uma colisão de zero. É o D46 vazando pela fresta entre as duas chamadas, e a
  // pergunta que o sinal responde é uma só — *que ativo se chama assim?* —, então
  // o índice também tem que ser um só.
  cascata.aplicar('HOSTNAME', hostname, indexarPorVarios(candidatos, [
    (a) => normalizeHostname(a.name),
    (a) => normalizeHostname(a.assetTag),
  ]));

  return cascata.resultado();
}
