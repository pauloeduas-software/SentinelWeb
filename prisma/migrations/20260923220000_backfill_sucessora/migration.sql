-- BACKFILL DO `predecessorId` — e a correção de uma frase da migration anterior.
--
-- A `20260923213000_componente_nota_e_sucessora` afirmou que `predecessorId`
-- nulo era "esta instalação não nasceu de uma divisão, o caso de toda linha
-- anterior a esta migration". ISSO ESTAVA ERRADO, e apareceu no primeiro
-- smoke contra um banco com dado de verdade: as divisões que já existiam
-- ficaram com a coluna nula, e a movimentação continuou lendo do jeito antigo —
-- "instalou 4, retirou 4, instalou 2" — exatamente o que o D38 prometeu que
-- ninguém leria.
--
-- Uma migration aplicada não se edita (o checksum do `_prisma_migrations`
-- quebraria o `migrate deploy` de todo banco que já a rodou), então a correção
-- é esta segunda, e a frase errada fica lá com esta aqui ao lado.
--
-- ---------------------------------------------------------------------------
-- DE ONDE VEM O VÍNCULO: DO `ActivityLog`, NÃO DE UM PALPITE
--
-- O `detachComponent` sempre gravou `changes.instalacaoId` e
-- `changes.sucessoraId` na trilha — era, aliás, o único lugar onde o par
-- existia, e o motivo de a coluna ter sido criada. Então o backfill é uma
-- LEITURA de um fato registrado, não uma reconstrução.
--
-- A alternativa seria casar as linhas por timestamp (`attachedAt` da sucessora
-- = `detachedAt` da fechada, que é como elas nascem). É a mesma heurística que
-- o use-case recusa em texto, e num backfill ela é pior ainda: erra em silêncio
-- e o erro fica gravado como se fosse dado.
--
-- `entityType = 'Component'` porque a retirada grava DUAS linhas com o mesmo
-- `changes` — uma no componente, outra no ativo. O `DISTINCT` já bastaria; o
-- filtro deixa explícito que se quer um par por retirada, não dois.
--
-- `WHERE "predecessorId" IS NULL` para a migration ser idempotente: rodá-la
-- duas vezes não reescreve nada, e ela nunca sobrepõe um vínculo que o
-- use-case já gravou.
-- ---------------------------------------------------------------------------

UPDATE "component_assets" AS sucessora
   SET "predecessorId" = par.fechada
  FROM (
    SELECT DISTINCT
           ("changes"->>'sucessoraId')::uuid  AS sucessora_id,
           ("changes"->>'instalacaoId')::uuid AS fechada
      FROM "activity_logs"
     WHERE "action" = 'UNINSTALL'
       AND "entityType" = 'Component'
       AND "changes"->>'sucessoraId' IS NOT NULL
       AND "changes"->>'instalacaoId' IS NOT NULL
  ) AS par
 WHERE sucessora."id" = par.sucessora_id
   AND sucessora."predecessorId" IS NULL;

-- O que este backfill NÃO alcança, declarado: uma divisão feita antes de o
-- `ActivityLog` existir, ou por fora do use-case (psql, importador). Essas
-- linhas continuam nulas e continuam lendo como instalação nova — que é a
-- leitura honesta quando não há registro do vínculo. Inventá-lo por data seria
-- gravar um palpite com cara de fato.
