// SEED DE DEMONSTRAÇÃO — `npm run db:seed:demo`.
//
// Separado do seed principal (`../index.ts`) de propósito. Aquele roda em todo
// banco — produção incluída — e antes de cada arquivo de teste, e por isso só
// semeia o que é do SOFTWARE (categorias, status, configuração).
// Fabricante, localização e modelo são dado da EMPRESA: semear "Dell" no banco
// de um cliente é adivinhar o parque dele (`categorias.seed.ts`).
//
// Este aqui é para o ambiente de desenvolvimento e para demonstrar o sistema:
// abre as telas com dado plausível. Roda o seed principal ANTES — os modelos
// precisam das categorias — e é idempotente: rodar de novo não duplica nem
// desfaz o que foi editado pela tela.
import { closeDatabase } from '../../../server/core/database/prismaClient';
import { semearBanco } from '../index';
import { logger, type Seeder } from '../seeder';
import { fabricantesDemo } from './fabricantes.seed';
import { localizacoesDemo } from './localizacoes.seed';
import { modelosDemo } from './modelos.seed';

// Os modelos DEPOIS dos fabricantes: cada modelo aponta para um.
const seeders: Seeder[] = [
  fabricantesDemo,
  modelosDemo,
  localizacoesDemo,
];

async function semearDemonstracao(): Promise<void> {
  await semearBanco();
  for (const seeder of seeders) {
    await seeder.run();
  }
  logger.info('[Seed demo] Concluído.');
}

semearDemonstracao()
  .catch((error: unknown) => {
    logger.error('[Seed demo] Falhou. Corrija e rode de novo — o seed é idempotente.', error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
