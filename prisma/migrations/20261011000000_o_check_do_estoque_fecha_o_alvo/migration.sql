-- O CHECK DA FORMA DO MOVIMENTO FECHA O DISCRIMINANTE — e o total ganha piso.
--
-- `stock_movements_forma` foi copiado do CHECK da posse, onde `targetType` é
-- NOT NULL. Em `stock_movements` ele é nulável (ENTRADA e BAIXA não têm alvo),
-- e com NULL a comparação `"targetType" = 'USER'` vira NULL em vez de FALSE —
-- e CHECK em Postgres só recusa FALSE. Uma SAIDA com uma FK preenchida e o
-- discriminante nulo passava pela rede que existe justamente para quem não
-- passa pela aplicação. O `IS NOT NULL` explícito no ramo da SAIDA é o que
-- derruba o NULL.
--
-- Na mesma passada: a nota e o autor da devolução só existem com `returnedAt`,
-- e o total do item não fica negativo — a BAIXA recusa na aplicação, e o banco
-- passa a recusar para quem escreve por fora.

ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_forma";

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_forma" CHECK (
  (
    "kind" = 'SAIDA'
    AND "qty" = 1
    AND "targetType" IS NOT NULL
    AND num_nonnulls("targetUserId", "targetLocationId") = 1
    AND (
         ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
      OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
    )
    AND ("returnedAt" IS NOT NULL OR ("returnNotes" IS NULL AND "returnedById" IS NULL))
  ) OR (
    "kind" <> 'SAIDA'
    AND "targetType" IS NULL
    AND "targetUserId" IS NULL
    AND "targetLocationId" IS NULL
    AND "returnedAt" IS NULL
    AND "returnNotes" IS NULL
    AND "returnedById" IS NULL
  )
);

ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_qty_nao_negativa"
  CHECK ("qty" >= 0);
