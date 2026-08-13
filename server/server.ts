import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import path from 'path';
import fastifyStatic from '@fastify/static';

import agentHubRoutes from './rmm/agent-hub';
import rmmCommandsRoutes from './rmm/commands';
import itamAssetsRoutes from './itam/assets';
import itamInventoryRoutes from './itam/inventory';
import usersRoutes from './users/users';

const server = Fastify({ logger: false });

async function startServer() {
  // 1. Plugins
  await server.register(cors, { origin: '*' });
  await server.register(websocket);

  // 2. Produção (Servir frontend)
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    await server.register(fastifyStatic, {
      root: distPath,
      wildcard: false,
    });
    
    server.get('/*', async (request, reply) => {
      // Exclude API and websocket paths from catch-all
      if (request.url.startsWith('/api') || request.url.startsWith('/agent-hub')) {
        return reply.callNotFound();
      }
      return reply.sendFile('index.html', distPath);
    });
  }

  // 3. Rotas ITAM e Usuários
  await server.register(itamAssetsRoutes);
  await server.register(itamInventoryRoutes);
  await server.register(usersRoutes);

  // 4. Rotas RMM
  await server.register(rmmCommandsRoutes);
  await server.register(agentHubRoutes);

  try {
    await server.listen({ port: 5000, host: '0.0.0.0' });
    console.log('🚀 Sentinel API (Monólito Refatorado) Rodando em http://localhost:5000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

startServer();
