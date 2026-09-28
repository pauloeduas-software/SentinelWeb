import { prisma } from '../../../core/database/prismaClient';
import { lerConfiguracaoDaDescoberta } from '../helpers/discovery-settings.helper';

// O PAINEL DE COBERTURA — a pergunta que só existe depois de os dois lados se
// falarem: *quanto do parque o sistema realmente enxerga?*
//
// Antes da F7 não havia como responder. O ITAM sabia o que foi cadastrado, o RMM
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.

export interface Cobertura {
  /** Ativos vivos no patrimônio (fora da lixeira e não baixados). */
  cadastrados: number;
  /** Desses, quantos têm máquina vinculada. */
  comAgente: number;
  semAgente: number;
  /**
   * Cadastrado e NUNCA visto por agente nenhum. É a resposta do D98: o
   * "NEVER_SEEN" que o TODO queria não é estado do endpoint — uma linha de
   * endpoint nasce de um handshake —, é esta contagem, do lado do patrimônio.
   */
  nuncaVistos: number;
  /** FANTASMA: já foi visto, e sumiu há mais de `ghostDays`. */
  fantasmas: number;

  /** Máquinas que o agente descobriu (não fundidas). */
  descobertas: number;
  /** Delas, quantas não têm cadastro: os órfãos. */
  orfaos: number;
  /** SHADOW IT: órfão visto há mais de `shadowHours` e ainda sem triagem. */
  shadowIt: number;
  /** Órfão triado como não autorizado. */
  bloqueados: number;

  /** Sugestões esperando gente. É o trabalho a fazer. */
  sugestoesPendentes: number;
}

/**
 * Tudo em uma `$transaction`.
 *
 * Não é por atomicidade — é leitura pura. É para os dez números descreverem o
 * MESMO instante: contados um a um, um handshake no meio faria `comAgente` e
 * `semAgente` não fecharem com `cadastrados`, e um painel que não soma é um
 * painel em que ninguém confia.
 */
export async function calcularCobertura(): Promise<Cobertura> {
  const configuracao = await lerConfiguracaoDaDescoberta();

  const limiteFantasma = new Date(Date.now() - configuracao.ghostDays * 24 * 60 * 60 * 1000);
  const limiteShadow = new Date(Date.now() - configuracao.shadowHours * 60 * 60 * 1000);

  // `retiredAt: null` porque ativo VENDIDO não é fantasma: ele saiu do
  // patrimônio de propósito, e contá-lo como falha de cobertura encheria o
  // painel de acertos contábeis (D19).
  const vivos = { retiredAt: null };

  const [
    cadastrados, comAgente, nuncaVistos, fantasmas,
    descobertas, orfaos, shadowIt, bloqueados, sugestoesPendentes,
  ] = await prisma.$transaction([
    prisma.asset.count({ where: vivos }),
    prisma.asset.count({ where: { ...vivos, endpoint: { isNot: null } } }),
    prisma.asset.count({ where: { ...vivos, lastSeenByAgentAt: null } }),
    prisma.asset.count({ where: { ...vivos, lastSeenByAgentAt: { lt: limiteFantasma } } }),

    prisma.endpoint.count({ where: { mergedIntoId: null } }),
    prisma.endpoint.count({ where: { mergedIntoId: null, assetId: null } }),
    prisma.endpoint.count({
      where: {
        mergedIntoId: null,
        assetId: null,
        reviewState: 'UNREVIEWED',
        lastSeen: { lt: limiteShadow },
      },
    }),
    prisma.endpoint.count({ where: { mergedIntoId: null, reviewState: 'BLOCKED' } }),

    prisma.reconciliationSuggestion.count({ where: { state: 'PENDING' } }),
  ]);

  return {
    cadastrados,
    comAgente,
    semAgente: cadastrados - comAgente,
    nuncaVistos,
    fantasmas,
    descobertas,
    orfaos,
    shadowIt,
    bloqueados,
    sugestoesPendentes,
  };
}
