// Seed do banco — idempotente por construção.
//
// Só `upsert`, nunca `create`: o seed roda mais de uma vez na vida do banco
// (ambiente novo, reset local, pipeline) e não pode duplicar linha nem estourar
// em P2002 na segunda execução.
//
// Reaproveita o cliente do servidor de propósito, em vez de um `new PrismaClient()`
// próprio: é `getDatabaseUrl()` (server/core/config/env.ts) que remove as aspas em
// volta do valor no .env — sem ele, as aspas entrariam na connection string.

// O `prisma` em si entra junto com o primeiro seeder, na F1: importar agora, sem
// usar, reprova o lint (`no-unused-vars`).
import { closeDatabase } from '../server/core/database/prismaClient';
import { createLogger } from '../server/core/logger/logger';

const logger = createLogger('seed');

interface Seeder {
  name: string;
  run: () => Promise<void>;
}

// As tabelas de catálogo (AppSetting, StatusLabel, Category, AssetModel) nascem
// na Fase 1 do docs/ITAM-TODO.md — hoje não existem, então não há o que semear.
// O encanamento fica pronto aqui, na Fase 0, porque a F1 trava no primeiro dia
// sem ele (docs/FASE-0-PLANO.md, etapa A2).
//
// O formato de cada seeder, para quando a F1 chegar:
//
//   {
//     name: 'StatusLabel',
//     run: async () => {
//       await prisma.statusLabel.upsert({
//         where: { name: 'Pronto p/ Uso' },
//         update: {},
//         create: { name: 'Pronto p/ Uso', type: 'DEPLOYABLE', color: '#22c55e' },
//       });
//     },
//   }
//
// `update: {}` é o detalhe que torna o seed seguro de rodar em banco com dado:
// garante que a linha exista sem desfazer o que alguém editou pela interface.
const seeders: Seeder[] = [];

async function main(): Promise<void> {
  if (seeders.length === 0) {
    logger.info('[Seed] Nada a semear: as tabelas de catálogo nascem na Fase 1 (docs/ITAM-TODO.md).');
    return;
  }

  for (const seeder of seeders) {
    await seeder.run();
    logger.info(`[Seed] ${seeder.name}: ok.`);
  }

  logger.info(`[Seed] Concluído: ${seeders.length} ${seeders.length === 1 ? 'seeder' : 'seeders'}.`);
}

main()
  .catch((error: unknown) => {
    // Cada seeder é uma transação própria: os que já rodaram continuam aplicados.
    // Como tudo é upsert, rodar de novo depois de corrigir é seguro.
    logger.error('[Seed] Falhou. Corrija e rode de novo — o seed é idempotente.', error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
