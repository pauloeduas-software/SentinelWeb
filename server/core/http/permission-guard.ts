import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from '../logger/logger';
import { casaRotaPublica, type RotaPublica } from './require-auth';

// A PERMISSÃO COMO HOOK GLOBAL, com conferência de cobertura no boot (D137).
//
// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS METADES, e a segunda é a que importa.
//
// 1. O `preHandler` — resolve a exigência da rota e autoriza. Global, pela mesma
//    razão do `require-auth.ts`: por rota, a rota nova nasce liberada.
//
// 2. A CONFERÊNCIA — coleta toda rota registrada (hook `onRoute`) e, ao final da
//    montagem, confere que cada uma tem exigência declarada. Faltando uma, o
//    boot **cai** com a lista.
//
// Sem a segunda, a primeira é só um `if` mais bonito: a rota não declarada
// cairia no `undefined` e alguém a trataria como "pode passar" — ou como "nega
// tudo", que é pior ainda, porque o sintoma aparece em produção, numa tela, sem
// nada no log do deploy.
//
// POR QUE `onRoute` E NÃO `printRoutes()`: o `printRoutes` devolve TEXTO
// formatado em árvore, para humano ler. Parseá-lo para extrair método e caminho
// seria depender do formato de saída de uma função de depuração. O `onRoute`
// entrega o objeto da rota, com `method` e `url` como o roteador os conhece.
//
// POR QUE A EXIGÊNCIA VEM POR PARÂMETRO: que chave uma rota pede é conhecimento
// de NEGÓCIO, e `server/core` não pode importar `server/domain`
// (eslint.config.js). Aqui mora só a ORDEM — resolveu, autoriza; não resolveu,
// derruba. É a mesma inversão do `autenticar` do `require-auth.ts` e do
// `sortable` do `parseListQuery`.
// ═══════════════════════════════════════════════════════════════════════════

const logger = createLogger('permission-guard');

/** O que o domínio responde sobre uma rota. `undefined` = não declarada. */
export type ExigenciaResolvida = string | null | undefined;

export interface PermissionGuardOptions {
  /**
   * A exigência declarada para `método + padrão de rota`. O padrão é o do
   * roteador (`/api/users/:id`), não a URL concreta.
   */
  exigenciaDaRota: (method: string, url: string) => ExigenciaResolvida;

  /**
   * Autoriza, ou LANÇA. Mora no domínio porque "ter a permissão" depende de onde
   * as permissões da sessão foram penduradas — e disso o core não sabe nada.
   */
  autorizar: (request: FastifyRequest, permissao: string) => void;

  /**
   * As mesmas rotas públicas do guard de sessão. Elas não têm sessão, então não
   * têm permissão — e precisam ser puladas aqui também, senão `/health` passa a
   * exigir uma chave que ninguém sem login pode ter.
   */
  rotasPublicas: readonly RotaPublica[];

  /**
   * Rotas registradas que ficam FORA da conferência, com o motivo.
   *
   * É para o que não é rota de API de verdade: o WebSocket do agente, o
   * catch-all do painel estático. Lista curta e explícita — o contrário de um
   * prefixo que engole o que vier.
   */
  foraDaConferencia: readonly { method: string; path: string; motivo: string }[];
}

interface RotaRegistrada {
  method: string;
  url: string;
}

export interface PermissionGuard {
  /**
   * Confere a cobertura. Chamada DEPOIS de todos os maestros — é esse o momento
   * em que a tabela de rotas está completa.
   *
   * LANÇA quando há rota sem declaração. Lançar e não `logger.error` é o ponto
   * inteiro: um erro logado no boot é um erro que o deploy ignora.
   */
  verificarCobertura: () => void;
}

export function registerPermissionGuard(
  server: FastifyInstance,
  options: PermissionGuardOptions,
): PermissionGuard {
  const { exigenciaDaRota, autorizar, rotasPublicas, foraDaConferencia } = options;
  const registradas: RotaRegistrada[] = [];

  // `onRoute` dispara a CADA registro, e `method` pode vir como array quando a
  // rota declara vários verbos. Normalizado aqui para a conferência não ter que
  // saber disso.
  server.addHook('onRoute', (rota) => {
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    for (const method of metodos) registradas.push({ method, url: rota.url });
  });

  server.addHook('preHandler', async (request) => {
    const path = request.url.split('?')[0];
    if (rotasPublicas.some((rota) => casaRotaPublica(rota, request.method, path))) return;

    // O PADRÃO da rota, não a URL. `routeOptions.url` é `undefined` em
    // requisição que não casou rota nenhuma — e aí o 404 do Fastify responde
    // antes, sem passar por aqui.
    const padrao = request.routeOptions?.url;
    if (!padrao) return;

    const exigencia = exigenciaDaRota(request.method, padrao);

    // NÃO DECLARADA EM TEMPO DE REQUISIÇÃO: só acontece se a conferência do
    // boot foi contornada. Nega — e loga como erro, porque é defeito de
    // montagem, não tentativa de acesso.
    if (exigencia === undefined) {
      logger.error(
        `[Permissão] Rota sem exigência declarada: ${request.method} ${padrao}. ` +
        'Declare em domain/access/helpers/route-permissions.ts.',
      );
      throw Object.assign(new Error('Rota sem permissão declarada.'), { statusCode: 500 });
    }

    // Dispensa declarada: a sessão já foi exigida pelo guard anterior.
    if (exigencia === null) return;

    autorizar(request, exigencia);
  });

  return {
    verificarCobertura: () => {
      const dispensadas = new Set(
        foraDaConferencia.map((rota) => `${rota.method.toUpperCase()} ${rota.path}`),
      );

      const semDeclaracao = registradas
        .filter((rota) => !dispensadas.has(`${rota.method.toUpperCase()} ${rota.url}`))
        .filter((rota) => !rotasPublicas.some((publica) => casaRotaPublica(publica, rota.method, rota.url)))
        .filter((rota) => exigenciaDaRota(rota.method, rota.url) === undefined)
        // `HEAD` nasce de graça junto com todo `GET` no Fastify. Declarar as
        // duas dobraria o mapa para zero ganho: quem pode ler pode ler o
        // cabeçalho do que leu.
        .filter((rota) => rota.method.toUpperCase() !== 'HEAD')
        .map((rota) => `${rota.method.toUpperCase()} ${rota.url}`);

      if (semDeclaracao.length > 0) {
        const lista = [...new Set(semDeclaracao)].sort().join('\n  ');
        throw new Error(
          `${semDeclaracao.length} rota(s) registradas sem exigência de permissão declarada.\n` +
          `Declare cada uma em server/domain/access/helpers/route-permissions.ts ` +
          `(use \`null\` para dispensa, com o motivo ao lado):\n  ${lista}`,
        );
      }

      const total = new Set(registradas.map((rota) => `${rota.method} ${rota.url}`)).size;
      logger.info(`[Permissão] ${total} rotas registradas, todas com exigência declarada.`);
      for (const rota of foraDaConferencia) {
        logger.info(`[Permissão] Fora da conferência: ${rota.method} ${rota.path} — ${rota.motivo}`);
      }
    },
  };
}
