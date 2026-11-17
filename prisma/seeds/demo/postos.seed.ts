import { prisma } from '../../../server/infra/database/prismaClient';
import { logger, type Seeder } from '../seeder';
import { garantirPorNome, mesmoNome } from './garantir-por-nome';

// POSTOS DE EXEMPLO, como se tivessem acabado de ser cadastrados na tela
// Postos: vagos, sem computador e sem ninguém neles. O nome segue o exemplo do
// formulário (MesaEscritório, MesaRecepção).
const POSTOS: readonly { name: string; local: string }[] = [
  { name: 'MesaRecepção', local: 'Matriz' },
  { name: 'MesaFinanceiro', local: 'Matriz' },
  { name: 'MesaRH', local: 'Matriz' },
  { name: 'MesaTI', local: 'Matriz' },
  { name: 'MesaFilial', local: 'Filial' },
];

export const postosDemo: Seeder = {
  name: 'Postos (demonstração)',
  run: async () => {
    // A localização pelo NOME, como no estoque: se alguém a renomeou ou excluiu
    // pela tela, o posto é pulado com aviso.
    let criados = 0;
    let pulados = 0;

    for (const posto of POSTOS) {
      const local = await prisma.location.findFirst({ where: mesmoNome(posto.local), select: { id: true } });
      if (!local) {
        pulados += 1;
        continue;
      }

      const criou = await garantirPorNome(
        (nome) => prisma.workstation.findFirst({ where: mesmoNome(nome), select: { id: true } }),
        () => prisma.workstation.create({ data: { name: posto.name, locationId: local.id } }),
        posto.name,
      );
      if (criou) criados += 1;
    }

    logger.info(
      `[Seed demo] Postos: ${criados} novos, ${POSTOS.length - criados - pulados} já existiam`
        + (pulados > 0 ? `, ${pulados} pulados (localização não encontrada).` : '.'),
    );
  },
};
