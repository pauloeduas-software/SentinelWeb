import { prisma } from '../../../infra/database/prismaClient';
import { SEM_BAIXA } from '../../asset/helpers/asset-filters.helper';
import { DIAS_SEM_CONTATO, limiteDeSumido } from '../../endpoint/helpers/endpoint-filters.helper';

// O PAINEL DE COBERTURA — a pergunta que só existe depois de os dois lados se
// falarem: *quanto do parque o sistema realmente enxerga?*
//
// Antes não havia como responder. O ITAM sabia o que foi cadastrado, o RMM
// sabia o que está ligado, e ninguém sabia o tamanho da diferença.

export interface Cobertura {
  /** Ativos vivos no patrimônio (fora da lixeira e não baixados). */
  cadastrados: number;
  /** Desses, quantos têm máquina vinculada. */
  comAgente: number;
  semAgente: number;
  /**
   * As MÁQUINAS sem sinal há mais de `DIAS_SEM_CONTATO`, com computador ou sem: o
   * número da vista Sumidos, onde se desvincula e se exclui (DD).
   */
  sumidos: number;
  /** O prazo dos sumidos, que a frase do painel cita. */
  diasSemContato: number;
}

/**
 * Tudo em uma `$transaction`.
 *
 * Não é por atomicidade — é leitura pura. É para os números descreverem o
 * MESMO instante: contados um a um, um handshake no meio faria `comAgente` e
 * `semAgente` não fecharem com `cadastrados`, e um painel que não soma é um
 * painel em que ninguém confia.
 */
export async function calcularCobertura(): Promise<Cobertura> {
  // `SEM_BAIXA` porque ativo VENDIDO não está sumido: ele saiu do
  // patrimônio de propósito, e contá-lo como falha de cobertura encheria o
  // painel de acertos contábeis (D19).
  const vivos = SEM_BAIXA;

  const [cadastrados, comAgente, sumidos] = await prisma.$transaction([
    prisma.asset.count({ where: vivos }),
    prisma.asset.count({ where: { ...vivos, endpoint: { isNot: null } } }),
    prisma.endpoint.count({ where: { lastSeen: { lt: limiteDeSumido() } } }),
  ]);

  return { cadastrados, comAgente, semAgente: cadastrados - comAgente, sumidos, diasSemContato: DIAS_SEM_CONTATO };
}
