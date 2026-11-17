import type { Prisma } from '@prisma/client';

// O QUE CADA ROTA DA MÁQUINA DEVOLVE, e só isso (DA): a lista de `/agentes`
// e a aba Máquina leem campos diferentes, e o resto da linha fica no banco.
//
// Os bytes de RAM da telemetria são BigInt no banco, e BigInt não tem
// representação em JSON: `JSON.stringify` estoura. A conversão acontece AQUI, na
// saída do domínio, e não com um `BigInt.prototype.toJSON` global — remendo que
// mudava o comportamento de toda a aplicação para resolver um campo.

/**
 * O ATIVO a que a máquina está vinculada — o que a lista de `/agentes` mostra
 * na coluna Computador. O resto do ativo é da ficha dele, para onde a
 * etiqueta leva.
 */
const ATIVO_DA_MAQUINA_SELECT = {
  select: { id: true, assetTag: true, name: true, serial: true },
} as const;

/** A linha da lista de `/agentes`, e o painel de vincular. */
export const MAQUINA_DA_LISTA_SELECT = {
  id: true,
  hostname: true,
  osVersion: true,
  biosSerial: true,
  // O chamado que chega só com o IP acha a máquina pela busca da lista (DJ).
  localIp: true,
  status: true,
  lastSeen: true,
  agentVersion: true,
  asset: ATIVO_DA_MAQUINA_SELECT,
} as const satisfies Prisma.EndpointSelect;

export type MaquinaDaLista = Prisma.EndpointGetPayload<{ select: typeof MAQUINA_DA_LISTA_SELECT }>;

/**
 * O computador da ficha da máquina (DF): a aba Computador mostra a linha dele como a
 * aba do posto, com o modelo, a categoria e o status.
 */
const ATIVO_DA_FICHA_DA_MAQUINA_SELECT = {
  select: {
    id: true,
    assetTag: true,
    serial: true,
    model: { select: { name: true, manufacturer: { select: { name: true } }, category: { select: { name: true } } } },
    status: { select: { name: true, type: true } },
  },
} as const;

/**
 * A ficha da máquina em `/agentes/:id` e a aba Máquina do computador e do posto: o
 * inventário do handshake, o computador vinculado e a amostra ATUAL de telemetria.
 *
 * `take: 1` porque é a amostra atual que a tela mostra. É o motivo do índice
 * `(endpointId, timestamp DESC)`: sem ele, cada poll de cada tela aberta era uma
 * varredura sequencial desta tabela.
 */
export const MAQUINA_DA_FICHA_SELECT = {
  id: true,
  hwid: true,
  hostname: true,
  osVersion: true,
  biosSerial: true,
  manufacturer: true,
  hardwareModel: true,
  gpus: true,
  cpuModel: true,
  localIp: true,
  macAddress: true,
  agentVersion: true,
  status: true,
  lastSeen: true,
  asset: ATIVO_DA_FICHA_DA_MAQUINA_SELECT,
  // Só para a dica e o aviso: a resposta não o leva.
  autoLinkOff: true,
  telemetries: {
    orderBy: { timestamp: 'desc' },
    take: 1,
    select: {
      cpuUsage: true, ramTotal: true, ramUsed: true, disks: true, timestamp: true,
    },
  },
} as const satisfies Prisma.EndpointSelect;

type MaquinaDaFicha = Prisma.EndpointGetPayload<{ select: typeof MAQUINA_DA_FICHA_SELECT }>;
type AmostraLida = MaquinaDaFicha['telemetries'][number];

type AmostraApresentada = Omit<AmostraLida, 'ramTotal' | 'ramUsed'> & { ramTotal: string; ramUsed: string };

export type MaquinaDaFichaApresentada = Omit<MaquinaDaFicha, 'telemetries' | 'autoLinkOff'> & { telemetries: AmostraApresentada[] };

export function presentMaquinaDaFicha(maquina: Omit<MaquinaDaFicha, 'autoLinkOff'>): MaquinaDaFichaApresentada {
  return {
    ...maquina,
    telemetries: maquina.telemetries.map((amostra) => ({
      ...amostra, ramTotal: amostra.ramTotal.toString(), ramUsed: amostra.ramUsed.toString(),
    })),
  };
}
