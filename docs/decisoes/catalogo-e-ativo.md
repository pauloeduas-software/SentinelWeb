# Decisões do catálogo e do ativo

> O vocabulário do inventário: o que é `Asset`, o que é `Endpoint`, as tabelas de catálogo e as vistas da listagem.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. As supersessões estão em [`README.md`](./README.md).
>
> Decisões neste arquivo: D1–D3, D5, D8–D13, D18–D21, D85, C/I da segunda rodada, AO e BE (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).

---

## D1 — `InventoryItem` vira `Asset`; o `Asset` atual (descoberto pelo agente) vira `Endpoint`

**✅ FEITO.**
Executado como `drop`+`create` do lado ITAM (D12) e rename de verdade do lado RMM.
No Snipe-IT, `Asset` é o ativo gerenciado — é esse vocabulário que queremos. A tabela que o
agente C# popula passa a se chamar `Endpoint` (`@@map("endpoints")`).
Impactou: `server/domain/agent/`, `server/domain/asset/` (virou `endpoint/`),
`server/domain/inventory/` (virou `asset/`), `src/domain/asset/`, `src/pages/telemetria/*`.
⚠️ O ponto de risco era `touchAsset`, chamada a cada mensagem do agente: um `prisma.asset`
apontando para o model errado ali congelaria o `lastSeen` e o zombie cleaner marcaria a frota
inteira como OFFLINE. **Verificado:** o arquivo hoje é
`server/domain/endpoint/use-cases/touch-endpoint.usecase.ts` e aponta para o model certo —
e os 6 pontos do RMM falharam na compilação durante o rename, nenhum silencioso (ver D13).
As rotas RMM passaram para `/api/endpoints` — não por colisão de rota (testado: `POST
/api/assets/:hwid/command` convive com `POST /api/assets/:id/checkout` no find-my-way 9.7;
só colide método+caminho idênticos com nome de parâmetro diferente), mas por clareza.

---

## D2 — `Folder` morre

**✅ FEITO.**
Snipe-IT não tem "pastas/filiais". Ele tem `Location` (hierárquica, com endereço, gestor,
pai/filho) e `Company` (multi-tenancy). O `Folder` era uma invenção nossa que fazia papel de
location pobre. Removido por completo na migration `20260922180151_remove_folders`:
model, coluna `folderId`, rotas `/api/folders`, sidebar de pastas e o select do formulário.
A `Location` de verdade nasceu do zero — não havia nada para migrar.

---

## D3 — `quantity` sai do `Asset`

**✅ APLICADO.**
No Snipe-IT 1 linha = 1 equipamento físico, com etiqueta e série próprias. Quantidade só
existe em `Accessory`, `Consumable` e `Component`. Resolveu-se sozinho pelo D12: a
tabela nova nasceu sem a coluna.

---

## D5 — Nada de texto livre onde o Snipe-IT tem tabela

> **Superada em parte pelo commit `505c520`:** o `ARCHIVED` sai: **quatro** tipos; cor e `showInNav` saem do `StatusLabel`; o seed cria um status por tipo.

**✅ APLICADO.** `category` e
`status` viraram `Category` (com `type`) e `StatusLabel` (com `type`).
**Correção:** o seed classificava "Em Uso" como `DEPLOYABLE`, e
`DEPLOYABLE` significa *pode ser entregue* — um ativo que está com alguém não pode. As duas
saídas óbvias foram descartadas (derivar de `assignedToId` deixa sem resposta o monitor
parafusado na sala, que está em uso **sem** responsável; tipar `PENDING` empacota "está com
um colaborador" junto com "está na assistência", que é a distinção mais cara do inventário).
`IN_USE` virou o **quinto** tipo do enum, entre `DEPLOYABLE` e `PENDING`:

```prisma
enum StatusLabelType {
  DEPLOYABLE    // no estoque, pode ser entregue — o único que libera o checkout
  IN_USE        // com alguém ou instalado em algum lugar
  PENDING       // fora do estoque por impedimento, e volta (reparo, trânsito)
  ARCHIVED      // saiu da operação
  UNDEPLOYABLE  // ainda é seu, não serve, não volta
}
```

**São cinco tipos, não quatro.** Qualquer texto, tela ou allowlist que liste quatro está
desatualizado. A posição importa: o Postgres ordena pela ordem de declaração e a listagem de
status é ordenável por `type` — a migration precisou de `ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE'`
à mão, porque o `migrate diff` acrescenta no fim.

> **Superada em parte pelo status enxuto (commit `505c520`):** o `ARCHIVED` saiu e o enum voltou
> a ter **quatro** tipos — `DEPLOYABLE`, `IN_USE`, `PENDING`, `UNDEPLOYABLE`; quem sai de vez da
> operação tem baixa (D19). Saíram junto a cor e o `showInNav` ("Em destaque") do `StatusLabel`,
> e o seed deixou de ter nomes próprios: hoje cria um status de cada tipo (Disponível, Em uso,
> Pendente, Inutilizável). O `IN_USE` e a posição dele continuam valendo; o "cinco, não quatro"
> acima governou até ali.

---

## D8 — Catálogo sem soft delete. O delete é real, bloqueado por uso.

> **Superada em parte por [V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira):**
> o colaborador — que entrou no catálogo depois — tem lixeira, por ter histórico de posse próprio.
> As outras cinco tabelas continuam como está aqui.

**O que o Snipe-IT faz, de verdade:** ele tem as duas coisas, e a que protege é a
primeira. `CategoriesController::destroy` **recusa** apagar categoria com item
associado; o `SoftDeletes` é rede secundária. **Aqui se reproduz a proteção
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
   `User.email`;
2. o `upsert` do seed deixa de funcionar — o Prisma não conhece índice parcial,
   e a promessa era "só `upsert`, nunca `create`";
3. relação **to-one** não é filtrável no Prisma: taparia o vazamento só com uma
   camada de apresentação anulando o registro apagado em cada `select`.

**No lugar:** `countUsages` por entidade; `DELETE` responde **409** com a contagem.
O `ActivityLog` grava a linha inteira em `changes` no DELETE, então um
apagão acidental é recuperável à mão.

**A decisão é barata de desfazer.** A extension descobre a lixeira pelo DMMF: se
um dia o catálogo precisar de soft delete, é acrescentar `deletedAt` e ele passa
a ser escopado sozinho — pagando, aí sim, as três contas acima.

> **Efeito colateral já presente hoje:** usuário na lixeira ainda aparece como
> `assignedTo` do inventário, pelo mesmo motivo. Severidade baixa (zero linhas) e
> a regra — `DELETE /api/users/:id` responde 409 com item em posse — fecha o
> caminho. Fica registrado para não ser redescoberto.

**O outro lado disto.** Se a extension não alcança leitura
aninhada, ela **alcança** o `count` de topo — e era esse o problema: `countUsages` rodava **com**
escopo de lixeira e não enxergava ativo apagado, então apagar um fornecedor zerava o vínculo de
ativos que estavam na lixeira, em silêncio. Corrigido com `INCLUINDO_LIXEIRA`
(`{ deletedAt: undefined }`, que faz a extension sair do caminho pela PRESENÇA da chave) nas
**cinco** specs que contam ativos. O 409 protege o vivo; isto protege o apagado.

---

## D9 — Um domínio `catalog` com sete especificações. Não sete domínios.

As sete tabelas são o **mesmo** CRUD. Sete fatias verticais completas seriam ~77
arquivos quase idênticos — e o `../referencia/arquitetura.md` já diz: *"Não crie `controllers/`
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

> **O número cresceu, a decisão não mudou.** Eram sete specs; o D64 acrescentou duas e o
> D75 a décima. "Um domínio `catalog`" segue valendo — e cada tabela nova continua sendo
> **uma spec, nenhuma rota escrita à mão**. Quem contar os arquivos em `specs/index.ts` vai
> achar dez.

> **E depois encolheu, e a decisão continua a mesma.** As duas do D64 saíram com os campos
> customizados ([D145](./escopo.md#d145--campos-customizados-saem-inteiros)), a depreciação com o
> valor contábil ([D152](./escopo.md#d152--o-valor-contábil-sai)), e fornecedor e departamento
> com o [segundo de-escopo](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai).
> Hoje `specs/index.ts` tem **cinco** — categorias, status, fabricantes, modelos e localizações. E
> o `sort` do parágrafo acima não existe mais: a varredura
> [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai) tirou a ordenação
> genérica das listagens, e o catálogo lista por nome, em ordem fixa.

---

## D10 — `type` vira `enum` do Prisma, não `String`.

`CategoryType`, `StatusLabelType` e `DepreciationFloorType` são conjuntos fechados
definidos pelo software — é o D5 levado até o fim. Vira tipo do Postgres (prova
nº 3), entra no tipo gerado e o `z.enum` passa a espelhar o banco (prova nº 8).

Preço: acrescentar valor depois é `ALTER TYPE … ADD VALUE` à mão na migração. Os
três conjuntos vêm do Snipe-IT e são estáveis.

> **O preço foi cobrado, e é o que o D5 conta:** o `IN_USE` entrou como
> quinto valor do `StatusLabelType` e exigiu `ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE'` escrito à
> mão — o `migrate diff` acrescenta no fim, e a posição importa porque o Postgres ordena pela
> ordem de declaração e a listagem de status é ordenável por `type`.

---

## D11 — Rota de opções separada da listagem.

`GET /api/<slug>/options?q=` devolve `{ id, name }[]` cru, sem envelope, ordenado
por nome, teto de 200.

A listagem pagina com `perPage` máximo de 100 (`core/http/list-query.ts`) — certo
para tabela, errado para `<select>`: o seletor de modelo do formulário de ativo
e o de pai da `Location` precisam da lista inteira. Sem esta rota, o
formulário pediria `perPage=100` e mentiria em silêncio a partir do 101º item.

---

## D12 — O `Asset` nasce inteiro. `inventory_items` é apagada, não migrada.

O D1 não precisa preservar o inventário existente: a base de ITAM atual (**16 arquivos, 841 linhas**) é descartável, e
as cinco tabelas estão em zero linha. Então a operação não é renomear — é
**apagar `inventory_items` e criar `assets`** já na forma do Snipe-IT.

Isso é mais simples e mais seguro que um rename: não há
`ALTER TABLE ... RENAME`, não há coluna sobrevivente fora de lugar, não há
`quantity` para descartar depois (D3 se resolve sozinho por não existir).

E é o que evita construir a mesma tabela duas vezes: uma versão magra só
para o catálogo ter a quem apontar, e a versão real depois. Coluna que nasce com a
tabela custa zero; acrescentada depois custa migração e backfill.

---

## D13 — A segurança do rename depende de o `Asset` novo **não** ter `status`, `lastSeen` nem `hwid`.

O risco do D1: se o rename deixar um `prisma.asset` apontando para o
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
> O status do ciclo de vida é `statusId` (D5). Para registrar
> quando o agente viu o ativo pela última vez, o campo chama `lastSeenByAgentAt`
> ou `lastAuditAt` — nunca `lastSeen`. É o mesmo par de eixos já separado
> (`AgentStatus` × `LifecycleStatus`), aplicado ao nome da coluna.

---

## D18 — `AssetLog` não nasce. A aba Histórico lê o `ActivityLog`.

> **Superada em parte por [AB](./acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco):** a trilha
> continua uma só — `audit_logs`, com quem fez —, mas a aba Histórico não a lê mais: ela é só
> movimentação (posse e licenças), e a auditoria fica no banco.

**Decidido:** uma trilha só, filtrada por `entityType`/`entityId`.
**Descartado:** tabela `AssetLog` com campo, valor antigo e valor novo por linha.
**Por quê:** o `ActivityLog` já grava o diff em `changes` **na mesma transação** da
operação — a garantia que a segunda tabela teria de reconstruir. Com as duas, a
pergunta *"por que o histórico não bate com a auditoria?"* passa a ter resposta
possível, e isso basta para não criá-la. O que falta é **rota de leitura**, e
fazer as operações que ainda não logam (arquivar, descomissionar, checkout,
checkin, nota) gravarem com `entityType: 'Asset'`.

---

## D19 — Arquivar, descomissionar e apagar são três coisas, com três colunas.

> **Superada em parte pelo commit `505c520`:** sem `ARCHIVED`, sobram duas: `retiredAt` (a baixa) e `deletedAt`.

> **Superada em parte por [BE](#be--os-motivos-da-baixa-viram-cadastro-de-configurações):** o motivo deixa de ser lista fechada e vira cadastro; a baixa continua separada do status.

**Decidido:** `status.type = ARCHIVED` (classificação, reversível), `retiredAt` +
`retiredReason` (fato datado de saída do parque), `deletedAt` (lixeira).
**Descartado:** um `archived Boolean` no `Asset`.
**Por quê:** o booleano seria segunda fonte de verdade ao lado de `status.type` —
o erro do `assignedToId` editável (D17), uma camada acima. E as três respondem
perguntas diferentes (*pode ser entregue?*, *ainda é patrimônio?*, *existe?*):
colapsá-las obriga a inventar a resposta que falta na hora do relatório.

> **Superada em parte pelo status enxuto (commit `505c520`):** o `ARCHIVED` saiu do
> `StatusLabelType`, e com ele o *arquivar*. Ficam duas colunas — `retiredAt` + `retiredReason`
> (o "descomissionar", que passou a se chamar **baixa**) e `deletedAt`. O argumento contra o
> `archived Boolean` não caiu: o arquivado não virou coluna, deixou de existir.

---

## D20 — "Arquivados" e "posto vago" são filtros do domínio, não `view` do `core`.

> **Superada pelo commit `505c520`:** a vista, a aba e o contador de arquivados saem; `active` exclui só o baixado.

**Decidido:** `?arquivados=` e `?relatorio=` vivem em `asset-filters.helper.ts`.
**Descartado:** acrescentar `'archived'` ao `ListView` de `core/http/list-query.ts`.
**Por quê:** `trashed` é genérico — toda tabela com `deletedAt` o entende.
"Arquivado" é `status.type = ARCHIVED`, que só existe no ITAM: pôr isso no `core`
é fazer a infraestrutura conhecer negócio — o que a seta `pages → domain → core`
proíbe e o lint reprova.

> **Superada em parte pelo status enxuto (commit `505c520`):** sem `ARCHIVED` não há
> "Arquivados" — o `?arquivados=` (e a vista que o sucedeu, D85) saiu. A regra continua valendo
> para o que ficou: "Baixado" (`retiredAt`) é filtro do domínio em `asset-filters.helper.ts`, não
> `view` do `core`.

---

## D21 — Ação em massa é tudo ou nada; entrega em massa não será.

> **Superada por [O](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai):** o segundo de-escopo: a régua do D143, aplicada sem a folga da primeira rodada.

**Decidido:** `POST /api/assets/bulk` roda numa `$transaction` e falha inteira se
um id barrar, devolvendo 409 com a lista.
**Descartado:** aplicar o que der e devolver relatório por linha.
**Por quê:** edição em massa é **uma** intenção aplicada a N linhas — metade
aplicada é um estado que ninguém pediu e ninguém desfaz sem conferir os 200 um a
um. É o oposto do checkout em massa, que são N entregas independentes: 7
entregues e 1 recusado é um resultado legível. A diferença não é inconsistência,
é a natureza da operação — e por isso está declarada aqui e no D31.

---

## D85 — `?view=archived` é a quarta vista, e a listagem padrão passa a excluir `ARCHIVED`.

> **Superada pelo commit `505c520`:** a vista, a aba e o contador de arquivados saem; `active` exclui só o baixado.

**Decidido:** `ASSET_VIEWS` vira `['active','trashed','retired','archived']`, e `active` passa
a excluir também `status.type = ARCHIVED`.
**Descartado:** uma coluna `archivedAt`, espelhando `retiredAt`.
**Por quê:** arquivar **já é** um tipo de `StatusLabel`, e a invariante que impede
arquivar ativo entregue já lê `status.type`. Uma coluna nova seria uma segunda verdade sobre o
mesmo fato — o erro do D17 uma camada acima.

**É uma mudança de comportamento, e está declarada:** ativo arquivado aparecia na listagem
padrão e a partir daqui não aparece mais.

**A armadilha, e a regra que a fecha:** a exclusão de `ARCHIVED` vale **só quando não há
`?statusId=` explícito**. Sem isso, clicar no contador de um status arquivado abriria uma lista
vazia — um filtro que o próprio sistema ofereceu e que não devolve nada. Pedir um status pelo
id é dizer que se quer aquele status.

**O preço:** `active` deixa de ser um predicado de coluna e passa a ter um join com
`status_labels`. A tabela é pequena e `assets_statusId_idx` existe; se um dia doer, o caminho é
desnormalizar o `type` para `assets`, não voltar atrás na regra.

> **Superada pelo status enxuto (commit `505c520`):** o `ARCHIVED` saiu, e com ele a quarta
> vista, a aba Arquivados e o contador. `ASSET_VIEWS` é `['active','trashed','retired']`, e
> `active` volta a ser predicado de coluna — exclui só o baixado (`retiredAt`). Quem sai de vez da
> operação tem baixa.

---

## I — Ativo é computador

**Decidido:** `/ativos` e o model `Asset` são para **máquinas** — o que tem ou pode ter um
`Endpoint` vinculado. Monitor, teclado, mouse, cabo e qualquer coisa sem patrimônio individual
não são `Asset`: são [estoque](./estoque.md#j--o-estoque-volta-como-stockitem--stockmovement), por
quantidade, sem série nem etiqueta própria.
**Consequência de:** [D3](#d3--quantity-sai-do-asset) (quem tem quantidade não é `Asset`) e do
retorno do estoque — ver [J](./estoque.md).

**Por quê precisou ser dito outra vez:** o D3 já tinha decidido isso, pela régua "tem
etiqueta própria → é `Asset`". O que faltava não era a regra — era um lugar onde ela decidisse
algo que custasse caro errar. É o que a [invariante 19](../referencia/invariantes.md#19--no-máximo-um-ativo-por-posto-de-trabalho)
passou a ser: "no máximo um **ativo** por posto" só funciona como regra simples se "ativo" for
sinônimo de "o computador da mesa" — caso contrário o monitor e o teclado entrariam na mesma
contagem do notebook, e a regra teria que aprender a distinguir categoria por texto livre.

**O que isso simplificou, em cascata:** `byod` e `requestable` saíram do `Asset` — as duas
colunas nasceram de um modelo em que qualquer coisa podia ser `Asset`, e nenhuma delas tinha
leitor (nenhum filtro, nenhuma ordenação, nenhum relatório). O status padrão de um ativo novo
passou a vir do **tipo** (`DEPLOYABLE`, "Disponível"), não do nome do status — o cadastro mais
comum parava de exigir trocar o status toda vez.

**O que isso NÃO decide:** se um dia um acessório caro (headset com patrimônio) precisar de
série própria, a régua do D3 continua valendo — "tem etiqueta própria → é `Asset`" — e ele
deixaria de ser estoque. Não é este o motivo do corte: o corte é sobre o que a invariante 19
precisa que "ativo" signifique.

---

## C — O ativo entregue a um posto sai de `/ativos`; a ficha do posto é rota

> **Superada em parte por [BJ](#bj--o-computador-entregue-a-um-posto-continua-na-lista-de-computadores):** o computador
> entregue a um posto volta à lista de Computadores, e a linha diz em que mesa ele está. Continua valendo
> a outra metade: a ficha do posto é rota.

**Decidido:** a vista padrão de `/ativos` exclui quem tem posse aberta num local marcado como
posto (`isWorkstation`). `/postos/:id` passa a ser rota — a mesma tela de `/postos`, com a
listagem atrás —, e a busca por etiqueta ou série leva até ela quando o ativo está montado numa
mesa.
**Descartado:** manter o ativo entregue a um posto na listagem de `/ativos`, com a mesa como só
mais uma coluna de "onde está".

**Por quê:** "o que há no parque" e "o que está nesta mesa" são perguntas diferentes. Um
computador montado numa mesa tem endereço, e o endereço dele é a mesa — quem pergunta pelo
parque quer o que está em estoque (disponível para entregar) ou com uma pessoa direta; o que
está num posto se pergunta em `/postos`, ao lado dos ocupantes que respondem por ele. Antes desta
decisão a ficha do posto era só uma janela (`useState`), sem URL própria — e sem lugar para onde
mandar quem acabou de ver o computador sumir da lista de ativos.

**O que acompanha a listagem, para a ausência não virar confusão:** a linha que sai de
`/ativos` deixa um rastro — "entregue à Mesa 1", com link — porque quem acabou de entregar volta
a esta tela e não acha o que entregou. `/stats` e o `?statusId=` explícito excluem o mesmo
conjunto, pelo mesmo motivo do D85: um contador que promete uma linha que a tabela não mostra é
o defeito que ele existe para não ter. O relatório de posto vago, que ocupava a mesma chave do
`where`, sai de `/ativos` com o filtro — a vista `vagos` de `/postos` continua.

**Só onde `isWorkstation` é true:** depósito e sala de reunião não são mesa de ninguém, e o
ativo guardado ali continua sendo parque.

> **Mantida por [Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe), com
> um recorte a menos:** o posto virou cadastro próprio e só ele recebe entrega, então "só onde
> `isWorkstation` é true" ficou sem objeto — toda posse aberta para posto tira o ativo de
> `/ativos`, e o ativo guardado no depósito continua parque.

---

## AO — Categoria, status, fabricante, modelo e localização não se desativam

> **Superada em parte por [AY](./plataforma.md#ay--o-visual-vem-da-intranet-em-tema-claro-e-escuro-e-a-linha-inteira-abre-o-registro):** a linha inteira abre o registro e as ações vão para o `⋯`; a situação pode ter cor; primitivos do shadcn só no que se usa, e tema claro e escuro; `GET /api/search` sai.

**Decidido** (2026-10-29, na comparação das Configurações com o Snipe-IT e o GLPI, com o usuário
escolhendo o modelo do Snipe-IT):

- **As cinco abas das Configurações perdem o Desativar.** `isActive` sai das cinco tabelas e das
  rotas: mandar o campo é 422. A linha não tem mais marca "desativado", o `/options` devolve todas,
  e o `?inativos=incluir` do filtro de categoria sai junto, sem nada para incluir.
- **A exclusão continua bloqueada pelo que usa o registro agora** (D8, V, Y), e o 409 diz o que
  tirar em vez de mandar desativar: `Não é possível excluir: fabricante em uso por 3 registros.
  Troque o fabricante desses registros e exclua de novo.` Na localização, `Mova o que está guardado
  nela e os postos que ficam nela, e exclua de novo.`
- **A invariante 21 sai.** A localização que existe recebe ativo, item e posto; a que não existe é
  404 (`assertLocalExiste`), no lugar do erro cru da FK.
- **O último status de Disponível e de Em uso continua protegido**, agora contra a troca de tipo e
  a exclusão: 409 `"Disponível" é o único status do tipo Disponível, e é ele que a devolução aplica
  sozinha. Crie outro do mesmo tipo antes.` A entrega e a devolução automáticas escolhem entre
  todos os status do tipo.

**Supera em parte:** o Desativar do catálogo do commit `ff34364` (configurações revisadas), com
a invariante 21 e o `assertEscolhaAtiva`;
[AF](./licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)
(o Desativar em todas as telas e o 409 que manda desativar);
[AN](./licencas.md#an--o-que-está-em-uso-bloqueia-e-nenhuma-data-é-futura) (o que ficava de fora:
o catálogo com Desativar); [Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)
(a localização desativada que não recebia nada novo).
**Mantém:** o D8 — sem lixeira no catálogo, exclusão definitiva —; o Desativar do colaborador, da
conta e do item de estoque, e o Encerrar da licença; a invariante 3 e a regra do último status do
tipo.

**Por quê:** o Desativar era a saída de quem não podia ser excluído por ter uso, e cada escolha do
sistema precisava conferir se o registro estava ativo — status, categoria, fabricante, modelo e
localização, cada um com a sua trava contra a desativação no meio. O Snipe-IT não tem nada disso
nessas cinco tabelas: a exclusão com uso é 409, e o que sai de linha fica até ninguém usar.

**Como o Snipe-IT e o GLPI fazem** (conferido no código-fonte): o Snipe-IT recusa excluir
categoria, fabricante, modelo, status e localização em uso, e sem uso apaga com `SoftDeletes`,
com Restaurar e limpeza da lixeira. O GLPI pergunta por qual registro trocar ou deixa o campo vazio
nos que apontavam. Aqui fica a parte do Snipe-IT que protege — o 409 por uso —, sem a lixeira,
pelos motivos do D8.

**O que fica de fora, declarado:** o colaborador e a conta mantêm o Desativar, porque são pessoas:
saem da empresa e continuam no histórico. O item de estoque o mantém como o acessório do Snipe-IT,
que se arquiva.

---

## BE — Os motivos da baixa viram cadastro de Configurações

**Decidido** (em 2026-11-06, na varredura do que estava fixo no código: "Motivos da baixa pode fazer"):

- **O enum `RetiredReason` sai, e entra a tabela `RetireReason`.** É a sexta aba de Configurações,
  Motivos de baixa, no CRUD do catálogo: só nome, único sem diferença de maiúscula, sem Desativar
  ([AO](#ao--categoria-status-fabricante-modelo-e-localização-não-se-desativam)).
- **O sistema nasce com os seis de antes**, pelo seed principal: Vendido, Descartado, Doado,
  Devolvido em garantia, Extraviado e Roubado.
- **O motivo em uso não se exclui.** `Asset.retiredReasonId` é FK `Restrict`, a contagem inclui a
  lixeira, e o 409 manda reverter a baixa, porque ela não se edita.
- **A baixa recebe `retiredReasonId`**, e o motivo que não existe é 404. O campo nasce vazio: antes
  vinha com Vendido marcado.
- **A auditoria guarda o nome por escrito**, e não o id ([V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)).
  Renomear muda o selo das baixas que já existem; a auditoria continua com o nome da época.

**Supera:** em parte o [D19](#d19--arquivar-descomissionar-e-apagar-são-três-coisas-com-três-colunas),
na lista fechada do motivo.
**Mantém:** a baixa separada do status (D19), e o [D5](#d5--nada-de-texto-livre-onde-o-snipe-it-tem-tabela):
continua sem texto livre, agora com a tabela que ele pede.

**Por quê:** dos 14 enums do banco, este era o único que nenhuma regra lia, e por isso o único que
podia sair do código. Tipo de categoria, tipo de status e cargo continuam fixos porque o sistema
decide por eles. A falta era concreta: o computador de locação que volta ao fornecedor não tinha
motivo certo, e a [`baixa.md`](../referencia/baixa.md) registrava isso. O GLPI e o Snipe-IT não têm
campo de motivo: lá é um status que o administrador cria. Aqui a coluna própria fica, pelo D19, e
o que passa à mão da empresa é a lista. O argumento do enum era contra o texto livre, e um cadastro
com nome único o cumpre.

**O que fica de fora, declarado:** o seletor passa a vir em ordem alfabética, e não com o que mais
acontece primeiro. O cadastro não impede "Venda" ao lado de "Vendido", mas só o Supervisor o
altera. Nada disso toca o estoque: sem baixa e sem motivo lá
([AJ](./estoque.md#aj--o-consumível-é-uma-categoria-e-o-total-é-o-que-existe)) continua decidido.

---

## BJ — O computador entregue a um posto continua na lista de Computadores

> **Superada em parte por [BL](#bl--o-computador-no-posto-mostra-o-posto-antes-de-quem-o-ocupa):** entregue a um posto, a coluna Responsável mostra o posto, sem quem o ocupa; o resto continua valendo.

**Decidido** (2026-11-06, na revisão de Computadores):

- **A vista Ativos mostra todo computador sem baixa**, entregue a um posto ou não. A busca, o filtro por
  status e os cartões contam o mesmo conjunto, e `EM_POSTO_DE_TRABALHO` sai.
- **A linha diz onde ele está.** A Localização é a do posto, lida da entrega em aberto como na ficha
  ([AW](./posse.md#aw--o-computador-está-onde-o-posto-fica-e-o-histórico-diz-quem-ocupou-o-posto)), e não
  a guardada, que é para onde ele volta. Responsável mostra os ocupantes, ou o selo Posto vago, com
  "no posto Mesa 1" embaixo.
- **O `⋯` da linha oferece Devolver**, a mesma operação da ficha. Excluir continua recusado com 409, como
  no computador entregue a uma pessoa ([AL](./posse.md#al--o-computador-entregue-não-vai-para-a-lixeira)).
- **A seta da ficha do computador volta ao posto** quando foi de lá que ela foi aberta, na aba em que se
  estava, e a seta do posto continua voltando à lista como ela estava.

**Supera:** em parte a [C](#c--o-ativo-entregue-a-um-posto-sai-de-ativos-a-ficha-do-posto-é-rota), no
computador fora da lista; a ficha do posto continua rota. Em parte a
[Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe), que mantinha a C, e a
[BI](./posse.md#bi--a-busca-de-postos-acha-o-computador-pela-etiqueta-e-pela-série), no que ela descartou.
**Mantém:** a busca de Postos por etiqueta e série (BI), a aba Computador do posto e todas as regras de Postos.

**Por quê:** a C partia de que a mesa era o endereço do computador, e de que "o que há no parque" e "o
que está nesta mesa" pediam duas telas. Na prática, Computadores contava menos máquinas do que
Descobertas, e a etiqueta na mão não achava o computador na tela que leva o nome dele: a BI foi o remendo
desse furo. Sair da lista não é o que os outros fazem. No Snipe-IT o ativo nunca sai; no NetBox, no GLPI e
no Shelf o item que está dentro de outro (rack, kit) continua na lista dele, e quem o guarda o mostra numa
aba, como a licença daqui. No iTop não se viu nada que tire, e no ServiceNow não se confirmou. A mesa
continua dita, agora na própria linha.

**Como a seta lembra o caminho:** no `state` da navegação, a mesma peça da
[BB](./plataforma.md#bb--toda-lista-ficha-e-formulário-seguem-o-mesmo-molde), com um nível a mais
(`useVoltaParaEstaFicha`). O critério é o do GOV.UK: voltar à página anterior no estado em que ela foi
vista por último.

**Descartado:** `navigate(-1)`, porque o histórico é cronológico: quem passa por outra tela no meio voltaria
para ela, e o link colado não teria para onde voltar. O parâmetro na URL, como o `return_url` do NetBox e o
`_changelist_filters` do Django, porque sujaria o endereço que se cola no chamado e pediria validar o
destino, que é onde o `back_url` do Redmine teve o redirecionamento aberto. Guardar os filtros de cada lista
na sessão, porque o menu recomeça a lista limpa (BB).

---

## BL — O computador no posto mostra o posto antes de quem o ocupa

> **Superada em parte por [BO](./posse.md#bo--em-responsáveis-vai-só-o-nome):** o selo Posto vago sai de embaixo do nome do posto.
>
> **E por [BP](./posse.md#bp--o-que-já-foi-mora-na-aba-histórico):** a aba Responsáveis passa ao box de Estoque e Licenças, e sai o histórico dela.

**Decidido** (2026-11-06, na revisão de Computadores):

- **Entregue a um posto, o responsável que aparece é o posto, em toda tela:** "Posto Mesa 1", ou o nome da pessoa
  quando foi entregue direto a ela. Vale na lista de Computadores, no cartão da ficha, na janela de devolução e nos
  Ociosos de Descobertas, como já valia em Estoque. Quem ocupa o posto não aparece, mesmo que seja um só; sem
  ninguém nele, o selo Posto vago fica embaixo do nome do posto.
- **O número da aba Responsáveis conta o posto como um,** tenha quantos ocupantes tiver, e vago também.
- **A pessoa só aparece pendurada no posto, na aba Responsáveis:** "Entregue para", o nome do posto e, embaixo dele,
  cada pessoa com "responsável pelo posto"; e no histórico da mesma aba, embaixo de cada entrega ao posto. Entregue a
  uma pessoa, a aba fica como estava.

**Supera:** em parte a [BJ](#bj--o-computador-entregue-a-um-posto-continua-na-lista-de-computadores), que punha
os ocupantes em cima e "no posto Mesa 1" embaixo.

**Por quê:** o nome do ocupante na primeira linha, igual ao de quem recebeu o computador direto, dava a entender
que a posse era da pessoa. A posse é do posto, e quem o ocupa responde por estar nele
([modelo de posse](../referencia/modelo-de-posse.md)). A tela diz o alvo da entrega, e a aba Responsáveis
mostra a ordem real: primeiro para quem foi entregue, depois quem responde por isso.

## BV — A vista Baixados conta por motivo, e o status do baixado é o motivo

> **Superada em parte por [CK](#ck--computadores-no-molde-das-outras-telas):** o aviso da ficha se chama Baixado, e não
> "Fora do patrimônio".

**Decisão.** A vista Baixados de Computadores deixa de mostrar os cartões da vista Ativos, e o Status do baixado passa a ser só
o motivo. A baixa continua separada do status (D19), e nenhuma regra de negócio mudou.

- **Os cartões da vista são o Total e um por motivo, os zerados inclusive.** Em uso, Disponível, Inutilizável e Pendente não
  dizem nada de quem saiu do patrimônio, e o número não batia com a lista embaixo. O cartão filtra: `?motivo=` na tela,
  `?retiredReasonId=` na API, e o `/stats` ganha `byRetiredReason`. Clicar continua em Baixados.
- **Na ordem do nome, e fixos.** O motivo é cadastro livre como o status (BT), mas nasce com seis e raramente muda, e sem o
  cartão por motivo não haveria como separar o vendido do roubado.
- **A Lixeira continua com os cartões da lista.**
- **O Status é "Vendido", sem o dia, e todo baixado é vermelho.** Na lista, no card e nos cartões da vista, em qualquer
  motivo. O dia cortava o texto na coluna, e o estado do ativo é o motivo. A data fica no aviso "Fora do patrimônio", na ficha.
- **A linha dá baixa e reverte,** com o mesmo formulário e a mesma pergunta da ficha. Só a ficha fazia, e quem via o ativo na
  lista precisava abrir para isso. Como na ficha, é do Supervisor, e o ativo entregue é recusado no formulário.

**O custo:** a coluna Status não diz mais quando saiu: para ver o dia, abre-se a ficha.

## BW — A linha da Lixeira abre a ficha, só para consulta

> **Superada em parte por [CF](#cf--a-linha-da-lixeira-de-colaboradores-também-abre-a-ficha):** a linha da Lixeira de
> Colaboradores também abre a ficha.

> **Superada em parte por [BZ](./reconciliacao.md#bz--vincular-e-desvincular-moram-em-descobertas):** a aba Máquina não tem mais Desvincular, em nenhuma ficha.

**Decisão.** Em Computadores, a linha da Lixeira abre a ficha, com as mesmas abas, e a única ação é Restaurar. Antes, ver o
histórico de um ativo excluído exigia restaurá-lo: uma escrita, que devolvia o ativo às listas e ia para a auditoria só para
alguém olhar. É o que o Snipe-IT faz: a rota do ativo inclui os excluídos.

- **É do Supervisor, como a Lixeira (AV).** A ficha, o histórico, as licenças, os componentes e a máquina alcançam o ativo
  excluído só para quem tem o cargo. Para o Técnico ele continua sem existir: 404, e a aba Máquina vazia.
- **Nenhuma escrita o alcança.** Editar, entregar e dar baixa continuam em 404, e a tela nem oferece: somem Entregar, Editar e
  o `⋯` do card, e o Desvincular da aba Máquina.
- **O aviso "Na lixeira" diz quando foi excluído,** entre o card e as abas, como o da baixa. Restaurar fica no card, e a ficha
  continua aberta, com as ações de volta.
- **Colaboradores não muda.** A tela está fechada, e a linha da lixeira de lá continua só restaurando.

**O custo:** o link para um computador excluído, no histórico de um colaborador, passa a abrir para o Supervisor, e continua
dizendo "Ativo não encontrado." para o Técnico.


## CF — A linha da Lixeira de Colaboradores também abre a ficha

**Decisão.** Como em Computadores ([BW](#bw--a-linha-da-lixeira-abre-a-ficha-só-para-consulta)), a linha da Lixeira de
Colaboradores abre a ficha, com as mesmas abas, e a única ação é Restaurar. Corrige o "Colaboradores não muda" da BW.

- **É do Supervisor, como a Lixeira (AV).** A ficha, o histórico e os postos alcançam o colaborador excluído só para quem
  tem o cargo. Para o Técnico ele continua sem existir: 404.
- **Nenhuma escrita o alcança.** Editar, desativar e entregar a ele continuam em 404, e a tela nem oferece: somem o Editar
  e o `⋯` do card ([CD](./plataforma.md#cd--a-ficha-do-colaborador-tem-as-ações-no-card)).
- **O aviso "Na lixeira" diz quando foi excluído,** entre o card e as abas, o mesmo do computador (`AvisoDaLixeira`).
  Restaurar fica no card, e a ficha continua aberta, com as ações de volta.
- **A seta volta para a Lixeira,** como estava.

**Por quê:** pedido para padronizar Colaboradores, e o motivo da BW vale aqui também: ver o histórico de quem foi
excluído exigia restaurá-lo, uma escrita que o devolvia às listas e ia para a auditoria só para alguém olhar.

**O custo:** o link para um colaborador excluído passa a abrir para o Supervisor, e continua dizendo "Colaborador não
encontrado." para o Técnico.

---

## CK — Computadores no molde das outras telas

**Decisão.** A lista, a ficha e os painéis de Computadores passam a seguir o que Estoque, Licenças e Postos já fazem. As
regras de negócio não mudaram, e nenhuma rota é nova.

- **O baixado não mostra o Entregar,** no `⋯` da lista e no card, como a licença encerrada e o item desativado. O que
  trava por um momento continua travado com o motivo, e a frase é curta como nas outras telas: "Já entregue: devolva
  antes de entregar de novo", "Em conserto: só computador disponível é entregue".
- **Reverter, e não desfazer, a baixa:** o botão é Reverter baixa, e as recusas de entregar e de vincular o baixado
  dizem "Reverta a baixa antes.".
- **O aviso da ficha se chama Baixado,** como a vista Baixados, e não "Fora do patrimônio". O motivo e o dia continuam
  embaixo.
- **A descrição do painel diz qual é o computador, e a regra vai para a ajuda do campo (AZ):** o Clonar diz "Cópia de
  ATV-00012"; o Dar baixa traz a etiqueta, o modelo e a série, como o Entregar e o Devolver, e a frase da lixeira vai
  para a ajuda do Motivo. A Data da saída perde a ajuda, como as outras datas.
- **As ajudas do Entregar são as do Estoque:** o Colaborador sem ajuda, e o Posto com "O posto é o responsável, e quem
  está nele responde pelo computador."
- **Devolver:** "Status após a devolução", par do "Status após a entrega", com "Em branco, volta disponível." O quadro de
  Responsáveis sai do painel: ele abre da linha do responsável.
- **Nome, e não "Nome / apelido",** no formulário e no card, como a busca diz.
- **No código, a ficha mora em `computadores/ficha/`,** como a das outras telas, com `useFichaDoComputador` e os
  componentes em português.

**Supera em parte:** [BV](#bv--a-vista-baixados-conta-por-motivo-e-o-status-do-baixado-é-o-motivo) (o nome do aviso da
ficha).

**Por quê:** era a tela que faltava na revisão do molde, depois de Licenças, Estoque e Postos, e o padrão vem de
`telas.md`: o título é ação e tipo, a descrição diz qual registro, a regra mora na ajuda do campo, e cada coisa tem um
nome só (CH).

**O custo:** as frases de recusa mudam, e os testes que as comparam acompanham.

**O que ficou de fora.** O card com Responsáveis, Volta para e os canais de suporte (BS, AW), a ordem dos campos do
Entregar, que também difere entre Estoque e Licenças, e a lixeira dos baixados, adiada.

---

## CL — O baixado não vai para a lixeira, e a máquina sai antes da baixa e da lixeira

**Decisão.** A baixa e a lixeira deixam de se somar, e o computador com máquina vinculada não sai por nenhuma das duas.
Retoma a lixeira dos baixados, que a [CK](#ck--computadores-no-molde-das-outras-telas) adiou.

- **O baixado não vai para a lixeira.** Excluir é 409, `ATV-00042 teve baixa e não vai para a lixeira. Reverta a baixa
  antes.`, e o Excluir some do `⋯` do baixado, na lista e na ficha, como o Entregar (CK). O banco recusa o par também: o
  `CHECK` `assets_baixado_fora_da_lixeira` é a invariante 26.
- **Os dois caminhos continuam:** a baixa feita por engano se reverte, e o computador se exclui; o excluído que foi
  vendido se restaura e recebe a baixa. Dar baixa direto da Lixeira não: a ficha de lá é só consulta
  ([BW](#bw--a-linha-da-lixeira-abre-a-ficha-só-para-consulta)).
- **A máquina vinculada segura a baixa e a lixeira,** como a posse, a licença e o componente: 409, `ATV-00042 ainda tem a
  máquina PC-FIN-07 vinculada. Desvincule pela tela de Descobertas antes de dar baixa.`, com a máquina em link para a
  lista Vinculadas, onde mora o Desvincular. A invariante 20 passa a incluir a máquina; na outra ponta, o vínculo já
  recusava o baixado, e o da lixeira não era encontrado. A aba Máquina do computador na Lixeira fica vazia.
- **A baixa e a lixeira encerram as sugestões de vínculo do computador** na mesma transação, como o vínculo encerra as
  da máquina, e a rodada do job encerra a que ela propôs no meio. Antes, elas ficavam em Sugestões para sempre, e o
  Aceitar dava 409 ou 404.

**Por quê:** a lixeira é o cadastro feito por engano, e a baixa é fato: o computador existiu e saiu do patrimônio.
Excluir o baixado o tirava de Baixados e soltava a etiqueta e a série, que só são únicas fora da lixeira: a mesma máquina
vendida podia voltar como cadastro novo. E a máquina de um computador que saiu seguia na cobertura, com a telemetria e os
comandos de reiniciar e desligar.

**As referências:** Snipe-IT, GLPI, ServiceNow, Shelf.nu, NinjaOne e Lansweeper não bloqueiam excluir o aposentado, mas
em nenhum deles excluir é "cadastrado por engano": é a limpeza definitiva do dado vencido, e o ServiceNow exige aposentar
antes de excluir. Aqui a lixeira se restaura, e não limpa nada.

**O custo:** a baixa feita por engano pede dois passos até a lixeira, e a máquina de um computador vendido se desvincula
antes da baixa.

## CN — A etiqueta e a série não se repetem com outra caixa

**Decisão.** A etiqueta e a série do computador continuam únicas fora da lixeira, e agora sem diferença de maiúscula:
"ABC123" e "abc123" são a mesma série. Antes, só a grafia exata colidia.

- **No banco:** os dois índices parciais passam a ser sobre `lower()`, e viram a invariante 27, com teste próprio.
- **Na aplicação,** antes do banco, no cadastro, na edição e ao restaurar, para dizer qual campo colidiu: `A etiqueta
  ATV-00042 já está em uso por outro computador.` e `O número de série 5CD1234XYZ já está em uso por ATV-00042.` A
  série diz quem a tem, que pode ser um baixado: a baixa não a solta.
- **O curinga não colide:** o `equals` sem caixa do Prisma vira `ILIKE`, e `_` e `%` vão escapados, como no nome do
  catálogo.

**Por quê:** o vínculo com o agente já comparava a série em minúsculas. Dois cadastros com a mesma série em caixas
diferentes passavam os dois, casavam com a mesma máquina, e o vínculo travava por ambiguidade. E nenhum teste provava a
recusa da repetida.

**As referências:** o Snipe-IT recusa a etiqueta repetida fora da lixeira (`unique_undeleted`), e a série também, com a
opção de série única ligada; a comparação é a do MySQL, que não diferencia maiúscula.

**O custo:** o computador antigo cadastrado com a mesma série em outra caixa precisa ser corrigido antes de a migração
subir. No banco de desenvolvimento não havia nenhum.
