import { prisma } from '../../../server/infra/database/prismaClient';
import { logger, type Seeder } from '../seeder';

// COLABORADORES DE EXEMPLO, para a entrega e o posto terem a quem apontar.
// Nomes inventados, e o e-mail no domínio reservado para exemplo (example.com),
// que não chega a caixa de ninguém.
const COLABORADORES = [
  { name: 'Ana Souza', email: 'ana.souza@example.com' },
  { name: 'Bruno Lima', email: 'bruno.lima@example.com' },
  { name: 'Carla Mendes', email: 'carla.mendes@example.com' },
  { name: 'Diego Rocha', email: 'diego.rocha@example.com' },
  { name: 'Fernanda Alves', email: 'fernanda.alves@example.com' },
];

export const colaboradoresDemo: Seeder = {
  name: 'Colaboradores (demonstração)',
  run: async () => {
    let criados = 0;
    for (const colaborador of COLABORADORES) {
      // A chave é o e-mail, não o nome: nome de pessoa se repete, e o e-mail é
      // único entre os que não estão na lixeira — que a extension de soft
      // delete já tira da busca.
      const existe = await prisma.person.findFirst({ where: { email: colaborador.email }, select: { id: true } });
      if (existe) continue;

      await prisma.person.create({ data: colaborador });
      criados += 1;
    }
    logger.info(`[Seed demo] Colaboradores: ${criados} novos, ${COLABORADORES.length - criados} já existiam.`);
  },
};
