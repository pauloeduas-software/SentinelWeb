import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Configuração PRÓPRIA, separada do `vite.config.ts`: o do frontend carrega o
// plugin do React e resolve `src/`, e nada disso tem uso aqui — a suíte exercita
// o servidor, em Node, contra o Postgres. Arquivo separado é também o que faz
// `npm test` não depender de o build do painel estar saudável.

/**
 * Lê o `.env.test` para um objeto.
 *
 * À mão, e não com `process.loadEnvFile()`, por um motivo: `loadEnvFile` NÃO
 * sobrescreve variável já definida no ambiente — que é exatamente o
 * comportamento desejado depois, quando o `server/core/config/load-env.ts`
 * carregar o `.env` e tiver que perder para estes valores. Mas para MONTAR a
 * lista precisamos do conteúdo do arquivo, tenha o ambiente o que tiver.
 */
function lerEnvDeTeste(): Record<string, string> {
  const arquivo = path.resolve(import.meta.dirname, '.env.test');
  if (!fs.existsSync(arquivo)) {
    throw new Error('.env.test não encontrado na raiz do projeto. Ele é versionado — confira o checkout.');
  }

  const valores: Record<string, string> = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (limpa === '' || limpa.startsWith('#')) continue;

    const igual = limpa.indexOf('=');
    if (igual === -1) continue;

    const chave = limpa.slice(0, igual).trim();
    // Aspas em volta do valor entrariam na connection string — é o mesmo
    // cuidado que o `getDatabaseUrl()` toma ao ler o `.env`.
    valores[chave] = limpa.slice(igual + 1).trim().replace(/^"|"$/g, '');
  }
  return valores;
}

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
    exclude: ['**/node_modules/**'],

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
