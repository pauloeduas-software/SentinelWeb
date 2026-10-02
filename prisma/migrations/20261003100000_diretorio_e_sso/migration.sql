-- ═══════════════════════════════════════════════════════════════════════════
-- DIRETÓRIO E SSO (F11, Etapa I) — aditiva inteira.
--
-- Quatro colunas em `users`, um enum novo, um valor a mais no enum de evento e
-- dois índices. `authSource` nasce `LOCAL` para TODO MUNDO, e é o que mantém o
-- comportamento de hoje: ninguém entra por SSO antes de alguém marcar a conta
-- (D78), e nenhuma conta existente passa a aceitar um login novo por causa desta
-- migração.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AuthSource" AS ENUM ('LOCAL', 'LDAP', 'OIDC');

-- AlterEnum
ALTER TYPE "AuthEventType" ADD VALUE 'OIDC_DENIED';

-- AlterTable
--
-- `NOT NULL DEFAULT 'LOCAL'` é seguro mesmo em tabela grande no Postgres 11+:
-- default não-volátil é gravado no catálogo, não reescreve a tabela.
ALTER TABLE "users" ADD COLUMN     "authSource" "AuthSource" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "directoryMissingAt" TIMESTAMP(3),
ADD COLUMN     "directorySyncedAt" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE INDEX "users_externalId_idx" ON "users"("externalId");


-- ═══════════════════════════════════════════════════════════════════════════
-- O `externalId` É ÚNICO POR ÍNDICE PARCIAL, não por `@unique`.
--
-- Mesmo caso de `email`, `username` e `employeeNumber`: com `@unique` comum, um
-- colaborador na lixeira travaria para sempre o recadastro da MESMA pessoa do
-- diretório — e recontratação é exatamente quando o `oid` volta.
--
-- E o `WHERE ... IS NOT NULL` é obrigatório por outro motivo: a coluna é nula
-- para todo mundo que não vem de diretório, e `UNIQUE` comum em Postgres aceita
-- N nulos — mas um índice parcial deixa isso EXPLÍCITO para quem lê, em vez de
-- depender de o leitor conhecer a regra do nulo.
--
-- O Prisma não expressa índice parcial, então ele mora aqui e o `migrate diff` o
-- ignora nas migrações seguintes.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "users_externalId_unico_ativo"
  ON "users"("externalId")
  WHERE "externalId" IS NOT NULL AND "deletedAt" IS NULL;
