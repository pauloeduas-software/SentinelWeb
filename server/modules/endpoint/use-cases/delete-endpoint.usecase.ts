import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { desconectarAgente } from '../../agent/agent.registry';

// EXCLUIR A MÁQUINA (DD) — a formatada, a descartada, a roubada: o que o agente
// mostrou e não existe mais, ou não deveria estar ali.
//
// Três coisas, nesta ordem: a credencial do agente sai, a linha da máquina sai
// (a telemetria vai junto, pelo `Cascade`), e a conexão aberta fecha. Sem a
// credencial, a reconexão leva 401: a máquina só volta reinstalando o agente
// com o segredo de instalação. Era a revogação da CR, que morava num comando de
// terminal e não fechava a conexão; daqui, que tem o socket, fecha.
//
// A MÁQUINA COM COMPUTADOR NÃO SAI: é 409, como a baixa do computador com
// máquina (CL). O vínculo é a identidade dela no patrimônio, e excluí-la em
// silêncio deixaria o computador sem agente sem ninguém ter decidido isso.
//
// Exclusão de verdade, sem lixeira: o histórico da máquina não é dela. A linha
// da auditoria guarda o nome e o HWID por escrito.

export async function excluirMaquina(endpointId: string, ator: Ator): Promise<void> {
  const hwid = await prisma.$transaction(async (tx) => {
    // A mesma trava do vínculo (`link-endpoint-asset.usecase.ts`): o Vincular no
    // meio da exclusão espera, e não liga um computador a uma linha que some.
    await tx.$queryRaw`SELECT id FROM endpoints WHERE id = ${endpointId}::uuid FOR UPDATE`;
    const maquina = await tx.endpoint.findUnique({
      where: { id: endpointId },
      select: { hwid: true, hostname: true, asset: { select: { id: true, assetTag: true } } },
    });
    if (!maquina) throw new AppError('Máquina não encontrada.', 404);

    if (maquina.asset) {
      throw new AppError(
        `A máquina ${maquina.hostname} está vinculada a ${maquina.asset.assetTag}. Desvincule antes de excluir.`,
        409,
        [{ tipo: 'ativo', id: maquina.asset.id, nome: maquina.asset.assetTag }],
      );
    }

    await tx.agentCredential.deleteMany({ where: { hwid: maquina.hwid } });
    await tx.endpoint.delete({ where: { id: endpointId } });
    await recordAudit(tx, {
      entityType: 'Endpoint',
      entityId: endpointId,
      entityLabel: maquina.hostname,
      action: 'DELETE',
      changes: { hostname: { de: maquina.hostname, para: null }, hwid: { de: maquina.hwid, para: null } },
    }, ator);

    return maquina.hwid;
  });

  // Depois do commit: fechada antes, a reconexão ainda acharia a credencial.
  desconectarAgente(hwid, 'Máquina excluída');
}
