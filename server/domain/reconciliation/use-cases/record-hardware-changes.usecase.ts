import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import {
  mudancasDeHardware, type EspecificacoesColetadas,
} from '../helpers/hardware-diff.helper';

const logger = createLogger('reconciliation.hardware');

// ═════════════════════════════════════════════════════════════════════════════
// "ESTA MÁQUINA TROCOU DE PEÇA" — a `AssetChange` ganha escritor.
//
// A comparação só pode acontecer no handshake, porque é o único momento em que o
// ANTES e o DEPOIS existem ao mesmo tempo: depois do `upsert`, o valor velho não
// está em lugar nenhum. É por isso que o `registerHandshake` devolve a
// fotografia do que ele estava por sobrescrever.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ISTO NÃO CONTRARIA O D95
//
// O D95 tirou do caminho de ingestão a escrita em `assets` — a tabela de
// PATRIMÔNIO, que a tela de ativos tranca em `bulk-update` e cujo lock atrasaria
// o batimento do RMM. Aqui a escrita é em `asset_changes`, que é tabela de LOG:
// append-only, sem ninguém trancando, sem ninguém editando. São dois custos
// diferentes com o mesmo nome.
//
// E ela é rara por construção: numa frota estável a comparação devolve zero e
// não há `INSERT` nenhum. Máquina não troca de pente de memória toda hora.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compara e grava — em silêncio quando não há nada a dizer.
 *
 * **SEM ATIVO, SEM LINHA.** `AssetChange.assetId` é obrigatório porque a
 * pergunta que a tabela responde é do patrimônio: *este equipamento é o mesmo
 * que a empresa comprou?* Máquina ainda órfã não tem patrimônio para contestar —
 * a conversa dela é outra (vincular primeiro), e é a tela de Descobertas que a
 * conduz.
 *
 * **Falha em silêncio (com log)**, como a observação de usuário: isto roda dentro
 * do tratamento do handshake e é uma INFERÊNCIA em cima do inventário. O que não
 * pode acontecer é a máquina deixar de aparecer no painel porque a detecção de
 * hardware tropeçou.
 */
export async function registrarMudancasDeHardware(
  endpointId: string,
  assetId: string | null,
  antes: EspecificacoesColetadas | null,
  depois: EspecificacoesColetadas,
): Promise<number> {
  // `antes` nulo = a máquina acabou de nascer neste handshake. Não há passado
  // para comparar, e tratar o primeiro contato como mudança faria toda máquina
  // nova entrar com nove linhas de histórico.
  if (!antes || !assetId) return 0;

  const mudancas = mudancasDeHardware(antes, depois);
  if (mudancas.length === 0) return 0;

  try {
    const { count } = await prisma.assetChange.createMany({
      data: mudancas.map((mudanca) => ({
        assetId,
        endpointId,
        field: mudanca.field,
        oldValue: mudanca.oldValue,
        newValue: mudanca.newValue,
      })),
    });

    logger.info(
      `[Hardware] ${count} mudança(s) detectada(s) no ativo ${assetId}: `
      + mudancas.map((mudanca) => mudanca.field).join(', '),
    );
    return count;
  } catch (error) {
    logger.error(`[Hardware] Falha ao registrar mudança de ${endpointId}:`, error);
    return 0;
  }
}

/** As mudanças detectadas num ativo, da mais recente para a mais antiga. */
export async function listarMudancasDoAtivo(assetId: string, limite = 50) {
  return prisma.assetChange.findMany({
    where: { assetId },
    orderBy: { detectedAt: 'desc' },
    take: limite,
    select: { id: true, field: true, oldValue: true, newValue: true, detectedAt: true },
  });
}
