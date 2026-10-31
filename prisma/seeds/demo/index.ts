// SEED DE DEMONSTRAÇÃO — `npm run db:seed:demo`.
//
// Separado do seed principal (`../index.ts`) de propósito. Aquele roda em todo
// banco — produção incluída — e antes de cada arquivo de teste, e por isso só
// semeia o que é do SOFTWARE (categorias, status, configuração).
// Fabricante, localização e modelo são dado da EMPRESA: semear "Dell" no banco
// de um cliente é adivinhar o parque dele (`categorias.seed.ts`).
//
// Este aqui é para o ambiente de desenvolvimento e para demonstrar o sistema:
// abre as telas com dado plausível, e cria a conta de entrar
// (`administrador.seed.ts`). Roda o seed principal ANTES — os modelos
// precisam das categorias — e é idempotente: rodar de novo não duplica nem
// desfaz o que foi editado pela tela.
import { closeDatabase } from '../../../server/infra/database/prismaClient';
import { semearBanco } from '../index';
import { logger, type Seeder } from '../seeder';
import { administradorDemo } from './administrador.seed';
import { colaboradoresDemo } from './colaboradores.seed';
import { estoqueDemo } from './estoque.seed';
import { fabricantesDemo } from './fabricantes.seed';
import { licencasDemo } from './licencas.seed';
import { localizacoesDemo } from './localizacoes.seed';
import { modelosDemo } from './modelos.seed';

// Os modelos e as licenças DEPOIS dos fabricantes, e o estoque DEPOIS das
// localizações: cada um aponta para o anterior.
const seeders: Seeder[] = [
  administradorDemo,
  fabricantesDemo,
  modelosDemo,
  localizacoesDemo,
  colaboradoresDemo,
  licencasDemo,
  estoqueDemo,
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
