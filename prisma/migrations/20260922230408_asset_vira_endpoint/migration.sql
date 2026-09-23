-- ESCRITA À MÃO, de propósito.
--
-- O `prisma migrate diff` gera `DROP TABLE "assets"` + `CREATE TABLE "endpoints"`
-- para este passo: ele compara estruturas e não tem como saber que um model
-- renomeado é o MESMO dado. Aplicar aquilo apagaria toda a frota já descoberta
-- pelo agente. Renomear preserva linhas, chaves e a sequência do id.
--
-- Contexto: `Asset` era a máquina do lado RMM. O nome foi liberado para o ativo
-- do ITAM, que é o `Asset` do vocabulário do Snipe-IT (docs/FASE-1-PLANO.md, D12).

ALTER TABLE "assets" RENAME TO "endpoints";
ALTER TABLE "endpoints" RENAME CONSTRAINT "assets_pkey" TO "endpoints_pkey";
-- `assets_hwid_key` é CONSTRAINT no banco que nasceu de `db push` e ÍNDICE no
-- banco criado a partir do `0_init` (que usa `CREATE UNIQUE INDEX`). As duas
-- origens existem, então o rename precisa cobrir as duas — foi o que a auditoria
-- da Fase 1 pegou ao reconstruir o banco do zero.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_hwid_key') THEN
    ALTER TABLE "endpoints" RENAME CONSTRAINT "assets_hwid_key" TO "endpoints_hwid_key";
  ELSE
    ALTER INDEX "assets_hwid_key" RENAME TO "endpoints_hwid_key";
  END IF;
END $$;

ALTER TABLE "telemetries" RENAME COLUMN "assetId" TO "endpointId";
ALTER TABLE "telemetries" RENAME CONSTRAINT "telemetries_assetId_fkey" TO "telemetries_endpointId_fkey";
