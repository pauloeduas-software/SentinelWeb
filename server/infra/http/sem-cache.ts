import type { FastifyInstance } from 'fastify';

// NENHUMA RESPOSTA DA API VAI PARA CACHE.
//
// O que sai de `/api` é dado de agora (quem tem qual computador, a lista de
// colaboradores) ou carrega sessão e senha. Sem o cabeçalho, o navegador pode
// gravar a resposta em disco, e numa máquina compartilhada ela fica para quem
// sentar depois. O painel estático fica de fora: o hook só olha `/api`, e o
// `@fastify/static` cuida do cache dele.
//
// `Pragma` acompanha por causa de intermediário HTTP/1.0 antigo, que ignora
// `Cache-Control` — custo zero e ainda aparece em rede corporativa.
//
// Hook de instância, registrado antes dos maestros: vale para toda rota, e
// também para o 404 de um caminho de `/api` que não existe.
export function registerSemCacheNaApi(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api')) return;
    reply.header('Cache-Control', 'no-store');
    reply.header('Pragma', 'no-cache');
  });
}
