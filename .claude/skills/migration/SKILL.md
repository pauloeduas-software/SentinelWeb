---
name: migration
description: Mudança no schema.prisma ou na migration 0_init do SentinelWeb. Use ao criar, remover ou alterar tabela, coluna, enum, índice ou CHECK, e ao alinhar o banco de desenvolvimento depois disso.
---

# Migration

O projeto tem **uma** migration, a `0_init`, editada no lugar. A receita inteira está em
`docs/guias/criar-uma-migration.md`: siga-a do começo ao fim, na ordem. Este arquivo só lista o
que já deu errado.

## Nunca

- `prisma migrate dev` e `prisma db push`. O primeiro é interativo e oferece resetar o banco; o
  segundo pula o SQL escrito à mão no fim da `0_init` (os índices parciais e os `CHECK`s que
  carregam as invariantes).
- O banco de desenvolvimento como `--shadow-database-url`: o shadow é zerado. Para comparar, crie um
  banco descartável ou use `--from-empty --to-schema-datamodel --script`.

## Antes de alinhar o dev

1. `grep` cada coluna removida no bloco escrito à mão da `0_init`. Se ela aparece num `CHECK`, o
   `DROP COLUMN` apaga o `CHECK` inteiro em silêncio: reescreva o `CHECK` na `0_init` e, no DDL do
   dev, faça `DROP CONSTRAINT` + `ADD CONSTRAINT` **antes** do `DROP COLUMN`.
2. O DDL do dev roda numa transação só, junto com o `UPDATE` do checksum da `0_init` em
   `_prisma_migrations`. O banco do Sentinel é o do container `sentinel-postgres`
   (`docker exec sentinel-postgres psql`), não o que o `DATABASE_URL` da shell aponta.
3. `bun run db:generate`.
4. Apague o `sentineldb_test` e o `sentineldb_e2e_test`: o `migrate deploy` não reaplica a
   `0_init` já registrada em `_prisma_migrations` (o banco ficaria no schema antigo, em silêncio),
   e o próximo `bun run test` e `bun run test:e2e` recriam cada um da `0_init` nova.
5. Invariante nova ou alterada: linha em `docs/referencia/invariantes.md` e teste em
   `tests/invariantes/`.

## Antes de concluir

`bun run check`, e a comparação de `pg_constraint` entre o dev e um banco descartável recriado da
`0_init`.
