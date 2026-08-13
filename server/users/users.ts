import { FastifyInstance } from 'fastify';
import { prisma } from '../core/db';

export default async function usersRoutes(server: FastifyInstance) {
  
  server.get('/api/users', async () => {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
  });

  server.post('/api/users', async (request, reply) => {
    const { name, email, department } = request.body as any;
    
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return reply.status(400).send({ error: "E-mail já está em uso." });
    }

    const user = await prisma.user.create({
      data: { name, email, department }
    });
    return user;
  });

  server.put('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = request.body as any;
    
    try {
      const user = await prisma.user.update({
        where: { id },
        data
      });
      return user;
    } catch (err) {
      return reply.status(404).send({ error: "Usuário não encontrado." });
    }
  });

  server.delete('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.user.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return reply.status(404).send({ error: "Usuário não encontrado." });
    }
  });
}
