-- A LINHA DE INSTALAÇÃO GUARDA DOIS EVENTOS — e agora tem colunas para os dois.
--
-- Aditiva: duas colunas nuláveis, um índice único e uma FK. Nenhuma linha
-- existente muda de valor, e nada precisa de backfill — `detachNotes` nulo em
-- linha antiga é a verdade (ninguém escreveu observação de retirada em coluna
-- que não existia), e `predecessorId` nulo é "esta instalação não nasceu de uma
-- divisão", que é o caso de toda linha anterior a esta migration.
--
-- ---------------------------------------------------------------------------
-- 1. `detachNotes` — a observação da RETIRADA
--
-- Antes havia UMA coluna `notes` para os dois eventos da linha, e o `detach`
-- escrevia nela: a nota da saída SOBRESCREVIA a da entrada. "Upgrade de 8 para
-- 16 GB" sumia para sempre no dia em que alguém registrava "2 pentes com
-- defeito" — e a movimentação, que lê a mesma coluna nos dois eventos, passava
-- a mostrar o texto da RETIRADA na linha da INSTALAÇÃO.
--
-- O `AccessoryCheckout` nunca teve esse problema porque nasceu com o par
-- `checkoutNotes`/`checkinNotes`. Esta migration é o `ComponentAsset` ganhando
-- a mesma forma.
--
-- `notes` NÃO foi renomeada para `attachNotes`. O par ficaria mais simétrico no
-- nome, e o preço seria reescrever uma coluna com dado dentro em troca de zero
-- mudança de comportamento. O significado dela está no comentário do schema.
--
-- ---------------------------------------------------------------------------
-- 2. `predecessorId` — a divisão da retirada parcial (D38), explícita
--
-- Retirar 2 de 4 fecha a linha de 4 e abre uma de 2. O D38 prometeu que a aba
-- rotularia o par como *"devolução parcial: 2 de 4"*, "comparando a linha
-- fechada com a sucessora" — e não havia como comparar: nada no banco ligava as
-- duas. O único vínculo era o `sucessoraId` no `changes` do `ActivityLog`, que
-- é trilha de auditoria e não fonte para leitura de tela.
--
-- A alternativa era casar as duas por TIMESTAMP (`attachedAt` da sucessora =
-- `detachedAt` da fechada, que é como elas nascem). O próprio use-case já
-- rejeita isso em texto — "o id da sucessora é o que liga o par para a aba
-- rotular sem adivinhar por data" —, e com razão: é heurística que quebra no
-- primeiro caminho que grave as datas de outro jeito, e quebra em silêncio.
--
-- `UNIQUE` porque uma linha fechada é sucedida NO MÁXIMO UMA VEZ: a divisão
-- acontece no ato de fechar, e linha fechada não se divide de novo. É essa
-- unicidade que faz a relação ser 1-1 — sem ela, ler "a sucessora desta linha"
-- devolveria uma lista, e a pergunta não é de lista.
--
-- `ON DELETE SET NULL`, nunca `CASCADE`: apagar a antecessora não pode levar
-- junto o que CONTINUA instalado. São unidades diferentes, e a sucessora é o
-- estado atual da máquina.

-- AlterTable
ALTER TABLE "component_assets" ADD COLUMN "detachNotes" TEXT;
ALTER TABLE "component_assets" ADD COLUMN "predecessorId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "component_assets_predecessorId_key" ON "component_assets"("predecessorId");

-- AddForeignKey
ALTER TABLE "component_assets" ADD CONSTRAINT "component_assets_predecessorId_fkey"
  FOREIGN KEY ("predecessorId") REFERENCES "component_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- UMA LINHA NÃO SUCEDE A SI MESMA.
--
-- O `UNIQUE` impede duas sucessoras; ele não impede `predecessorId = id`, que
-- seria um ciclo de tamanho 1 e faria a leitura do par devolver a própria
-- linha ("parcial: 2 de 2", que não é retirada nenhuma). É o mesmo cuidado do
-- CHECK `assignment_alvo_nao_e_o_proprio_ativo` da F4, e cabe no banco pelo
-- mesmo motivo: é forma de UMA linha.
ALTER TABLE "component_assets" ADD CONSTRAINT "component_asset_sucessora_nao_e_ela_mesma"
  CHECK ("predecessorId" IS NULL OR "predecessorId" <> "id");
