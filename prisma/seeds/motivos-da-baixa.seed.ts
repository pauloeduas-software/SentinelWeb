import { prisma } from '../../server/infra/database/prismaClient';
import type { Seeder } from './seeder';

// Os motivos com que o sistema nasce. O Supervisor acrescenta os da empresa em
// Configurações › Motivos de baixa (BE).
const MOTIVOS = ['Vendido', 'Descartado', 'Doado', 'Devolvido em garantia', 'Extraviado', 'Roubado'];

export const motivosDaBaixaSeeder: Seeder = {
  name: 'RetireReason',
  run: async () => {
    for (const name of MOTIVOS) {
      await prisma.retireReason.upsert({ where: { name }, update: {}, create: { name } });
    }
  },
};
