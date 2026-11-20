# Criar uma migration

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md), e as decisões que a moldaram são o **D6** (nunca `migrate dev`), a **DN** (cada mudança é uma migration nova) e o **D10** (enum do Prisma vira tipo do Postgres), em [`../decisoes/plataforma.md`](../decisoes/plataforma.md) e [`../decisoes/catalogo-e-ativo.md`](../decisoes/catalogo-e-ativo.md).

---

**Nunca `prisma migrate dev` nem `prisma db push`.** O primeiro é interativo, detecta drift e
oferece resetar o banco; o segundo não passa pelas migrations, e o SQL escrito à mão (os índices
parciais e os `CHECK`s que carregam as invariantes) não chegaria ao banco.

**A `0_init` não se edita.** Ela é o ponto de partida, e o checksum dela está gravado em
`_prisma_migrations` de todo banco que a aplicou: mexer no arquivo faz o `migrate deploy` recusar
o banco. Cada mudança de `schema.prisma` é uma migration nova, aplicada por `migrate deploy` em
todo banco, do de desenvolvimento ao de produção.

## A migration nova

**1. Gerar o SQL**, a partir do que as migrations já existentes constroem, num shadow descartável:

```bash
docker exec sentinel-postgres psql -U sentinel -d postgres \
  -c "DROP DATABASE IF EXISTS sentinel_shadow;" -c "CREATE DATABASE sentinel_shadow;"
SHADOW="postgresql://sentinel:sentinelpassword@localhost:3002/sentinel_shadow?schema=public"
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome"
mkdir -p "$PASTA"
bunx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW" --script > "$PASTA/migration.sql"
```

O nome da pasta diz a mudança em `snake_case`: `20261118120000_licenca_ganha_fornecedor`.

> ⚠️ **Nunca passe o banco de desenvolvimento como `--shadow-database-url`.** O shadow é
> zerado antes de o Prisma aplicar as migrations nele, e já foi assim que o `sentineldb`
> perdeu todos os dados uma vez.

**2. Escrever à mão o que o Prisma não expressa.** Índice parcial e `CHECK` vão no fim da
migration nova, num bloco comentado como o da `0_init`. O gerador não sabe que eles existem, nos
dois sentidos: não os cria, e não os tira quando a coluna que citam sai.

> ⚠️ **`DROP COLUMN` apaga em silêncio o `CHECK` inteiro que cita a coluna**, mesmo um `CHECK`
> de várias colunas. Procure cada coluna removida nos blocos à mão de todas as migrations
> (`grep`); se ela aparece num `CHECK`, a migration nova faz `DROP CONSTRAINT` + `ADD CONSTRAINT`
> com a versão nova **antes** do `DROP COLUMN`. Foi o que o `stock_movements_forma` pediu quando
> o `returnNotes` saiu.

Invariante nova ou alterada ganha linha em [`../referencia/invariantes.md`](../referencia/invariantes.md)
e teste em `tests/invariantes/`.

**3. Revisar o SQL.** Não é formalidade: já aconteceu duas vezes de o gerador emitir algo que
destrói dado ou não executa:

- um `DROP INDEX` que o Postgres recusa quando o índice sustenta uma CONSTRAINT;
- um `DROP TABLE` + `CREATE TABLE` para o que era um **rename** de model, o que
  teria apagado todas as máquinas dos agentes.

**4. Aplicar e gerar o client.**

```bash
bun run db:migrate && bun run db:generate
```

Os bancos de teste não pedem nada: o próximo `bun run test` e o próximo `bun run test:e2e`
rodam o `migrate deploy` e aplicam a migration nova
([`../referencia/testes.md`](../referencia/testes.md)).

## Conferir que nada divergiu

```bash
bunx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

O esperado é **nenhuma instrução**. Os índices parciais e os `CHECK`s escritos à mão não
aparecem — o `migrate diff` os ignora nos dois sentidos —, então o que sair é divergência de
verdade: o schema declara algo que as migrations não criam.

Como o `migrate diff` não enxerga `CHECK` nem índice parcial, um `CHECK` perdido passaria limpo
por ele. A conferência que pega isso é reconstruir o banco do zero num descartável e comparar o
`pg_dump --schema-only` dele com o do dev: os dois têm que ser iguais.

```bash
docker exec sentinel-postgres psql -U sentinel -d postgres \
  -c "DROP DATABASE IF EXISTS sentinel_audit;" -c "CREATE DATABASE sentinel_audit;"
AUDIT="postgresql://sentinel:sentinelpassword@localhost:3002/sentinel_audit?schema=public"
DATABASE_URL="$AUDIT" bunx prisma migrate deploy
DATABASE_URL="$AUDIT" bun run db:seed
```

Foi assim que se descobriu que a cadeia de migrations **não aplicava do zero**: o
`0_init` foi adotado com `migrate resolve --applied` e nunca rodou, então ninguém
notou que ele cria `CREATE UNIQUE INDEX` onde o banco de desenvolvimento — nascido
de `db push` — tinha uma CONSTRAINT. Rodar a cadeia em banco limpo é o único jeito
de garantir que um ambiente novo sobe. Depois, apague o `sentinel_shadow` e o `sentinel_audit`.

## A migration que não é aditiva

Ela vai em dois tempos: criar a coluna nova e **preencher na mesma transação** numa migration;
apagar a antiga na seguinte, depois de o resultado ser conferido. Entre as duas, um rollback
ainda encontra o dado original. O projeto fez isso uma vez, com `users.department` (o D75, que o
D135 corrigiu no que dizia sobre o contrato da API — e o departamento saiu depois, no segundo
de-escopo).

E a armadilha que vale para toda coluna nova num banco que **já tem linhas**: o `DEFAULT` é o
valor para a linha que ainda não existe; para as que existem, ele é uma escrita em massa — o
[D164](../decisoes/escopo.md#d164--o-default-da-coluna-tranca-o-sistema-e-a-migração-precisa-do-backfill)
conta a vez em que isso trancou o sistema. Reconstruir o banco do zero é a prova de que a
cadeia inteira sobe com o backfill no meio dela.
