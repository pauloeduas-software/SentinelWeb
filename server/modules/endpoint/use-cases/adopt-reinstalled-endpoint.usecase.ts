import { prisma } from '../../../infra/database/prismaClient';
import { errorCode } from '../../../infra/errors/error-shape';
import { createLogger } from '../../../infra/logger/logger';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { normalizeSerial, normalizeUuid } from '../../reconciliation/helpers/normalize-identity.helper';
import { shortHwid } from '../helpers/hwid.helper';

const logger = createLogger('endpoint.reinstall');

const SISTEMA: Ator = { tipo: 'SYSTEM', origem: 'agent:reinstalacao' };

// A MÁQUINA REINSTALADA HERDA A PRÓPRIA LINHA (CV) — o que o GLPI faz.
//
// O HWID é o id da INSTALAÇÃO do agente: ele nasce sorteado no primeiro
// arranque e morre quando o disco é formatado ou o pacote é purgado. A máquina
// é a mesma, e quem a reconhece é o firmware que chega no handshake: o
// `RuleImportAsset` do GLPI casa o inventário com o computador cadastrado por
// serial e UUID, aponta o agente novo para ele e apaga o agente velho
// (`MainAsset::rulepassed`). Aqui a linha do `Endpoint` faz o papel do
// computador do GLPI — é nela que moram o vínculo com o ativo e a telemetria —,
// então ela fica, e só o `hwid` muda.
//
// AS REGRAS SÃO AS DO GLPI, e na mesma ordem (`RuleImportAsset.xml`):
//   - serial e UUID iguais (a regra 11);
//   - serial igual e a linha antiga sem UUID (a 12);
//   - os dois vieram e nada casou com os dois: máquina nova (a 13);
//   - só o serial veio: serial igual (a 14).
// O UUID sozinho não basta, como lá (a 15 vem desligada): é o valor que a VM
// clonada e o firmware genérico repetem. O nome nunca, porque é renomeável e se
// repete (o D46 já dava 60 pontos a ele).
//
// E DUAS TRAVAS QUE O GLPI NÃO TEM, porque lá o erro custa um inventário e aqui
// custa os comandos de outra máquina:
//   - **um candidato só.** Dois endpoints com o mesmo serial são evidência
//     zero (D46): a máquina nasce nova, e o log diz por quê.
//   - **o candidato OFFLINE.** A máquina que segue ligada não foi reinstalada:
//     o outro agente com o mesmo serial é um clone, ou um serial repetido que a
//     lista de fábrica não conhece. Herdar a linha dela tomaria o lugar de uma
//     máquina viva.

interface IdentidadeDoHandshake {
  hwid: string;
  biosSerial?: string | null;
  systemUuid?: string | null;
}

/**
 * Se este HWID nunca foi visto e o firmware dele é o de uma máquina conhecida
 * e desligada, troca o `hwid` daquela linha por este. Devolve se trocou.
 *
 * Roda antes do `upsert` do handshake: com a linha renomeada, o `upsert` cai no
 * `update`, e o "antes" que a mudança de hardware compara é o da máquina antiga.
 */
export async function herdarMaquinaReinstalada(identidade: IdentidadeDoHandshake): Promise<boolean> {
  const serial = normalizeSerial(identidade.biosSerial);
  if (!serial) return false;
  const uuid = normalizeUuid(identidade.systemUuid);

  // O serial do banco está como chegou, e a comparação é pela forma
  // normalizada: a consulta traz os que têm serial, e o filtro é daqui. Só a
  // máquina que o servidor nunca viu passa por aqui, uma vez.
  const comSerial = await prisma.endpoint.findMany({
    where: { biosSerial: { not: null } },
    select: { id: true, hwid: true, hostname: true, status: true, biosSerial: true, systemUuid: true },
  });
  const mesmoSerial = comSerial.filter((linha) => normalizeSerial(linha.biosSerial) === serial);
  if (mesmoSerial.length === 0) return false;

  let candidatos = mesmoSerial;
  if (uuid) {
    const mesmoUuid = mesmoSerial.filter((linha) => normalizeUuid(linha.systemUuid) === uuid);
    candidatos = mesmoUuid.length > 0 ? mesmoUuid : mesmoSerial.filter((linha) => !normalizeUuid(linha.systemUuid));
  }

  if (candidatos.length !== 1) {
    if (candidatos.length > 1) {
      logger.warn(`[Endpoint] ${shortHwid(identidade.hwid)} tem o serial de ${candidatos.length} máquinas: entra como máquina nova.`);
    }
    return false;
  }

  const antiga = candidatos[0];
  if (antiga.status !== 'OFFLINE') {
    logger.warn(
      `[Endpoint] ${shortHwid(identidade.hwid)} tem o serial de ${antiga.hostname}, que está online: `
        + 'entra como máquina nova (clone ou serial repetido).',
    );
    return false;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // A trava e a releitura: a máquina antiga pode ter voltado entre a
      // consulta e aqui, e aí ela continua dela.
      const [atual] = await tx.$queryRaw<{ hwid: string; status: string }[]>`
        SELECT hwid, status::text AS status FROM endpoints WHERE id = ${antiga.id}::uuid FOR UPDATE`;
      if (!atual || atual.status !== 'OFFLINE' || atual.hwid !== antiga.hwid) return false;

      await tx.endpoint.update({ where: { id: antiga.id }, data: { hwid: identidade.hwid } });

      // O token da instalação velha morre com ela: o disco que o guardava foi
      // formatado, e uma cópia dele não pode mais falar por esta máquina.
      await tx.agentCredential.deleteMany({ where: { hwid: antiga.hwid } });

      await recordAudit(tx, {
        entityType: 'Endpoint',
        entityId: antiga.id,
        entityLabel: antiga.hostname,
        action: 'REINSTALL',
        changes: { hwid: { de: antiga.hwid, para: identidade.hwid } },
      }, SISTEMA);

      logger.info(
        `[Endpoint] ${antiga.hostname} reinstalada: ${shortHwid(antiga.hwid)} passou a ser ${shortHwid(identidade.hwid)}.`,
      );
      return true;
    });
  } catch (error) {
    // Dois handshakes do mesmo HWID novo ao mesmo tempo: o segundo encontra o
    // `hwid` já gravado pelo primeiro, e o `upsert` que vem depois o atualiza.
    if (errorCode(error) === 'P2002') return false;
    throw error;
  }
}
