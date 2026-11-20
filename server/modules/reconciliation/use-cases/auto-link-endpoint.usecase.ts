import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { createLogger } from '../../../infra/logger/logger';
import type { Ator } from '../../audit/audit.types';
import { normalizeSerial } from '../helpers/normalize-identity.helper';
import {
  analisarMaquina, seriesRepetidas, type AtivoDoParque, type MaquinaDoParque,
} from '../helpers/match-cascade.helper';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';

// O VÍNCULO AUTOMÁTICO, na hora em que algo muda (DC): no handshake da máquina e
// quando um computador é salvo com série. O GLPI decide na chegada do inventário,
// e não numa varredura de hora em hora; assim ninguém espera nem aperta botão.

const logger = createLogger('reconciliation.auto-link');

/**
 * O autor do vínculo automático: o sistema, não uma conta. É a diferença que a
 * auditoria existe para mostrar (AB).
 */
const VINCULO_AUTOMATICO: Ator = { tipo: 'SYSTEM', origem: 'vinculo-automatico' };

export const MAQUINA_DO_PARQUE_SELECT = {
  id: true, hostname: true, biosSerial: true, autoLinkOff: true,
} as const;

export interface Parque {
  ativos: AtivoDoParque[];
  repetidas: Set<string>;
}

/**
 * O que a regra precisa ver: os computadores vivos e as séries repetidas entre
 * máquinas. `findMany` e não SQL: a extensão de soft delete tira a lixeira sozinha.
 */
export async function lerParque(): Promise<Parque> {
  const [ativos, maquinas] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true, assetTag: true, serial: true, name: true, retiredAt: true,
        endpoint: { select: { id: true, hostname: true } },
      },
    }),
    prisma.endpoint.findMany({ select: { biosSerial: true } }),
  ]);
  return { ativos, repetidas: seriesRepetidas(maquinas.map((maquina) => maquina.biosSerial)) };
}

/**
 * Liga a máquina ao computador da mesma série, quando a regra deixa. Devolve se
 * ligou. Nunca lança: o handshake e o salvamento do computador já deram certo, e
 * o vínculo que não aconteceu deixa a máquina em Sem computador, para a mão.
 */
export async function vincularPelaSerie(endpointId: string): Promise<boolean> {
  try {
    const maquina: (MaquinaDoParque & { assetId: string | null }) | null = await prisma.endpoint.findUnique({
      where: { id: endpointId },
      select: { ...MAQUINA_DO_PARQUE_SELECT, assetId: true },
    });
    // As saídas baratas antes de ler o parque: o handshake passa aqui a cada conexão,
    // uma vez por dia e a cada Atualizar agora.
    if (!maquina || maquina.assetId || maquina.autoLinkOff || !normalizeSerial(maquina.biosSerial)) return false;

    const { ativos, repetidas } = await lerParque();
    const { vincularA } = analisarMaquina(maquina, ativos, repetidas);
    if (!vincularA) return false;

    const ligada = await vincularEndpointAoAtivo(maquina.id, vincularA.id, VINCULO_AUTOMATICO, { automatico: true, sinal: 'SERIAL' });
    return ligada !== null;
  } catch (error) {
    // O 409 é a corrida perdida: outra pessoa vinculou ou baixou no meio.
    if (!(error instanceof AppError)) logger.error(`[Vínculo] Falha ao vincular ${endpointId}:`, error);
    return false;
  }
}

/**
 * O computador salvo com série procura a máquina que chegou antes dele. Nunca
 * lança, pelo mesmo motivo do `vincularPelaSerie`: o computador já foi salvo.
 */
export async function vincularMaquinaDoComputador(assetId: string): Promise<void> {
  try {
    const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { serial: true } });
    const serie = normalizeSerial(ativo?.serial);
    if (!serie) return;

    const semComputador = await prisma.endpoint.findMany({
      where: { assetId: null, autoLinkOff: false, biosSerial: { not: null } },
      select: { id: true, biosSerial: true },
    });
    for (const maquina of semComputador) {
      if (normalizeSerial(maquina.biosSerial) === serie) await vincularPelaSerie(maquina.id);
    }
  } catch (error) {
    logger.error(`[Vínculo] Falha ao procurar a máquina de ${assetId}:`, error);
  }
}
