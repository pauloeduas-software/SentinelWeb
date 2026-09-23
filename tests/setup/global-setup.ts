import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl } from '../../server/core/config/env';
import { exigirBancoDeTeste, nomeDoBanco } from './database';

const exec = promisify(execFile);

// Roda UMA VEZ por execução do `npm test`, no processo principal do vitest,
// antes de qualquer arquivo de teste.
//
// O que ele garante: o banco de teste EXISTE e está no schema mais recente.
// Quem esvazia e semeia é o `each-file.ts`, a cada arquivo — são coisas
// diferentes e de custo muito diferente (migrar é caro, truncar é barato).

/**
 * Cria o banco se ele ainda não existir.
 *
 * `CREATE DATABASE` não roda dentro de transação nem no banco que está sendo
 * criado: precisa de uma conexão a OUTRO banco do mesmo servidor. `postgres` é
 * o banco de manutenção que toda instalação tem.
 *
 * Um `PrismaClient` CRU de propósito, sem a extension de lixeira: aqui não há
 * model nenhum, só DDL — e o cliente da aplicação (`prismaClient.ts`) já está
 * preso à `DATABASE_URL` de teste, que é justamente o banco que talvez não
 * exista ainda.
 */
async function criarBancoSeFaltar(): Promise<void> {
  const url = new URL(getDatabaseUrl());
  const nome = nomeDoBanco(url.toString());

  const manutencao = new URL(url.toString());
  manutencao.pathname = '/postgres';
  // `?schema=public` é parâmetro do Prisma, não do Postgres; no banco de
  // manutenção ele não tem uso e só atrapalha a leitura do erro se falhar.
  manutencao.search = '';

  const client = new PrismaClient({ datasources: { db: { url: manutencao.toString() } } });
  try {
    const existe = await client.$queryRaw<{ um: number }[]>`
      SELECT 1 AS um FROM pg_database WHERE datname = ${nome}
    `;
    if (existe.length > 0) return;

    // O nome vem do `.env.test` e já passou pela trava do sufixo, mas ele entra
    // aqui por interpolação (identificador não aceita parâmetro em DDL), então
    // as aspas duplas e a recusa de aspas no meio do nome são o que fecha a porta.
    if (nome.includes('"')) throw new Error(`Nome de banco inválido: ${nome}`);
    await client.$executeRawUnsafe(`CREATE DATABASE "${nome}"`);
  } finally {
    await client.$disconnect();
  }
}

/**
 * Aplica as migrations no banco de teste.
 *
 * `migrate deploy`, NUNCA `migrate dev` nem `db push` — é o D6: `dev` é
 * interativo, detecta drift e OFERECE resetar o banco, e `db push` não passa
 * pelas migrations, então o SQL escrito à mão (os índices parciais que carregam
 * as invariantes, os CHECKs) simplesmente não existiria no banco de teste. O
 * teste passaria provando que a invariante funciona num schema que produção
 * não tem.
 */
async function aplicarMigrations(): Promise<void> {
  await exec('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: getDatabaseUrl() },
  });
}

export default async function globalSetup(): Promise<void> {
  const nome = exigirBancoDeTeste();
  await criarBancoSeFaltar();
  await aplicarMigrations();
  // Uma linha só, e ela existe para uma pergunta específica: "em qual banco
  // isto acabou de rodar?". É a pergunta de quem viu um teste falhar e
  // desconfia do ambiente.
  console.log(`[harness] banco de teste pronto: ${nome}`);
}
