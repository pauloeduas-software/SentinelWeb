import prepararBanco from '../setup/global-setup';
import { resetarBanco } from '../setup/database';
import { closeDatabase } from '../../server/infra/database/prismaClient';

// Roda UMA VEZ por `bun run test:e2e`, antes do build e do servidor: é o
// primeiro passo do `e2e:servidor` (package.json), com o ambiente que o
// playwright.config.ts montou do `.env.test` já injetado.
//
// O mesmo harness do vitest, nos mesmos passos — a trava do sufixo `_test`,
// criar o banco se faltar, `migrate deploy`, esvaziar, semear e criar o
// administrador —, apontado para o banco do E2E. Não é cópia: é o
// `global-setup.ts` e o `database.ts` importados, para a suíte do navegador
// começar do mesmo lugar que a da API.
//
// Esvaziar a cada execução é o que deixa o spec do catálogo criar "Categoria do
// E2E" sem conferir antes se a execução anterior, interrompida no meio, a
// deixou lá.

await prepararBanco();
await resetarBanco();
await closeDatabase();
