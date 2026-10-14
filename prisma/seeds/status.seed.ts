import { prisma } from '../../server/core/database/prismaClient';
import type { Seeder } from './seeder';

// Um status de cada tipo, com o nome do próprio tipo — o bastante para o
// primeiro ativo ser cadastrado e entregue sem passar antes pelo catálogo.
//
// O `type` NÃO é enfeite: é ele que decide o que dá para fazer com o ativo, e
// só `DEPLOYABLE` libera a entrega. O significado de cada um está no
// `enum StatusLabelType` (prisma/schema.prisma) e nas ajudas de `TIPOS_STATUS`
// (src/pages/configuracoes/specs/catalog-ui.types.ts). Quem quiser distinguir
// "Em conserto" de "Em trânsito" cadastra outros status do mesmo tipo.
const STATUS_LABELS = [
  { name: 'Disponível', type: 'DEPLOYABLE' },
  { name: 'Em uso', type: 'IN_USE' },
  { name: 'Pendente', type: 'PENDING' },
  { name: 'Inutilizável', type: 'UNDEPLOYABLE' },
] as const;

export const statusSeeder: Seeder = {
  name: 'StatusLabel',
  run: async () => {
    for (const status of STATUS_LABELS) {
      // `name` é `@unique` global: o mesmo nome não existe com dois tipos.
      await prisma.statusLabel.upsert({
        where: { name: status.name },
        update: {},
        create: status,
      });
    }
  },
};
