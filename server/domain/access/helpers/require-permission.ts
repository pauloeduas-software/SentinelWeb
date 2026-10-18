import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { ehCargo, NOME_DO_CARGO, cargoAlcanca, type Cargo } from './cargo';

// A AUTORIZAÇÃO, do ponto de vista de uma requisição (D148).
//
// Chamada pelo guard global (`core/http/permission-guard.ts`), que já resolveu
// QUAL cargo a rota exige. Aqui só se responde se a sessão o alcança — e o que
// acontece quando não.
//
// O NOME DO ARQUIVO E DO EXPORT FICARAM: o guard do `core` recebe
// `autorizar: (request, exigencia: string) => void` e não sabe se a exigência é
// uma chave de permissão ou um cargo. Renomear aqui obrigaria a mexer no `core`
// para nada — a inversão do D137 continua valendo palavra por palavra.

const logger = createLogger('require-permission');

/**
 * A sessão alcança este cargo? Sem lançar — para quem precisa DECIDIR, não barrar.
 *
 * É o que os `select` por cargo usam (D77): o use-case da listagem de ativos
 * pergunta `temCargo(request, 'ADMIN')` para escolher o select com ou sem custo,
 * e não para recusar a requisição.
 */
export function temCargo(request: FastifyRequest, minimo: Cargo): boolean {
  return request.cargo ? cargoAlcanca(request.cargo, minimo) : false;
}

/**
 * Exige o cargo, ou **403**.
 *
 * 403 E NÃO 404, e a escolha é deliberada: esconder a existência da rota seria
 * defensável contra quem não tem sessão, mas aqui quem está perguntando já
 * provou quem é. Para essa pessoa, "não existe" é uma mentira que a manda
 * procurar um bug — e a frase do 403 nomeia o cargo que falta, que é o que o
 * administrador precisa ouvir para conceder.
 */
export function exigirPermissao(request: FastifyRequest, exigencia: string): void {
  // Cargo que não existe chegando aqui é defeito de montagem — o mapa de rotas
  // declarou algo que o `cargo.ts` não conhece. O `tests/invariantes` pega isso,
  // mas se escapar, NEGAR é a resposta segura: a alternativa seria liberar a
  // rota por causa de um erro de digitação.
  if (!ehCargo(exigencia)) {
    logger.error(
      `[Permissão] Rota exige cargo inexistente: "${exigencia}". ` +
      'Confira route-permissions.ts contra cargo.ts.',
    );
    throw new AppError('Permissão mal configurada para esta rota.', 500);
  }

  if (request.cargo && cargoAlcanca(request.cargo, exigencia)) return;

  throw new AppError(
    `Esta ação exige o cargo de ${NOME_DO_CARGO[exigencia]}. Fale com quem administra o sistema.`,
    403,
  );
}
