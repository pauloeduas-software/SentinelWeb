-- A TELEMETRIA GANHA O ÍNDICE QUE AS DUAS PERGUNTAS DELA PEDEM.
--
-- `telemetries` não tinha índice nenhum além da chave primária. Enquanto a
-- telemetria aparecia numa tela só — a frota em cards, uma consulta para todas
-- as máquinas —, isso custava UMA varredura sequencial por ciclo. A telemetria
-- passou a aparecer na ficha do ativo e na do posto, e a pergunta mudou de
-- forma: cada tela aberta pergunta por UMA máquina, a cada poucos segundos.
-- Sem índice, cada uma dessas perguntas é outra varredura da tabela inteira,
-- multiplicada pelo número de telas abertas.
--
-- `(endpointId, timestamp DESC)` serve as duas, e não só a nova:
--
--   a amostra atual de uma máquina — `WHERE endpointId = $1 ORDER BY timestamp
--     DESC LIMIT 1`, que com o índice é a primeira linha de um ramo em vez de um
--     seq scan mais um top-N sort;
--   o agregado diário de uso — `aggregate-usage.usecase.ts`, que varre uma
--     janela de três dias agrupando por máquina e por dia. É o ÚNICO leitor da
--     série histórica, e roda de hora em hora.
--
-- A ordem das colunas é essa porque toda consulta fixa o `endpointId` antes de
-- olhar o tempo. O `DESC` é para a mais recente estar na ponta que se lê.
--
-- NENHUMA COLUNA É TOCADA e nenhum índice é derrubado: é só um CREATE INDEX.

CREATE INDEX "telemetries_endpointId_timestamp_idx"
  ON "telemetries" ("endpointId", "timestamp" DESC);
