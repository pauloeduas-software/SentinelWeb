import { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { normalizeSerial } from '../../reconciliation/helpers/normalize-identity.helper';
import { inicioDoDiaLocal } from '../../../core/time/local-day';
import { ATIVO_NO_PARQUE } from '../../asset/helpers/asset-scope.helper';
import { registrarAuditoriaNaTransacao } from './record-audit.usecase';

// A AUDITORIA AUTOMÁTICA — o D124, e o item que a F7 declarou e não construiu.
//
// ═════════════════════════════════════════════════════════════════════════════
// TRÊS DECISÕES, E CADA UMA FECHA UMA FORMA DE ERRAR.
//
// 1. ELA NASCE NO JOB, NUNCA NO HANDSHAKE — é o D95 outra vez. `touchEndpoint`
//    roda a cada Handshake, Telemetry e Ping de CADA máquina. Uma linha de `Audit`
//    ali cresceria em (máquinas × mensagens por dia), e a tabela que responde
//    "quando este ativo foi conferido" viraria a maior do banco em uma semana.
//
// 2. SÓ O SERIAL CONFIRMA. Hostname é renomeável e MAC muda com dock; nenhum dos
//    dois prova que alguém olhou o equipamento. O `biosSerial` é o número que está
//    na etiqueta do fabricante, e é ele que casa com `Asset.serial`.
//
// 3. SERIAL QUE NÃO BATE NÃO É AUDITORIA NENHUMA — e em particular NÃO é
//    `NAO_LOCALIZADO`. Máquina que não manda serial é caso normal e aceito na F7
//    (`biosSerial` é nulável de propósito); marcá-la como não localizada seria o
//    sistema afirmando um desaparecimento a partir de um dado que nunca existiu.
//
// E O QUE ELA NÃO FAZ: escrever `locationId`. O agente não sabe onde a máquina
// está — ele sabe que ela existe e qual é o número de série dela. Os três campos
// conferidos da Etapa B são do caminho MANUAL; aqui é `result: OK`, `lastAuditAt`
// avança, e nada mais. Sem esta linha, a automática cairia na mesma transação que
// corrige localização e violaria o D52 por dentro de um job.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('audit.agente');

/**
 * Teto por rodada. A primeira rodada de uma frota grande conferiria tudo de uma
 * vez; o resto entra na hora seguinte, e o corte diário impede repetição.
 */
const TETO = 500;

/**
 * Confere pelo agente os ativos cuja máquina bateu e cujo serial casa.
 *
 * UMA POR ATIVO POR DIA, e o corte é o dia LOCAL (D123): duas conferências
 * automáticas no mesmo dia de trabalho não acrescentam informação, e a coluna
 * `lastAuditAt` responde em dias.
 *
 * Devolve quantas foram gravadas — o job loga junto dos outros números da rodada.
 */
export async function auditarPeloAgente(fuso: string): Promise<number> {
  const desdeHoje = inicioDoDiaLocal(fuso);

  // Os candidatos: máquina VIVA (não fundida) com ativo vinculado, serial nos dois
  // lados, e ativo que ainda não foi conferido hoje.
  //
  // O RECORTE É O MESMO DO RELATÓRIO (`ATIVO_NO_PARQUE`), e não um `retiredAt:
  // null` escrito aqui: ativo que saiu do patrimônio ou da operação não é
  // conferido, e se o agente ainda bate nele isso é assunto do painel de
  // cobertura. Com o recorte frouxo, um ARCHIVED tinha `lastAuditAt` avançado todo
  // dia por este job e nunca aparecia no relatório que lê o recorte completo.
  //
  // `deletedAt: null` À MÃO: o ativo é alcançado por RELAÇÃO ANINHADA daqui, e
  // relação aninhada não herda o escopo da `softDeleteExtension` (D8). Sem ele, um
  // ativo na lixeira com agente ativo era conferido diariamente por um job — e
  // nenhuma tela mostrava isso.
  const candidatos = await prisma.endpoint.findMany({
    where: {
      assetId: { not: null },
      mergedIntoId: null,
      biosSerial: { not: null },
      asset: {
        ...ATIVO_NO_PARQUE,
        deletedAt: null,
        serial: { not: null },
        OR: [{ lastAuditAt: null }, { lastAuditAt: { lt: desdeHoje } }],
      },
    },
    select: {
      id: true,
      biosSerial: true,
      asset: { select: { id: true, assetTag: true, serial: true, locationId: true } },
    },
    take: TETO,
  });

  // A COMPARAÇÃO É SOBRE O VALOR NORMALIZADO, e não sobre o texto cru: o mesmo
  // serial chega com espaços, caixa diferente e lixo de fábrica, e é o
  // `normalizeSerial` (F7) que já sabe disso. Comparar cru faria a auditoria
  // automática nunca casar em metade da frota — e falhar em silêncio, porque o
  // resultado é "nenhuma conferência", que é indistinguível de "nada mudou".
  const confirmados = candidatos.filter((endpoint) => {
    const doAgente = normalizeSerial(endpoint.biosSerial);
    const doCadastro = normalizeSerial(endpoint.asset?.serial);
    return doAgente !== null && doCadastro !== null && doAgente === doCadastro;
  });

  if (confirmados.length === 0) return 0;

  const ativos = confirmados.map((endpoint) => endpoint.asset!).filter((ativo) => ativo !== null);

  // A POSSE NÃO É LIDA AQUI, e a leitura em lote que existia foi removida: as duas
  // divergências que ela alimentava são OBSERVAÇÕES, e o agente não observa (D124).
  // `registrarAuditoriaNaTransacao` já garante isso pelo `method`, então buscar o
  // contexto era uma consulta por rodada para um valor que a função descarta.
  let gravadas = 0;

  for (const ativo of ativos) {
    // UMA TRANSAÇÃO POR ATIVO, e não uma para as quinhentas: uma máquina que falhe
    // (o ativo foi apagado entre a leitura e a escrita) não pode desfazer as
    // conferências das outras 499. É a mesma escolha do laço do
    // `rodarReconciliacao`.
    try {
      await prisma.$transaction(async (tx) => {
        await registrarAuditoriaNaTransacao(tx, {
          ativo,
          // Sem `posse`: ver o bloco acima e o de `registrarAuditoriaNaTransacao`.
          result: $Enums.AuditResult.OK,
          // NUNCA preenchido pelo agente: ele não sabe onde a máquina está.
          locationIdFound: null,
          notes: null,
          method: $Enums.AuditMethod.AGENTE,
          // Sem ator, e esse `null` é uma AFIRMAÇÃO: job não tem autor, e um
          // usuário `system` inventado para preencher a coluna seria auditoria
          // assinada por quem não existe (D23).
          auditedById: null,
        });
      });
      gravadas += 1;
    } catch (error) {
      logger.error(`[Auditoria] Falha ao conferir ${ativo.assetTag} pelo agente:`, error);
    }
  }

  return gravadas;
}
