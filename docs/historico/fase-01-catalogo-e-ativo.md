# Plano de implementação — Fase 1: catálogo e o ativo do ITAM ✅ CONCLUÍDA

> Plano de execução da Fase 1 do [`../ROADMAP.md`](../ROADMAP.md), escrito contra o
> código real depois da Fase 0 e **verificado contra o banco, o Prisma e o
> TypeScript** antes de virar plano (ver *O que foi provado*).
> Convenções de camada: [`../referencia/arquitetura.md`](../referencia/arquitetura.md).
>
> **Auditado em 23/09/2026**, linha a linha, com as F0 e F1 na árvore de trabalho: 5 defeitos
> e 6 observações, todos corrigidos na mesma sessão. O relatório e as correções estão em
> [Auditoria das F0 e F1](#auditoria-das-f0-e-f1--23092026), no fim deste arquivo — e as
> decisões que ela mudou (o `IN_USE` do D5, o `INCLUINDO_LIXEIRA` do D8) estão escritas na
> própria decisão, não só lá.
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias

---

## De onde viemos e para onde vamos

**O que a Fase 0 fez** — nada visível na tela; tudo que sustenta o resto.

| Frente | O que ficou pronto |
|---|---|
| **Migrações** | Baseline `0_init` adotado sem resetar o banco. `_prisma_migrations` existe e `migrate status` está limpo. Receita fixada: `migrate diff` + `migrate deploy`, nunca `migrate dev` |
| **Entrada** | `zod@4` com `strictObject` em todo payload — campo desconhecido vira 422 em vez de ser ignorado. Fim do mass assignment |
| **Saída** | `select` explícito por domínio (`USER_PUBLIC_SELECT`, `INVENTORY_ITEM_SELECT`): coluna nova não vaza sozinha. Fim do `BigInt.prototype.toJSON` global |
| **Erro** | Um ponto único (`core/errors/`) traduzindo `AppError`, `ZodError`→422, P2002→409, P2003→409, P2025→404, 429. Nenhum controller tem `try/catch` |
| **Listagem** | Paginação `{ total, rows }`, ordenação por allowlist do domínio, busca `insensitive`, `/inventory/stats` fora do skip/take |
| **Lixeira** | Soft delete automático por Prisma Client Extension, que descobre os models pelo DMMF. Aba Lixeira em duas telas. `User.email` virou índice único **parcial** |
| **Histórico** | `ActivityLog` com diff em `changes`, gravado na mesma transação da operação |
| **Porta** | Rate limit (300/40/10 por min), CORS fechado, `/agent-hub` exigindo `Bearer $AGENT_TOKEN` |
| **Encanamento** | `db:seed` + `prisma/seed.ts` idempotente — **vazio**, à espera desta fase |

**O que a Fase 1 vai fazer** — o modelo de dados que o Snipe-IT chama de *Settings*.

| Entrega | Em uma frase |
|---|---|
| **7 tabelas de catálogo** | `Category`, `StatusLabel`, `Manufacturer`, `AssetModel`, `Supplier`, `Location`, `Depreciation` |
| **Um domínio `catalog`** | CRUD genérico dirigido por 7 especificações, não 7 fatias verticais duplicadas |
| **Regra de "em uso"** | `DELETE` responde 409 quando algo aponta para a linha — é o que o Snipe-IT faz |
| **Seed com conteúdo** | Os 5 status do TODO e as categorias iniciais; o encanamento da F0 finalmente roda |
| **Tela `/configuracoes`** | Uma aba por tabela, no padrão `font-mono text-xs` do `ItamPage` |
| **Hierarquia de `Location`** | `parentId` com guarda de ciclo — o banco **não** impede ciclo (provado abaixo) |
| **`Endpoint`** *(Etapa F)* | O `Asset` do lado RMM vira `Endpoint`, liberando o nome `Asset` para o ITAM |
| **`Asset` nasce inteiro** *(Etapa G)* | `inventory_items` é **apagada**; `assets` nasce na forma do Snipe-IT, com etiqueta, série, compra, garantia, EOL e todas as FKs do catálogo |

**Por que nesta ordem:** a F2 não começa sem `StatusLabel` — `Asset.statusId` aponta
para uma tabela que precisa existir antes. A F1 é pré-requisito duro, não preferência.

---

## O que move de fase, e o que não move

**A ordem `F0 → F1 → F2 → …` continua igual.** Nenhuma fase troca de lugar. O que
muda é a **fronteira entre F1 e F2**, por uma razão declarada pelo dono do projeto:
*a base de ITAM existente é descartável, e o alvo é a complexidade lógica do
Snipe-IT.* Isso reclassifica o trabalho.

**Três atributos saem da F1** — porque dependem de máquina que ainda não existe:

| Atributo | Por que não cabe na F1 | Vai para |
|---|---|---|
| `AssetModel` **imagem** | upload não existe: `@fastify/multipart` nem instalado está | **F2** |
| `AssetModel` **fieldset** | `CustomFieldset` é tabela da **F9**. FK para tabela inexistente é impossível, não adiável | **F9** |
| `GET /api/suppliers/:id/assets` | ganha sentido com o `Asset` inteiro — passa a nascer na Etapa G | **F1/G** |

O `AssetModel` **inteiro continua na F1**; o que fica para depois são duas colunas
nullable, uma migração de uma linha cada.

**O modelo do ativo entra na F1** — porque construí-lo duas vezes é exatamente o
retrabalho que se pediu para evitar:

| Vem da F2 para a Etapa G | Por quê |
|---|---|
| D1 (`InventoryItem`→`Asset`, `Asset`→`Endpoint`) e D3 (sem `quantity`) | com a tabela vazia e o código descartável, é `drop`+`create`, não migração |
| Etiqueta automática, número de série, índices únicos parciais | são **colunas da tabela**: nascem com ela ou exigem migração + backfill depois |
| Dados de compra, garantia, EOL, `statusId` obrigatório | idem |
| Soft delete e lixeira do ativo | herda a F0 de graça |

**O que fica na F2**, porque é funcionalidade sobre o modelo, não o modelo:
tela de detalhe com abas, `AssetLog`, ações em massa, clonar, imagens, anexos,
arquivamento e descomissionamento.

**Volta para a F1:** `AppSetting`. Eu a tinha empurrado para a F2, mas o
`assetTagNext` mora nela e a etiqueta automática agora nasce aqui. Com isso a nota
da F0 — *"semear `AppSetting`, `StatusLabel`, `Category` e `AssetModel` na F1"* —
volta a estar correta como escrita.

---

## Estado na abertura — verificado em 22/09/2026

| O quê | Estado |
|---|---|
| Migrations | 3 pastas, todas aplicadas, `migrate status` limpo. A tentativa que falhou na F0 está marcada `rolled_back_at`, então **`migrate deploy` não vai travar** |
| Linhas no banco | `users` 0 · `inventory_items` 0 · `assets` 0 · `telemetries` 0 · `activity_logs` 0 |
| `InventoryItem.category` | `String` livre |
| `InventoryItem.status` | `String` livre, com a lista de valores duplicada em **dois** arquivos: `server/domain/inventory/schemas/inventory.schema.ts` e `src/pages/gestao-itam/helpers/status-label.helper.ts` |
| `prisma/seed.ts` | `seeders: Seeder[] = []` — encanamento pronto, vazio |
| `src/pages/configuracoes/` | não existe: nem pasta, nem rota em `App.tsx`, nem item em `AppHeader` |

**A janela de D6 continua aberta.** Zero linha em toda tabela: qualquer decisão
estrutural desta fase custa um `migrate diff` — inclusive tornar `categoryId` e
`statusId` obrigatórios, que com inventário preenchido exigiria backfill.

---

## O que foi provado antes de escrever este plano

Cada linha foi executada contra o banco real (em transação revertida), contra o
Prisma 5.22 e contra o `tsc` com as flags do `tsconfig.server.json`.

| # | Hipótese | Resultado |
|---|---|---|
| 1 | O CRUD genérico de 7 tabelas compila em `strict` | ✅ **Compila limpo.** Protótipo com 3 specs de formas diferentes (enum, duas FKs, Decimal) passando pelo mesmo `listCatalog`/`deleteCatalog`, sob `strict` + `verbatimModuleSyntax` + `erasableSyntaxOnly` + `noUnusedLocals`. Exit 0 |
| 2 | `countUsages` mantém tipagem real | ✅ `client.assetModel.count({ where: { categoryId: id } })` é **totalmente tipado**, sem cast. O cast fica só no delegate genérico — a parte com regra continua verificada pelo compilador |
| 3 | `enum` do Prisma vira tipo do Postgres | ✅ `CREATE TYPE "CategoryType" AS ENUM ('ASSET', …)`. Mas ⚠️ **enum de uma linha não compila**: cada valor precisa da própria linha, senão `P1012: This line is not an enum value definition` |
| 4 | `@@unique([manufacturerId, modelNumber])` aceita vários modelos sem número | ✅ **Dois inseridos, zero erro.** Postgres trata `NULL` como distinto — não precisa de índice parcial |
| 5 | `onDelete: Restrict` barra o delete de um fabricante em uso | ✅ `violates foreign key constraint` → Prisma **P2003** → o `error-handler` **já** responde 409 "Registro está em uso por outro cadastro". Rede de segurança pronta mesmo se o `countUsages` for esquecido |
| 6 | O banco impede ciclo em `Location` | ❌ **Não impede.** `Matriz → Andar 2 → Matriz` foi aceito sem reclamar. A guarda em código é **obrigatória**, não zelo |
| 7 | `Decimal` chega inteiro ao frontend | ⚠️ **Chega como STRING:** `{"floorValue":"1234.5"}` — e o zero à direita some. É a armadilha do `BigInt` da F0 em outra roupa |
| 8 | `z.enum` aceita o enum gerado pelo Prisma | ✅ `z.enum($Enums.CategoryType, 'mensagem')` valida e recusa com a nossa mensagem |
| 9 | Prisma aceita string em campo `Decimal` | ✅ `floorValue: '1234.50'` compila e não passa por float. `Decimal('0.1').plus('0.2') = 0.3` exato, contra `0.1+0.2 = 0.30000000000000004` em float |
| 10 | A extension de soft delete alcança relação aninhada | ❌ **Não alcança** — base do D8, detalhado abaixo |
| 11 | O compilador pega o rename `Asset`→`Endpoint` nos 6 pontos do RMM | ✅ **11 erros, nenhum passa calado.** `'hwid' does not exist in AssetWhereUniqueInput`, `'status' … Did you mean 'statusId'?`, `'lastSeen' does not exist`, `'include' does not exist`. O desastre do `touchAsset` não acontece em silêncio — ver **D13** |

Os artefatos do teste ficaram fora do repositório e o banco está intacto
(`users`/`inventory_items`/`activity_logs` seguem em 0).

---

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/catalogo-e-ativo.md`](../decisoes/catalogo-e-ativo.md) — **D8–D13**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Armadilhas — todas verificadas

**`Decimal` chega ao frontend como string, e perde o zero à direita.** Prova nº 7:
`JSON.stringify({ floorValue: Decimal('1234.50') })` → `{"floorValue":"1234.5"}`.
É a armadilha do `BigInt` da F0 em outra roupa. Consequências, nesta ordem:
- o tipo em `src/domain/shared/` declara `floorValue: string`, não `number`;
- formatar é trabalho da tela (`Intl.NumberFormat`), nunca do banco;
- **gravar manda string**: `floorValue: '1234.50'` direto ao Prisma (prova nº 9).
  Passar por `z.coerce.number()` converte para float e reintroduz o erro de
  centavo que o `Decimal` existe para evitar. Validar com regex
  `/^\d+(\.\d{1,2})?$/` e repassar a string.

**O banco aceita ciclo em `Location`.** Prova nº 6: `Matriz → Andar 2 → Matriz`
entrou sem erro. Qualquer renderização de árvore trava em laço infinito. O
`beforeWrite` sobe a cadeia de pais antes de gravar e responde 409 — incluindo o
caso trivial `parentId === id`, com teto de profundidade para a subida não virar
N consultas.

**Enum do Prisma não aceita uma linha.** Prova nº 3: `enum X { A B C }` falha com
`P1012`. Um valor por linha.

**Cor do banco não vira classe do Tailwind.** `statusColor()` funciona hoje porque
devolve classe **fixa**. O Tailwind v4 gera o CSS a partir das cores declaradas em
`@theme` no `src/index.css`, lidas em tempo de build: `` className={`text-[${cor}]`} ``
com string de runtime não gera regra nenhuma e o elemento sai sem cor. Cor de
`StatusLabel` vai em `style={{ color }}` / `style={{ borderColor }}`.

**Trocar o `type` de uma categoria em uso quebra semântica.** Uma categoria ASSET
virando LICENSE leva junto tudo que aponta para ela. Mesma guarda do delete:
`countUsages > 0` → 409. Inerte na F1, ativa na Etapa F.

**Revisar o SQL do `migrate diff` antes de aplicar.** Na F0 ele emitiu um
`DROP INDEX` que o Postgres recusa (2BP01). O SQL desta fase já foi gerado e
conferido: 3 `CREATE TYPE`, 7 tabelas, 7 índices únicos, 4 FKs com o `ON DELETE`
certo.

**Ordem do seed importa.** `Manufacturer` e `Category` antes de `AssetModel`. O
`seeders: Seeder[]` roda em sequência — a ordem do array é a garantia.

---

# Etapa A — Schema e migração · **M** ✅

Sete models, três enums, uma migração. O schema abaixo já foi validado e o SQL
já foi gerado e lido.

| Model | Campos | Unicidade |
|---|---|---|
| `Category` | `name`, `type CategoryType`, `color?`, `requireAcceptance @default(false)`, `eulaText?`, `checkinEmail @default(false)` | `@@unique([name, type])` |
| `StatusLabel` | `name`, `type StatusLabelType`, `color?`, `showInNav @default(false)`, `notes?` | `name @unique` |
| `Manufacturer` | `name`, `url?`, `supportPhone?`, `supportEmail?` | `name @unique` |
| `AssetModel` | `name`, `modelNumber?`, `manufacturerId`, `categoryId`, `eolMonths?`, `notes?` | `@@unique([manufacturerId, modelNumber])` |
| `Supplier` | `name`, `contactName?`, `phone?`, `email?`, `url?`, `address?`, `city?`, `state?`, `zip?`, `notes?` | `name @unique` |
| `Location` | `name`, `parentId? (self)`, `address?`, `city?`, `state?`, `zip?`, `managerId? → User`, `phone?`, `notes?` | `name @unique` |
| `Depreciation` | `name`, `months Int`, `floorValue Decimal @db.Decimal(12,2)`, `floorType DepreciationFloorType` | `name @unique` |

Todos com `createdAt`/`updatedAt` e **sem** `deletedAt` (D8) — a extension descobre
a lixeira pela presença da coluna, então a ausência é o opt-out.

`onDelete`: `Restrict` em `AssetModel.manufacturerId`, `AssetModel.categoryId` e
`Location.parentId` (prova nº 5 — é a rede embaixo do 409). `SetNull` em
`Location.managerId`: desligar o gestor não pode derrubar a filial.

```bash
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_catalogo"
mkdir -p "$PASTA"
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$PASTA/migration.sql"
# revisar o SQL ANTES de aplicar
npm run db:migrate && npm run db:generate
```

**Verificação:** `migrate status` limpo e `\d categories` mostrando `CategoryType`
na coluna `type`.

---

# Etapa B — O domínio `catalog` · **M** ✅

O CRUD genérico e as sete specs (D9). Rotas registradas em laço sobre as specs:

```
GET    /api/<slug>            listagem paginada, busca, ordenação
GET    /api/<slug>/options    id+nome para <select>            (D11)
POST   /api/<slug>            201
PUT    /api/<slug>/:id
DELETE /api/<slug>/:id        409 se countUsages > 0           (D8)
```

Sem `POST /:id/restore`: não há lixeira aqui.

Cada escrita grava `ActivityLog` **na mesma transação**, com `entityType` da spec
— padrão já estabelecido em `create-inventory-item.usecase.ts`. O `buildChanges`
de `shared/diff.helper.ts` recebe `spec.audited`.

O `parseListQuery` recebe `sortable` e `defaultSort` da spec: a allowlist continua
declarada pelo domínio, como manda `core/http/list-query.ts`.

Registrar em `server.ts`: `await CatalogMaestro.setupRoutes(server);`

**Verificação por `curl`**, numa entidade de cada forma — `categories` (enum),
`asset-models` (duas FKs), `depreciations` (Decimal): criar, listar, buscar,
ordenar por coluna fora da allowlist (espera 422), mandar campo desconhecido
(espera 422), apagar em uso (espera 409), apagar livre (espera 200), conferir a
linha em `activity_logs`, e conferir que `floorValue` volta como **string**.

---

# Etapa C — Seed do catálogo · **P** ✅

O encanamento da F0 ganha conteúdo. Só `upsert` — possível porque o D8 manteve
`@unique` de verdade.

**`StatusLabel`** — os cinco nomeados no TODO:

| Nome | `type` | Cor |
|---|---|---|
| Pronto p/ Uso | `DEPLOYABLE` | `#22c55e` |
| Em Uso | `DEPLOYABLE` | `#3b82f6` |
| Aguardando | `PENDING` | `#f59e0b` |
| Manutenção | `UNDEPLOYABLE` | `#ef4444` |
| Arquivado | `ARCHIVED` | `#888888` |

As cores saem dos tokens do `src/index.css`, para o catálogo nascer coerente com
o painel.

**`Category`** — mínimo para a Etapa F não abrir com `<select>` vazio: Notebook,
Desktop, Monitor, Periférico (todas `ASSET`) e Licença (`LICENSE`).

As outras cinco tabelas **não** são semeadas: fabricante, fornecedor, localização,
modelo e depreciação são dado da empresa, não do software. Semear "Dell" adivinha
o cliente.

`AppSetting` **não** entra aqui. A F0 a citou junto das demais, mas o único campo
com dono definido é o `assetTagNext`, que nasce com a etiqueta automática na F2, e
a tela do singleton é F10. Criar a tabela agora é criar registro que ninguém lê.

**Verificação:** `npm run db:seed` duas vezes; a contagem de `status_labels` e
`categories` idêntica nas duas.

---

# Etapa D — Telas de administração · **M** ✅

`/configuracoes`, uma aba por tabela, no padrão `font-mono text-xs` do `ItamPage`.

```
src/domain/catalog/catalog.queries.ts     # hooks genéricos, parametrizados pelo slug
src/pages/configuracoes/
├── index.tsx                             # tira de abas + tabela + modal
├── hooks/useCatalog.ts                   # página, busca, modal, submit, delete
├── components/CatalogTable.tsx           # colunas vindas da spec
├── components/CatalogFormModal.tsx       # campos vindos da spec
└── specs/*.spec.ts                       # 7 specs de INTERFACE
```

A spec do frontend é irmã da do backend, não a mesma: aqui ela diz *rótulo em
português*, *tipo de campo* (`text`/`textarea`/`select`/`color`/`number`/`checkbox`)
e *quais colunas a tabela mostra*. Fica em `pages/` porque é decisão de tela — e
por isso não importa nada de `core/api` (o lint recusa).

Reaproveita `ListToolbar` sem a aba Lixeira: a prop `view` é opcional e a aba
simplesmente não aparece (D8).

Ainda: rota `/configuracoes` em `App.tsx` e item em `AppHeader` (`Settings` do
`lucide-react`).

**Verificação:** criar, editar e apagar em cada uma das sete abas; apagar um
`Manufacturer` que tem `AssetModel` (espera 409 com a contagem).

---

# Etapa E — Hierarquia de `Location` · **M** ✅

A única entidade que não é CRUD plano — e a prova nº 6 diz por quê.

- `parentId` alimentado pelo `/options` (D11), com a própria linha e seus
  descendentes fora da lista: escolher a si mesma como pai não pode nem ser
  oferecido.
- Guarda de ciclo no `beforeWrite`: sobe a cadeia de pais; reencontrou o id, 409.
- A tabela mostra a localização **pai imediata** (coluna "Dentro de"), não o
  caminho inteiro. Mudei de ideia durante a execução, por dois motivos: é o que a
  lista de Locations do Snipe-IT mostra, e `locations.name` é único no banco — o
  nome sozinho já identifica a linha, então o caminho completo não desfaz
  ambiguidade nenhuma. Montá-lo exigiria mandar a árvore inteira ao cliente e
  quebrar a listagem genérica do catálogo por causa de uma tabela só.
- `GET /api/locations/tree` fica para quando existir uma visão de árvore de
  verdade, não para uma coluna de tabela.

**Verificação:** A→B→C; pôr C como pai de A (espera 409); A como pai de A (espera
409); apagar B com filho (espera 409).

---

# Etapa F — `Asset` (RMM) vira `Endpoint` · **M** ✅

O único rename de verdade da fase: esse model tem dado real chegando do agente C#
e não é descartável.

- `model Asset` → `model Endpoint`, `@@map("assets")` → `@@map("endpoints")`
- `Telemetry.assetId` → `endpointId`
- `server/domain/asset/` → `server/domain/endpoint/`; `src/domain/asset/` e
  `src/pages/telemetria/` acompanham
- Rotas `/api/assets` → `/api/endpoints` (clareza, não colisão — o TODO já testou
  que `find-my-way` conviveria com as duas)
- 21 arquivos / 946 linhas tocados, quase tudo mecânico

**Etapa isolada, commit próprio, e antes da Etapa G de propósito:** enquanto
`prisma.asset` não existir, todo ponto que ficou para trás é erro de compilação
duro. Fundida com a G, o nome `asset` volta a existir com outro significado no
mesmo commit e a rede de segurança do D13 depende de coincidência de nomes.

**Verificação — o caminho crítico, explicitamente:** subir o servidor com um
agente conectado, confirmar que `lastSeen` avança a cada mensagem, esperar o job
de zumbis rodar e confirmar que a máquina **continua ONLINE**. É o teste que o
TODO pede em letras maiúsculas.

---

# Etapa G — O `Asset` do ITAM nasce inteiro · **G** ✅

A tabela `inventory_items` é apagada e `assets` nasce na forma do Snipe-IT (D12).
Os 16 arquivos do ITAM atual saem junto.

**Colunas** — todas de uma vez, porque coluna que nasce com a tabela custa zero:

| Grupo | Campos |
|---|---|
| Identidade | `assetTag` (único), `serial?` (único), `name?`, `notes?`, `byod`, `requestable` |
| Catálogo | `statusId` **obrigatório**, `categoryId`, `modelId?`, `supplierId?`, `locationId?` |
| Compra | `orderNumber?`, `purchaseDate?`, `purchaseCost Decimal @db.Decimal(12,2)?` |
| Prazos | `warrantyMonths?`, `warrantyExpiresAt?`, `eolMonths?`, `eolDate?`, `eolExplicit` |
| Posse | `assignedToId?` — a coluna que existe desde sempre e **nenhuma rota nunca escreveu**; continua sem escrita até a F4 |
| Ciclo | `deletedAt` (lixeira herdada da F0) |

**Sem `quantity`** (D3): quantidade é de `Accessory`/`Consumable`/`Component`, na F5.

**Regras que não são coluna:**

- **Unicidade de `assetTag` e `serial` por índice PARCIAL** (`WHERE deleted_at IS NULL`),
  escrito à mão na migration — é o `unique_undeleted` do Snipe-IT, e o mesmo
  motivo do `User.email` na F0: com `@unique` comum, um ativo na lixeira travaria
  o recadastro da mesma etiqueta para sempre. Aqui o custo do índice parcial se
  justifica (ao contrário do catálogo, D8), porque o ativo **precisa** de lixeira.
- **`nextAssetTag()` incrementa PRIMEIRO** e usa o valor devolvido:
  `update({ data: { assetTagNext: { increment: 1 } } })`. Ler-e-depois-incrementar
  colide em READ COMMITTED. `GET /api/settings/next-asset-tag` é *peek* puro e
  nunca incrementa — senão abrir e cancelar o modal fura a sequência.
- **`warrantyExpiresAt` e `eolDate` são calculadas no save**, a partir dos meses.
  `eolExplicit` permite sobrescrever à mão.
- **`purchaseCost` é `Decimal` e sai como string** (prova nº 7): o tipo no
  frontend é `string`, grava-se string, e formatar é da tela.
- **`GET /api/assets/by-serial/:serial`** — a busca que o leitor de código de
  barras vai usar na F10.

**`AppSetting`** entra aqui: singleton com `assetTagPrefix`, `assetTagZerofill` e
`assetTagNext`, semeado junto.

**Frontend:** `src/pages/gestao-itam/` é reescrito contra o modelo real — os
`<select>` vêm do `/options` de cada catálogo (D11), a cor do status vem do
`StatusLabel` por `style`, e morrem `INVENTORY_STATUSES` e
`status-label.helper.ts`.

**Verificação:** cadastrar sem etiqueta (gera sozinha, em sequência); abrir e
cancelar o modal duas vezes e confirmar que a sequência **não** andou; duplicar
série (espera 409); apagar e recadastrar a mesma etiqueta (tem que deixar —
é o índice parcial); apagar a categoria do ativo (espera 409).

---

## Ordem de commits

Um commit por etapa. A Etapa D muda contrato e tela juntos, de propósito — mesmo
motivo da Etapa C da F0.

```
A: feat(db): tabelas de catálogo do ITAM (7 models, 3 enums)
B: feat(api): domínio catalog — CRUD genérico por especificação
C: feat(db): seed de StatusLabel e Category
D: feat(web): tela de configurações com uma aba por tabela de catálogo
E: feat(catalog): hierarquia de Location com guarda de ciclo
F: refactor(rmm): Asset vira Endpoint e libera o nome para o ITAM
G: feat(itam): Asset nasce inteiro; inventory_items é removida
```

A ordem **F antes de G** não é estética: é o que mantém a rede de segurança do
D13 (ver Etapa F).

O lint tem que passar em cada um. Não há testes no projeto: a verificação é
manual, por `curl` e pela tela, como descrito em cada etapa.

---

## O que muda no `../ROADMAP.md`

1. Marcar os itens da F1 conforme as etapas fecham.
2. Mover **imagem** do `AssetModel` para a F2 e **fieldset** para a F9 — dois
   atributos, não o model, e **nenhuma fase troca de lugar**.
3. Registrar **D8**–**D13** na seção de decisões, e reescrever o **D1**: não é
   rename do `InventoryItem`, é `drop` + `create` (D12).
4. Mover da F2 para a F1: o D1/D3, a etiqueta automática, o número de série, os
   índices parciais, os dados de compra, garantia, EOL e `statusId` obrigatório.
   A F2 fica com tela de detalhe, `AssetLog`, ações em massa, clonar, imagens,
   anexos, arquivamento e descomissionamento.
5. Anotar na F0 que `AppSetting` **voltou** para a F1 (`assetTagNext`), e que a
   tela do singleton continua na F10.
6. Acrescentar ao D1 a regra do **D13**: `Asset` nunca tem `status`, `lastSeen`
   nem `hwid` — relevante quando a F7 for registrar o último contato do agente.

---

# Auditoria das F0 e F1 — 23/09/2026

> Revisão linha a linha do código entregue nas Fases 0 e 1, com a suíte de testes
> executada contra o servidor de pé, sobre a árvore de trabalho (108 arquivos alterados,
> nada commitado ainda).
>
> **5 defeitos confirmados**, 6 observações. Nenhum deles é estrutural: o modelo de dados,
> as migrações e a arquitetura de camadas passaram inteiros.
>
> O defeito 2 foi apontado pelo dono do projeto durante a auditoria, não pela suíte — e é o
> mais interessante dos cinco, porque nenhum teste mecânico o pegaria: o código faz
> exatamente o que foi escrito, e o que foi escrito é que está errado.
>
> **Os 5 defeitos e as observações 6, 7 e 8 estão corrigidos** — ver *Correções aplicadas*.
> A lista de defeitos fica como está: é o registro do que foi encontrado, não uma lista de
> pendências. Os dois itens que são da F0 (a trilha do `.env` e os três comentários órfãos
> do rename) estão anotados no [`fase-00-base-tecnica.md`](fase-00-base-tecnica.md).

## Como foi verificado

Nada aqui é leitura de código sozinha. Cada defeito tem reprodução executada.

| Verificação | Resultado |
|---|---|
| `tsc -b` (app + server + node, `strict`) | ✅ exit 0 |
| `eslint .` (inclui as regras de camada) | ✅ exit 0 |
| `npm run build` (produção) | ✅ 1852 módulos, 374 kB |
| Cadeia de migrations em **banco vazio** (`sentinel_audit1`) | ✅ 6 migrations, exit 0 |
| Drift `banco-do-zero` × `schema.prisma` | ✅ *empty migration* |
| Drift `banco de dev` × `schema.prisma` | ✅ *empty migration* |
| `prisma migrate status` | ✅ *up to date* |
| `db:seed` em banco novo | ✅ 3 seeders |
| Índices parciais criados de fato | ✅ os 3 (`assets_assetTag`, `assets_serial`, `users_email`) |
| **Suíte de API: 120 asserções** | **114 passaram, 6 falharam → 4 defeitos** |

A suíte rodou contra um banco descartável (`sentinel_audit1`), num servidor na porta 3999.
**O banco `sentineldb` não foi tocado.**

## O que está certo — e merece ser dito

Testado adversarialmente nas partes que costumam quebrar. Estas aguentaram:

- **A etiqueta automática sob concorrência.** 12 `POST /assets` simultâneos: 12× 201,
  etiquetas `ATV-00012`…`ATV-00023`, zero duplicata no banco. O `increment` atômico faz o
  que o comentário promete.
- **O contador não fura.** Duas criações que falharam (FK inválida, custo inválido)
  deixaram `assetTagNext` no mesmo número. A transação devolve o número.
- **O *peek* não consome.** 3 chamadas seguidas a `/settings/next-asset-tag` devolveram
  `ATV-00001` nas três.
- **A aritmética de datas.** `31/01 + 1 mês = 28/02`; em ano bissexto, `29/02`. Sem
  transbordo para março. Passou nos 5 casos.
- **O recálculo das datas na edição.** Mudar só a data de compra move a garantia; mudar só
  o nome **não** apaga a garantia (era o erro mais provável ali). `eolExplicit` congela e
  descongela o cálculo corretamente.
- **A guarda de ciclo de `Location`.** Pai = ela mesma, pai = filha, pai = neta: 409 nos
  três. Desvincular e revincular continua funcionando.
- **Os índices únicos parciais.** Etiqueta de ativo na lixeira é reaproveitável; restaurar
  o ativo original então dá 409 com a mensagem certa; liberada a etiqueta, restaura. O
  mesmo para `users.email`.
- **O rename `Asset`→`Endpoint` (D1).** Zero `prisma.asset` fora do domínio de ativos, zero
  `prisma.endpoint` fora do de endpoints, zero referência órfã a `inventory`/`folder`. O
  `touchEndpoint` — o caminho que derrubaria a frota inteira — aponta para o model certo.
- **As migrações escritas à mão.** O `DO $$ ... pg_constraint` que cobre banco nascido de
  `db push` **e** banco nascido do `0_init` resolve de verdade o problema que o comentário
  descreve: a cadeia aplica do zero.
- **A allowlist de ordenação, o teto de `perPage`, o `strictObject`.** `?sort=` fora da
  lista, `?perPage=999999`, `?ordr=` (typo), campo desconhecido no corpo, `?view=trashed`
  em domínio sem lixeira: 422 em todos.

## Os cinco defeitos

### 🔴 1 — A etiqueta automática era inalcançável pela tela

**O mais grave, e o mais fácil de corrigir.** A funcionalidade-título da Etapa G não
funcionava pelo formulário. Funcionava por `curl`, e é por isso que passou.

`AssetFormModal` monta o estado inicial com string vazia em todo campo de texto
(`src/pages/gestao-itam/components/AssetFormModal.tsx:15`):

```ts
assetTag: asset?.assetTag ?? '',
```

Nada limpava isso no caminho — `useAssets.handleSubmit` → `useCreateAsset` →
`apiClient.post` mandam o objeto do formulário como está. O servidor recebia
`assetTag: ""`, e o schema (`server/domain/asset/schemas/asset.schema.ts:43`) era:

```ts
assetTag: nomeObrigatorio('etiqueta').optional(),
```

`.optional()` só deixa passar `undefined`. `""` **não é** `undefined`: entra no
`z.string().trim().min(1)` e falha.

**Reprodução** — o corpo literal que o formulário envia ao clicar em "Salvar Ativo" sem
digitar etiqueta:

```
POST /api/assets  {"assetTag":"","serial":"","name":"", ...}
→ 422 {"error":"etiqueta não pode ser vazio","fields":{"assetTag":"etiqueta não pode ser vazio"}}
```

Isolando campo a campo, `assetTag` era o **único** que quebrava — `serial`, `name`,
`orderNumber`, `purchaseDate`, `purchaseCost`, `warrantyMonths`, `eolMonths`, `eolDate`,
`locationId`, `supplierId`, `assignedToId` e `notes` todos aceitam `""` e viram `null`. O
mesmo corpo **sem a chave** `assetTag` respondia 201 e gerava `ATV-00037`.

Os 3 ativos do banco de dev (`ATV-00001`…`00003`) nasceram com 15 ms de diferença entre si
— foram criados por script, não por formulário. Daí a funcionalidade parecer verificada.

**Correção** — no schema, seguindo a convenção que `fields.schema.ts` já usa para todo o
resto (`''` vira o valor neutro). Aqui o neutro é `undefined`, porque é ele que significa
"gere a etiqueta":

```ts
// server/domain/asset/schemas/asset.schema.ts
// '' do formulário significa "gere automaticamente" — `.optional()` sozinho
// só aceita a chave ausente, e o formulário sempre manda a chave.
const etiquetaOpcional = z
  .string()
  .trim()
  .max(200, 'etiqueta: máximo de 200 caracteres')
  .optional()
  .transform((valor) => valor || undefined);
```

> Corrigir no formulário (remover as chaves vazias antes de enviar) também resolveria, mas
> deixa a API com uma armadilha para o próximo cliente — e a convenção do projeto já é o
> servidor normalizar.

### 🟠 2 — "Em Uso" estava classificado como `DEPLOYABLE` — e `DEPLOYABLE` significa "pode ser entregue"

Um ativo que está com alguém **não** está disponível para ser entregue. O seed dizia que
estava. A contradição aparecia em três arquivos ao mesmo tempo:

```ts
// prisma/seed.ts:27  — a regra
// O `type` NÃO é enfeite: é ele que decide se o ativo pode ser emprestado.
// Só `DEPLOYABLE` libera o checkout (F4).

// prisma/seed.ts:46  — a violação da regra
{ name: 'Em Uso', type: 'DEPLOYABLE', color: '#3b82f6', showInNav: true,
  notes: 'Entregue a um colaborador ou instalado em uma localização.' },

// src/pages/configuracoes/specs/catalog-ui.types.ts:104  — o que a tela mostra
{ value: 'DEPLOYABLE', label: 'Disponível',
  ajuda: 'Pode ser entregue a alguém. É o único tipo que libera a entrega.' },
```

Resultado na tela de Configurações › Status: uma linha escrita **"Em Uso | Disponível"**,
com o texto de ajuda *"Pode ser entregue a alguém"* logo abaixo. E os 3 ativos cadastrados
estavam todos nesse status — "em uso" e classificados como "disponíveis para entrega".

**Por que passou.** O próprio seed explicava o raciocínio — e é nele que estava o erro:

```ts
// No Snipe-IT "Deployed" é derivado do checkout, não um rótulo. Aqui ele
// existe como status explícito porque o checkout só chega na F4 — até lá é
// como se marca à mão o que está com alguém.
```

A primeira frase está certa: no Snipe-IT *Deployed* **não é um status label**, é estado
derivado de `assigned_to`. A segunda é a que não se sustenta: o `Asset.assignedToId` **já
existia**, já estava no `ASSET_SELECT`, já era gravável pelo schema, já era campo do
formulário e já era coluna da tabela. Quem está com o equipamento era registrável sem F4 e
sem rótulo.

**O que quebrava.** Nada ainda — nenhuma consulta filtrava por `DEPLOYABLE` (verificado: as
únicas ocorrências eram o seed, a allowlist do `/options` e o rótulo da tela). O defeito era
latente e detonaria na F4, em dois pontos que o `../ROADMAP.md` já listava: *"duplo
checkout"* (a regra "só `DEPLOYABLE` libera o checkout" deixaria passar ativo que já está
com outra pessoa) e *"status derivado do checkout"* (o status deixaria de ser derivável,
porque passaria a existir um rótulo competindo com o `Assignment`). E um relatório trivial
de "quantos ativos estão disponíveis?" já responderia errado.

**O custo sobe com o tempo.** É o argumento da *"janela é agora"*: com 3 ativos, corrigir é
um `UPDATE`. Com o inventário cadastrado, é reclassificar à mão tudo que foi marcado "Em
Uso" e decidir, caso a caso, se aquilo estava com alguém ou só mal rotulado.

**Correção — `IN_USE` vira o quinto tipo do enum.** Duas correções anteriores foram
descartadas pelo dono do projeto, e as duas estavam erradas pelo mesmo motivo: tratavam "em
uso" como algo que o sistema deduz, em vez de algo que o usuário declara.

| Tentativa | Por que não |
|---|---|
| Remover o rótulo e derivar de `assignedToId` | `statusId` é **obrigatório** no cadastro, e a carga inicial é feita de equipamento que já está com gente — o formulário fica sem como dizer isso. E existe uso **sem responsável**: o monitor parafusado na sala de reunião ficaria marcado como disponível |
| Manter o rótulo, tipado `PENDING` | Empacota "está com um colaborador" junto com "está na assistência". Um gera valor, o outro custa dinheiro — é a distinção mais cara do inventário, e ela some. "Quantos ativos estão em uso?", a métrica principal do módulo, fica inexpressável pelo tipo |

```prisma
enum StatusLabelType {
  DEPLOYABLE    // no estoque, pode ser entregue — o único que libera o checkout
  IN_USE        // com alguém ou instalado em algum lugar
  PENDING       // fora do estoque por impedimento, e volta (reparo, trânsito)
  ARCHIVED      // saiu da operação
  UNDEPLOYABLE  // ainda é seu, não serve, não volta
}
```

Com isso cada rótulo do seed tem um lugar sem ambiguidade, e `PENDING` volta a significar
uma coisa só:

| Tipo | Rótulos |
|---|---|
| `DEPLOYABLE` | Pronto p/ Uso |
| `IN_USE` | Em Uso |
| `PENDING` | Aguardando, Em Diagnóstico, Manutenção |
| `UNDEPLOYABLE` | Danificado, Perdido / Roubado |
| `ARCHIVED` | Arquivado |

**A migration precisou de correção à mão.** O `migrate diff` gerou
`ALTER TYPE ... ADD VALUE 'IN_USE'` **sem posição**, o que acrescenta o valor no fim do enum
— enquanto o `schema.prisma` o declara em segundo. O Postgres usa a ordem dos valores em
`ORDER BY` e a listagem de status é ordenável por `type`: sem o `AFTER`, banco e schema
divergiriam para sempre.

```sql
ALTER TYPE "StatusLabelType" ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE';
```

Verificado: a cadeia aplica do zero, a ordem no banco é
`DEPLOYABLE, IN_USE, PENDING, ARCHIVED, UNDEPLOYABLE`, e o `migrate diff` contra o schema
volta vazio. No banco de dev a mudança é aditiva — nenhuma linha muda de valor sozinha:
`npm run db:migrate` e um `UPDATE status_labels SET type = 'IN_USE' WHERE name = 'Em Uso'`
fecham o assunto, e **nenhum ativo muda de status**.

### 🟠 3 — Apagar fornecedor ou localização zerava o vínculo de ativos na lixeira

**Perda de dado silenciosa.** O `countUsages` de cada spec contava pelo cliente Prisma **com
escopo de lixeira**, então ativo apagado era invisível para ele:

```ts
// server/domain/catalog/specs/supplier.spec.ts:24
countUsages: (client, id) => client.asset.count({ where: { supplierId: id } }),
```

A extension acrescenta `deletedAt: null` a todo `count` de topo. Com o único ativo que
referencia o fornecedor na lixeira, `countUsages` devolvia **0**, o `deleteCatalog` seguia
em frente, e a FK `onDelete: SetNull` limpava a coluna. Restaurar o ativo depois trazia de
volta um registro **sem fornecedor e sem localização**, sem nenhum erro em lugar nenhum.

```
ativo criado com supplierId + locationId
DELETE /api/suppliers/<id>  com o ativo VIVO      → 409 "fornecedor em uso por 1 registro"  ✅
DELETE /api/assets/<id>                            (vai para a lixeira)
DELETE /api/suppliers/<id>  com o ativo na LIXEIRA → 200 {"success":true}   ❌
supplierId na linha: NULL                          ← apagado em silêncio
```

Com FK `Restrict` (`StatusLabel`, `AssetModel`, `Manufacturer`, `Category`) o banco segura —
a rede de segurança do D8 funciona —, mas aí o usuário recebe **"Registro está em uso por
outro cadastro"** (P2003 genérico) em vez da mensagem com a contagem. É o mesmo defeito, com
sintoma diferente conforme o `onDelete`.

**Correção** — o `countUsages` precisa contar vivos **e** lixeira. A extension já tem o
escape hatch: ela sai do caminho quando a chave `deletedAt` está presente no `where`,
**inclusive com `undefined`** (verificado: `count({ where: { deletedAt: undefined } })`
devolveu 39 contra 36 do `count({})`). Como isso é sutil demais para ficar implícito em sete
specs, ganhou nome:

```ts
// server/core/database/soft-delete.extension.ts
/**
 * Espalhe no `where` para a consulta enxergar TAMBÉM a lixeira.
 * A extension sai do caminho pela PRESENÇA da chave `deletedAt` — e a chave
 * existe mesmo valendo `undefined`, que é o que faz isto não virar filtro.
 */
export const INCLUINDO_LIXEIRA = { deletedAt: undefined } as const;
```

Aplicado nas **cinco** specs que contam ativos: `supplier`, `location`, `status-label`,
`asset-model` e `category`. É o outro lado do D8, e está escrito lá.

### 🟡 4 — Coluna `Decimal` marcava "mudança" a cada edição

`buildChanges` (`server/domain/shared/diff.helper.ts:35`) tratava `Date` como caso especial,
mas não `Decimal`:

```ts
const iguais =
  valorAntigo instanceof Date && valorNovo instanceof Date
    ? valorAntigo.getTime() === valorNovo.getTime()
    : valorAntigo === valorNovo;
```

`Prisma.Decimal` é objeto: duas instâncias do mesmo valor nunca são `===`. Então
`purchaseCost` e `floorValue` entravam no diff **sempre**, e como `updateCatalog`/`updateAsset`
só gravam o log quando `Object.keys(changes).length > 0`, uma edição que não mudou nada mesmo
assim escrevia uma linha no `ActivityLog`.

```
ativo com purchaseCost = 1234.56
PUT {"notes":"nota um"}  → log: {"notes":{...}, "purchaseCost":{"de":"1234.56","para":"1234.56"}}
PUT {"notes":"nota um"}  → log: {"purchaseCost":{"de":"1234.56","para":"1234.56"}}   ← ruído puro
```

Controle: o mesmo teste num ativo **sem** `purchaseCost` gerava 1 log para 2 PUTs, que é o
correto. Na base de teste, 2 dos 16 logs de UPDATE eram 100% ruído. O impacto imediato era
histórico poluído; o problema real era a F2, que monta a aba "Histórico" em cima dessa tabela
— e mostraria "valor de compra alterado de R$ 1.234,56 para R$ 1.234,56".

**Correção** — comparar os valores **já normalizados**, o que resolve `Decimal`, mantém `Date`
resolvido e dispensa o caso especial. O `diff.helper.ts` é da F0; a armadilha só apareceu
quando a F1 trouxe as duas primeiras colunas `Decimal` do projeto (é a prova 7 de *O que foi
provado*, vista pelo outro lado).

### 🟡 5 — Trocar o modelo não re-herdava a vida útil

Na criação, `eolMonths` desce do modelo quando o ativo não define o seu
(`create-asset.usecase.ts:46`). Na edição, não:

```ts
// update-asset.usecase.ts:40 — o modelo não é consultado
const eolMonths = valorFinal(data.eolMonths, antes.eolMonths);
```

**Reprodução:** ativo criado num modelo de 48 meses (`eolMonths = 48`, `eolDate =
2030-01-01`). Trocado para um modelo de 12 meses → continuava `eolMonths = 48`, `eolDate =
2030-01-01`. Pela mesma razão, limpar o campo na edição gravava `null` em vez de voltar a
herdar do modelo.

Podia ser decisão consciente — "o que foi materializado no ativo é dele". Mas então a tela
precisaria dizer isso, porque o campo tinha o placeholder *"herda do modelo"*, que descreve
só o comportamento da criação.

## Observações

**5 — Usuário na lixeira ainda aparece como gestor e como responsável.** É o efeito
colateral que o D8 registrou (a extension não alcança leitura aninhada), mas este plano o
descrevia só para o `assignedTo` do inventário. Vale também para `Location.manager` e
`Asset.assignedTo`. Verificado: apagado o usuário "Gestor", `GET /api/locations` continuava
devolvendo `"manager":{"id":"90d981a1-…","name":"Gestor"}`. Severidade baixa e caminho já
previsto para fechar na F4; fica registrado porque a superfície cresceu.

**6 — `PERCENT` de depreciação sem teto.** `floorValue` aceitava `9999999999.99` com
`floorType: PERCENT` — 201. A validação era só de formato monetário.

**7 — O `<select>` tem teto de 200 e a saída documentada não existia na tela.**
`MAX_OPCOES = 200` em `list-catalog-options.usecase.ts` e `list-user-options.usecase.ts`; o
comentário dizia *"acima disso, o campo de busca (`?q=`) é o caminho"* — mas o
`ReferenceSelect` não tinha campo de busca, e a query nunca mandava `q`. Com mais de 200
localizações, editar uma cujo pai está fora dos 200 primeiros mostrava "— nenhum —" e salvar
**apagava o vínculo** (`parentId` e `managerId` são `uuidOpcional`, então `''` vira `null`).
Para `modelId` e `statusId` o dano era menor: 422 em vez de apagar.

**10 — Zeros à direita do `Decimal`.** `10.00` gravado volta `"10"` no JSON (`10.00` no
banco). Já documentado no schema e no tipo do frontend, e `formatarMoeda` cobre a exibição.
Só confirmando que o comportamento é o descrito.

*(As observações 8 — comentários apontando para arquivos apagados no rename — e 9 — `.env`
sem `AGENT_TOKEN` — são de arquivos da F0 e estão anotadas lá.)*

## Correções aplicadas

Feitas logo após o relatório, na mesma sessão. `tsc -b`, `eslint` e `npm run build`: exit 0
nos três, depois das mudanças.

| # | O que mudou | Arquivos |
|---|---|---|
| 1 | `etiquetaOpcional` com `preprocess`: `''` e `'   '` viram `undefined` antes do `.optional()`, e aí sim significam "gere a etiqueta" | `asset.schema.ts` |
| 2 | `IN_USE` vira o **quinto tipo** do enum, entre `DEPLOYABLE` e `PENDING`; "Em Uso" passa a ser dele; rótulos e ajudas dos cinco tipos reescritos | `schema.prisma`, migration `…_status_em_uso`, `seed.ts`, `status-label.spec.ts`, `catalog-ui.types.ts` |
| 3 | `INCLUINDO_LIXEIRA` exportado pela extension e aplicado nas 5 `countUsages` que contam ativos | `soft-delete.extension.ts` + 5 specs |
| 4 | `buildChanges` compara os valores **já normalizados**; o caso especial de `Date` sai, e `Decimal` passa a funcionar pelo mesmo caminho | `diff.helper.ts` |
| 5 | `resolverVidaUtil`: ao trocar o modelo, o ativo volta a herdar `eolMonths` **se estava herdando** — override digitado à mão é preservado | `update-asset.usecase.ts` |
| 6 | `beforeWrite` na spec de depreciação valida `PERCENT ≤ 100` sobre o **estado final**, o que o schema não alcança em edição parcial | `depreciation.spec.ts` |
| 7 | `ReferenceSelect` mantém o vínculo atual como `<option>` quando ele está fora das 200 primeiras opções | `ReferenceSelect.tsx` |
| 8 | Três comentários apontando para arquivos apagados no rename | `fields.schema.ts`, `soft-delete.extension.ts`, `list.types.ts` |

### A prova

Suíte de regressão nova (**34 asserções, 34 passaram**) em banco limpo:

- **1** — o corpo literal do formulário (`assetTag:""` + 17 campos) responde 201 e gera
  `ATV-00001`; `"   "` também; etiqueta digitada continua respeitada; `PUT` com etiqueta
  vazia preserva a que existe.
- **1 + concorrência** — 12 `POST` simultâneos **com `assetTag:""`**: 12× 201,
  `ATV-00033`…`ATV-00044`, zero duplicata.
- **2** (suíte própria, **21 asserções**) — `IN_USE` existe no enum do banco, na **posição
  2**; o `<select>` do formulário oferece os 8 rótulos, "Em Uso" incluído; os 4 cenários
  reais cadastram (notebook com colaborador, monitor na sala **sem responsável**,
  equipamento em estoque, equipamento na assistência); as três contagens que o tipo precisa
  responder saem certas — *em uso* = 2, *disponíveis* = 1, *parados por impedimento* = 1,
  sem mistura; entrega e devolução movem o tipo nos dois sentidos; criar/editar/apagar um
  status novo em `IN_USE` pela tela funciona; `?type=DEPLOYED` (inexistente) dá 422; e o
  `ORDER BY type` sai na ordem do ciclo de vida.
- **3** — apagar fornecedor/localização com o ativo **na lixeira** agora responde 409 e as
  colunas ficam intactas (conferido direto no banco). Status e modelo passam a dizer *"em
  uso por 5 registros"* em vez do P2003 genérico. O 409 com ativo vivo não regrediu.
- **4** — dois `PUT` idênticos num ativo com `purchaseCost`: **1 log**, não 2. O mesmo na
  depreciação. Mudança real de `Decimal` continua registrada
  (`{"floorValue":{"de":"10","para":"20"}}`). Zero logs com `de == para` no banco inteiro.
- **5** — ativo herdando 48 meses movido para um modelo de 12 passa a 12 e recalcula o
  `eolDate`; ativo com 60 digitado à mão **mantém** 60 na mesma operação; edição explícita
  vence; modelo inexistente dá 404.
- **6** — `PERCENT` acima de 100 → 422; `= 100` passa; `AMOUNT` alto continua passando;
  trocar só o `floorType` para `PERCENT` com valor alto guardado → 422.

E a bateria original **inteira** re-executada em banco novo, para regressão: **Suíte 1: 30/30
· Suíte 2: 13/13 · Suíte 3: 30/30 · Suíte 6: 8/8** (era 7/8).

## O que ficou de fora, e por quê

- **O banco de desenvolvimento.** O código está corrigido, mas o seed é `update: {}` por
  construção: ele existe para garantir que a linha exista, não para reescrever o que já está
  lá. O rótulo "Em Uso" em `sentineldb` continua `DEPLOYABLE` até alguém rodar
  `npm run db:migrate` e o `UPDATE` do defeito 2. A migration é aditiva (`ADD VALUE`) e não
  toca em nenhuma linha existente.
- **Seletor com busca acima de 200 opções (observação 7).** A perda silenciosa de vínculo foi
  fechada; navegar além das 200 pede um combobox com busca, que é funcionalidade, não
  correção. Ficou para a **F10**, junto do seletor de colunas — e foi lá que entrou.
- **`AGENT_TOKEN` no `.env` (observação 9).** Definir um token ali faria o hub recusar o
  agente C# que conectava sem nenhum. É decisão de ambiente, e o boot já avisa.

## O que restou, e para onde foi

Nada dos 5 defeitos. O que sobrou eram escolhas, não pendências:

1. **`db:migrate` + o `UPDATE` do "Em Uso"** no banco de dev — o único passo para o defeito 2
   estar fechado ponta a ponta.
2. **Revisar a semântica do defeito 5.** A regra implementada é "herda se estava herdando,
   preserva se foi digitado". É defensável, mas foi uma decisão de produto tomada dentro de
   uma correção.
3. **Ligar `IN_USE` ao checkout na F4.** O tipo existia; faltava a operação que o escreve —
   é o que impede o status e a posse divergirem, já que as duas coisas são graváveis em
   separado. Fechado na F4, e a invariante está no [`../referencia/invariantes.md`](../referencia/invariantes.md).
4. **Seletor com busca** (observação 7) — entrou na F10 — e **`AGENT_TOKEN`**
   (observação 9), que a Leva 5 da F3 substituiu pelo `ApiToken` (D89).

## O teste que faltou

Quando esta auditoria rodou não havia teste automatizado nenhum no repositório, e o defeito 1
mostra o custo: a etiqueta automática foi verificada pelo caminho que funciona (API) e não
pelo que o usuário usa (formulário).

O teste que teria pego os defeitos 1, 3, 4 e 5 é o mesmo: **enviar o corpo literal que o
formulário monta**, não um corpo escrito à mão para a ocasião. É o que
`tests/formularios/corpo-literal.test.ts` passou a fazer quando a suíte nasceu
([`../referencia/testes.md`](../referencia/testes.md)).

O defeito 2 não sairia de teste nenhum. O código fazia o que foi escrito; o que foi escrito é
que contradizia a regra declarada três linhas acima, no mesmo arquivo. Contra isso o que
funciona é o que aconteceu: alguém ler a lista de status e perguntar por que "Em Uso" aparece
como "Disponível".
