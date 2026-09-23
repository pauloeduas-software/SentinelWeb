# Plano de implementação — Fase 1: catálogo e o ativo do ITAM ✅ CONCLUÍDA

> Plano de execução da Fase 1 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o
> código real depois da Fase 0 e **verificado contra o banco, o Prisma e o
> TypeScript** antes de virar plano (ver *O que foi provado*).
> Convenções de camada: [`ARQUITETURA.md`](./ARQUITETURA.md).
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

## Decisões de arquitetura desta fase

Continuam a numeração do `ITAM-TODO.md`.

### D8 — Catálogo sem soft delete. O delete é real, bloqueado por uso.

**O que o Snipe-IT faz, de verdade:** ele tem as duas coisas, e a que protege é a
primeira. `CategoriesController::destroy` **recusa** apagar categoria com item
associado; o `SoftDeletes` é rede secundária. **Esta fase reproduz a proteção
principal** — o 409 por uso — e dispensa a secundária. O comportamento que o
usuário vê é o mesmo do Snipe-IT.

**Por que a secundária custa caro aqui e não custa lá.** No Laravel o global scope
do `SoftDeletes` também alcança relação carregada. No Prisma, não:

```
user.findMany (topo)  -> 0 linha(s)                          ← a extension escopou
assignedTo (aninhado) -> {"id":"7003…","name":"Probe"}       ← passou
```

`core/database/soft-delete.extension.ts` intercepta **operação de topo**. Um
`select: { category: true }` é join dentro da query do ativo, não operação
própria — nenhum `deletedAt: null` chega ali. Com lixeira no catálogo, categoria
apagada continuaria aparecendo em todo ativo que a referencia, em silêncio.

**As três contas de manter soft delete no catálogo:**

1. sete índices únicos **parciais** escritos à mão (o `unique_undeleted`), como
   `User.email` na F0;
2. o `upsert` do seed deixa de funcionar — o Prisma não conhece índice parcial,
   e a F0 prometeu "só `upsert`, nunca `create`";
3. relação **to-one** não é filtrável no Prisma: taparia o vazamento só com uma
   camada de apresentação anulando o registro apagado em cada `select`.

**No lugar:** `countUsages` por entidade; `DELETE` responde **409** com a contagem.
Na F1 toda contagem é `0` (nada referencia o catálogo ainda) — a F2 e a Etapa F
preenchem. O `ActivityLog` grava a linha inteira em `changes` no DELETE, então um
apagão acidental é recuperável à mão.

**A decisão é barata de desfazer.** A extension descobre a lixeira pelo DMMF: se
um dia o catálogo precisar de soft delete, é acrescentar `deletedAt` e ele passa
a ser escopado sozinho — pagando, aí sim, as três contas acima.

> **Efeito colateral já presente hoje:** usuário na lixeira ainda aparece como
> `assignedTo` do inventário, pelo mesmo motivo. Severidade baixa (zero linhas) e
> a regra da F4 — `DELETE /api/users/:id` responde 409 com item em posse — fecha o
> caminho. Fica registrado para não ser redescoberto.

### D9 — Um domínio `catalog` com sete especificações. Não sete domínios.

As sete tabelas são o **mesmo** CRUD. Sete fatias verticais completas seriam ~77
arquivos quase idênticos — e o `ARQUITETURA.md` já diz: *"Não crie `controllers/`
+ `use-cases/` para um CRUD de quatro linhas só por simetria"*.

```
server/domain/catalog/
├── catalog.maestro.ts                  # percorre as specs, registra 5 rotas por entidade
├── controllers/catalog.controller.ts   # um controller, parametrizado pela spec
├── use-cases/                          # list / options / create / update / delete genéricos
├── helpers/catalog-where.helper.ts     # busca por OR+contains sobre `searchable`
└── specs/                              # 7 arquivos: o que cada tabela é
```

A spec é o que varia — e é exatamente a do protótipo que compilou:

```ts
interface CatalogSpec {
  slug: string;              // 'categories' → /api/categories
  entityType: string;        // 'Category'   → ActivityLog
  delegate: (client: ClienteCatalogo) => CatalogDelegate;
  createSchema: ZodType;
  updateSchema: ZodType;
  select: Record<string, boolean>;          // allowlist de resposta
  sortable: readonly [string, ...string[]]; // allowlist de ordenação
  defaultSort: string;
  searchable: readonly string[];
  audited: readonly string[];               // campos do diff do ActivityLog
  countUsages: (client: ClienteCatalogo, id: string) => Promise<number>;
  beforeWrite?: (client: ClienteCatalogo, id: string | null, data: object) => Promise<void>;
}
```

**O custo, medido e declarado:** tipar a união dos sete delegates do Prisma não
existe em TS — cada um tem `where`/`data` próprios. O CRUD genérico trabalha
contra uma interface estrutural mínima e cada spec faz **um** cast, ao lado do
nome real do model:

```ts
delegate: (client) => client.category as unknown as CatalogDelegate,
```

Sete casts auditáveis contra 77 arquivos duplicados. **O cast não atravessa a
regra de negócio:** o `countUsages` continua totalmente tipado (prova nº 2), o
`strictObject` continua validando a entrada e o `select` continua sendo allowlist
de saída. O que se perde é o estreitamento de tipo do `sort` — que já era
garantido **em runtime** pelo `z.enum` do `parseListQuery`, e continua sendo.

### D10 — `type` vira `enum` do Prisma, não `String`.

`CategoryType`, `StatusLabelType` e `DepreciationFloorType` são conjuntos fechados
definidos pelo software — é o D5 levado até o fim. Vira tipo do Postgres (prova
nº 3), entra no tipo gerado e o `z.enum` passa a espelhar o banco (prova nº 8).

Preço: acrescentar valor depois é `ALTER TYPE … ADD VALUE` à mão na migração. Os
três conjuntos vêm do Snipe-IT e são estáveis.

### D11 — Rota de opções separada da listagem.

`GET /api/<slug>/options?q=` devolve `{ id, name }[]` cru, sem envelope, ordenado
por nome, teto de 200.

A listagem pagina com `perPage` máximo de 100 (`core/http/list-query.ts`) — certo
para tabela, errado para `<select>`: o seletor de modelo do formulário de ativo
(F2) e o de pai da `Location` precisam da lista inteira. Sem esta rota, o
formulário pediria `perPage=100` e mentiria em silêncio a partir do 101º item.

### D12 — O `Asset` nasce inteiro na F1. `inventory_items` é apagada, não migrada.

O TODO trata o D1 como *rename* porque assumia preservar o inventário existente.
Não é o caso: a base de ITAM atual (**16 arquivos, 841 linhas**) é descartável, e
as cinco tabelas estão em zero linha. Então a operação não é renomear — é
**apagar `inventory_items` e criar `assets`** já na forma do Snipe-IT.

Isso é mais simples e mais seguro que o rename que o TODO descreve: não há
`ALTER TABLE ... RENAME`, não há coluna sobrevivente fora de lugar, não há
`quantity` para descartar depois (D3 se resolve sozinho por não existir).

E é o que evita construir a mesma tabela duas vezes: uma versão magra na F1 só
para o catálogo ter a quem apontar, e a versão real na F2. Coluna que nasce com a
tabela custa zero; acrescentada depois custa migração e backfill.

### D13 — A segurança do rename depende de o `Asset` novo **não** ter `status`, `lastSeen` nem `hwid`.

O TODO marca o D1 com ⚠️: se o rename deixar um `prisma.asset` apontando para o
model errado no `touchAsset`, o `lastSeen` congela e o zombie cleaner marca a
frota inteira como OFFLINE.

Testado (prova nº 11): com `Asset` (RMM) virando `Endpoint` e o nome `asset`
passando ao ativo do ITAM, os **seis** pontos do lado RMM falham na compilação —
11 erros, nenhum silencioso:

```
'hwid' does not exist in type 'AssetWhereUniqueInput'
'status' does not exist in type 'AssetWhereInput'. Did you mean to write 'statusId'?
'lastSeen' does not exist in type 'AssetUpdateInput'
'include' does not exist in type ...          ← telemetries saiu do Asset
```

**Mas a rede só existe porque os nomes não colidem.** Se o `Asset` novo tivesse
mantido um `status String`, o `markStaleAssetsOffline` teria compilado e
atualizado a tabela errada em silêncio. Daí a regra, que vale para sempre:

> Nenhuma coluna do `Asset` (ITAM) pode se chamar `status`, `lastSeen` ou `hwid`.
> O status do ciclo de vida é `statusId` (D5). Quando a **F7** quiser registrar
> quando o agente viu o ativo pela última vez, o campo chama `lastSeenByAgentAt`
> ou `lastAuditAt` — nunca `lastSeen`. É o mesmo par de eixos que a F7 já separa
> (`AgentStatus` × `LifecycleStatus`), aplicado ao nome da coluna.

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

## O que muda no `ITAM-TODO.md`

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
