-- Janela de execução de job e índice dos vencidos (Leva 3 do
-- docs/FECHAMENTO-F2-F4-PLANO-ITAM.md).
--
-- `job_runs` é o D79: uma LINHA POR JOB, e não a coluna única
-- `AppSetting.lastAlertRunAt` que a F4 e a F8 disputariam. Com a coluna única, o
-- job que acordasse primeiro no dia venceria o compare-and-set e o segundo
-- receberia `count: 0` — o sinal de "já rodou hoje" — e nunca executaria. Todo
-- dia, sem erro e sem log.

-- CreateTable
CREATE TABLE "job_runs" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("name")
);


-- O ÍNDICE DOS VENCIDOS, À MÃO, porque o `migrate diff` não o emite: o Prisma
-- não expressa `WHERE` em índice (mesma razão dos índices únicos parciais deste
-- projeto).
--
-- Sem ele, `GET /api/assignments/overdue` varre `assignments` inteira a cada
-- consulta — e o job de lembrete a varre todo dia. O `WHERE checkinAt IS NULL`
-- é o que importa: posse fechada é a maioria absoluta das linhas com o tempo, e
-- nenhuma delas pode vencer.
CREATE INDEX "assignments_vencidos"
  ON "assignments"("expectedCheckinAt") WHERE "checkinAt" IS NULL;
