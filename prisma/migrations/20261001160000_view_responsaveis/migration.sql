-- A VIEW DA CAMADA 3 — quem responde por cada ativo (F10, Etapa F, D66).
--
-- ESCRITA À MÃO, e não gerada pelo `migrate diff`: o Prisma não conhece views.
-- Ele também não as derruba — por isso a cadeia de migrations continua
-- fechando com "empty migration" depois desta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE UMA VIEW, E NÃO UMA COLUNA NEM UM CACHE (D66).
--
-- A responsabilidade é DERIVADA da `Assignment` (Camada 1) e do
-- `LocationOccupant` (Camada 2). Uma coluna seria a quarta fonte de verdade
-- para o mesmo fato (é o D16), e divergiria em silêncio.
--
-- E a resolução em memória (`resolverResponsaveisEmLote`) serve para uma página
-- de 25 ativos e NÃO serve para AGRUPAR: não dá para agrupar por responsável
-- aquilo que não foi buscado. A view é exata, não tem política de refresh para
-- ninguém esquecer, e os índices de que precisa já existem desde a migration do
-- modelo de posse: `assignments(assetId, checkinAt)`,
-- `assignments(targetAssetId, checkinAt)` e
-- `location_occupants(locationId, endedAt)`.
--
-- O TRADE-OFF ASSUMIDO: cada relatório paga os joins. Se o `EXPLAIN` com 10 mil
-- ativos doer, a saída está pré-escrita — `CREATE MATERIALIZED VIEW` sobre o
-- MESMO SQL mais `REFRESH CONCURRENTLY` no job diário da F8. Uma linha de DDL,
-- porque a derivação está num lugar só.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AS TRÊS CORREÇÕES QUE A AUDITORIA DA FASE FEZ NESTE SQL (docs/AUDITORIA-F10.md)
--
-- 1. `deletedAt IS NULL` — o SQL do plano não filtrava a lixeira, embora a
--    própria seção de Riscos exigisse. `$queryRaw` não passa pela
--    `softDeleteExtension`, então sem o JOIN com `assets` o relatório contaria
--    ativo apagado, e a planilha fecharia com um número que a tela não produz.
--
-- 2. `COALESCE(...) IS NOT NULL` na perna de ASSET — sem isso, a dock entregue
--    a um posto VAZIO (ou presa a outro ativo) produzia uma linha com
--    responsável NULO. O resolver em memória devolve lista vazia nos dois
--    casos, e um `GROUP BY "userId"` criaria um balde NULL que a tela nunca
--    teve: duas respostas para a mesma pergunta, que é o D16 renascendo como
--    view.
--
-- 3. `via` em DIRETO/POSTO/ATIVO — o plano projetava USER/LOCATION/ASSET, uma
--    terceira língua para um fato que o tipo `ViaPosse`, a API e três telas já
--    nomeiam.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIEW vw_asset_responsibles AS
  -- DIRETO: a posse é da pessoa.
  SELECT g."assetId",
         g."targetUserId" AS "userId",
         'DIRETO'::text   AS via,
         NULL::uuid       AS "locationId",
         NULL::text       AS shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
   WHERE g."checkinAt" IS NULL
     AND g."targetType" = 'USER'
     AND g."targetUserId" IS NOT NULL

  UNION ALL

  -- POSTO: uma linha por ocupante ABERTO do posto. Num posto com duas pessoas,
  -- as DUAS respondem — é o caso que o modelo existe para descrever.
  --
  -- Posto VAZIO não produz linha (o JOIN o elimina), e é por isso que o
  -- relatório de "posto vago" NÃO sai desta view: ele sai do `POSTO_VAGO` do
  -- domínio do ativo, que já existia (D130).
  SELECT g."assetId",
         o."userId",
         'POSTO'::text,
         o."locationId",
         o.shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
    JOIN location_occupants o
      ON o."locationId" = g."targetLocationId" AND o."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL
     AND g."targetType" = 'LOCATION'

  UNION ALL

  -- ATIVO: o salto de UM nível — dock → notebook → (pessoa | posto).
  --
  -- UM nível por decisão (D16): cadeia mais longa é sintoma de modelagem
  -- errada, e nada de `WITH RECURSIVE` — uma CTE recursiva seguiria um ciclo
  -- alegremente.
  SELECT g."assetId",
         COALESCE(h."targetUserId", o2."userId"),
         'ATIVO'::text,
         o2."locationId",
         o2.shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
    JOIN assignments h ON h."assetId" = g."targetAssetId" AND h."checkinAt" IS NULL
    LEFT JOIN location_occupants o2
      ON o2."locationId" = h."targetLocationId" AND o2."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL
     AND g."targetType" = 'ASSET'
     AND COALESCE(h."targetUserId", o2."userId") IS NOT NULL;
