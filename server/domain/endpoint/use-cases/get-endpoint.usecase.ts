import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { presentEndpoint, type PresentedEndpoint } from '../helpers/present-endpoint.helper';

/**
 * UMA máquina, com a amostra de telemetria mais recente.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE UMA ROTA PRÓPRIA, e não a listagem filtrada.
 *
 * A telemetria existia em um lugar só — `GET /api/endpoints`, a frota inteira em
 * uma resposta, consultada a cada 5 segundos. Isso servia a uma tela que mostrava
 * a frota em cards. Ela saiu: a telemetria agora aparece onde a máquina tem nome,
 * que é a ficha do ATIVO (aba Máquina) e a do POSTO.
 *
 * Nessas duas telas a pergunta é sobre UMA máquina, e responder a ela com a
 * listagem é pior do que parece. O `take: 1` do `include` NÃO vira `LIMIT` no
 * SQL quando há mais de um pai: o Prisma empurra o limite para o banco só no
 * caso de um pai só, e no plural emite uma consulta `endpointId IN (…)` SEM
 * limite nenhum, carregando a série inteira dos 500 endpoints da página para
 * cortar em memória, no query engine. A cada 5 segundos, para desenhar uma.
 *
 * Com um pai, o limite desce para o SQL — é o caso desta consulta, e é por isso
 * que ela é barata.
 *
 * A listagem FICA, e não é redundante: é dela que `/descobertas` tira as máquinas
 * sem cadastro. Ela responde "o que o agente vê que o cadastro não sabe"; esta
 * responde "como está esta máquina".
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function getEndpoint(id: string): Promise<PresentedEndpoint> {
  const endpoint = await prisma.endpoint.findUnique({
    where: { id },
    include: {
      // `include` aqui pelo mesmo motivo da listagem: `Endpoint` não tem campo
      // sensível, e a telemetria é o conteúdo da tela.
      //
      // `take: 1` porque é a amostra ATUAL que a tela mostra. A série histórica
      // tem UM leitor, e ele não é tela: é o agregado de uso
      // (`reconciliation/use-cases/aggregate-usage.usecase.ts`), que varre uma
      // janela de três dias de hora em hora e grava em `asset_usage_daily` — é
      // dali que a ociosidade sai. Os dois caminhos são o motivo do índice
      // `(endpointId, timestamp DESC)`: sem ele, cada poll de cada tela aberta
      // era uma varredura sequencial desta tabela.
      telemetries: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  // 404 aqui é o id que não existe, e só isso. "Existe mas está offline" é outra
  // pergunta, respondida pelo `status` desta mesma resposta — e é a razão de o
  // comando ter deixado de usar 404 para os dois casos (ver send-command).
  if (!endpoint) throw new AppError('Máquina não encontrada.', 404);

  return presentEndpoint(endpoint);
}
