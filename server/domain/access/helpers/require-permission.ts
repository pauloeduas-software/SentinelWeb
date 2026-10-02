import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { PERMISSION_CATALOG, ehPermissaoConhecida, type Permissao } from './permission-catalog';

// A AUTORIZAÇÃO, do ponto de vista de uma requisição.
//
// Chamada pelo guard global (`core/http/permission-guard.ts`), que já resolveu
// QUAL chave a rota exige. Aqui só se responde se a sessão a tem — e o que
// acontece quando não.

const logger = createLogger('require-permission');

/**
 * A sessão tem esta chave? Sem lançar — para quem precisa DECIDIR, não barrar.
 *
 * É o que os `select` por permissão usam (D77): o use-case da listagem de
 * ativos pergunta `temPermissao(request, 'assets.viewCost')` para escolher o
 * select, e não para recusar a requisição.
 */
export function temPermissao(request: FastifyRequest, permissao: Permissao): boolean {
  return request.permissions?.has(permissao) ?? false;
}

/**
 * Exige a chave, ou **403**.
 *
 * 403 E NÃO 404, e a escolha é deliberada: esconder a existência da rota seria
 * defensável contra quem não tem sessão, mas aqui quem está perguntando já
 * provou quem é. Para essa pessoa, "não existe" é uma mentira que a manda
 * procurar um bug — e a frase do 403 nomeia a chave que falta, que é o que o
 * administrador precisa ouvir para conceder.
 *
 * A FRASE NOMEIA A CHAVE de propósito. O risco do modelo (D76) é que chave
 * errada **nega em silêncio**: dizer só "sem permissão" deixaria a investigação
 * começar pelo `preHandler`. Dizendo *"falta `assets.viewCost`"*, a primeira
 * parada é a tela de grupos, que é onde a resposta está.
 */
export function exigirPermissao(request: FastifyRequest, permissao: string): void {
  // Chave que não existe no catálogo chegando aqui é defeito de montagem — o
  // mapa de rotas declarou algo que o catálogo não conhece. O `tests/invariantes`
  // pega isso, mas se escapar, NEGAR é a resposta segura: a alternativa seria
  // liberar a rota por causa de um erro de digitação.
  if (!ehPermissaoConhecida(permissao)) {
    logger.error(
      `[Permissão] Rota exige chave fora do catálogo: "${permissao}". ` +
      'Confira route-permissions.ts contra permission-catalog.ts.',
    );
    throw new AppError('Permissão mal configurada para esta rota.', 500);
  }

  if (request.permissions?.has(permissao)) return;

  throw new AppError(
    `Seu acesso não inclui "${PERMISSION_CATALOG[permissao]}". Fale com quem administra os grupos.`,
    403,
    { permissao },
  );
}
