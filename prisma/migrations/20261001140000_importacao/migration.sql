-- CreateEnum
CREATE TYPE "ImportTarget" AS ENUM ('ASSETS', 'USERS', 'OCCUPANTS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SIMULADO', 'APLICANDO', 'APLICADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('OK', 'ERRO', 'IGNORADA');

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "target" "ImportTarget" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'SIMULADO',
    "mapping" JSONB NOT NULL,
    "delimiter" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "ok" INTEGER NOT NULL DEFAULT 0,
    "erro" INTEGER NOT NULL DEFAULT 0,
    "ignorada" INTEGER NOT NULL DEFAULT 0,
    "appliedUpTo" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "ganhamResponsavel" INTEGER,
    "perdemResponsavel" INTEGER,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "message" TEXT,
    "entityId" UUID,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imports_createdAt_idx" ON "imports"("createdAt");

-- CreateIndex
CREATE INDEX "import_rows_importId_status_idx" ON "import_rows"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_importId_lineNumber_key" ON "import_rows"("importId", "lineNumber");

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

