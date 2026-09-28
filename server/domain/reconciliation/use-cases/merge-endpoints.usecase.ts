import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

// ═════════════════════════════════════════════════════════════════════════════
// A FUSÃO DE DUAS MÁQUINAS QUE SÃO A MESMA — reimagem ou troca de placa muda o
// `hwid`, e o agente reinstalado cria uma linha nova sem saber que já existia.
//
// **Regra em uma linha:** quando o serial casa com um ativo que JÁ TEM endpoint
// vinculado, isso não é vínculo, é MERGE.
//
// É a operação mais destrutiva da fase e a única sem desfazer, então ela é:
// humana (nunca automática, em nenhum `discoveryMode`), transacional (mover
// metade da telemetria seria pior do que não mover nada) e registrada.
//
// O QUE ELA NÃO FAZ: apagar o endpoint antigo (D103). A linha fica, com
// `mergedIntoId` preenchido e fora de toda listagem. Três razões concretas — o
// agente antigo pode VOLTAR (a reimagem não pegou, a placa foi devolvida) e
// recriaria um órfão sem saber que já foi fundido; o `ApiToken` daquela
// instalação aponta para este id; e ela é a testemunha de que a fusão
// aconteceu, ao lado do `ActivityLog`.
// ═════════════════════════════════════════════════════════════════════════════

const SELECT_ENDPOINT = {
  id: true,
  hwid: true,
  hostname: true,
  assetId: true,
  lastSeen: true,
  mergedIntoId: true,
} as const;

/**
 * Funde `perdedorId` em `vencedorId`.
 *
 * O VENCEDOR é a linha que continua sendo a máquina — normalmente a mais
 * recente, que é a que o agente está usando agora. Quem escolhe é quem opera:
 * a tela mostra as duas com data de último contato, e a escolha errada aqui é
 * recuperável só por outra fusão.
 *
 * SOBRE AS COLISÕES DE CHAVE: `endpoint_user_daily` é única por (máquina, conta,
 * dia) e `software_installations` por (máquina, pacote). As duas máquinas podem
 * ter linhas do MESMO dia e do MESMO pacote — é o caso normal, aliás, porque a
 * reimagem acontece no meio de um dia de trabalho. Mover cegamente violaria o
 * índice, então as colididas são CONSOLIDADAS (somando amostras e esticando as
 * datas) e só as demais são movidas.
 */
export async function fundirEndpoints(perdedorId: string, vencedorId: string, actorId: string | null) {
  if (perdedorId === vencedorId) {
    throw new AppError('Uma máquina não pode ser fundida nela mesma.', 422);
  }

  return prisma.$transaction(async (tx) => {
    const perdedor = await tx.endpoint.findUnique({ where: { id: perdedorId }, select: SELECT_ENDPOINT });
    const vencedor = await tx.endpoint.findUnique({ where: { id: vencedorId }, select: SELECT_ENDPOINT });

    if (!perdedor) throw new AppError('Máquina de origem não encontrada.', 404);
    if (!vencedor) throw new AppError('Máquina de destino não encontrada.', 404);
    if (perdedor.mergedIntoId) throw new AppError('Esta máquina já foi fundida em outra.', 409);
    if (vencedor.mergedIntoId) throw new AppError('A máquina de destino já foi fundida em outra.', 409);

    // Dois ativos diferentes NÃO se fundem: seria dizer que dois patrimônios são
    // a mesma coisa, que é um problema de cadastro de ATIVO e se resolve na tela
    // de ativos — com a nota fiscal na mão, não pelo RMM.
    if (perdedor.assetId && vencedor.assetId && perdedor.assetId !== vencedor.assetId) {
      throw new AppError(
        'As duas máquinas estão vinculadas a ativos diferentes. Desfaça um dos vínculos antes de fundir.',
        409,
      );
    }

    // ── A TELEMETRIA, o volume da operação ───────────────────────────────────
    const { count: telemetriasMovidas } = await tx.telemetry.updateMany({
      where: { endpointId: perdedorId },
      data: { endpointId: vencedorId },
    });

    // ── A PRESENÇA, consolidando o que colide ────────────────────────────────
    const diasDoPerdedor = await tx.endpointUserDaily.findMany({ where: { endpointId: perdedorId } });
    for (const dia of diasDoPerdedor) {
      const existente = await tx.endpointUserDaily.findUnique({
        where: { endpointId_userKey_day: { endpointId: vencedorId, userKey: dia.userKey, day: dia.day } },
        select: { id: true, firstSeenAt: true, lastSeenAt: true },
      });

      if (!existente) {
        await tx.endpointUserDaily.update({ where: { id: dia.id }, data: { endpointId: vencedorId } });
        continue;
      }

      await tx.endpointUserDaily.update({
        where: { id: existente.id },
        data: {
          firstSeenAt: dia.firstSeenAt < existente.firstSeenAt ? dia.firstSeenAt : existente.firstSeenAt,
          lastSeenAt: dia.lastSeenAt > existente.lastSeenAt ? dia.lastSeenAt : existente.lastSeenAt,
          samples: { increment: dia.samples },
        },
      });
      await tx.endpointUserDaily.delete({ where: { id: dia.id } });
    }

    // ── O SOFTWARE, idem ─────────────────────────────────────────────────────
    const instalacoes = await tx.softwareInstallation.findMany({ where: { endpointId: perdedorId } });
    for (const instalacao of instalacoes) {
      const existente = await tx.softwareInstallation.findUnique({
        where: { endpointId_packageId: { endpointId: vencedorId, packageId: instalacao.packageId } },
        select: { id: true, firstSeenAt: true },
      });

      if (!existente) {
        await tx.softwareInstallation.update({ where: { id: instalacao.id }, data: { endpointId: vencedorId } });
        continue;
      }

      // A primeira vez que o software foi visto é da MÁQUINA, não da linha: se
      // ele estava instalado antes da reimagem, "instalado desde" é a data
      // antiga. É o mesmo princípio de preservar o histórico mais longo.
      await tx.softwareInstallation.update({
        where: { id: existente.id },
        data: {
          firstSeenAt: instalacao.firstSeenAt < existente.firstSeenAt ? instalacao.firstSeenAt : existente.firstSeenAt,
        },
      });
      await tx.softwareInstallation.delete({ where: { id: instalacao.id } });
    }

    await tx.assetChange.updateMany({ where: { endpointId: perdedorId }, data: { endpointId: vencedorId } });

    // ── O TOKEN da instalação antiga ─────────────────────────────────────────
    //
    // Ele passa a apontar para o vencedor: o binário instalado na máquina é o
    // mesmo, e revogar o token por causa de uma reimagem derrubaria o agente que
    // está funcionando agora.
    await tx.apiToken.updateMany({ where: { endpointId: perdedorId }, data: { endpointId: vencedorId } });

    // ── O VÍNCULO, se só o perdedor tinha ────────────────────────────────────
    const assetId = vencedor.assetId ?? perdedor.assetId;
    if (perdedor.assetId && !vencedor.assetId) {
      // Solta o do perdedor ANTES de pôr no vencedor: `assetId` é `@unique` e os
      // dois preenchidos ao mesmo tempo violariam o índice.
      await tx.endpoint.update({ where: { id: perdedorId }, data: { assetId: null } });
    }

    await tx.endpoint.update({
      where: { id: vencedorId },
      data: {
        assetId: assetId ?? undefined,
        // O último contato mais RECENTE dos dois: a máquina esteve viva na data
        // maior, independentemente de qual linha registrou.
        lastSeen: perdedor.lastSeen > vencedor.lastSeen ? perdedor.lastSeen : vencedor.lastSeen,
      },
    });

    const fundido = await tx.endpoint.update({
      where: { id: perdedorId },
      data: { mergedIntoId: vencedorId, assetId: null, status: 'OFFLINE' },
      select: SELECT_ENDPOINT,
    });

    // Sugestões pendentes das duas linhas deixam de fazer sentido: elas falavam
    // de um parque com duas máquinas onde há uma.
    await tx.reconciliationSuggestion.updateMany({
      where: { state: 'PENDING', OR: [{ endpointId: perdedorId }, { mergeIntoEndpointId: perdedorId }] },
      data: { state: 'SUPERSEDED', resolvedAt: new Date() },
    });

    // O log vai no ATIVO quando existe um — é lá que alguém vai procurar por que
    // a telemetria mudou de máquina. Sem ativo, vai no endpoint que sobreviveu.
    await recordActivity(tx, {
      entityType: assetId ? 'Asset' : 'Endpoint',
      entityId: assetId ?? vencedorId,
      action: 'MERGE',
      changes: {
        hwidAbsorvido: { de: perdedor.hwid, para: vencedor.hwid },
        hostnameAbsorvido: { de: perdedor.hostname, para: vencedor.hostname },
        telemetriasMovidas: { de: null, para: telemetriasMovidas },
      },
    }, actorId);

    return { perdedor: fundido, vencedorId, telemetriasMovidas };
  });
}
