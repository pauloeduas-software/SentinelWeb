-- Geração da sessão + trilha de autenticação (F3, endurecimento).
--
-- `tokenVersion` sobe DEFAULT 0 para todo mundo: as sessões abertas no momento
-- da migration continuam valendo (o token que elas carregam ainda não tem o
-- campo — ver a leitura tolerante em authenticate-request.helper.ts).

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED', 'LOGIN_DISABLED', 'LOGOUT', 'PASSWORD_CHANGED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "auth_events" (
    "id" UUID NOT NULL,
    "type" "AuthEventType" NOT NULL,
    "userId" UUID,
    "username" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_events_userId_createdAt_idx" ON "auth_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "auth_events_createdAt_idx" ON "auth_events"("createdAt");

-- CreateIndex
CREATE INDEX "auth_events_type_createdAt_idx" ON "auth_events"("type", "createdAt");

-- AddForeignKey
-- `SET NULL`, não `CASCADE`: apagar o cadastro não pode apagar o histórico de
-- acesso dele — é justamente o que uma auditoria vem procurar.
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
