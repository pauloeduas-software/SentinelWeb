# Decisões do catálogo e do ativo

> O vocabulário do inventário: o que é `Asset`, o que é `Endpoint`, as tabelas de catálogo e as vistas da listagem.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D1–D3, D5, D8–D13, D18–D21, D85, e C/I da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D1 — `InventoryItem` vira `Asset`; o `Asset` atual (descoberto pelo agente) vira `Endpoint`

**✅ FEITO na F1.**
Executado como `drop`+`create` do lado ITAM (D12) e rename de verdade do lado RMM.
No Snipe-IT, `Asset` é o ativo gerenciado — é esse vocabulário que queremos. A tabela que o
agente C# popula passa a se chamar `Endpoint` (`@@map("endpoints")`).
Impactou: `server/domain/agent/`, `server/domain/asset/` (virou `endpoint/`),
`server/domain/inventory/` (virou `asset/`), `src/domain/asset/`, `src/pages/telemetria/*`.
⚠️ O ponto de risco era `touchAsset`, chamada a cada mensagem do agente: um `prisma.asset`
apontando para o model errado ali congelaria o `lastSeen` e o zombie cleaner marcaria a frota
inteira como OFFLINE. **Verificado na auditoria:** o arquivo hoje é
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
A `Location` de verdade nasceu na F1, do zero — não havia nada para migrar.

---

## D3 — `quantity` sai do `Asset`

**✅ APLICADO na F1.**
No Snipe-IT 1 linha = 1 equipamento físico, com etiqueta e série próprias. Quantidade só
existe em `Accessory`, `Consumable` e `Component` (F5). Resolveu-se sozinho pelo D12: a
tabela nova nasceu sem a coluna.

---

## D5 — Nada de texto livre onde o Snipe-IT tem tabela

**✅ APLICADO na F1.** `category` e
`status` viraram `Category` (com `type`) e `StatusLabel` (com `type`).
**Correção vinda da auditoria da F1:** o seed classificava "Em Uso" como `DEPLOYABLE`, e
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

**O outro lado disto, achado pela auditoria das F0/F1.** Se a extension não alcança leitura
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

> **O número cresceu, a decisão não mudou.** Eram sete specs; a F9 acrescentou duas (D64) e a
> F11 a décima (D75). "Um domínio `catalog`" segue valendo — e cada tabela nova continua sendo
> **uma spec, nenhuma rota escrita à mão**. Quem contar os arquivos em `specs/index.ts` vai
> achar dez.

> **E depois encolheu, e a decisão continua a mesma.** As duas da F9 saíram com os campos
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

> **O preço foi cobrado na auditoria das F0/F1, e é o que o D5 conta:** o `IN_USE` entrou como
> quinto valor do `StatusLabelType` e exigiu `ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE'` escrito à
> mão — o `migrate diff` acrescenta no fim, e a posição importa porque o Postgres ordena pela
> ordem de declaração e a listagem de status é ordenável por `type`.

---

## D11 — Rota de opções separada da listagem.

`GET /api/<slug>/options?q=` devolve `{ id, name }[]` cru, sem envelope, ordenado
por nome, teto de 200.

A listagem pagina com `perPage` máximo de 100 (`core/http/list-query.ts`) — certo
para tabela, errado para `<select>`: o seletor de modelo do formulário de ativo
(F2) e o de pai da `Location` precisam da lista inteira. Sem esta rota, o
formulário pediria `perPage=100` e mentiria em silêncio a partir do 101º item.

---

## D12 — O `Asset` nasce inteiro na F1. `inventory_items` é apagada, não migrada.

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

---

## D13 — A segurança do rename depende de o `Asset` novo **não** ter `status`, `lastSeen` nem `hwid`.

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

---

## D18 — `AssetLog` não nasce. A aba Histórico lê o `ActivityLog`.

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

## D21 — Ação em massa é tudo ou nada; entrega em massa não será (F4).

**Decidido:** `POST /api/assets/bulk` roda numa `$transaction` e falha inteira se
um id barrar, devolvendo 409 com a lista.
**Descartado:** aplicar o que der e devolver relatório por linha.
**Por quê:** edição em massa é **uma** intenção aplicada a N linhas — metade
aplicada é um estado que ninguém pediu e ninguém desfaz sem conferir os 200 um a
um. É o oposto do checkout em massa da F4, que são N entregas independentes: 7
entregues e 1 recusado é um resultado legível. A diferença não é inconsistência,
é a natureza da operação — e por isso está declarada nos dois planos.

---

## D85 — `?view=archived` é a quarta vista, e a listagem padrão passa a excluir `ARCHIVED`.

**Decidido:** `ASSET_VIEWS` vira `['active','trashed','retired','archived']`, e `active` passa
a excluir também `status.type = ARCHIVED`.
**Descartado:** uma coluna `archivedAt`, espelhando `retiredAt`.
**Por quê:** arquivar **já é** um tipo de `StatusLabel` desde a F1, e a invariante que impede
arquivar ativo entregue já lê `status.type`. Uma coluna nova seria uma segunda verdade sobre o
mesmo fato — o erro do D17 uma camada acima.

**É uma mudança de comportamento, e está declarada:** ativo arquivado aparecia na listagem
padrão e a partir daqui não aparece mais. É o que o roadmap do projeto sempre
pediu (*"sai das listagens por padrão"*) e o que não tinha sido implementado.

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

**Por quê precisou ser dito outra vez:** o D3 já tinha decidido isso na F1, pela régua "tem
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
