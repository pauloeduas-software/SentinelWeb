import { defineConfig } from 'vitest/config';
import { lerEnvDeTeste } from './tests/setup/env-de-teste';

// Configuração PRÓPRIA, separada do `vite.config.ts`: o do frontend carrega o
// plugin do React e resolve `src/`, e nada disso tem uso aqui — a suíte exercita
// o servidor, em Node, contra o Postgres. Arquivo separado é também o que faz
// `npm test` não depender de o build do painel estar saudável.

// O leitor do `.env.test` mora em `tests/setup/env-de-teste.ts` (com o porquê
// de não ser o `process.loadEnvFile()`): o playwright.config.ts lê o mesmo
// arquivo, do mesmo jeito.
const envDeTeste = lerEnvDeTeste();

// Aplicado TAMBÉM no processo principal do vitest, e não só nos workers: o
// `globalSetup` roda aqui, e é ele que cria o banco e aplica as migrations.
// Sem esta linha ele usaria a `DATABASE_URL` do `.env` — o banco de
// desenvolvimento — e a trava do `database.ts` derrubaria a suíte inteira antes
// do primeiro teste.
Object.assign(process.env, envDeTeste);

// ═══════════════════════════════════════════════════════════════════════════
// UMA CONFIGURAÇÃO SÓ, porque todo teste desta suíte fala com o banco.
//
// Houve dois projetos: `*.puro.test.ts` exercitava função pura e rodava sem
// `globalSetup`, porque ele cria o banco e aplica as migrations em TODA
// invocação. O corte de escopo levou o último arquivo puro, e um projeto com
// zero arquivos não é separação — é um `npm run test:puro` que sai com código 1
// sem nenhum teste ter falhado.
//
// O dia que nascer o próximo teste puro, o que volta é o par projeto + sufixo no
// NOME do arquivo (não uma pasta própria): a exigência de infraestrutura fica
// visível em quem a tem, e as pastas continuam agrupando por assunto.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  test: {
    // Injeta o mesmo ambiente nos workers. Chega ANTES de qualquer import, e é
    // isso que faz o `prismaClient.ts` nascer apontado para o banco de teste.
    env: envDeTeste,

    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `tests/e2e/` é do Playwright (`.spec.ts`, playwright.config.ts): outro
    // harness, outro banco. O `include` já o deixa de fora pelo sufixo; a
    // linha aqui é para a exclusão não depender de ninguém lembrar disso.
    exclude: ['**/node_modules/**', 'tests/e2e/**'],

    // UM BANCO SÓ, então UM ARQUIVO POR VEZ.
    //
    // Com paralelismo, dois arquivos truncariam a mesma tabela no meio do teste do
    // outro — e a falha apareceria em um arquivo por causa do que o outro fez, de
    // forma diferente a cada execução. Suíte que falha sem repetir é pior que suíte
    // que não existe: ensina a ignorar o vermelho.
    //
    // O preço é tempo de parede. É o preço certo enquanto o banco for um.
    fileParallelism: false,

    globalSetup: ['tests/setup/global-setup.ts'],
    setupFiles: ['tests/setup/each-file.ts'],

    // Semear paga um hash de argon2, que é lento de propósito.
    hookTimeout: 60_000,
    // Generoso porque há teste que dispara duas requisições simultâneas e
    // espera o `FOR UPDATE` serializar as duas.
    testTimeout: 30_000,
  },
});
