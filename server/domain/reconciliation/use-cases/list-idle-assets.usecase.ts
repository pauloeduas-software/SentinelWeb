import { prisma } from '../../../core/database/prismaClient';
import { resolverResponsaveisEmLote } from '../../assignment/use-cases/resolve-responsibles.usecase';

// ═════════════════════════════════════════════════════════════════════════════
// "NINGUÉM USA" × "NINGUÉM RESPONDE" — duas conversas diferentes, com duas
// pessoas diferentes, e é o cruzamento que as separa.
//
//   ocioso + com responsável  → falar COM a pessoa: ela ainda precisa disto?
//   ocioso + posto vago       → o equipamento está numa mesa sem ninguém:
//                               candidato a voltar para o estoque
//   ocioso + sem posse        → já está no estoque e ligado à toa
//
// Nenhum ITAM de prateleira responde a segunda linha, porque `postoVago` só
// existe se houver uma camada entre o ativo e a pessoa (MODELO-POSSE.md).
// ═════════════════════════════════════════════════════════════════════════════

export interface AtivoOcioso {
  assetId: string;
  assetTag: string;
  name: string | null;
  hostname: string | null;
  /** Último dia com QUALQUER sinal de uso. Null = nunca houve. */
  ultimoUso: string | null;
  diasSemUso: number | null;
  postoVago: boolean;
  responsaveis: { id: string; name: string; via: string }[];
}

/**
 * Ativos com agente que não dão sinal de uso há `dias`.
 *
 * SÓ OS QUE TÊM AGENTE: um ativo sem máquina vinculada não é ocioso, é
 * desconhecido — e chamá-lo de ocioso encheria a lista com monitores e cadeiras,
 * que não têm telemetria e nunca terão.
 */
export async function listarAtivosOciosos(dias = 30): Promise<AtivoOcioso[]> {
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const comAgente = await prisma.asset.findMany({
    where: { retiredAt: null, endpoint: { isNot: null } },
    select: {
      id: true,
      assetTag: true,
      name: true,
      endpoint: { select: { hostname: true } },
      usageDays: {
        where: { activeMinutes: { gt: 0 } },
        orderBy: { day: 'desc' },
        take: 1,
        select: { day: true },
      },
    },
  });

  const ociosos = comAgente.filter((ativo) => {
    const ultimo = ativo.usageDays[0]?.day;
    return !ultimo || ultimo < limite;
  });
  if (ociosos.length === 0) return [];

  // A Camada 3 em lote: é ela que traz o `postoVago`, e é por isso que esta
  // consulta não pergunta "quem é o dono" ao `assignedToId` — ele é null
  // justamente no caso mais interessante, o do ativo entregue a um posto (D14).
  const posses = await resolverResponsaveisEmLote(prisma, ociosos.map((ativo) => ativo.id));

  const agora = Date.now();
  return ociosos.map((ativo) => {
    const ultimo = ativo.usageDays[0]?.day ?? null;
    const posse = posses.get(ativo.id);

    return {
      assetId: ativo.id,
      assetTag: ativo.assetTag,
      name: ativo.name,
      hostname: ativo.endpoint?.hostname ?? null,
      ultimoUso: ultimo ? ultimo.toISOString().slice(0, 10) : null,
      diasSemUso: ultimo ? Math.floor((agora - ultimo.getTime()) / (24 * 60 * 60 * 1000)) : null,
      postoVago: posse?.postoVago ?? false,
      responsaveis: (posse?.responsaveis ?? []).map((pessoa) => ({ id: pessoa.id, name: pessoa.name, via: pessoa.via })),
    };
  });
}
