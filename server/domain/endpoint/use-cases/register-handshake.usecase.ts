import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { HandshakeData } from '../../shared/agent-protocol.types';
import { hashDaListaDeSoftware, normalizarListaDeSoftware } from '../../reconciliation/helpers/software-key.helper';
import type { EspecificacoesColetadas } from '../../reconciliation/helpers/hardware-diff.helper';
import { shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('endpoint.handshake');

/**
 * As especificações que ESTAVAM gravadas, lidas antes de o `upsert` passar por
 * cima delas. `null` quando a máquina nasceu neste handshake.
 *
 * Existe porque a detecção de mudança de hardware precisa do ANTES e do DEPOIS
 * no mesmo instante, e depois do `upsert` o valor velho não está em lugar nenhum.
 * A alternativa seria guardar uma segunda cópia das specs para comparar contra —
 * segunda fonte de verdade para o mesmo dado, que é o que o D16 recusa.
 */
const SELECT_ESPECIFICACOES = {
  id: true,
  assetId: true,
  manufacturer: true,
  hardwareModel: true,
  chassisType: true,
  biosSerial: true,
  systemUuid: true,
  cpuModel: true,
  osVersion: true,
  ramTotalBytes: true,
  diskTotalBytes: true,
} as const;

export interface HandshakeRegistrado {
  id: string;
  /** O ativo vinculado, se houver. Quem detecta mudança de hardware precisa dele. */
  assetId: string | null;
  /** O que havia gravado antes deste handshake. `null` = máquina nova. */
  anterior: EspecificacoesColetadas | null;
  /** O que passou a estar gravado. É o outro lado da comparação. */
  atual: EspecificacoesColetadas;
}

// Primeiro contato (ou re-sincronização) de uma máquina: cria o registro ou
// atualiza o inventário dela. O HWID já vem normalizado do parser.
export async function registerHandshake(data: HandshakeData): Promise<HandshakeRegistrado> {
  // `?? undefined` em TODO campo de identidade, e não `?? null`: em Prisma,
  // `undefined` significa NÃO ESCREVA e `null` significa APAGUE. A diferença é a
  // fase inteira durante o rollout do agente C# — uma máquina que já mandou o
  // serial e reconecta com a versão antiga do agente (rollback, reinstalação)
  // apagaria o próprio serial, e com ele o vínculo que a reconciliação já tinha
  // resolvido. O que o agente velho não sabe, ele não desfaz.
  const inventory = {
    hostname: data.hostname,
    osVersion: data.osVersion,
    macAddress: data.macAddress,
    localIp: data.localIp,
    cpuModel: data.cpuModel,
    // Campo Json: ausente vira `undefined` (não escreve) em vez de null
    installedSoftware: (data.installedSoftware ?? undefined) as Prisma.InputJsonValue | undefined,

    // O HASH DA LISTA, calculado aqui e não no job (D100). São dois `sha256` de
    // string por handshake — que acontece quando o agente sobe, não a cada
    // amostra —, e é ele que impede o job de re-hashear o JSON da frota inteira
    // de hora em hora só para descobrir quem mudou.
    softwareHash: data.installedSoftware === null
      ? undefined
      : hashDaListaDeSoftware(normalizarListaDeSoftware(data.installedSoftware)),

    biosSerial: data.biosSerial ?? undefined,
    systemUuid: data.systemUuid ?? undefined,
    manufacturer: data.manufacturer ?? undefined,
    hardwareModel: data.hardwareModel ?? undefined,
    chassisType: data.chassisType ?? undefined,
    ramTotalBytes: data.ramTotalBytes ?? undefined,
    diskTotalBytes: data.diskTotalBytes ?? undefined,
    loggedOnUser: data.loggedOnUser ?? undefined,
  };

  // A FOTOGRAFIA DO ANTES, e é UMA leitura por `hwid` — coluna `@unique`, então
  // é busca por índice. Handshake acontece quando o agente sobe ou
  // ressincroniza, não a cada amostra de telemetria: o caminho quente continua
  // sendo o `touchEndpoint`, que não passa por aqui.
  const anterior = await prisma.endpoint.findUnique({
    where: { hwid: data.hwid },
    select: SELECT_ESPECIFICACOES,
  });

  // Devolve o `id` porque quem roteia a mensagem (domain/agent) precisa dele
  // para a observação de usuário e para o vínculo do ApiToken — sem isso, os
  // dois fariam um `findUnique` pelo hwid logo depois deste upsert, que é a
  // mesma linha lida duas vezes no caminho de ingestão.
  const endpoint = await prisma.endpoint.upsert({
    where: { hwid: data.hwid },
    update: { ...inventory, status: 'ONLINE', lastSeen: new Date() },
    create: { hwid: data.hwid, ...inventory, status: 'ONLINE' },
    select: SELECT_ESPECIFICACOES,
  });

  logger.info(`[Endpoint] Handshake de ${shortHwid(data.hwid)} (${data.hostname})`);

  return {
    id: endpoint.id,
    assetId: endpoint.assetId,
    anterior: anterior ? especificacoesDe(anterior) : null,
    atual: especificacoesDe(endpoint),
  };
}

/** Recorta as specs da linha lida — o formato que a comparação pura espera. */
function especificacoesDe(linha: {
  manufacturer: string | null; hardwareModel: string | null; chassisType: string | null;
  biosSerial: string | null; systemUuid: string | null; cpuModel: string | null;
  osVersion: string; ramTotalBytes: bigint | null; diskTotalBytes: bigint | null;
}): EspecificacoesColetadas {
  return {
    manufacturer: linha.manufacturer,
    hardwareModel: linha.hardwareModel,
    chassisType: linha.chassisType,
    biosSerial: linha.biosSerial,
    systemUuid: linha.systemUuid,
    cpuModel: linha.cpuModel,
    osVersion: linha.osVersion,
    ramTotalBytes: linha.ramTotalBytes,
    diskTotalBytes: linha.diskTotalBytes,
  };
}
