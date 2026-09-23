-- OS TRÊS CHECKS DA TABELA MAIS IMPORTANTE DO SISTEMA — invariante 5.
--
-- Migration puramente ADITIVA: só constraints. Nenhuma coluna muda, nenhuma
-- linha é reescrita. Verificado antes de aplicar que nenhuma linha existente
-- viola as três (a tabela estava vazia).
--
-- ---------------------------------------------------------------------------
-- POR QUE AGORA, E POR QUE NO BANCO
--
-- A `Assignment` era a única tabela do modelo de posse SEM CHECK: o
-- `AccessoryCheckout` da F5 vai nascer com um, e o assento (`LocationOccupant`)
-- já é defendido por índice único parcial. A tabela que carrega a Camada 1 — a
-- que diz quem responde por cada equipamento — ficaria como a mais frouxa.
--
-- A validação de aplicação CONTINUA no `assertAlvoCoerente`
-- (assignment/use-cases/checkout-asset.usecase.ts), e é ela que dá a mensagem
-- que ensina o modelo. Estes CHECKs são a rede para quem NÃO passa pela API:
-- o seed, um `psql` à mão, o importador de CSV da F10, uma migração futura.
-- É a regra do INVARIANTES.md: o banco GARANTE, a aplicação EXPLICA.
--
-- Uma linha com `targetType: 'USER'` e `targetLocationId` preenchido é aceita
-- pelo Postgres sem CHECK, e a Camada 3 a resolveria como "sem responsável" —
-- em silêncio, que é o pior jeito de um equipamento sumir de vista.
-- ---------------------------------------------------------------------------

-- 1. O ALVO POLIMÓRFICO É COERENTE.
--
-- Duas afirmações numa: exatamente UMA das três FKs está preenchida, e é a que
-- corresponde ao `targetType`. As duas são necessárias — sem a primeira,
-- `USER` com `targetUserId` E `targetLocationId` passaria; sem a segunda,
-- `USER` com só `targetLocationId` passaria.
--
-- `num_nonnulls` é função do Postgres desde a 9.6 e diz exatamente isto sem
-- três `CASE WHEN`.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
  num_nonnulls("targetUserId", "targetAssetId", "targetLocationId") = 1
  AND (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
    OR ("targetType" = 'ASSET'    AND "targetAssetId"    IS NOT NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
  )
);

-- 2. UM ATIVO NÃO É ENTREGUE A SI MESMO.
--
-- É um ciclo de tamanho 1. A Camada 3 pararia no limite de um salto e devolveria
-- "sem responsável", mas o que ficou gravado é uma posse que não responde nada —
-- e some do relatório de equipamento sem dono, porque posse ele tem.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_nao_entregue_a_si_mesmo" CHECK (
  "targetAssetId" IS NULL OR "targetAssetId" <> "assetId"
);

-- 3. A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA.
--
-- Uma posse que fecha antes de abrir tem duração negativa, e é isso que quebra
-- o relatório de tempo médio de posse e o cálculo de atraso — que lê
-- `expectedCheckinAt` contra `checkinAt` e passaria a dizer que um equipamento
-- devolvido está vencido.
--
-- `>=` e não `>`: entrega e devolução no MESMO instante é real — é o
-- desligamento no mesmo dia da entrega, e o `offboard` carimba os dois com
-- relógios que podem coincidir no milissegundo.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);
