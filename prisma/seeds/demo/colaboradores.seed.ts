import { prisma } from '../../../server/core/database/prismaClient';
import { logger, type Seeder } from '../seeder';

// COLABORADORES DE EXEMPLO, para a entrega e o posto terem a quem apontar.
// Nome genérico de propósito: um nome de gente inventado parece cadastro real.
const COLABORADORES = Array.from({ length: 5 }, (_, i) => ({
  name: `PESSOA${i + 1}`,
  email: `pessoa${i + 1}@gmail.com`,
}));

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
