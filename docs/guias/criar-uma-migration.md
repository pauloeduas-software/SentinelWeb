# Criar uma migration

> Guia. Receita para quem já sabe o que quer fazer — o *porquê* está em
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md), e as decisões que a moldaram são o **D6** (nunca `migrate dev`) e o **D10** (enum do Prisma vira tipo do Postgres), em [`../decisoes/plataforma.md`](../decisoes/plataforma.md) e [`../decisoes/catalogo-e-ativo.md`](../decisoes/catalogo-e-ativo.md).

---

**Nunca `prisma migrate dev`.** Ele é interativo, detecta drift e oferece resetar
o banco. Para cada migração nova:

```bash
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome"
mkdir -p "$PASTA"
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > "$PASTA/migration.sql"
# REVISAR o SQL antes de aplicar
npm run db:migrate && npm run db:generate
```

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
de `db push` — tinha uma CONSTRAINT. Rodar a cadeia em banco limpo é o único jeito
de garantir que um ambiente novo sobe.

---

## Se a migração NÃO for aditiva

Aconteceu **uma vez** no projeto, e a receita é em dois tempos: `DROP COLUMN users.department`
(F11, **D75**). Criar a coluna nova e **preencher na mesma transação** numa migração; apagar a
antiga na seguinte, depois de a lista ser revisada à mão. Entre as duas, um rollback ainda
encontra o dado original.

E aqui reconstruir o banco do zero deixa de ser zelo: é a única prova de que a cadeia inteira
sobe com o backfill no meio dela. Ver
[`../historico/fase-11-acesso-avancado.md`](../historico/fase-11-acesso-avancado.md).
