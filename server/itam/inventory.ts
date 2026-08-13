import { FastifyInstance } from 'fastify';
import { prisma } from '../core/db';

export default async function itamInventoryRoutes(server: FastifyInstance) {
  
  // Pastas (Folders)
  server.get('/api/folders', async () => {
    return await prisma.folder.findMany({ orderBy: { name: 'asc' } });
  });

  server.post('/api/folders', async (request, reply) => {
    const { name } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Nome obrigatório' });
    try {
      return await prisma.folder.create({ data: { name } });
    } catch {
      return reply.status(400).send({ error: 'Pasta já existe' });
    }
  });

  server.delete('/api/folders/:id', async (request, reply) => {
    try {
      const params = request.params as { id: string };
      await prisma.folder.delete({ where: { id: params.id } });
      return { success: true };
    } catch {
      return reply.status(400).send({ error: 'Erro ao deletar pasta' });
    }
  });

  server.get('/api/inventory', async () => {
    return await prisma.inventoryItem.findMany({
      include: { assignedTo: true, folder: true },
      orderBy: { createdAt: 'desc' }
    });
  });

  server.post('/api/inventory', async (request, reply) => {
    const { name, description, quantity, category, status, folderId, notes } = request.body as any;
    
    const item = await prisma.inventoryItem.create({
      data: { name, description, quantity: Number(quantity), category, status, folderId: folderId || null, notes }
    });
    return item;
  });

  // Atualizar um item existente
  server.put('/api/inventory/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, description, quantity, category, status, folderId, notes } = request.body as any;
    
    try {
      const item = await prisma.inventoryItem.update({
        where: { id },
        data: { name, description, quantity: Number(quantity), category, status, folderId: folderId || null, notes }
      });
      return item;
    } catch (err) {
      return reply.status(404).send({ error: "Item não encontrado." });
    }
  });

  // Deletar um item
  server.delete('/api/inventory/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.inventoryItem.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return reply.status(404).send({ error: "Item não encontrado." });
    }
  });
}
