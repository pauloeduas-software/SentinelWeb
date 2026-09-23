# Plano de implementação — Fase 2: ativos, o que se faz com eles

> Plano **prospectivo** da Fase 2 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito
> contra o código real depois da F1 e do modelo de posse entrar no schema.
> Camadas: [`ARQUITETURA.md`](./ARQUITETURA.md) · posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) e [`INVARIANTES.md`](./INVARIANTES.md).
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
- **Nasce:** `server/domain/attachment/` (maestro, controller,
  `use-cases/upload-attachment.usecase.ts`, `delete-attachment.usecase.ts`,
  `helpers/storage.helper.ts`) e
  `src/pages/gestao-itam/detalhe/components/FilesTab.tsx`.
- **Regra:** o arquivo vai para `UPLOAD_DIR` com nome **uuid + extensão derivada
  do MIME da allowlist** — nunca o nome que o cliente mandou.

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

## Decisões da fase — D18 a D21

### D18 — `AssetLog` não nasce. A aba Histórico lê o `ActivityLog`.

**Decidido:** uma trilha só, filtrada por `entityType`/`entityId`.
**Descartado:** tabela `AssetLog` com campo, valor antigo e valor novo por linha.
**Por quê:** o `ActivityLog` já grava o diff em `changes` **na mesma transação** da
operação — a garantia que a segunda tabela teria de reconstruir. Com as duas, a
pergunta *"por que o histórico não bate com a auditoria?"* passa a ter resposta
possível, e isso basta para não criá-la. O que falta é **rota de leitura**, e
fazer as operações que ainda não logam (arquivar, descomissionar, checkout,
checkin, nota) gravarem com `entityType: 'Asset'`.

### D19 — Arquivar, descomissionar e apagar são três coisas, com três colunas.

**Decidido:** `status.type = ARCHIVED` (classificação, reversível), `retiredAt` +
`retiredReason` (fato datado de saída do parque), `deletedAt` (lixeira).
**Descartado:** um `archived Boolean` no `Asset`.
**Por quê:** o booleano seria segunda fonte de verdade ao lado de `status.type` —
o erro do `assignedToId` editável (D17), uma camada acima. E as três respondem
perguntas diferentes (*pode ser entregue?*, *ainda é patrimônio?*, *existe?*):
colapsá-las obriga a inventar a resposta que falta na hora do relatório.

### D20 — "Arquivados" e "posto vago" são filtros do domínio, não `view` do `core`.

**Decidido:** `?arquivados=` e `?relatorio=` vivem em `asset-filters.helper.ts`.
**Descartado:** acrescentar `'archived'` ao `ListView` de `core/http/list-query.ts`.
**Por quê:** `trashed` é genérico — toda tabela com `deletedAt` o entende.
"Arquivado" é `status.type = ARCHIVED`, que só existe no ITAM: pôr isso no `core`
é fazer a infraestrutura conhecer negócio — o que a seta `pages → domain → core`
proíbe e o lint reprova.

### D21 — Ação em massa é tudo ou nada; entrega em massa não será (F4).

**Decidido:** `POST /api/assets/bulk` roda numa `$transaction` e falha inteira se
um id barrar, devolvendo 409 com a lista.
**Descartado:** aplicar o que der e devolver relatório por linha.
**Por quê:** edição em massa é **uma** intenção aplicada a N linhas — metade
aplicada é um estado que ninguém pediu e ninguém desfaz sem conferir os 200 um a
um. É o oposto do checkout em massa da F4, que são N entregas independentes: 7
entregues e 1 recusado é um resultado legível. A diferença não é inconsistência,
é a natureza da operação — e por isso está declarada nos dois planos.

## Riscos e armadilhas

**`@fastify/static` registrado duas vezes derruba o boot.** Já existe um root
para o front; o segundo, para `/uploads/`, precisa de `decorateReply: false` —
sem isso o Fastify lança `FST_ERR_DEC_ALREADY_PRESENT`, porque `sendFile` já foi
decorado.

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

### O que ficou para a próxima leva

**Etapa G — imagem e anexos (multipart).** `@fastify/multipart` está instalado e
nada mais foi feito: nem `Attachment`, nem `imagePath`, nem `UPLOAD_DIR`. A aba
**Arquivos** já existe na tela de detalhe, desabilitada, com o rótulo "próxima
leva" — quando a etapa entrar, é trocar o `fase` por `null` em
`detalhe/helpers/abas.helper.ts` e escrever o conteúdo. As armadilhas
continuam valendo e estão na seção "Riscos": `@fastify/static` registrado duas
vezes, o arquivo que não participa da `$transaction`, a extensão vinda do
cliente e o soft delete que não pode apagar arquivo.

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
