# Plano de implementação — Fase 2: ativos, o que se faz com eles

> Plano **prospectivo** da Fase 2 do [`../ROADMAP.md`](../ROADMAP.md), escrito
> contra o código real depois da F1 e do modelo de posse entrar no schema.
> Camadas: [`../referencia/arquitetura.md`](../referencia/arquitetura.md) · posse:
> [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md) e [`../referencia/invariantes.md`](../referencia/invariantes.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias

## Objetivo

Dar ao ativo uma **tela própria** — `/itam/assets/:id`, com abas Detalhes, Posse,
Histórico, Componentes, Licenças, Manutenções e Arquivos — e as operações que hoje
não existem: histórico por ativo, ações em massa, imagem, anexo, arquivamento e
descomissionamento.

O modelo do ativo nasceu inteiro na F1, então esta fase não acrescenta coluna de
identidade nenhuma: acrescenta **saída de operação** (`retiredAt`), **arquivo**
(`Attachment`, `imagePath`) e as leituras que a tela de detalhe pede.

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F1 concluída** | `Asset` inteiro, `StatusLabel` com `type`, catálogo com `/options` |
| **`Assignment` + `LocationOccupant`** | a aba Posse não tem o que ler sem eles; já aplicados na migration `20260923011728_posse_e_ocupacao` |
| **A leitura de posse da F4** | `GET /api/assets/:id/assignments` e `resolverResponsaveis()` — **a F2 lê, a F4 escreve** (Etapa C) |
| **Invariante 4 (`assert-status-posse`)** | o arquivamento da Etapa D depende dela para recusar arquivar ativo entregue |
| **`@fastify/multipart`** | não instalado. A Etapa G não começa sem ele |

**O que NÃO é pré-requisito:** autenticação. A F2 roda inteira com `actorId: null`
— esperar a F3 atrasaria a fase por uma coluna que ela preenche depois, sem
migração.

## Etapa A — `GET /api/assets/:id` e a moldura da tela · **M**

**Não existe rota de leitura unitária.** Nenhuma rota do `asset.maestro.ts` devolve
*um* ativo por id: o modal de hoje recebe a linha que a listagem já tinha em
memória, e uma URL colada no navegador não tem essa linha.

- **Schema:** nada muda.
- **Nasce:** `server/domain/asset/use-cases/find-asset-by-id.usecase.ts`; no
  front `src/pages/gestao-itam/detalhe/` (`index.tsx`,
  `hooks/useAssetDetail.ts`, `components/AssetTabs.tsx`) e a rota
  `/itam/assets/:id` em `App.tsx`.
- **Regra:** devolve pelo `ASSET_SELECT` que já existe; 404 se não achar ou se
  estiver na lixeira.

As **sete abas nascem todas**; as de fases futuras (Componentes/F5, Licenças/F6,
Manutenções/F8) renderizam *"disponível na Fase N"* — tabela vazia é
indistinguível de bug.

## Etapa B — Aba Histórico, sem tabela `AssetLog` · **M**

- **Schema:** nada muda. O índice `@@index([entityType, entityId, createdAt])`
  do `ActivityLog` já é exatamente a consulta desta aba.
- **Nasce:** `server/domain/activity/use-cases/list-entity-activity.usecase.ts`,
  `controllers/activity.controller.ts` e `activity.maestro.ts` — o domínio existe
  hoje só com o `record-activity.usecase.ts` e ganha rota;
  `src/pages/gestao-itam/detalhe/components/HistoryTab.tsx`.
- **Regra:** `GET /api/assets/:id/activity` pagina todo `ActivityLog` com
  `entityType = 'Asset'` e `entityId = :id`.

**Para o checkout aparecer aqui, ele precisa se logar como `Asset`** — entrega é
operação *sobre o ativo*: `entityType: 'Asset'`, `entityId: assetId`, alvo em
`changes`. Gravado como `'Assignment'` com o id da assignment, a aba não o
encontra. É contrato entre esta etapa e a F4, escrito nos dois planos.

## Etapa C — Aba Posse · **M**

Mostra, nesta ordem: **responsáveis resolvidos** (podem ser vários, com turno), a
posse aberta e o histórico.

- **Schema:** nada muda.
- **Nasce:** `src/pages/gestao-itam/detalhe/components/PosseTab.tsx`,
  `detalhe/helpers/rotulo-do-alvo.helper.ts`,
  `src/domain/assignment/assignment.queries.ts`.
- **Regra:** consome `GET /api/assets/:id/assignments` e o `PosseResolvida` já
  tipado em `src/domain/shared/posse.types.ts`; não recalcula nada.

**A fronteira com a F4: a F2 lê, a F4 escreve.** Se a rota já existir quando a F2
chegar aqui, a etapa custa metade; se não, a F2 pula esta aba e segue.

O que a tela mostra e a listagem não: a `via` de cada responsável (`DIRETO` /
`POSTO` / `ATIVO`). "Laura por posse direta" e "Laura por ocupar a Mesa 1" são
fatos diferentes, e o botão de devolver só aparece no primeiro.

## Etapa D — Arquivar e descomissionar · **M**

- **Schema:** `Asset.retiredAt DateTime?`, `Asset.retiredReason RetiredReason?` e
  `enum RetiredReason { SOLD DISCARDED LOST STOLEN WARRANTY_RETURN }`. Aditiva,
  sem backfill.
- **Nasce:** `use-cases/retire-asset.usecase.ts`,
  `use-cases/archive-asset.usecase.ts`, filtro em `asset-filters.helper.ts`,
  `components/RetireModal.tsx`.
- **Regra:** arquivar é mover para um status de tipo `ARCHIVED`; a listagem
  **exclui** esses ativos por padrão e `?arquivados=incluir|somente` os traz.

**Arquivar é recusado com posse aberta**, e não é regra nova: é a Invariante 4,
que `assert-status-posse.usecase.ts` já aplica em toda edição — a rota de
arquivar chama a **mesma** guarda; em duplicata, uma das duas ficaria para trás.

`retiredAt` não é status: é fato datado de saída do parque, e o ativo vendido
continua no relatório de depreciação da F8 com a data em que saiu.

## Etapa E — Relatório: ativos em posto vago · **P**

Ativo cuja posse aberta aponta para um local **sem ocupante aberto**: equipamento
parado em mesa vazia — o sinal que nenhum ITAM de prateleira dá.

- **Schema:** nada muda. `location_occupants(locationId, endedAt)` e
  `assignments(targetLocationId, checkinAt)` já existem para isto.
- **Nasce:** um filtro em `asset-filters.helper.ts` + item no menu de relatórios.
- **Regra:** `?relatorio=posto-vago` filtra a listagem de ativos.

```ts
// asset-filters.helper.ts — é filtro, não rota nova (D20)
export const POSTO_VAGO: Prisma.AssetWhereInput = {
  assignments: {
    some: {
      checkinAt: null,
      targetType: 'LOCATION',
      targetLocation: { occupants: { none: { endedAt: null } } },
    },
  },
};
```

O campo `postoVago` já vem por linha no contrato; o que falta é **filtrar no
servidor**. No cliente quebraria a paginação: a página 1 mostraria 3 de 25 e o
`total` mentiria.

## Etapa F — Ações em massa · **G**

Editar N, trocar status, mover de localização, excluir. Checkout em massa é F4.

- **Schema:** nada muda.
- **Nasce:** `use-cases/bulk-update-assets.usecase.ts`, `schemas/bulk.schema.ts`,
  `src/pages/gestao-itam/hooks/useBulkSelection.ts`,
  `components/BulkActionBar.tsx`.
- **Regra:** `POST /api/assets/bulk` aplica **uma** operação a N ids, tudo ou
  nada, teto de 200 ids.

Antes de gravar, a guarda de posse roda em todos os ids e, se algum barrar,
responde 409 com a lista e o motivo de cada um (D21). Uma linha de `ActivityLog`
**por ativo**, nunca uma pelo lote — senão a aba Histórico perde o evento; as N
levam o mesmo `batchId` em `changes` para a tela agrupá-las.

## Etapa G — Imagem e anexos · **M**

- **Schema:** `imagePath String?` em `Asset`, `AssetModel`, `Manufacturer` e
  `Category`; model `Attachment` (`assetId`, `path`, `originalName`, `mimeType`,
  `sizeBytes`, `uploadedById String?`, `createdAt`), `onDelete: Cascade`.
- **Nasce:** `server/core/storage/` (gravar bytes, derivar nome seguro, apagar —
  **não** `attachment/helpers/storage.helper.ts`, ver **D83**),
  `server/domain/attachment/` (maestro, controller,
  `use-cases/upload-attachment.usecase.ts`, `delete-attachment.usecase.ts`) e
  `src/pages/gestao-itam/detalhe/components/FilesTab.tsx`.
- **Regra:** o arquivo vai para `UPLOAD_DIR` com nome **uuid + extensão derivada
  do MIME da allowlist** — nunca o nome que o cliente mandou. O download sai por
  **`GET /api/attachments/:id/download`, com sessão**, e `UPLOAD_DIR` fica fora de
  qualquer raiz do `@fastify/static` (**D84**).

> ⚠️ **Esta etapa foi reescrita no fechamento, e o motivo é um furo de segurança.** O texto
> original mandava servir os arquivos por `@fastify/static` numa segunda raiz. A F2 foi
> planejada **antes** da porta fechada da F3 — e com a regra do estático daquela fase, um
> `GET /uploads/<uuid>.pdf` não começa com `/api` e sairia **sem sessão em produção**. Ver o
> **D84**, e o [Fechamento da F2](#fechamento-da-f2--as-pontas-que-a-fase-deixou-abertas).

`uploadedById` nasce nulável pelo motivo de `ActivityLog.actorId`: a F3 não
chegou, e esperar por ela perderia tudo que for anexado até lá.

**`Attachment` nasce com FK direta para `Asset`**, não polimórfico. Quando
licença (F6) e manutenção (F8) quiserem anexo, é uma coluna nulável a mais e um
discriminante — o padrão do `Assignment`, aditivo. Nascer polimórfico agora é
pagar complexidade por dois donos que não existem.

## Etapa H — Clonar, filtrar e ordenar a listagem · **P**

- **Schema:** nada muda.
- **Nasce:** `src/pages/gestao-itam/hooks/useCloneAsset.ts`, filtros em
  `asset-filters.helper.ts`, `components/AssetFilters.tsx`.
- **Regra:** clonar abre o formulário em modo criação com `id`, `assetTag`,
  `serial` e a posse em branco; os filtros por status, categoria, modelo,
  localização e fornecedor entram como `where` no servidor.

Clonar é operação **de tela**, sem rota nova. A etiqueta vem do
`GET /api/settings/next-asset-tag`, que é *peek* puro — abrir e cancelar o clone
duas vezes não pode furar a sequência.

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/catalogo-e-ativo.md`](../decisoes/catalogo-e-ativo.md) — **D18–D21 e o D85**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.
>
> **Duas delas não ficaram com o assunto desta fase:** o **D83** e o **D84** — onde o
> armazenamento de arquivo mora e por que anexo sai por `/api/` com sessão — foram para
> [`../decisoes/plataforma.md`](../decisoes/plataforma.md), porque guardar bytes é
> infraestrutura e serve também ao termo de entrega da F4.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Riscos e armadilhas

**`@fastify/static` registrado duas vezes derruba o boot.** Continua valendo caso alguém
reintroduza a segunda raiz apesar do **D84**: sem `decorateReply: false` o Fastify lança
`FST_ERR_DEC_ALREADY_PRESENT`, porque `sendFile` já foi decorado. Mas o desenho certo é
**não ter a segunda raiz** — anexo sai por rota com sessão.

**O arquivo no disco não participa da `$transaction`.** Gravá-lo antes do commit
deixa órfão quando a transação reverte: valida → grava a linha → commita → só
então move do temporário. E o inverso — **soft delete não apaga arquivo**: apagar
o `.pdf` ao mandar o ativo para a lixeira torna a restauração um link quebrado.

**Extensão vinda do cliente é execução remota esperando lugar.** O nome no disco
é `uuid` + extensão da allowlist de MIME; o original vai para uma coluna, só para
exibir. `../../` num nome de arquivo é o ataque mais velho que existe, e
`path.join` não protege sozinho.

**`$transaction` do Prisma tem timeout de 5 s por padrão.** A ação em massa com
200 ids são ~400 statements e estoura com `P2028` no meio — o rollback é o
comportamento certo, mas o operador vê "erro desconhecido". Passar `{ timeout }`
explícito e manter o teto de 200.

**Corrida em READ COMMITTED entre a ação em massa e o modal.** Validar os 200 e só
depois gravar deixa uma janela em que alguém faz checkout de um deles: a guarda
roda **dentro** da transação da escrita; a pré-validação é para a *mensagem*.

**`Decimal` nunca `Float`.** `purchaseCost` sai da API como string (`"1234.5"` —
o zero à direita some): a tela formata com `Intl.NumberFormat`, o formulário
manda string, e um `z.coerce.number()` no caminho reintroduz o erro de centavo
que o `Decimal` existe para impedir.

**A extension de soft delete não alcança leitura aninhada.** Na tela de detalhe
isso reaparece: `assignedTo` de um usuário apagado e o `manager` da localização
continuam vindo preenchidos — são join dentro da query do ativo, não operação de
topo. A aba Posse filtra `deletedAt: null` **explicitamente**; não herda escopo.

**`migrate diff` de novo.** Enum do Prisma não compila em uma linha (`P1012`): um
valor por linha em `RetiredReason`. E revisar o SQL antes de aplicar continua
valendo — o gerador já emitiu `DROP TABLE` onde era rename, neste repositório. A
cor do `StatusLabel`, como na F1, vai em `style={{ color }}` e nunca em classe.

## Verificação

```bash
API=http://localhost:3001
ID=$(curl -s "$API/api/assets?perPage=1" | jq -r '.rows[0].id')
ARQ=$(curl -s "$API/api/status-labels/options?q=Arquivado" | jq -r '.[0].id')

# A — leitura unitária e 404
curl -s "$API/api/assets/$ID" | jq '{assetTag, status: .status.name}'
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/assets/00000000-0000-0000-0000-000000000000"

# B — a edição vira linha na aba Histórico, com o diff
curl -s -X PUT "$API/api/assets/$ID" -H 'Content-Type: application/json' -d '{"notes":"nota um"}'
curl -s "$API/api/assets/$ID/activity" | jq '.rows[0] | {action, changes}'

# D — a amarra da fase: arquivar ativo COM posse aberta, espera 409
curl -s -w '\n%{http_code}\n' -X PUT "$API/api/assets/$ID" \
     -H 'Content-Type: application/json' -d "{\"statusId\":\"$ARQ\"}"

# D — as contagens têm que fechar: padrão + somente == incluir
for v in '' '?arquivados=somente' '?arquivados=incluir'; do curl -s "$API/api/assets$v" | jq .total; done

# E — encerrar o último ocupante da Mesa 1 e o ativo dela aparecer aqui
curl -s "$API/api/assets?relatorio=posto-vago" | jq '.rows[].assetTag'

# F — 3 ids, um com posse aberta, arquivando os três: 409 e NADA alterado
curl -s -w '\n%{http_code}\n' -X POST "$API/api/assets/bulk" -H 'Content-Type: application/json' \
  -d "{\"ids\":[\"$A\",\"$B\",\"$C\"],\"op\":\"status\",\"statusId\":\"$ARQ\"}"

# G — anexo aceito; extensão fora da allowlist recusada; nomes uuid no disco
curl -s -X POST "$API/api/assets/$ID/attachments" -F 'file=@nf.pdf' | jq '{id, originalName}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/assets/$ID/attachments" -F 'file=@x.sh'
```

```sql
-- Invariante 4 por outro caminho: nenhum ativo ARCHIVED com posse aberta
SELECT a.id FROM assets a
  JOIN status_labels s ON s.id = a."statusId"
  JOIN assignments  g ON g."assetId" = a.id AND g."checkinAt" IS NULL
 WHERE s.type = 'ARCHIVED';                                            -- 0 linhas

-- F: a transação reverteu inteira — nenhum log dos três ids
SELECT count(*) FROM activity_logs
 WHERE "entityId" IN (:a, :b, :c) AND "createdAt" > now() - interval '1 minute';  -- 0
```

**Duas provas que não são comando:** apagar um ativo com anexo, conferir que o
arquivo **continua** no disco e restaurar; abrir e cancelar o clone duas vezes,
conferindo em `app_settings.assetTagNext` que a sequência **não** andou.

## Ordem de commits

Um commit por etapa, na ordem A→H, com o lint passando em cada um: `feat(api)`
para a leitura unitária, `feat(itam)` para histórico/arquivamento/massa/relatório,
`feat(files)` para os anexos, `feat(web)` para as telas. Não há suíte de testes —
a verificação é a seção acima, mais `prisma/verificacoes/` para invariante de banco.

---

## O que entrou

> Escrito **depois** da implementação, contra o código que está no repositório.
> O plano acima continua como foi planejado; esta seção diz o que virou código,
> o que mudou de forma no caminho e o que ficou para a leva seguinte.

### Rotas novas

| Rota | O que faz | Etapa |
|---|---|---|
| `GET /api/assets/:id` | UM ativo pelo `ASSET_SELECT` + a posse resolvida. 404 fora da lixeira | A |
| `GET /api/assets/:id/history` | `ActivityLog` do ativo **unido** ao histórico de posse, mais recente primeiro (`?limit=`, teto 200) | B |
| `POST /api/assets/:id/retire` | `{ retiredReason, retiredAt?, notes? }` — saída do patrimônio | D |
| `POST /api/assets/:id/unretire` | Desfaz a saída, limpando as duas colunas | D |
| `POST /api/assets/bulk` | `{ op: 'status'\|'location'\|'delete', ids, … }` — tudo ou nada | F |

E na listagem que já existia: `?view=active\|trashed\|retired`, `?statusId=`,
`?locationId=` e `?relatorio=posto-vago`.

### Arquivos

**Servidor** — nasceram `use-cases/find-asset-by-id`, `asset-history`,
`retire-asset`, `unretire-asset`, `assert-retire-posse` e `bulk-update-assets`;
mudaram `helpers/asset-filters.helper.ts` (vistas, filtros e o `where` do
relatório), `helpers/asset-select.helper.ts` (as duas colunas de saída),
`schemas/asset.schema.ts` (`retireAssetSchema`, `bulkAssetsSchema`,
`historyQuerySchema`), `use-cases/list-assets`, `use-cases/asset-stats`, o
controller e o maestro. Em `activity/use-cases/record-activity.usecase.ts`
entraram **só** `RETIRE` e `UNRETIRE` no union `ActivityAction`.

**Frontend** — `src/pages/gestao-itam/detalhe/` inteiro (página, `useAssetDetail`,
`AssetTabs`, `DetalhesTab`, `PosseTab`, `HistoryTab`, `RetireModal`, e os
helpers `abas`, `historico` e `rotulo-do-alvo`), mais `components/BulkActionBar`,
`components/AssetFilterBar`, `hooks/useBulkSelection` e
`helpers/descomissionamento.helper.ts`. O contrato ganhou `retiredAt`,
`retiredReason`, `AssetListParams`, `EventoDoAtivo` e `BulkOperacao`.

**Banco** — nada. A migration `20260923102207_postos_descomissionamento_auth` já
trazia as colunas e o índice `assets_retiredAt_idx`. Entrou
`prisma/verificacoes/descomissionamento.sql`: cinco consultas de DETECÇÃO (zero
linhas esperadas), porque estas regras vivem na aplicação e não há índice para
provar.

### Decisões tomadas na implementação

**`?view=retired` é do domínio, e o domínio parseia a vista INTEIRA.** O D20 diz
que a vista de ativo não entra no `ListView` do `core`. A saída foi
`separarFiltrosDeAtivo()`: o controller tira `view`, `statusId`, `locationId` e
`relatorio` da query **antes** do `parseListQuery` (que é `strictObject` e
responderia 422), e chama o parser genérico com `trashable: false`. Traduzir
`retired` para `active` e guardar a vista real à parte teria deixado duas
verdades sobre a mesma chave.

**A aba Histórico não mostra `CHECKOUT`/`CHECKIN` do `ActivityLog`.** Eles
continuam sendo gravados lá — o contrato com a F4 está mantido —, mas a leitura
os tira e usa a linha de `assignments`, que traz o NOME de quem recebeu (o log
guarda só o id), as observações e a devolução prevista. As duas fontes juntas
contariam a mesma entrega duas vezes, a segunda pior.

**`notes` do descomissionamento vai para o `ActivityLog`, não para uma coluna.**
Ela descreve o EVENTO, não o ativo: numa coluna `retiredNotes`, um segundo
descomissionamento sobrescreveria a justificativa do primeiro. No `changes` ela
fica presa à linha que a explica (D18 — uma trilha só).

**Descomissionar NÃO mexe no status.** São três colunas com três significados
(D19). Quem vende um notebook pode querer arquivá-lo também, e isso é uma
segunda decisão, com uma segunda linha no histórico.

**A listagem padrão exclui `retiredAt`, e o `/stats` também.** Os contadores do
cabeçalho viraram filtro clicável (`?statusId=`), e um número que não bate com a
lista que ele abre é pior que número nenhum. `AssetStats` ganhou `retired` — o
contador da aba "Descomissionados".

**O lote grava `batchId` + `batchSize` em cada linha.** Só o `batchId` não fecha
conta: com os dois, um lote gravado com UMA linha em vez de N é detectável em
SQL (verificação #4) e a tela pode dizer "1 de 20 deste lote".

**O lote NÃO tem guarda de posse no `delete`**, porque o delete de um ativo só
também não tem. Inventar a regra apenas no caminho do lote faria a mesma
operação ter dois comportamentos conforme o botão clicado. A guarda de posse do
lote é a de STATUS, reaproveitada de `assert-status-posse.usecase.ts` com a
etiqueta na frente da mensagem — a regra continua morando num lugar só.

**A seleção da tela atravessa a paginação e morre ao trocar de filtro.** Montar
um lote virando páginas é o caminho normal; seleção viva numa lista que o
operador não está vendo é ação em massa disparada às cegas.

**Clonar continuou sem rota.** É o formulário em modo criação com os valores de
outro ativo, e só etiqueta e série nascem em branco — são os dois campos únicos
entre os vivos. A etiqueta vem do `/settings/next-asset-tag`, que é *peek*: abrir
e cancelar o clone não fura a sequência.

**`actorId` foi propagado.** A F3 entrou no repositório durante esta fase e
`recordActivity` passou a receber o ator; `retire`, `unretire` e `bulk` já
nascem passando `atorDaRequisicao(request)`, em vez de deixar três pontos para
trás quando o `= null` temporário for removido.

### O que ficou para o fechamento

**Etapa G — imagem e anexos (multipart)** e **a vista de arquivados**. Quando esta leva
fechou, `@fastify/multipart` estava instalado e nada mais tinha sido feito: nem `Attachment`,
nem `imagePath`, nem `UPLOAD_DIR`; a aba **Arquivos** existia na tela de detalhe, desabilitada,
com o rótulo "próxima leva". As duas entraram no fechamento conjunto das F2, F3 e F4 — ver
[Fechamento da F2](#fechamento-da-f2--as-pontas-que-a-fase-deixou-abertas), no fim deste
arquivo, com o desenho do armazenamento corrigido (D83, D84).

### Verificado em runtime

Servidor na porta 3096 contra `sentinel_audit` (migrado do zero e semeado),
autenticado pelo login da F3:

- `GET /api/assets/:id` devolve a posse resolvida nos dois caminhos (alvo
  `USER` → `via: DIRETO`; alvo `LOCATION` com ocupante → `via: POSTO`, com turno);
  404 em id inexistente e 422 em id que não é uuid;
- `retire` de ativo **entregue** → 409 `ATV-00002 está entregue e não pode ser
  descomissionado.`; de ativo livre → 200, e o ativo sai da listagem padrão;
- as contagens fecham: padrão 5 + `?view=retired` 1 = 6, e `/stats` devolve
  `total: 5`, `retired: 1`;
- `?statusId=` e `?locationId=` filtram; `?view=xpto`, `?relatorio=xpto` e
  `?statusId=abc` respondem 422, e `?ordr=asc` continua respondendo 422 pelo
  parser do `core`;
- `?relatorio=posto-vago` não devolvia nada; encerrada a ocupação da Mesa 1, o
  ativo entregue a ela apareceu — com `perPage=1`, `total: 2` e uma linha na
  página (a paginação descreve o conjunto filtrado);
- `GET /api/assets/:id/history` traz cadastro, entrega (com o nome do alvo) e
  edição com o diff, sem repetir a entrega; o descomissionado mostra `RETIRE`
  com `retiredAt`, `retiredReason` e a observação;
- lote de 3 com um ativo entregue indo para "Arquivado" → 409 com a etiqueta, e
  os outros dois **inalterados**; lote de localização → 200 com `batchId`, uma
  linha de histórico por ativo com `batchSize`; `op` inválida, campo faltando,
  campo a mais e 201 ids → 422; id inexistente → 404 com a lista;
- `prisma/verificacoes/descomissionamento.sql`: zero linhas nas cinco consultas.

---

# Fechamento da F2 — as pontas que a fase deixou abertas

> As F2, F3 e F4 foram fechadas **juntas**, em cinco levas, porque as pontas que sobraram
> dependiam umas das outras numa ordem que não é a ordem das fases. Esta seção guarda o que
> era da F2: a **Leva 1D** (a vista de arquivados) e a **Leva 2** (o armazenamento de
> arquivo). As outras levas estão nos planos da [F3](fase-03-autenticacao-e-ator.md) e da
> [F4](fase-04-posse.md), que apontam para a tabela e o grafo abaixo.

## Por que levas, e não três revisões de fase

Três coisas atravessavam as três fases:

1. **O armazenamento de arquivo era o gargalo.** Ele é a Etapa G desta fase, e é também onde
   moram a assinatura e o PDF do termo da F4. Enquanto não existisse, o aceite não tinha onde
   gravar nada.
2. **O envio de e-mail tinha quatro clientes** — checkout, checkin, aceite e lembrete de
   atraso — e três deles eram de fases diferentes.
3. **A porta fechada da F3 mudou o desenho da Etapa G desta fase**, que foi escrita antes
   dela. Ver o **D84**: é um furo de segurança real, não um detalhe de estilo.

```
Leva 1  dívida sem migration ────────────┐
                                         │
Leva 2  armazenamento ───┬───────────────┼──▶ Leva 4  aceite + assinatura + PDF
                         │               │
Leva 3  e-mail + job ────┘───────────────┘

Leva 5  ApiToken por agente  (independente de tudo; por último por causa da frota)
```

A Leva 4 é a única que depende de duas outras: ela precisa de **onde gravar** (Leva 2) e de
**como avisar** (Leva 3). As levas 1 e 5 não dependiam de nada — a 1 veio primeiro porque era
barata e a 5 por último porque é a única que exige coordenar com um binário que **não está
neste repositório**.

## As catorze pontas, levantadas contra o código

Levantado lendo o repositório, não o `../ROADMAP.md` — que na época marcava a F2 e a F3
inteiras como pendentes.

| # | O que faltava | Fase | Prova de que faltava |
|---|---|---|---|
| 1 | Ator em `catalog` e `occupancy` | F3 | as 5 chamadas de `recordActivity` sem o 3º parâmetro |
| 2 | `expectedCheckinAt` no passado é aceito | F4 | `assignment.schema.ts` não tinha `refine` |
| 3 | Histórico da pessoa no perfil | F4 | nenhuma rota lia `ActivityLog` por `entityId` de `User` |
| 4 | Vista "arquivados" | **F2** | `ASSET_VIEWS = ['active','trashed','retired']` |
| 5 | `Attachment` + `imagePath` | **F2 (G)** | `@fastify/multipart` instalado, **zero imports** |
| 6 | `createdById`/`updatedById` no `Asset` | F3 (F) | nenhuma das duas colunas no `schema.prisma` |
| 7 | `core/mail/` | F4 (C) | `nodemailer` instalado, **zero imports** |
| 8 | `JobRun` + janela de execução | F4 (D) | D79 decidido, tabela não criada |
| 9 | Índice parcial dos vencidos | F4 (D) | `GET /api/assignments/overdue` varria `assignments` |
| 10 | Lembrete automático de atraso | F4 (D) | não existia `overdue-reminder.job.ts` |
| 11 | `Acceptance` + a página do termo | F4 (A) | `Category.requireAcceptance` e `eulaText` **nunca lidos** |
| 12 | PDF do termo | F4 (B) | `pdfkit` instalado, **zero imports** |
| 13 | Relatório de não aceitos + reenvio | F4 | dependia do 11 |
| 14 | `ApiToken` por agente | F3 (G) | `/agent-hub` com o `AGENT_TOKEN` compartilhado da F0 |

Quatro itens do `../ROADMAP.md` **não** entraram porque já estavam feitos e o documento não
tinha sido atualizado: painel de ocupantes no posto, checkout em massa, perfil do colaborador
(menos o histórico) e o desligamento.

## Leva 1D — A vista "arquivados" (**D85**) ✅

- **Muda:** `asset/helpers/asset-filters.helper.ts` (`ASSET_VIEWS` ganha `'archived'`, e
  `whereDaVista` passa a olhar `status.type`), `asset/use-cases/asset-stats.usecase.ts` (o
  contador) e `src/pages/gestao-itam/index.tsx` (a quarta aba).
- **Regra:** `active` exclui `retiredAt` **e** `status.type = ARCHIVED`; `archived` mostra só
  o segundo; `trashed` continua sem olhar status nenhum — lixeira é lixeira.

A invariante que impede arquivar ativo entregue **já existia** e não mudou:
`assert-status-posse.usecase.ts` recusa `ARCHIVED` com responsável resolvido. O que faltava era
só a vista.

**O que entrou:** `ASSET_VIEWS` ganhou `'archived'`, `whereDaVista` passou a receber se há
`statusId` explícito, e `/stats` ganhou o contador `archived` com `total` deixando de incluí-lo.
`AssetStats.byStatus` ganhou `type`, que é o que deixa a tela saber que aquele contador é de
arquivo.

**A armadilha que apareceu escrevendo o teste, e que o plano já previa:** com `active`
excluindo `ARCHIVED`, clicar no contador de um status arquivado no cabeçalho abriria lista
vazia. A regra do D85 (`statusId` explícito vence a exclusão) está implementada e é o teste
`?statusId= do arquivado DEVOLVE o ativo, em vez de uma lista vazia`.

## Leva 2 — Armazenamento de arquivo · **M** ✅

A Etapa G desta fase, mais as duas colunas de ator da Etapa F da F3 — que pegaram carona por
serem a mesma migration.

**Migration `20260923150000_anexos_e_autoria`:**

- `imagePath String?` em `Asset`, `AssetModel`, `Manufacturer` e `Category`
- model `Attachment`: `assetId` (`onDelete: Cascade`), `path`, `originalName`, `mimeType`,
  `sizeBytes Int`, `uploadedById String?`, `createdAt`
- `createdById String?` e `updatedById String?` **no `Asset`, e só** (D26)

**Nasceu:**

| Onde | O quê |
|---|---|
| `server/core/storage/storage.ts` | gravar, apagar e resolver caminho. Não sabe o que é anexo (**D83**) |
| `server/core/storage/mime.ts` | a allowlist MIME → extensão |
| `server/domain/attachment/` | maestro, controller, `upload-attachment`, `delete-attachment`, `list-asset-attachments`, `attachment-select.helper.ts` |
| `src/pages/gestao-itam/detalhe/components/FilesTab.tsx` | a aba que existia desabilitada |

**Rotas:** `POST|GET /api/assets/:id/attachments`, `GET /api/attachments/:id/download`,
`DELETE /api/attachments/:id` e `GET|PUT|DELETE /api/images/:alvo/:id`.

**Regras:**

- O nome no disco é `uuid` + extensão derivada do **MIME da allowlist**, nunca o nome que o
  cliente mandou. O original vai para `originalName`, só para exibir.
- O arquivo **não participa da `$transaction`**: valida → grava a linha → commita → **só
  então** move do temporário para o definitivo. Gravar antes deixa órfão no disco quando a
  transação reverte.
- **Soft delete não apaga arquivo.** Mandar o ativo para a lixeira e restaurar não pode
  devolver um link quebrado.
- `uploadedById` nasce **preenchido** — ao contrário do que a Etapa G previa: quando ela foi
  escrita a F3 não existia, e agora existe.
- Trocar a imagem apaga a anterior **depois** do commit, pela mesma razão.

**O D84 está provado em teste:** `tests/anexos/upload.test.ts` verifica que anônimo leva 401 no
download **e** que `GET /uploads/*` não é rota nenhuma. Se alguém registrar `@fastify/static`
ali, o teste cai.

**Um defeito latente corrigido de passagem:** `assets_retiredAt_idx` e
`locations_isWorkstation_idx` tinham sido criados à mão numa migration e nunca declarados no
schema — então **todo** `migrate diff` emitia `DROP INDEX` deles. Declarados, os DROPs sumiram
das quatro migrations do fechamento.

## Riscos que esta parte do fechamento acrescentou

**`../../` no nome do arquivo.** O nome no disco é `uuid` + extensão da allowlist e `path.join`
**não** protege sozinho: o caminho final é conferido contra a raiz resolvida antes de qualquer
escrita ou leitura.

**`imagePath` em quatro tabelas é quatro caminhos de exclusão.** Apagar o fabricante não pode
deixar o arquivo, e apagar o arquivo não pode deixar a coluna apontando para o vazio. O
catálogo **não** tem lixeira (D8): ali o delete é real e o arquivo vai junto, depois do commit.

## Verificação

| Leva | Arquivo | O que prova |
|---|---|---|
| 1D | `tests/listagens/vistas-do-ativo.test.ts` | arquivado some de `active`, aparece em `?view=archived`, e `?statusId=` do arquivado **devolve** o ativo |
| 2 | `tests/anexos/upload.test.ts` | anônimo em `/api/attachments/:id/download` → 401; MIME fora da allowlist → 422; `../../` no nome não escapa da raiz; soft delete do ativo **não** apaga o arquivo; `GET /uploads/*` não é rota |

Mais uma prova que só o SQL dá, no padrão de `prisma/verificacoes/`: **anexo órfão** — linha
apontando para arquivo que não existe mais no disco, comparando com o listado de `UPLOAD_DIR`.
