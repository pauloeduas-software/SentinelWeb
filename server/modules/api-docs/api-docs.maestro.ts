import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../infra/logger/logger';
import { COOKIE_SESSAO } from '../auth/helpers/session-cookie.helper';
import { CONTRATO, type ContratoDaRota } from './helpers/contrato-das-rotas';
import { zodParaJsonSchema } from './helpers/zod-para-openapi.helper';

const logger = createLogger('api-docs.maestro');

/** Onde o Swagger abre. Debaixo de `/api` para o proxy do Vite (`vite.config.ts`) alcançá-lo. */
export const CAMINHO_DO_SWAGGER = '/api/docs';

const DESCRICAO_DO_STATUS: Record<number, string> = {
  200: 'Sucesso', 201: 'Criado', 204: 'Sem conteúdo',
  401: 'Sessão ausente ou expirada', 403: 'Sem permissão (ou troca de senha pendente)',
  404: 'Não encontrado', 409: 'Conflito: em uso, já existe ou a linha mudou',
  422: 'Dados inválidos',
};

// O corpo de TODO erro da API: a frase que a tela mostra (`infra/errors`).
const CORPO_DE_ERRO = {
  type: 'object',
  properties: { error: { type: 'string' }, refs: { type: 'array', items: { type: 'object' } } },
  required: ['error'],
};

// A paginação e a busca de toda listagem (`infra/http/list-query.ts`).
const QUERY_DE_LISTA = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1 },
    perPage: { type: 'integer', minimum: 1, maximum: 100 },
    q: { type: 'string', maxLength: 200 },
  },
};

function respostas(contrato: ContratoDaRota, url: string, publica: boolean) {
  const sucesso = contrato.status ?? 200;
  const erros = [
    ...(publica ? [] : [401, 403]),
    ...(url.includes(':') ? [404] : []),
    ...(contrato.body ? [409, 422] : []),
  ];
  return Object.fromEntries([
    [sucesso, { description: DESCRICAO_DO_STATUS[sucesso] }],
    ...erros.map((status) => [status, { description: DESCRICAO_DO_STATUS[status], ...CORPO_DE_ERRO }]),
  ]);
}

// O SWAGGER (AS): a API inteira navegável em `/api/docs`, com o corpo de cada
// rota tirado do MESMO schema Zod que o controller valida. SÓ FORA DE PRODUÇÃO:
// o contrato é uma planta da API, e em produção ele não tem leitor.
//
// Registrado ANTES dos maestros, porque o plugin descobre as rotas pelo `onRoute`
// e só vê as que nascem depois dele. Não toca a validação: o `transform` abaixo só
// reescreve o que o Swagger MOSTRA, e o `parse` do controller segue sendo quem
// recusa o corpo inválido.
export class ApiDocsMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    await server.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'SentinelWeb API',
          description: 'Inventário de TI com convergência RMM. Entre pelo painel (ou por `POST /api/auth/login`): a sessão vai no cookie.',
          version: 'dev',
        },
        tags: [...new Set(Object.values(CONTRATO).map((c) => c.tag))].map((name) => ({ name })),
        components: { securitySchemes: { sessao: { type: 'apiKey', in: 'cookie', name: COOKIE_SESSAO } } },
        security: [{ sessao: [] }],
      },
      transform: ({ schema, url, route }) => {
        const metodo = (Array.isArray(route.method) ? route.method[0] : route.method).toUpperCase();
        const contrato = CONTRATO[`${metodo} ${route.url}`];
        // Fora do contrato e fora do que se mostra: `/health`, `/agent-hub` e as
        // rotas do próprio Swagger. Rota de API sem linha reprova o teste do contrato.
        if (!contrato) return { schema: { ...(schema ?? {}), hide: true }, url };

        const publica = metodo === 'POST' && route.url === '/api/auth/login';
        return {
          url,
          schema: {
            ...(schema ?? {}),
            tags: [contrato.tag],
            summary: contrato.resumo,
            ...(publica ? { security: [] } : {}),
            ...(contrato.body ? { body: zodParaJsonSchema(contrato.body) } : {}),
            ...(contrato.query ? { querystring: contrato.query === 'lista' ? QUERY_DE_LISTA : zodParaJsonSchema(contrato.query) } : {}),
            response: respostas(contrato, route.url, publica),
          },
        };
      },
    });

    await server.register(swaggerUi, {
      routePrefix: CAMINHO_DO_SWAGGER,
      uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: false },
    });

    logger.debug(`[Maestro] Swagger em ${CAMINHO_DO_SWAGGER} (só fora de produção).`);
  }
}
