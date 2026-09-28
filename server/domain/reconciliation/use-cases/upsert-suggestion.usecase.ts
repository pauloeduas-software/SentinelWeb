import type { MatchSignal, Prisma, SuggestionKind } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { errorCode } from '../../../core/errors/error-shape';
import { hashDaAfirmacao, type Afirmacao, type Evidencia } from '../helpers/evidence.helper';

// PROPOR UMA SUGESTÃO SEM ENCHER A FILA — o coração da idempotência da fase.
//
// O job roda de hora em hora sobre a frota inteira e reencontra as MESMAS
// evidências. Sem as guardas daqui, uma semana de operação transforma a fila em
// 168 cópias de cada sugestão — e a fila que deveria ser lida por uma pessoa
// vira uma lista que ninguém abre duas vezes.

export interface SugestaoProposta {
  kind: SuggestionKind;
  endpointId: string;
  assetId?: string | null;
  targetUserId?: string | null;
  targetLocationId?: string | null;
  mergeIntoEndpointId?: string | null;
  score: number;
  signal?: MatchSignal | null;
  shift?: string | null;
  /** O que a tela mostra. Pode crescer a cada rodada — ver `evidence.helper.ts`. */
  evidence: Evidencia;
  /**
   * O que a sugestão AFIRMA, reduzido ao que a identifica. É ISTO que vai para o
   * hash, e é por isso que ele é um campo próprio e obrigatório: quem escreve uma
   * sugestão nova é obrigado a decidir qual é a frase, em vez de deixar o hash
   * cair sobre um objeto que tem contadores dentro (D109).
   */
  afirmacao: Afirmacao;
}

/**
 * O que aconteceu com a proposta. Devolvido para o job contar e logar — três
 * rodadas seguidas com `criadas: 0` é a prova de que a idempotência funciona.
 */
export type ResultadoDaProposta = 'CRIADA' | 'RENOVADA' | 'INALTERADA' | 'JA_RESOLVIDA';

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO HÁ PARÂMETRO `client` AQUI
//
// Esta função recebia um `Pick<typeof prisma, 'reconciliationSuggestion'>` — o
// formato que aceita tanto o `prisma` quanto um `tx` — e no ramo da SUBSTITUIÇÃO
// ela abria `prisma.$transaction` por conta própria, ignorando o cliente
// recebido. Os seis chamadores passavam `prisma`, então não havia defeito; havia
// uma PROMESSA FALSA na assinatura. Quem acreditasse nela e chamasse de dentro de
// uma transação aninharia `$transaction` no Prisma — que não é suportado — e
// descobriria isso em produção, no ramo que só executa quando uma sugestão
// substitui outra.
//
// A substituição PRECISA da sua própria transação (`SUPERSEDED` + `create`, ou o
// par fica sem nenhuma pendente), então a honestidade é dizer que esta função
// abre transação e não pode rodar dentro de uma. Parâmetro removido em vez de
// tipo alargado: um `client` que só aceita o `prisma` global não é um parâmetro,
// é uma decoração.
// ─────────────────────────────────────────────────────────────────────────────

/** As quatro FKs de alvo, normalizadas — `undefined` e `null` são a mesma coisa aqui. */
function alvoDaProposta(proposta: SugestaoProposta) {
  return {
    assetId: proposta.assetId ?? null,
    targetUserId: proposta.targetUserId ?? null,
    targetLocationId: proposta.targetLocationId ?? null,
    mergeIntoEndpointId: proposta.mergeIntoEndpointId ?? null,
  };
}

/**
 * Cria a sugestão, ou não — e o "ou não" é a parte que importa.
 *
 * A decisão é tomada em DOIS passos, e a ordem entre eles é a correção do D109:
 *
 * **1. Já existe linha para ESTA AFIRMAÇÃO (mesmo hash)?**
 *
 * | Estado dela | O que acontece |
 * |---|---|
 * | `PENDING`    | nada de novo: a evidência VISÍVEL é atualizada (os dias crescem) e o hash fica |
 * | `REJECTED`   | **nada** — já disseram não sobre isto (D97) |
 * | `ACCEPTED`   | nada: já foi resolvida |
 * | `SUPERSEDED` | cria de novo: a afirmação havia sido substituída e voltou a valer |
 *
 * A busca é pelo HASH, e não pela linha mais recente do par. Com "a mais
 * recente", uma recusa ficava ESCONDIDA atrás de qualquer linha posterior — um
 * `SUPERSEDED` de ontem mascarava o `REJECTED` de anteontem e a sugestão
 * recusada voltava. A memória tem que ser consultada pela chave que a define.
 *
 * **2. Não existe. Há uma `PENDING` com outra afirmação para o mesmo alvo?**
 * Ela vira `SUPERSEDED` e a nova nasce, na mesma transação. `SUPERSEDED` não é
 * sinônimo de recusa: ninguém disse não, o mundo é que mudou — a máquina passou
 * a mandar o serial, a pessoa trocou.
 */
export async function proporSugestao(proposta: SugestaoProposta): Promise<ResultadoDaProposta> {
  const alvo = alvoDaProposta(proposta);
  const evidenceHash = hashDaAfirmacao(proposta.afirmacao);
  const par = { kind: proposta.kind, endpointId: proposta.endpointId, ...alvo };

  const dados = {
    ...par,
    score: proposta.score,
    signal: proposta.signal ?? null,
    shift: proposta.shift ?? null,
    evidence: proposta.evidence as Prisma.InputJsonValue,
    evidenceHash,
  };

  // ── 1. A MEMÓRIA, consultada pela chave da afirmação ─────────────────────
  const mesmaAfirmacao = await prisma.reconciliationSuggestion.findFirst({
    where: { ...par, evidenceHash },
    orderBy: { createdAt: 'desc' },
    select: { id: true, state: true },
  });

  if (mesmaAfirmacao?.state === 'PENDING') {
    // A EVIDÊNCIA É ATUALIZADA, O HASH NÃO. Quem abre a fila amanhã tem que ler
    // "apareceu em 7 dias", e não o número congelado de quando a sugestão
    // nasceu — mas atualizar o hash junto reabriria exatamente o buraco que o
    // D109 fechou.
    await prisma.reconciliationSuggestion.update({
      where: { id: mesmaAfirmacao.id },
      data: {
        evidence: proposta.evidence as Prisma.InputJsonValue,
        score: proposta.score,
        shift: proposta.shift ?? null,
      },
    });
    return 'INALTERADA';
  }

  if (mesmaAfirmacao && mesmaAfirmacao.state !== 'SUPERSEDED') return 'JA_RESOLVIDA';

  // ── 2. Outra afirmação está na fila para o mesmo alvo? ───────────────────
  const pendente = await prisma.reconciliationSuggestion.findFirst({
    where: { ...par, state: 'PENDING' },
    select: { id: true },
  });

  try {
    if (pendente) {
      // Substituição ATÔMICA: sem a mesma transação, uma falha entre o update e
      // o create deixaria o par sem nenhuma sugestão pendente, e o job só
      // perceberia na próxima hora.
      await prisma.$transaction([
        prisma.reconciliationSuggestion.update({
          where: { id: pendente.id },
          data: { state: 'SUPERSEDED', resolvedAt: new Date() },
        }),
        prisma.reconciliationSuggestion.create({ data: dados }),
      ]);
      return 'RENOVADA';
    }

    await prisma.reconciliationSuggestion.create({ data: dados });
    return 'CRIADA';
  } catch (error) {
    // P2002 = o índice parcial `sugestao_pendente_por_alvo` recusou. Não é erro:
    // é outra rodada do job (ou outro processo) tendo criado a mesma sugestão
    // entre a consulta e o `create`. A checagem acima é pela DECISÃO; o índice
    // é a GARANTIA — mesmo par de guardas do `addLocationOccupant`.
    if (errorCode(error) === 'P2002') return 'INALTERADA';
    throw error;
  }
}
