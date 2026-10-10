-- BYOD E "PODE SER SOLICITADO" SAEM.
--
-- As duas colunas nasceram na F1 como caixas de marcar do formulário e nunca
-- saíram da ficha: nenhum filtro, nenhuma ordenação, nenhuma coluna de
-- listagem, nenhum relatório. O `requestable` existia para uma fila de
-- requisição que o ROADMAP declara descartada de propósito, e o `byod` para uma
-- distinção que o inventário deste sistema não usa.
--
-- NENHUM DROP/CREATE DE ÍNDICE AQUI, e isso foi conferido: os dois únicos
-- índices parciais escritos à mão sobre `assets` são o `assets_assetTag_unique_undeleted`
-- e o `assets_serial_unique_undeleted`, e nenhum CHECK, view ou trigger da
-- tabela cita as duas colunas. Derrubar coluna leva junto todo índice que a
-- referencie, em silêncio — por isso a conferência é parte da migration e não
-- da memória de quem a escreveu.

ALTER TABLE "assets" DROP COLUMN "byod",
                     DROP COLUMN "requestable";
