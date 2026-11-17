import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { errorCode } from '../../../infra/errors/error-shape';
import type { HandshakeData } from '../../shared/agent-protocol.types';
import { shortHwid } from '../helpers/hwid.helper';
import { herdarMaquinaReinstalada } from './adopt-reinstalled-endpoint.usecase';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('endpoint.handshake');

// Primeiro contato (ou re-sincronização) de uma máquina: cria o registro ou
// atualiza o inventário dela. O HWID já vem normalizado do parser.
/**
 * Grava o handshake e devolve o id da máquina, que o vínculo automático usa, ou
 * `null` quando ela foi excluída durante o handshake (DD).
 */
export async function registerHandshake(data: HandshakeData): Promise<string | null> {
  // `?? undefined` na identidade, e não `?? null`: em Prisma, `undefined`
  // significa NÃO ESCREVA e `null` significa APAGUE. O serial que não veio
  // neste handshake (a leitura do firmware falhou) não apaga o que já estava, e
  // com ele o vínculo que a reconciliação já tinha resolvido. O fabricante, o
  // modelo e as placas de vídeo seguem a mesma regra. A versão do agente, não: o
  // handshake sem ela é de um agente anterior à A25, e a versão gravada mentiria.
  const inventory = {
    hostname: data.hostname,
    osVersion: data.osVersion,
    macAddress: data.macAddress,
    localIp: data.localIp,
    cpuModel: data.cpuModel,
    biosSerial: data.biosSerial ?? undefined,
    systemUuid: data.systemUuid ?? undefined,
    manufacturer: data.manufacturer ?? undefined,
    hardwareModel: data.hardwareModel ?? undefined,
    gpus: data.gpus as Prisma.InputJsonValue[] | undefined,
    agentVersion: data.agentVersion,
  };

  // HWID NUNCA VISTO PODE SER UMA MÁQUINA CONHECIDA, REINSTALADA (CV): o HWID é
  // da instalação do agente, e o firmware diz se a máquina é outra. Herdando,
  // a linha antiga passa a ter este HWID, e o `upsert` abaixo a atualiza.
  //
  // A MÁQUINA EXCLUÍDA NO MEIO DO HANDSHAKE NÃO VOLTA (DD). A exclusão apaga a
  // linha e a credencial na mesma transação: sem a linha, a credencial se
  // confere antes de criar; com ela, só se atualiza, e a linha que sumiu depois
  // da leitura é `null`, e não uma linha nova sem credencial.
  const conhecida = await prisma.endpoint.findUnique({ where: { hwid: data.hwid }, select: { id: true } });
  if (!conhecida) {
    if (await prisma.agentCredential.count({ where: { hwid: data.hwid } }) === 0) return null;
    if (!(await herdarMaquinaReinstalada(data))) {
      const { id } = await prisma.endpoint.upsert({
        where: { hwid: data.hwid },
        update: { ...inventory, status: 'ONLINE', lastSeen: new Date() },
        create: { hwid: data.hwid, ...inventory, status: 'ONLINE' },
        select: { id: true },
      });
      logger.info(`[Endpoint] Handshake de ${shortHwid(data.hwid)} (${data.hostname})`);
      return id;
    }
  }

  try {
    const { id } = await prisma.endpoint.update({
      where: { hwid: data.hwid },
      data: { ...inventory, status: 'ONLINE', lastSeen: new Date() },
      select: { id: true },
    });
    logger.info(`[Endpoint] Handshake de ${shortHwid(data.hwid)} (${data.hostname})`);
    return id;
  } catch (error) {
    if (errorCode(error) === 'P2025') return null;
    throw error;
  }
}
