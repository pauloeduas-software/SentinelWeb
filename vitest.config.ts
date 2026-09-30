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
// DOIS PROJETOS, E A DIVISÃO É PELO QUE O TESTE PRECISA PARA RODAR.
//
// `*.puro.test.ts` exercita FUNÇÃO PURA e não fala com o banco. Antes eles
// estavam na mesma configuração dos outros, e o `globalSetup` roda em TODA
// invocação — então `vitest run tests/ciclo-de-vida/webhook.puro.test.ts` morria
// com `PrismaClientInitializationError` antes do primeiro `it`. A allowlist de
// destino de webhook (D126) é a única coisa desta fase que um atacante alcança, e
// ela só era verificável com Postgres de pé: exatamente o oposto do que separar o
// arquivo pretendia.
//
// O sufixo no NOME e não uma pasta própria: `tests/ciclo-de-vida/` continua
// agrupando por fase, que é como alguém procura ("o que a F8 cobre?"), e a
// exigência de infraestrutura fica visível no arquivo que a tem.
//
// `npm test` roda os dois. `npm run test:puro` roda só o que dispensa banco — é o
// que dá para rodar em pre-commit e numa máquina sem contêiner.
// ═══════════════════════════════════════════════════════════════════════════

const PUROS = 'tests/**/*.puro.test.ts';

export default defineConfig({
  test: {
    // Injeta o mesmo ambiente nos workers. Chega ANTES de qualquer import, e é
    // isso que faz o `prismaClient.ts` nascer apontado para o banco de teste.
    env: envDeTeste,

    // UM BANCO SÓ, então UM ARQUIVO POR VEZ.
    //
    // Com paralelismo, dois arquivos truncariam a mesma tabela no meio do teste do
    // outro — e a falha apareceria em um arquivo por causa do que o outro fez, de
    // forma diferente a cada execução. Suíte que falha sem repetir é pior que suíte
    // que não existe: ensina a ignorar o vermelho.
    //
    // FICA NA RAIZ, e não dentro do projeto `banco`, porque o vitest só aceita esta
    // opção no nível de cima — ela é do runner, não de um projeto. O projeto `puro`
    // herda a serialização e não se incomoda: são dois arquivos de milissegundos.
    //
    // O preço é tempo de parede. É o preço certo enquanto o banco for um.
    fileParallelism: false,

    projects: [
      {
        test: {
          name: 'puro',
          environment: 'node',
          include: [PUROS],
          env: envDeTeste,
          // SEM `globalSetup` e SEM `setupFiles`: é isso que faz este projeto
          // rodar sem banco nenhum. E sem `fileParallelism: false` — não há
          // recurso compartilhado para serializar.
        },
      },
      {
        test: {
          name: 'banco',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [PUROS, '**/node_modules/**'],
          env: envDeTeste,

          globalSetup: ['tests/setup/global-setup.ts'],
          setupFiles: ['tests/setup/each-file.ts'],

          // Semear paga um hash de argon2, que é lento de propósito.
          hookTimeout: 60_000,
          // Generoso porque há teste que dispara duas requisições simultâneas e
          // espera o `FOR UPDATE` serializar as duas.
          testTimeout: 30_000,
        },
      },
    ],
  },
});
