import { prisma } from '../../../core/database/prismaClient';
import {
  MAINTENANCE_SELECT, paraResposta,
  type LinhaDeManutencao, type ManutencaoNaResposta,
} from '../helpers/maintenance-select.helper';
import { assertAtivoDaManutencao } from './assert-maintenance-references.usecase';

/**
 * A ABA MANUTENÇÕES da tela do ativo — a que a F2 deixou desabilitada.
 *
 * TUDO, aberta e encerrada, e sem paginação: a aba é o histórico de serviço
 * daquele equipamento, e é justamente o que já passou que responde "vale a pena
 * consertar de novo?". Cortar em 25 linhas esconderia a resposta num notebook
 * antigo, que é exatamente onde a pergunta aparece.
 *
 * O 404 vem de `assertAtivoDaManutencao`, escrito uma vez só: sem ele, uma aba
 * de um ativo inexistente responderia `[]` — indistinguível de um ativo que
 * nunca foi para a manutenção.
 */
export async function listAssetMaintenances(assetId: string): Promise<ManutencaoNaResposta[]> {
  await assertAtivoDaManutencao(prisma, assetId);

  const linhas = await prisma.maintenance.findMany({
    where: { assetId },
    select: MAINTENANCE_SELECT,
    // As abertas primeiro na prática: `startDate` desc põe o mais recente no
    // topo, e é dele que a tela fala.
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  }) as LinhaDeManutencao[];

  const agora = new Date();
  return linhas.map((linha) => paraResposta(linha, agora));
}
