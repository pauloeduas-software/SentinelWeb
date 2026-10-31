import { defineConfig, devices } from '@playwright/test';
import { lerEnvDeTeste } from './tests/setup/env-de-teste';

// ═══════════════════════════════════════════════════════════════════════════
// O HARNESS DE PONTA A PONTA: o build de produção servido pelo Fastify, num
// banco próprio, e o Chromium clicando na tela.
//
// O que ele prova que o vitest não prova: o `dist` carrega, o login pela tela
// funciona, cada página do menu abre sem erro no console, e o cadastro do
// catálogo (o padrão de CRUD do sistema inteiro) fecha o ciclo criar, editar,
// excluir. A suíte do vitest fala com o Fastify por `inject()` e nunca abre o
// navegador — ver docs/referencia/testes.md.
// ═══════════════════════════════════════════════════════════════════════════

// O MESMO `.env.test` do vitest, lido pelo mesmo leitor: um ambiente de teste
// só, versionado e sem segredo, e quem clonar roda `bun run test:e2e` sem
// configurar nada.
const envDeTeste = lerEnvDeTeste();
if (!envDeTeste.E2E_DATABASE_URL || !envDeTeste.PORT) {
  throw new Error('.env.test precisa de E2E_DATABASE_URL e PORT: são as linhas do Playwright. Confira o arquivo.');
}
const origem = `http://localhost:${envDeTeste.PORT}`;

// Três trocas, que são a natureza deste harness e não configuração: o banco
// próprio (os dois harnesses podem rodar juntos sem um truncar o do outro),
// produção (o único modo em que o Fastify serve o `dist`) e, no CORS, a origem
// do próprio servidor, porque aqui painel e API são a mesma origem.
const envDeE2e: Record<string, string> = {
  ...envDeTeste,
  DATABASE_URL: envDeTeste.E2E_DATABASE_URL,
  NODE_ENV: 'production',
  CORS_ORIGIN: origem,
};

// Os specs leem `ADMIN_PASSWORD` daqui (tests/setup/admin-de-teste.ts). Este
// módulo é avaliado no processo principal e em cada worker, antes dos specs.
Object.assign(process.env, envDeE2e);

/** A sessão que o `auth.setup.ts` guarda e todo spec autenticado reaproveita. */
export const SESSAO_DO_ADMIN = 'tests/e2e/.auth/admin.json';

export default defineConfig({
  testDir: 'tests/e2e',

  // UM BANCO SÓ, então UM ARQUIVO POR VEZ — a mesma razão do vitest.config.ts:
  // dois specs escrevendo no mesmo catálogo falhariam um por causa do outro, de
  // um jeito diferente a cada execução.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // `test.only` esquecido pularia o resto da suíte e ainda sairia verde: no CI vira falha.
  forbidOnly: !!process.env.CI,
  reporter: 'list',

  use: {
    baseURL: origem,
    locale: 'pt-BR',
    // O trace (tela, rede, console, passo a passo) só fica quando o teste falha.
    trace: 'retain-on-failure',
  },

  projects: [
    // Entra uma vez pela tela de login e guarda o cookie. Um login por execução,
    // não por spec: cinco erros bloqueiam a conta por quinze minutos, e vinte
    // logins por minuto, por IP, é o teto em produção.
    { name: 'sessao', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: SESSAO_DO_ADMIN },
      dependencies: ['sessao'],
    },
  ],

  // O servidor nasce e morre com a suíte. `e2e:servidor` prepara o banco
  // (tests/e2e/preparar.ts), faz o build e sobe o Fastify com o ambiente acima: o
  // `globalSetup` do Playwright não serve para o banco porque roda DEPOIS de o
  // servidor subir, e o servidor não sobe sem banco.
  webServer: {
    command: 'bun run e2e:servidor',
    url: `${origem}/health`,
    reuseExistingServer: false,
    env: envDeE2e,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
