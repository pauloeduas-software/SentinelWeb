-- Token de API com dono polimórfico (Leva 5 do
-- docs/FECHAMENTO-F2-F4-PLANO-ITAM.md; D80 da reconciliação).
--
-- UMA tabela para os dois usos — o token do AGENTE (F3) e o PESSOAL (F11) —
-- porque o caminho de autenticação é idêntico nos dois: procurar pelo prefixo,
-- comparar o hash em tempo constante, conferir `revokedAt`, carimbar
-- `lastUsedAt`. Duas tabelas seriam duas cópias da parte mais sensível do
-- sistema, e a segunda esqueceria uma das quatro no primeiro ajuste.

-- CreateEnum
CREATE TYPE "ApiTokenOwner" AS ENUM ('AGENT', 'USER');

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerType" "ApiTokenOwner" NOT NULL,
    "userId" UUID,
    "endpointId" UUID,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_prefix_key" ON "api_tokens"("prefix");

-- CreateIndex
CREATE INDEX "api_tokens_ownerType_idx" ON "api_tokens"("ownerType");


-- O CHECK DE COERÊNCIA DO DONO, à mão porque o Prisma não o expressa.
--
-- Sem ele, nada impede uma linha `ownerType = 'USER'` com `endpointId`
-- preenchido — um token pessoal amarrado a uma máquina, que nenhuma das duas
-- telas saberia mostrar e que o caminho de autenticação trataria como válido.
--
-- Note que `AGENT` **não** exige `endpointId`: é exatamente o estado de antes
-- do primeiro handshake. O token é gerado quando o agente é INSTALADO, e a
-- máquina só existe no sistema quando ela se apresenta pela primeira vez.
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_dono_coerente" CHECK (
     ("ownerType" = 'USER'  AND "userId" IS NOT NULL AND "endpointId" IS NULL)
  OR ("ownerType" = 'AGENT' AND "userId" IS NULL)
);

-- UM token ATIVO por endpoint, depois de vinculado.
--
-- Índice parcial (`WHERE`), como os outros do projeto. Ele é o que dá sentido
-- ao alerta de token copiado: com dois tokens ativos para a mesma máquina, o
-- segundo handshake vindo de outro lugar seria indistinguível de uma troca
-- legítima de credencial.
CREATE UNIQUE INDEX "api_tokens_um_ativo_por_endpoint"
  ON "api_tokens"("endpointId")
  WHERE "endpointId" IS NOT NULL AND "revokedAt" IS NULL;
