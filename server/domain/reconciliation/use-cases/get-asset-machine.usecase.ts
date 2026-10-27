import { prisma } from '../../../core/database/prismaClient';
import { listarMudancasDoAtivo } from './record-hardware-changes.usecase';

// ═════════════════════════════════════════════════════════════════════════════
// O QUE O AGENTE VÊ DESTE ATIVO — tudo o que a aba Máquina mostra, numa resposta.
//
// A ROTA CHAMA `/machine`, e não o nome de um dos conteúdos: ela devolve
// especificação coletada, os dois últimos contatos e a mudança de hardware
// detectada. É a mesma regra que aposentou `/itam` em favor de `/ativos` (hoje `/computadores`) e que
// fez a tela se chamar `/descobertas`: o nome é do que a coisa É, não do que ela
// era quando nasceu.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * As especificações coletadas, com os dois `BigInt` já em string.
 *
 * **A CONVERSÃO NÃO É OPCIONAL.** `ramTotalBytes` e `diskTotalBytes` são
 * `BigInt` no Prisma e `JSON.stringify` não sabe serializá-los: sem isto a rota
 * morre com *"Do not know how to serialize a BigInt"* — o mesmo defeito que o
 * `presentEndpoint` já teve que consertar quando a Etapa A pôs os dois campos na
 * tabela. O tipo abaixo é o que faz o compilador cobrar a conversão.
 */
export interface EspecificacoesDaMaquina {
  manufacturer: string | null;
  hardwareModel: string | null;
  chassisType: string | null;
  biosSerial: string | null;
  systemUuid: string | null;
  cpuModel: string | null;
  osVersion: string | null;
  ramTotalBytes: string | null;
  diskTotalBytes: string | null;
  macAddress: string | null;
  localIp: string | null;
}

const SELECT_MAQUINA = {
  id: true,
  hostname: true,
  status: true,
  reviewState: true,
  lastSeen: true,
  manufacturer: true,
  hardwareModel: true,
  chassisType: true,
  biosSerial: true,
  systemUuid: true,
  cpuModel: true,
  osVersion: true,
  ramTotalBytes: true,
  diskTotalBytes: true,
  macAddress: true,
  localIp: true,
} as const;

/**
 * A máquina vinculada a um ativo, ou a resposta vazia.
 *
 * `endpointId` vai junto porque a aba precisa dele para desvincular: sem isso a
 * tela faria uma segunda consulta só para descobrir o id de uma máquina que ela
 * acabou de receber.
 *
 * `ultimoContatoNoAtivo` é o `Asset.lastSeenByAgentAt` — o carimbo que o JOB
 * propaga (D95), e ele vem AO LADO do `lastSeen` do endpoint de propósito: são
 * duas datas com significados diferentes e até uma hora de diferença, e quem lê
 * a tela precisa poder ver que a coluna do patrimônio está atrás do batimento
 * real sem que isso pareça defeito.
 */
export async function obterMaquinaDoAtivo(assetId: string) {
  const [endpoint, ativo] = await Promise.all([
    prisma.endpoint.findFirst({ where: { assetId }, select: SELECT_MAQUINA }),
    // `findFirst` e não `findUnique`: é ele que recebe o escopo da lixeira da
    // extension, então ativo excluído não devolve máquina por esta porta.
    prisma.asset.findFirst({ where: { id: assetId }, select: { id: true, lastSeenByAgentAt: true } }),
  ]);

  const vazio = {
    endpointId: null,
    hostname: null,
    status: null,
    reviewState: null,
    ultimoContato: null,
    ultimoContatoNoAtivo: ativo?.lastSeenByAgentAt ?? null,
    especificacoes: null,
    mudancas: [],
  };
  if (!ativo || !endpoint) return vazio;

  const mudancas = await listarMudancasDoAtivo(assetId);

  const especificacoes: EspecificacoesDaMaquina = {
    manufacturer: endpoint.manufacturer,
    hardwareModel: endpoint.hardwareModel,
    chassisType: endpoint.chassisType,
    biosSerial: endpoint.biosSerial,
    systemUuid: endpoint.systemUuid,
    cpuModel: endpoint.cpuModel,
    osVersion: endpoint.osVersion,
    ramTotalBytes: endpoint.ramTotalBytes?.toString() ?? null,
    diskTotalBytes: endpoint.diskTotalBytes?.toString() ?? null,
    macAddress: endpoint.macAddress,
    localIp: endpoint.localIp,
  };

  return {
    endpointId: endpoint.id,
    hostname: endpoint.hostname,
    status: endpoint.status,
    reviewState: endpoint.reviewState,
    ultimoContato: endpoint.lastSeen,
    ultimoContatoNoAtivo: ativo.lastSeenByAgentAt,
    especificacoes,
    mudancas,
  };
}
