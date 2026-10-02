-- ═══════════════════════════════════════════════════════════════════════════
-- SEGUNDO FATOR E TOKEN PESSOAL (F11, Etapa H).
--
-- ADITIVA INTEIRA: três colunas nuláveis em `users`, cinco valores de enum, um
-- índice e a chave estrangeira que o `api_tokens.userId` nunca teve (D142).
-- Nenhum `DROP`, nenhum `NOT NULL` sem padrão — o deploy desta migração não
-- muda o comportamento de ninguém até alguém cadastrar um autenticador.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum
--
-- CINCO VALORES NUMA MIGRAÇÃO SÓ, e o aviso do gerador não se aplica aqui: ele
-- vale para PostgreSQL 10 e anteriores. Do 12 em diante `ADD VALUE` roda dentro
-- de transação; o que continua proibido é USAR o valor novo na MESMA transação
-- que o criou — e esta migração não grava evento nenhum.
ALTER TYPE "AuthEventType" ADD VALUE 'TOTP_REQUIRED';
ALTER TYPE "AuthEventType" ADD VALUE 'TOTP_FAIL';
ALTER TYPE "AuthEventType" ADD VALUE 'TOTP_ENABLED';
ALTER TYPE "AuthEventType" ADD VALUE 'TOTP_DISABLED';
ALTER TYPE "AuthEventType" ADD VALUE 'TOTP_RECOVERY_USED';

-- AlterTable
--
-- `totpRecoveryCodes TEXT[]` nasce com o default do Postgres para array, que é
-- `{}` — não `NULL`. É o que faz `codigos.length` responder zero sem nenhum
-- `??` no caminho de leitura.
ALTER TABLE "users" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpRecoveryCodes" TEXT[],
ADD COLUMN     "totpSecret" TEXT;

-- CreateIndex
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");


-- ═══════════════════════════════════════════════════════════════════════════
-- A LIMPEZA ANTES DA FK, E POR QUE ELA É UM `DELETE`.
--
-- `api_tokens.userId` existe desde a F0 sem chave estrangeira: nada no banco
-- impedia um token apontar para um uuid que nunca foi usuário. Pela aplicação
-- isso é inalcançável — até esta fase, o único caminho de emissão gravava
-- `ownerType: 'AGENT'` com `userId` nulo. Mas a FK abaixo FALHA se existir uma
-- linha órfã, e uma migração que quebra no deploy por causa de uma linha de 2025
-- é o pior lugar para descobrir isso.
--
-- `DELETE` e não `SET NULL`: um token `USER` sem dono passa pela busca por
-- prefixo e pela conferência do segredo, e só quebra depois, ao carregar a
-- sessão. É uma credencial que autentica como ninguém, que é exatamente o que a
-- FK existe para proibir. Anular a coluna preservaria a linha e o problema.
--
-- Na prática isto apaga zero linhas. Ele está aqui para o banco que teve
-- `psql`, carga de migração ou um bug fora do caminho da aplicação.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM "api_tokens"
 WHERE "userId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "api_tokens"."userId");

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
