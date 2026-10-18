-- BAIXA — o que o banco pode conferir sozinho.
--
-- Diferença para `posse-invariantes.sql`: lá as regras vivem no BANCO (índices
-- parciais), e o SQL prova que elas recusam o que deve recusar. Aqui as regras
-- vivem na APLICAÇÃO — `assert-retire-posse.usecase.ts` —, porque cruzam
-- tabelas e porque o valor delas está na MENSAGEM que ensina o que fazer
-- (docs/referencia/invariantes.md, "a regra de onde cada uma mora").
--
-- Então este arquivo não prova o índice: ele DETECTA a linha que não deveria
-- existir. Toda consulta abaixo tem que devolver ZERO linhas. Uma linha
-- significa que alguma escrita chegou ao banco por fora das guardas — um
-- `psql` à mão, um script de carga, ou uma regressão no use-case.
--
--   docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -q -f - \
--     < prisma/verificacoes/baixa.sql

BEGIN;

\echo ''
\echo '### 1. Ativo fora do patrimonio COM posse aberta  -> esperado: 0 linhas'
-- O equipamento foi vendido/descartado e continua na mao de alguem: sumiu do
-- inventario sem que a devolucao tenha acontecido.
SELECT a."assetTag", a."retiredAt", a."retiredReason", g.id AS assignment
FROM assets a
JOIN assignments g ON g."assetId" = a.id AND g."checkinAt" IS NULL
WHERE a."retiredAt" IS NOT NULL AND a."deletedAt" IS NULL;

\echo ''
\echo '### 2. Motivo sem data, ou data sem motivo  -> esperado: 0 linhas'
-- As duas colunas andam juntas: `retiredAt` sozinho e "saiu, nao se sabe por
-- que"; `retiredReason` sozinho e um motivo de saida para um ativo que nao
-- saiu. Nenhuma tela sabe mostrar esses dois estados.
SELECT a."assetTag", a."retiredAt", a."retiredReason"
FROM assets a
WHERE (a."retiredAt" IS NULL) <> (a."retiredReason" IS NULL);

\echo ''
\echo '### 3. Saida do patrimonio sem linha no historico  -> esperado: 0 linhas'
-- RETIRE grava `assets` e `activity_logs` na MESMA transacao. Um ativo
-- baixado sem o evento correspondente significa escrita fora do
-- use-case — e um ativo que sumiu do parque sem explicacao.
SELECT a."assetTag", a."retiredAt"
FROM assets a
WHERE a."retiredAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activity_logs l
    WHERE l."entityType" = 'Asset' AND l."entityId" = a.id AND l.action = 'RETIRE'
  );

ROLLBACK;
