-- AUDITORIA — quem fez o quê, consultado no banco (decisão AB).
--
-- Tela nenhuma lê `audit_logs`: este arquivo é a tela. Cada bloco responde uma
-- pergunta, no horário de Brasília. Ele só LÊ — e roda numa transação que
-- termina em ROLLBACK, como os vizinhos.
--
-- Cada pergunta usa uma variável; a que não for passada responde vazio:
--
--   docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -q \
--     -v registro='ATV-0042' -v conta='fulana@empresa.com' -f - \
--     < prisma/verificacoes/auditoria.sql
--
--   registro    a etiqueta do ativo, o nome do item, da licença, o e-mail da
--               conta, o hostname da máquina — ou o id do registro
--   conta       o e-mail de quem entra no sistema
--   busca       um pedaço do nome do registro (maiúscula não importa; acento, sim)
--   requisicao  o X-Request-Id de uma resposta, o mesmo da linha do log
--   dias        quantos dias para trás olham os blocos 6 a 8 (padrão: 7)
--
-- Como ler o autor: `conta` é quem estava na sessão, com o nome e o e-mail que
-- tinha NO MOMENTO; `sistema` é o job ou o comando de terminal, e a origem diz
-- qual; `sem sessão` é a tela de login — quem digitou não provou ser a conta.
--
-- Para copiar um bloco para outra ferramenta, troque cada `:'variavel'` pelo
-- valor entre aspas simples.

\if :{?registro}
\else
  \set registro ''
\endif
\if :{?conta}
\else
  \set conta ''
\endif
\if :{?busca}
\else
  \set busca ''
\endif
\if :{?requisicao}
\else
  \set requisicao ''
\endif
\if :{?dias}
\else
  \set dias 7
\endif

\pset null '—'

BEGIN;

\echo ''
\echo '### 1. Tudo de um registro  (-v registro=...)'
-- Pelo nome OU pelo id. Pelo nome também acha o que aconteceu DEPOIS de o
-- registro ser renomeado: a busca pega o id de toda linha que teve aquele nome,
-- e traz todas as linhas desse id. Dois registros que tiveram o mesmo nome (a
-- etiqueta reaproveitada, a conta excluída e recriada com o mesmo e-mail) vêm
-- juntos — a coluna `id` os separa.
-- O id colado entra pelo `CASE`, que só converte o texto com forma de id; o
-- `MATERIALIZED` impede o Postgres de converter antes de olhar a forma.
WITH alvo AS MATERIALIZED (SELECT :'registro'::text AS texto),
ids AS (
  SELECT x."entityId" AS id FROM audit_logs x
  WHERE x."entityLabel" = :'registro' AND x."entityId" IS NOT NULL
  UNION
  SELECT CASE
    WHEN a.texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN lower(a.texto)::uuid
  END
  FROM alvo a
)
SELECT
  to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando,
  CASE l."actorType"
    WHEN 'USER' THEN l."actorName" || ' <' || l."actorEmail" || '>'
    WHEN 'SYSTEM' THEN 'sistema'
    ELSE 'sem sessão'
  END AS quem,
  l.source AS origem,
  l.action AS acao,
  l."entityType" || ': ' || l."entityLabel" AS registro,
  l.changes::text AS o_que_mudou,
  l."requestId" AS requisicao,
  l."entityId" AS id
FROM audit_logs l
WHERE :'registro' <> ''
  -- `= ANY(ARRAY(...))`, e não `IN (...)`: assim os dois lados do OR usam índice.
  AND (l."entityId" = ANY(ARRAY(SELECT id FROM ids)) OR l."entityLabel" = :'registro')
ORDER BY l."createdAt", l.id;

\echo ''
\echo '### 2. O que uma conta fez  (-v conta=...)'
-- Pelo e-mail gravado na linha, e pelo id da conta que teve esse e-mail: a
-- conta que trocou de e-mail traz também o que fez com o antigo. A conta
-- excluída continua aparecendo: a linha não depende de `users`. O e-mail é
-- gravado em minúsculas, então a comparação usa o índice direto.
SELECT
  to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando,
  l."actorName" AS nome,
  l."actorEmail" AS email,
  l.action AS acao,
  l."entityType" || ': ' || l."entityLabel" AS registro,
  l.changes::text AS o_que_mudou,
  l."requestId" AS requisicao
FROM audit_logs l
WHERE :'conta' <> ''
  AND (
    l."actorEmail" = lower(:'conta')
    OR l."actorId" = ANY(ARRAY(SELECT x."actorId" FROM audit_logs x WHERE x."actorEmail" = lower(:'conta')))
  )
ORDER BY l."createdAt", l.id;

\echo ''
\echo '### 3. O que aconteceu COM uma conta  (-v conta=...)'
-- A conta como registro: cadastro, edição, troca de senha, exclusão, entradas,
-- saídas e as tentativas de senha errada — estas, sem autor.
SELECT
  to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando,
  l.action AS acao,
  CASE l."actorType"
    WHEN 'USER' THEN l."actorName" || ' <' || l."actorEmail" || '>'
    WHEN 'SYSTEM' THEN 'sistema (' || l.source || ')'
    ELSE 'sem sessão'
  END AS quem,
  l.changes::text AS o_que_mudou,
  l."requestId" AS requisicao,
  l."entityId" AS id
FROM audit_logs l
WHERE :'conta' <> ''
  AND l."entityType" = 'User'
  AND l."entityId" IN (
    SELECT x."entityId" FROM audit_logs x
    WHERE x."entityType" = 'User' AND x."entityLabel" = lower(:'conta')
  )
ORDER BY l."createdAt", l.id;

\echo ''
\echo '### 4. Busca por um pedaço do nome  (-v busca=...)'
-- Para quando não se sabe a etiqueta inteira: um registro por linha, com a
-- primeira e a última vez que ele apareceu.
SELECT
  l."entityType" AS tipo,
  l."entityLabel" AS registro,
  l."entityId" AS id,
  count(*) AS linhas,
  to_char(min(l."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS primeira,
  to_char(max(l."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS ultima
FROM audit_logs l
WHERE :'busca' <> '' AND l."entityLabel" ILIKE '%' || :'busca' || '%'
GROUP BY l."entityType", l."entityLabel", l."entityId"
ORDER BY max(l."createdAt") DESC
LIMIT 50;

\echo ''
\echo '### 5. Uma requisição  (-v requisicao=...)'
-- Tudo que uma única ação da tela gravou — a entrega com a devolução
-- automática da posse anterior, o vínculo com a entrega ao posto.
SELECT
  to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando,
  CASE l."actorType"
    WHEN 'USER' THEN l."actorName" || ' <' || l."actorEmail" || '>'
    ELSE 'sem sessão'
  END AS quem,
  l.action AS acao,
  l."entityType" || ': ' || l."entityLabel" AS registro,
  l.changes::text AS o_que_mudou
FROM audit_logs l
WHERE :'requisicao' <> '' AND l."requestId" = :'requisicao'
ORDER BY l."createdAt", l.id;

\echo ''
\echo '### 6. Senha errada e conta bloqueada, nos últimos dias  (-v dias=...)'
-- Por conta — pelo id, então a conta que trocou de e-mail é uma linha só, com o
-- e-mail mais recente. Muitas tentativas numa conta só, ou em várias seguidas,
-- é alguém tentando adivinhar; uma ou duas é quem esqueceu a senha. Durante o
-- bloqueio fica UMA linha por bloqueio, não uma por tentativa.
SELECT
  (array_agg(l."entityLabel" ORDER BY l."createdAt" DESC))[1] AS conta,
  count(*) FILTER (WHERE l.changes->>'motivo' = 'senha') AS senha_errada,
  count(*) FILTER (WHERE l.changes->>'motivo' = 'bloqueada') AS insistiu_bloqueada,
  count(*) FILTER (WHERE l.changes->>'motivo' = 'desativada') AS conta_desativada,
  count(*) FILTER (WHERE l.changes->>'bloqueadaAte' IS NOT NULL) AS bloqueios,
  to_char(max(l."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS ultima
FROM audit_logs l
WHERE l.action = 'LOGIN_FAILED'
  AND l."createdAt" >= now() AT TIME ZONE 'UTC' - make_interval(days => :dias)
GROUP BY l."entityId"
ORDER BY count(*) DESC;

\echo ''
\echo '### 7. O que o sistema fez sozinho, nos últimos dias  (-v dias=...)'
-- É a resposta para "foi o sistema": o vínculo automático da reconciliação e
-- o comando de terminal. O que não estiver aqui teve uma conta por trás.
SELECT
  to_char(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') AS quando,
  l.source AS origem,
  l.action AS acao,
  l."entityType" || ': ' || l."entityLabel" AS registro,
  l.changes::text AS o_que_mudou
FROM audit_logs l
WHERE l."actorType" = 'SYSTEM'
  AND l."createdAt" >= now() AT TIME ZONE 'UTC' - make_interval(days => :dias)
ORDER BY l."createdAt", l.id;

\echo ''
\echo '### 8. Quem fez quanto, nos últimos dias  (-v dias=...)'
-- Uma linha por conta e ação: o retrato rápido de quem mexeu em quê.
SELECT
  CASE l."actorType"
    WHEN 'USER' THEN l."actorName" || ' <' || l."actorEmail" || '>'
    WHEN 'SYSTEM' THEN 'sistema (' || l.source || ')'
    ELSE 'sem sessão'
  END AS quem,
  l.action AS acao,
  count(*) AS vezes,
  to_char(max(l."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS ultima
FROM audit_logs l
WHERE l."createdAt" >= now() AT TIME ZONE 'UTC' - make_interval(days => :dias)
GROUP BY 1, l.action
ORDER BY 1, count(*) DESC;

ROLLBACK;
