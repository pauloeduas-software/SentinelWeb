import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import {
  MAQUINA_DA_FICHA_SELECT, presentMaquinaDaFicha, type MaquinaDaFichaApresentada,
} from '../helpers/present-endpoint.helper';
import { dicaEAviso, type DicaEAviso } from './list-endpoints.usecase';
import { lerParque } from '../../reconciliation/use-cases/auto-link-endpoint.usecase';

/**
 * UMA máquina, com a amostra de telemetria mais recente.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE UMA ROTA PRÓPRIA, e não a listagem filtrada.
 *
 * A telemetria existia em um lugar só — `GET /api/endpoints`, a frota inteira em
 * uma resposta, consultada a cada poucos segundos. Isso servia a uma tela que mostrava
 * a frota em cards. Ela saiu: a telemetria agora aparece onde a máquina tem nome,
 * que é a ficha do ATIVO (aba Máquina) e a do POSTO.
 *
 * Nessas duas telas a pergunta é sobre UMA máquina, e responder a ela com a
 * listagem é pior do que parece. O `take: 1` do `include` NÃO vira `LIMIT` no
 * SQL quando há mais de um pai: o Prisma empurra o limite para o banco só no
 * caso de um pai só, e no plural emite uma consulta `endpointId IN (…)` SEM
 * limite nenhum, carregando a série inteira dos 500 endpoints da página para
 * cortar em memória, no query engine. A cada consulta, para desenhar uma.
 *
 * Com um pai, o limite desce para o SQL — é o caso desta consulta, e é por isso
 * que ela é barata.
 *
 * A listagem FICA, e não é redundante: é dela que `/agentes` tira as máquinas
 * sem cadastro. Ela responde "o que o agente vê que o cadastro não sabe"; esta
 * responde "como está esta máquina".
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function getEndpoint(id: string): Promise<MaquinaDaFichaApresentada & DicaEAviso> {
  const endpoint = await prisma.endpoint.findUnique({
    where: { id },
    select: MAQUINA_DA_FICHA_SELECT,
  });

  // 404 aqui é o id que não existe, e só isso. "Existe mas está offline" é outra
  // pergunta, respondida pelo `status` desta mesma resposta — e é a razão de o
  // comando ter deixado de usar 404 para os dois casos (ver send-command).
  if (!endpoint) throw new AppError('Máquina não encontrada.', 404);

  // A dica e o aviso são da ficha da máquina sem computador (DF), como na linha da
  // lista. Com computador, o parque nem é lido.
  const { autoLinkOff, ...maquina } = endpoint;
  const semComputador = maquina.asset ? { dica: null, aviso: null } : dicaEAviso({ ...maquina, autoLinkOff }, await lerParque());
  return { ...presentMaquinaDaFicha(maquina), ...semComputador };
}
