import { prisma } from '../../../core/database/prismaClient';
import { AUDIT_SELECT } from '../helpers/audit-select.helper';
import { carregarAtivoConferido, type LinhaDeAuditoria } from './record-audit.usecase';

// O HISTÓRICO DE CONFERÊNCIAS DE UM ATIVO.
//
// Os NOMES dos locais vêm de uma consulta em lote e não de um `include`, porque
// `locationIdBefore` e `locationIdFound` são UUID SEM FK (ver o schema): não há
// relação para incluir. O ganho é o que se vê quando uma sala é apagada — a linha
// continua na lista, dizendo "(local removido)", em vez de sumir com a prova.

export interface AuditoriaNaResposta extends LinhaDeAuditoria {
  locationBeforeName: string | null;
  locationFoundName: string | null;
}

/** Quanto a aba recebe quando não pede nada. */
const LIMITE_PADRAO = 100;

export async function listAssetAudits(
  assetId: string,
  limite = LIMITE_PADRAO,
): Promise<AuditoriaNaResposta[]> {
  await carregarAtivoConferido(prisma, assetId);

  const linhas = await prisma.audit.findMany({
    where: { assetId },
    select: AUDIT_SELECT,
    orderBy: { auditedAt: 'desc' },
    take: limite,
  });

  const ids = [...new Set(
    linhas.flatMap((linha) => [linha.locationIdBefore, linha.locationIdFound])
      .filter((id): id is string => id !== null),
  )];

  const locais = ids.length === 0
    ? []
    : await prisma.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });

  const nomePorId = new Map(locais.map((local) => [local.id, local.name]));

  return linhas.map((linha) => ({
    ...linha,
    locationBeforeName: linha.locationIdBefore ? nomePorId.get(linha.locationIdBefore) ?? null : null,
    locationFoundName: linha.locationIdFound ? nomePorId.get(linha.locationIdFound) ?? null : null,
  }));
}
