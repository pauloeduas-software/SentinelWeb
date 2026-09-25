-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "cryptoCanary" TEXT;

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "reassignable" BOOLEAN NOT NULL DEFAULT true,
    "maintained" BOOLEAN NOT NULL DEFAULT false,
    "expirationDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "licensedToName" TEXT,
    "licensedToEmail" TEXT,
    "productKey" TEXT,
    "minSeats" INTEGER,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "supplierId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_seats" (
    "id" UUID NOT NULL,
    "licenseId" UUID NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "burnedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_seat_checkouts" (
    "id" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "assignedUserId" UUID,
    "assignedAssetId" UUID,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkinAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "checkinNotes" TEXT,
    "checkoutById" UUID,
    "checkinById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_seat_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licenses_deletedAt_idx" ON "licenses"("deletedAt");

-- CreateIndex
CREATE INDEX "licenses_categoryId_idx" ON "licenses"("categoryId");

-- CreateIndex
CREATE INDEX "licenses_expirationDate_idx" ON "licenses"("expirationDate");

-- CreateIndex
CREATE INDEX "license_seats_licenseId_idx" ON "license_seats"("licenseId");

-- CreateIndex
-- Obriga o `reconcile-seats` a numerar com MAX+1 e nunca COUNT+1: a linha
-- aposentada continua na tabela, e a contagem colidiria aqui.
CREATE UNIQUE INDEX "license_seats_numero" ON "license_seats"("licenseId", "seatNumber");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_seatId_checkinAt_idx" ON "license_seat_checkouts"("seatId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_assignedUserId_checkinAt_idx" ON "license_seat_checkouts"("assignedUserId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_assignedAssetId_checkinAt_idx" ON "license_seat_checkouts"("assignedAssetId", "checkinAt");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "license_seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_assignedAssetId_fkey" FOREIGN KEY ("assignedAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- O QUE O PRISMA NÃO EXPRESSA — e por isso é escrito à mão
--
-- Migração puramente ADITIVA: três tabelas novas e uma coluna nulável em
-- `app_settings`. Nenhuma coluna existente muda, nenhuma linha é reescrita.
-- ---------------------------------------------------------------------------

-- NOME ÚNICO ENTRE OS VIVOS. O `unique_undeleted` do Snipe-IT, pela quarta vez
-- no projeto: sem o `WHERE`, uma licença na lixeira bloqueia para sempre o
-- recadastro do mesmo nome.
CREATE UNIQUE INDEX "licenses_name_unico_ativo"
  ON "licenses"("name") WHERE "deletedAt" IS NULL;

-- O ALVO DO ASSENTO É UM SÓ — e quem garante é o BANCO (D39).
--
-- Duas colunas nuláveis admitem quatro estados, e dois deles são mentira: as
-- duas preenchidas ("este assento está com a Laura E com o notebook") e nenhuma
-- preenchida ("este assento está ocupado por ninguém"). Nenhum dos dois dá erro
-- sozinho; o que acontece é o assento sair da conta de livres sem aparecer em
-- lista nenhuma — pago, indisponível e invisível.
--
-- `num_nonnulls` é função do Postgres desde a 9.6 e diz exatamente isto sem
-- dois `CASE WHEN`. É o mesmo CHECK que `assignments_alvo_coerente` faz com
-- três FKs, com uma diferença: aqui NÃO há discriminante para conferir, porque
-- com dois alvos possíveis a FK preenchida já diz qual é.
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_alvo_xor"
  CHECK (num_nonnulls("assignedUserId", "assignedAssetId") = 1);

-- UM ASSENTO NÃO ESTÁ EM DUAS MÃOS AO MESMO TEMPO.
--
-- Mesma forma do `assignments_um_aberto_por_ativo` (D14), um nível abaixo — e
-- pelo mesmo motivo: com `SKIP LOCKED` duas entregas simultâneas pegam assentos
-- DIFERENTES e nunca disputam esta linha, mas o índice é a rede para quem NÃO
-- passa pelo use-case (o psql à mão, o importador de CSV da F10, uma migração
-- futura). É a regra do INVARIANTES.md: o banco GARANTE, a aplicação EXPLICA.
CREATE UNIQUE INDEX "license_seat_uma_aberta_por_assento"
  ON "license_seat_checkouts"("seatId") WHERE "checkinAt" IS NULL;

-- A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA.
--
-- O mesmo CHECK que `assignments` ganhou, e pelo mesmo motivo: uma ocupação que
-- fecha antes de abrir tem duração negativa, e é isso que quebra o relatório de
-- tempo médio de uso de assento.
--
-- `>=` e não `>`: entrega e devolução no MESMO instante é real — é o
-- desligamento no mesmo dia da entrega, e o `offboard` carimba os dois com
-- relógios que podem coincidir no milissegundo.
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkin_nao_antecede"
  CHECK ("checkinAt" IS NULL OR "checkinAt" >= "checkoutAt");

-- O CONTRATO NÃO É NEGATIVO, E O ASSENTO É NUMERADO A PARTIR DE 1.
--
-- `seatsTotal = 0` é legítimo (contrato cadastrado antes da compra) e passa: o
-- que não pode é o checkout achar assento onde não há, e disso cuida o `SELECT`
-- que devolve zero linhas.
ALTER TABLE "licenses"      ADD CONSTRAINT "licenses_seats_nao_negativo"  CHECK ("seatsTotal" >= 0);
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seat_numero_positivo" CHECK ("seatNumber" >= 1);
