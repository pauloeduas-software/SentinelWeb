import { prisma } from '../../server/core/database/prismaClient';
import { getDatabaseUrl } from '../../server/core/config/env';
import { semearBanco } from '../../prisma/seed';

// O BANCO DE TESTE — e a trava que impede o harness de apagar o seu.
//
// O reset é `TRUNCATE` em tudo: não existe teste que "arruma depois". Um teste
// que limpa o que criou só limpa quando PASSA — o que falha no meio deixa
// sujeira, e a sujeira quebra o próximo arquivo com uma mensagem sobre outra
// coisa. Apagar antes, sempre, faz cada arquivo começar do mesmo lugar.
//
// A consequência é que apontar `DATABASE_URL` para o banco de desenvolvimento
// APAGA O BANCO DE DESENVOLVIMENTO — inteiro, sem confirmação, na primeira vez
// que alguém rodar `npm test` com o `.env` errado carregado. Por isso o harness
// não confia em configuração: ele LÊ o nome do banco e se recusa a trabalhar se
// ele não terminar em `_test`.

/** O sufixo que marca um banco como descartável. É a trava inteira. */
const SUFIXO_OBRIGATORIO = '_test';

/** A `_prisma_migrations` fica: é o registro do schema, não dado de teste. */
const TABELAS_PRESERVADAS = new Set(['_prisma_migrations']);

export function nomeDoBanco(url = getDatabaseUrl()): string {
  // `URL` resolve o caso chato sozinho: senha com caractere especial, porta,
  // query string (`?schema=public`). `pathname` vem como "/sentineldb_test".
  const caminho = new URL(url).pathname;
  return decodeURIComponent(caminho.replace(/^\//, ''));
}

/**
 * Derruba o processo se o banco apontado não for descartável.
 *
 * Chamada no `globalSetup` (antes de qualquer arquivo) E no setup de cada
 * arquivo. As duas, porque são dois processos: o `globalSetup` roda no processo
 * principal do vitest e os arquivos rodam em workers, cada um com o seu
 * `process.env`. Verificar só no primeiro deixaria o worker sem trava.
 */
export function exigirBancoDeTeste(): string {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL vazia no ambiente de teste. O vitest.config.ts carrega o .env.test — ' +
        'confira se o arquivo existe na raiz do projeto.',
    );
  }

  const nome = nomeDoBanco(url);
  if (!nome.endsWith(SUFIXO_OBRIGATORIO)) {
    throw new Error(
      `RECUSADO: o harness apaga TODAS as tabelas do banco apontado, e "${nome}" não termina ` +
        `em "${SUFIXO_OBRIGATORIO}".\n` +
        'Isto é a trava que impede `npm test` de apagar o banco de desenvolvimento. ' +
        'Aponte DATABASE_URL para um banco descartável no .env.test.',
    );
  }

  return nome;
}

/**
 * Esvazia todas as tabelas de dado, numa instrução só.
 *
 * `TRUNCATE` e não `DELETE`: não passa pelo índice, não gera tupla morta e não
 * precisa de ordem topológica — `CASCADE` resolve as FKs, que é justamente o
 * que apagar `users` antes de `assignments` exigiria à mão.
 *
 * `RESTART IDENTITY` zera as sequências: sem isso, o número da etiqueta
 * automática (`AppSetting`) continuaria subindo entre arquivos e um teste que
 * espera "ATV-00001" passaria sozinho e falharia na suíte inteira.
 *
 * A lista sai do `information_schema`, não de uma constante: tabela nova
 * entraria no reset sem ninguém lembrar de acrescentá-la aqui — e esquecer
 * disso é dado de um arquivo vazando para o próximo, o bug mais caro de
 * diagnosticar que uma suíte pode ter.
 */
export async function truncarTudo(): Promise<void> {
  exigirBancoDeTeste();

  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  const alvos = tabelas
    .map((t) => t.tablename)
    .filter((nome) => !TABELAS_PRESERVADAS.has(nome))
    .map((nome) => `"public"."${nome}"`);

  if (alvos.length === 0) return;

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${alvos.join(', ')} RESTART IDENTITY CASCADE`);
}

/**
 * O estado inicial de todo arquivo de teste: banco vazio + o seed de verdade.
 *
 * É o seed de `prisma/seed.ts`, importado — não uma cópia. Uma cópia
 * divergiria do catálogo real no primeiro ajuste, e os testes passariam a
 * provar coisas sobre um sistema que não existe.
 */
export async function resetarBanco(): Promise<void> {
  await truncarTudo();
  await semearBanco();
}
