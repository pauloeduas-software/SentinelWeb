# Criar uma migration

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md), e as decisões que a moldaram são o **D6** (nunca `migrate dev`) e o **D10** (enum do Prisma vira tipo do Postgres), em [`../decisoes/plataforma.md`](../decisoes/plataforma.md) e [`../decisoes/catalogo-e-ativo.md`](../decisoes/catalogo-e-ativo.md).

---

**Nunca `prisma migrate dev`.** Ele é interativo, detecta drift e oferece resetar
o banco.

## Enquanto não há produção: a `0_init`, editada no lugar

O projeto tem **uma** migration, `prisma/migrations/0_init/migration.sql`, e mudança de
`schema.prisma` edita essa migration em vez de ganhar uma irmã. Não existe banco deste
projeto fora da máquina de desenvolvimento — o cabeçalho da própria `0_init` diz isso —, e
uma cadeia incremental só contaria a história de um banco que ninguém precisa reconstruir.
O squash foi feito duas vezes (as 39 migrations em `798a3aa`, as oito seguintes em
`904af4e`); desde então as mudanças de schema editam a `0_init` (`e05e2c7`, `505c520`,
`ff34364`).

**1. Regerar a parte gerada da `0_init`.** O arquivo tem duas metades: o que o `migrate diff`
escreve e, no fim, o bloco escrito à mão — índices parciais e `CHECK`s, que o Prisma não
expressa e que carregam metade das invariantes. Regere a primeira e preserve a segunda:

```bash
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma --script
# a saída substitui a metade gerada da 0_init; o bloco do fim continua à mão
```

Se a mudança tira uma coluna que o bloco à mão cita, o índice ou o `CHECK` dela sai junto —
o gerador não sabe que eles existem.

> ⚠️ **`DROP COLUMN` apaga em silêncio o `CHECK` inteiro que cita a coluna**, mesmo um `CHECK`
> de várias colunas. Antes do passo 2, procure cada coluna removida no bloco à mão da `0_init`
> (`grep`); se ela aparece num `CHECK`, reescreva o `CHECK` na `0_init` e, no DDL do dev, faça
> `DROP CONSTRAINT` + `ADD CONSTRAINT` com a versão nova **antes** do `DROP COLUMN`. Foi o que
> o `stock_movements_forma` pediu quando o `returnNotes` saiu.

**2. Alinhar o banco de desenvolvimento.** O `sentineldb` já tem a `0_init` aplicada, e o
`migrate deploy` não reaplica migration já aplicada. Então o DDL equivalente à mudança roda
à mão, **numa transação**, e o checksum da linha `0_init` em `_prisma_migrations` passa a ser
o do arquivo novo — sem isso, o Prisma acusa a `0_init` de ter sido modificada depois de
aplicada:

```bash
sha256sum prisma/migrations/0_init/migration.sql     # o checksum novo
docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
-- o DDL da mudança, por exemplo: ALTER TABLE "users" DROP COLUMN "lastLoginAt";
UPDATE "_prisma_migrations" SET checksum = '<o sha256 acima>' WHERE migration_name = '0_init';
COMMIT;
SQL
npm run db:generate
```

O banco de teste não se alinha: ele é descartável. Apague o `sentineldb_test` e o
`globalSetup` do próximo `npm test` o recria com a `0_init` nova
([`../referencia/testes.md`](../referencia/testes.md)).

**3. Conferir que nada divergiu.**

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

O esperado é **nenhuma instrução**. Os índices parciais e os `CHECK`s do bloco à mão não
aparecem — o `migrate diff` os ignora nos dois sentidos —, então o que sair é divergência de
verdade: o DDL do passo 2 ficou incompleto, ou o schema declara algo que o banco não tem.

Como o `migrate diff` não enxerga `CHECK` nem índice parcial, um `CHECK` perdido no dev passaria
limpo por ele. A conferência que pega isso é comparar o `pg_dump --schema-only` do dev com o de
um banco descartável recriado da `0_init` (o do teste abaixo): os dois têm que ser iguais.

> ⚠️ **Nunca passe o banco de desenvolvimento como `--shadow-database-url`.** O shadow é
> zerado antes de o Prisma aplicar as migrations nele, e já foi assim que o `sentineldb`
> perdeu todos os dados uma vez. Para conferir as migrations contra um banco, use um
> descartável, como o do teste abaixo.

**Revisar o SQL não é formalidade.** Já aconteceu duas vezes de o gerador emitir
algo que destrói dado ou não executa:

- um `DROP INDEX` que o Postgres recusa quando o índice sustenta uma CONSTRAINT;
- um `DROP TABLE` + `CREATE TABLE` para o que era um **rename** de model, o que
  teria apagado a frota inteira descoberta pelo agente.

**E o teste que pega o resto:** reconstruir o banco do zero num banco descartável.

```bash
docker exec sentinel-postgres psql -U sentinel -d postgres \
  -c "DROP DATABASE IF EXISTS sentinel_audit;" -c "CREATE DATABASE sentinel_audit;"
AUDIT="postgresql://sentinel:sentinelpassword@localhost:3002/sentinel_audit?schema=public"
DATABASE_URL="$AUDIT" npx prisma migrate deploy
DATABASE_URL="$AUDIT" npm run db:seed
```

Foi assim que se descobriu que a cadeia de migrations **não aplicava do zero**: o
`0_init` foi adotado com `migrate resolve --applied` e nunca rodou, então ninguém
notou que ele cria `CREATE UNIQUE INDEX` onde o banco de desenvolvimento — nascido
de `db push` — tinha uma CONSTRAINT. Rodar a migration em banco limpo é o único jeito
de garantir que um ambiente novo sobe.

---

## Quando houver produção

A `0_init` congela no dia em que um banco de verdade a aplicar, e cada mudança passa a ser
uma migration nova, aplicada por `migrate deploy`:

```bash
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome"
mkdir -p "$PASTA"
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > "$PASTA/migration.sql"
# REVISAR o SQL antes de aplicar
npm run db:migrate && npm run db:generate
```

**Se a migração NÃO for aditiva**, ela vai em dois tempos: criar a coluna nova e **preencher
na mesma transação** numa migração; apagar a antiga na seguinte, depois de o resultado ser
conferido. Entre as duas, um rollback ainda encontra o dado original. O projeto fez isso uma
vez, com `users.department` na F11 (o D75, que o D135 corrigiu no que dizia sobre o contrato
da API — e o departamento saiu depois, no segundo de-escopo): ver
[`../historico/fase-11-acesso-avancado.md`](../historico/fase-11-acesso-avancado.md).

E a armadilha que vale para toda coluna nova num banco que **já tem linhas**: o `DEFAULT` é o
valor para a linha que ainda não existe; para as que existem, ele é uma escrita em massa — o
[D164](../decisoes/escopo.md#d164--o-default-da-coluna-tranca-o-sistema-e-a-migração-precisa-do-backfill)
conta a vez em que isso trancou o sistema. Aqui, reconstruir o banco do zero deixa de ser
zelo: é a única prova de que a cadeia inteira sobe com o backfill no meio dela.
