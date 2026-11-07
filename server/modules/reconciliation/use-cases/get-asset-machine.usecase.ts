import { prisma } from '../../../infra/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';

// ═════════════════════════════════════════════════════════════════════════════
// QUAL MÁQUINA ESTÁ VINCULADA A ESTE ATIVO — o que a aba Máquina precisa saber para
// abrir o painel, que lê o resto em `GET /api/endpoints/:id`, revalidando (BY, BZ).
//
// A ROTA CHAMA `/machine`, e não o nome de um dos conteúdos. É a mesma regra que
// aposentou `/itam` em favor de `/ativos` (hoje `/computadores`) e que fez a tela se
// chamar `/descobertas`: o nome é do que a coisa É, não do que ela era quando nasceu.
// ═════════════════════════════════════════════════════════════════════════════

/** A máquina vinculada a um ativo, ou a resposta vazia. */
export async function obterMaquinaDoAtivo(assetId: string, podeVerLixeira = false) {
  const [endpoint, ativo] = await Promise.all([
    prisma.endpoint.findFirst({ where: { assetId }, select: { id: true, hostname: true } }),
    // `findFirst` e não `findUnique`: é ele que recebe o escopo da lixeira da
    // extension, então ativo excluído só devolve máquina a quem vê a Lixeira (BW).
    prisma.asset.findFirst({ where: { id: assetId, ...(podeVerLixeira ? INCLUINDO_LIXEIRA : {}) }, select: { id: true } }),
  ]);

  if (!ativo || !endpoint) return { endpointId: null, hostname: null };

  return { endpointId: endpoint.id, hostname: endpoint.hostname };
}
