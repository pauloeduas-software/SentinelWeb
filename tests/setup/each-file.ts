import { afterAll, beforeAll } from 'vitest';
import { closeDatabase } from '../../server/core/database/prismaClient';
import { exigirBancoDeTeste, resetarBanco } from './database';

// Roda uma vez POR ARQUIVO de teste (é o `setupFiles` do vitest.config.ts).
//
// POR ARQUIVO, e não por teste: semear custa um hash de argon2 (deliberadamente
// lento, ~100ms), e pagá-lo a cada `it` faria a suíte inteira levar minutos.
// O preço é que testes do mesmo arquivo compartilham banco — então cada arquivo
// cria o que precisa com nome próprio, e um arquivo que depende da ORDEM dos
// seus testes está mal escrito.
//
// POR QUE NÃO UMA TRANSAÇÃO COM ROLLBACK, que seria mais rápido: metade do que
// esta suíte precisa provar é justamente o comportamento TRANSACIONAL — as
// corridas com duas requisições simultâneas, os índices únicos parciais, o
// rollback do `offboard`. Envolver tudo numa transação externa mudaria o que
// está sendo testado.

beforeAll(async () => {
  // A trava de novo, aqui dentro: o `globalSetup` roda em OUTRO processo, e um
  // worker com `process.env` diferente passaria por ela sem nunca ter sido
  // verificado.
  exigirBancoDeTeste();
  await resetarBanco();
}, 60_000);

afterAll(async () => {
  // Sem isto o pool do Prisma segura o worker e o vitest não encerra sozinho.
  await closeDatabase();
});
