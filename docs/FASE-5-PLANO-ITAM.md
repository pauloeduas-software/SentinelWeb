# Plano de implementação — Fase 5: acessórios, consumíveis e componentes

> Plano **prospectivo** da Fase 5 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o
> código real depois da F1 e contra [`MODELO-POSSE.md`](./MODELO-POSSE.md). Convenções de
> camada: [`ARQUITETURA.md`](./ARQUITETURA.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
>
> **Decisões `D33`–`D38`**, continuando a sequência global onde a F4 parou (D32).

---

## Objetivo

Os três tipos de item que **têm quantidade** — e que por isso não são `Asset` (D3). Lá uma
linha é um equipamento com etiqueta e série; aqui uma linha é **N unidades
intercambiáveis**, e o que separa os três é o que acontece quando uma sai:

| | Sai para | Volta? | Como a linha de saída fecha |
|---|---|---|---|
| **`Accessory`** | pessoa **ou posto** | sim | `checkedInAt` preenchido |
| **`Consumable`** | pessoa | **não** | **não existe coluna para fechar** |
| **`Component`** | **outro ativo** | sim, inclusive parcial | `detachedAt` preenchido |

A régua contra o `Asset`: **tem etiqueta própria → é `Asset`**. A dock tem patrimônio e
série, então é `Asset` com `Assignment` de alvo `ASSET` (F4). O pente de RAM não tem,
então é `Component`. O mouse avulso da gaveta não tem, então é `Accessory`.

**A novidade sobre o Snipe-IT:** o acessório pode ser entregue a um **posto**, não só a
uma pessoa. Entregar 5 mouses à Mesa 1 é o caso real do `MODELO-POSSE.md`.

---

## Pré-requisitos

| Precisa estar pronto | Por quê | Estado |
|---|---|---|
| **F1** — `Category` com `type`, `Supplier`, `Manufacturer`, `Location`, `Asset` | categorias próprias por tipo, dados de compra, e o alvo do `ComponentAsset` | ✅ |
| **F4** — `Assignment`, `LocationOccupant`, `resolverResponsaveis()`, `holdings` e `offboard` | o acessório entregue a um posto herda os ocupantes; sem a Camada 2 o alvo `LOCATION` não resolve responsável nenhum. Esta fase **estende** o `holdings` e o `offboard`, não cria paralelos | tabelas ✅ (`20260923011728_posse_e_ocupacao`), use-cases na F4 |
| **F0** — soft delete, `ActivityLog`, `parseListQuery` | herdados de graça | ✅ |

**Não é pré-requisito:** F3 (auth) — `actorId` segue nulo, como no resto do sistema.

**Um item do TODO ficou sem objeto e já foi removido na reescrita:** *"migração do
`InventoryItem` achatado para os três tipos"*. A tabela `inventory_items` foi **apagada**
na F1 (D12); não há dado a migrar e as seis tabelas desta fase nascem vazias. Registrado
aqui para ninguém o ressuscitar ao ler um plano antigo (prova: **Verificação, 1**).

---

## Etapas

### Etapa A — Schema e migração · **M**

Seis tabelas, um enum, migração puramente aditiva.

| Model | Campos próprios | Regra de negócio em uma linha |
|---|---|---|
| `Accessory` | `name`, `qty Int`, `minQty Int?`, `modelNumber?`, `categoryId`, `manufacturerId?`, `supplierId?`, `locationId?`, compra (`orderNumber?`, `purchaseDate?`, `purchaseCost Decimal?`), `notes?`, `deletedAt?` | uma linha = N unidades iguais de algo que é entregue e volta |
| `AccessoryCheckout` | `accessoryId`, `targetType AccessoryTarget`, `targetUserId?`, `targetLocationId?`, `checkedOutAt`, `expectedCheckinAt?`, `checkedInAt?`, notas e `checkoutById?`/`checkinById?` | **uma linha por unidade entregue**; devolver preenche `checkedInAt` e nunca apaga a linha |
| `Consumable` | os mesmos do `Accessory` | idem, para o que não volta |
| `ConsumableCheckout` | `consumableId`, `userId?`, `userNameSnapshot`, `qty Int @default(1)`, `consumedAt`, `notes?` | **sem coluna de fechamento**: a irreversibilidade é estrutural, não uma regra a lembrar |
| `Component` | os mesmos + `serial?` | idem, para o que vai para dentro de um ativo |
| `ComponentAsset` | `componentId`, `assetId`, `assignedQty Int`, `attachedAt`, `detachedAt?`, `notes?` | **uma linha por instalação, com quantidade** — a primeira ponte real entre estoque e ativo |

```prisma
// Só USER e LOCATION. `ASSET` não entra: o que vai para DENTRO de um ativo é
// `Component`. Um enum que admite valor sem significado é um enum que um dia
// vai guardar um — foi assim que a auditoria da F1 achou "Em Uso" DEPLOYABLE.
enum AccessoryTarget { USER  LOCATION }
```

**Escrito à mão na migration** (o `migrate diff` não emite nenhum destes):

```sql
CREATE UNIQUE INDEX "accessories_name_unico_ativo"          -- idem consumables, components
  ON "accessories"("name") WHERE "deletedAt" IS NULL;       -- o `unique_undeleted` de novo

ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkout_alvo_xor"
  CHECK (("targetType"='USER'     AND "targetUserId" IS NOT NULL AND "targetLocationId" IS NULL)
      OR ("targetType"='LOCATION' AND "targetLocationId" IS NOT NULL AND "targetUserId" IS NULL));

CREATE INDEX ON "accessory_checkouts"("accessoryId") WHERE "checkedInAt" IS NULL;
CREATE INDEX ON "component_assets"("componentId")    WHERE "detachedAt" IS NULL;
CREATE INDEX ON "component_assets"("assetId")        WHERE "detachedAt" IS NULL;
```

`onDelete`: `Restrict` em catálogo e nos alvos (pessoa, posto, ativo) — é o 409 por uso,
e a FK é a rede embaixo dele.

### Etapa B — O domínio `stock` · **G**

```
server/domain/stock/
├── stock.maestro.ts
├── controllers/{accessory,consumable,component}.controller.ts
├── schemas/{accessory,consumable,component}.schema.ts   # strictObject, SEM `qty` no update
├── helpers/stock-balance.helper.ts                      # o saldo derivado, um lugar só
├── helpers/stock-filters.helper.ts                      # allowlists de ordenação e busca
└── use-cases/  checkout-accessory · checkin-accessory · consume-consumable
                attach-component · detach-component · adjust-quantity · list-stock-alerts
```

```
GET    /api/accessories | /api/consumables | /api/components      listagem com saldo
POST   /api/accessories/:id/checkout   { targetType, targetUserId | targetLocationId }
POST   /api/accessories/checkouts/:id/checkin
POST   /api/consumables/:id/consume    { userId, qty }
POST   /api/components/:id/attach      { assetId, qty }
POST   /api/components/attachments/:id/detach  { qty }     ← parcial
POST   /api/<tipo>/:id/adjust-quantity { delta, reason }
GET    /api/stock/alerts[?tipo=]       saldo < minQty, e posto vago com unidade parada
```

### Etapa C — Saldo derivado e a trava · **M**

```
disponivel(accessory)  = qty − COUNT(checkouts WHERE checkedInAt IS NULL)
disponivel(consumable) = qty − SUM(consumos.qty)
disponivel(component)  = qty − SUM(assignedQty WHERE detachedAt IS NULL)
```

**Regra em uma linha:** `qty` é *quanto entrou*, a saída é *linha*, o saldo é *conta* — e
toda saída roda dentro de uma transação que primeiro tranca a linha-pai (D34).

### Etapa D — `StockLog` e o ajuste de estoque · **P**

`StockLog`: `itemType`, `itemId`, `delta Int`, `reason`, `notes?`, `actorId?`, `createdAt`.

**Regra em uma linha:** o `StockLog` responde *por que a quantidade nominal mudou*
(chegou nota, quebrou, recontagem) — **não** para onde a unidade foi, que já está na
tabela de checkout; `qty` só muda por `adjust-quantity`, na mesma transação que grava o
log, e a "movimentação completa" da tela é a união das duas fontes na leitura.

### Etapa E — Telas · **M**

`src/pages/estoque/` com três abas no padrão `font-mono text-xs`, reusando `ListToolbar`
com a aba Lixeira ligada; `src/domain/stock/stock.queries.ts`; tipos em `src/domain/shared/`
declarando `purchaseCost: string` (Decimal sai como string — armadilha nº 7 da F1). A coluna
principal é **`disponivel / qty`**, com `minQty` estourado em vermelho por `style`, nunca
por classe montada em runtime.

### Etapa F — Integração com a F4 · **M**

Nenhum arquivo novo do lado da posse: esta etapa **estende** o que a F4 escreveu.

- `GET /api/users/:id/holdings` passa a listar acessórios com a **mesma `via`** que a F4
  já usa nos ativos (`DIRETO` | `POSTO`); `DELETE /api/users/:id` soma os `DIRETO` no 409.
- `POST /api/users/:id/offboard` fecha **só** os checkouts de alvo `USER` — o resto da
  operação (encerrar as ocupações) é da F4 e não muda.
- `GET /api/locations/:id/occupancy` ganha os acessórios do posto — o *"o que este posto
  tem"* do TODO.

---

## Decisões da fase

### D33 — O acessório entregue a um posto é **do posto**; os ocupantes respondem solidariamente

**Decidido:** uma unidade entregue à Mesa 1 é **uma** unidade entregue, qualquer que seja
o número de ocupantes; `resolverResponsaveis()` devolve Laura **e** Ana e o saldo cai 1.
**Descartado:** "entregue a posto de N ocupantes conta como N entregas".

**Por quê:** o saldo do estoque passaria a depender do RH. O posto ganha uma terceira
ocupante e, sem ninguém tocar em uma unidade física, o disponível cairia de 2 para 0.
Quantidade é fato do almoxarifado; número de ocupantes é fato da escala — ligar os dois
inventa movimentação que não aconteceu. É também a única leitura coerente com a Camada 3:
o ativo entregue à Mesa 1 continua sendo **um** ativo com **dois** responsáveis, e o mouse
que está na mesma mesa não tem motivo para se comportar diferente.

**O que a tela carrega por causa disso:** "quantos mouses a Laura tem?" ganha duas
respostas honestas — *diretos* e *por posto, compartilhados* — que **nunca** são somadas
num número só: somar produz "Laura tem 6 mouses" a partir de 5 compartilhados, frase falsa
sobre o patrimônio. **E o posto vazio cai de graça:** unidade entregue a posto sem ocupante
aberto resolve para `[]` — não é bug, é o *posto vago* do `MODELO-POSSE.md` aplicado ao
estoque, candidato a voltar, listado em `/api/stock/alerts`.

### D34 — Saldo é sempre **calculado**, nunca coluna

**Decidido:** `qty` (quanto entrou) é coluna; `disponivel` é `COUNT`/`SUM` sobre as linhas
de saída, num helper só. **Descartado:** uma coluna `qtyAvailable` mantida por decremento.

**Por quê — qual corrida a coluna cria.** A óbvia é a do *ler-e-depois-escrever*, a mesma
que o `nextAssetTag()` da F1 documenta: duas requisições leem `qtyAvailable = 1`, as duas
calculam `0`, as duas gravam — duas unidades entregues de um estoque de uma. Em
`READ COMMITTED` nada impede, e um `UPDATE … SET x = x − 1` resolve só **esse** caso.

A segunda é pior porque é silenciosa e permanente: **a coluna pode divergir das linhas.**
Basta um `INSERT` de checkout que não passe pelo decremento — falha no meio de uma
operação sem transação, correção à mão no `psql`, importador de CSV da F10. A partir daí a
coluna mente **para sempre** e nada detecta, porque a coluna *é* a resposta: não existe
ninguém para discordar dela. Com `COUNT` a resposta não pode divergir das linhas — ela
**são** as linhas. É o D16 uma camada abaixo.

**O que o `COUNT` sozinho não resolve.** Duas requisições podem contar "4 de 5 ocupados" e
as duas inserirem: 6 de 5. Contar não é travar. Então **toda saída tranca a linha-pai**:

```ts
await prisma.$transaction(async (tx) => {
  // A linha do acessório é o mutex. Precisa ser DENTRO da transação: um lock em
  // autocommit é um lock que dura zero milissegundo.
  await tx.$queryRaw`SELECT id FROM accessories WHERE id = ${id}::uuid FOR UPDATE`;
  const ocupados = await tx.accessoryCheckout.count({ where: { accessoryId: id, checkedInAt: null } });
  if (ocupados >= qty) throw new AppError('Sem unidade disponível.', 409, { qty, ocupados });
  await tx.accessoryCheckout.create({ /* … */ });
});
```

Serializa só os checkouts **do mesmo item**. Se o SQL cru incomodar, o equivalente pela
API tipada é um `tx.accessory.update({ where: { id }, data: { updatedAt: new Date() } })`
como primeira operação — tranca a mesma linha, mas esconde a intenção, e por isso não é a
primeira escolha.

### D35 — Um domínio `stock`, não três fatias verticais

**Decidido:** `server/domain/stock/` com os três dentro, esqueleto padrão.
**Descartado:** `accessory/`, `consumable/` e `component/` separados (o default 1:1 do
`ARQUITETURA.md`), e enfiar os três no motor de specs do catálogo.

**Por quê:** os três compartilham **uma** invariante (saldo derivado + trava na linha-pai)
e **uma** tela; três fatias copiariam a invariante três vezes, e invariante copiada é
invariante que um dia diverge — o argumento do D9 num caso menor. O que difere são as
*operações*, e operação já é um arquivo por vez em `use-cases/`. O motor do catálogo não
serve porque a coluna principal da listagem é **derivada** e o `select` da `CatalogSpec` é
allowlist estática: ensiná-lo a calcular saldo seria dobrar um genérico para atender três
clientes — abstração que passa a custar mais do que economiza.

### D36 — Os três têm lixeira; aqui o D8 não se aplica

**Decidido:** `deletedAt` nos três, `name` único por índice parcial, `DELETE` respondendo
**409 enquanto houver saída aberta**.

**Por quê o catálogo não tem e estes têm:** o vazamento que o D8 evitou é o de um registro
apagado aparecendo como valor **atual** de outra linha (a categoria na lixeira ainda sendo
a categoria do ativo). Aqui a leitura aninhada é de **histórico** — o nome do acessório na
linha de consumo de março — e mostrar o item apagado ali é **certo**. E o delete real
levaria junto o histórico de consumo, a única coisa da fase que não se reconstrói.

### D37 — `Consumable` não tem devolução; não é validação, é ausência

**Decidido:** `ConsumableCheckout` sem coluna de fechamento e sem rota de checkin. Um
`POST .../checkin` responde **404 do roteador**.

**Por quê:** a alternativa — aceitar a rota e responder 409 "consumível não volta" — põe a
regra na memória de quem escreve o próximo use-case. Sem coluna e sem rota, implementar a
devolução exige uma migração, que é o tipo de mudança que alguém revisa. Mesmo princípio
do D13: a segurança vem da **ausência** do nome, não de uma checagem. `userNameSnapshot` é
copiado no ato — o consumo precisa continuar legível depois que a pessoa sai.

### D38 — Devolução parcial de componente **divide a linha**

**Decidido:** devolver 2 de 4 pentes fecha a linha de 4 (`detachedAt = now()`) e abre uma
com `assignedQty = 2`. **Descartado:** decrementar `assignedQty` na linha aberta.

**Por quê:** decrementar apaga a resposta de *"quantos pentes estavam nessa máquina em
março?"*. A soma das linhas abertas continua sendo o estado atual (o que a tela mostra) e
a sequência continua sendo o histórico (o que a auditoria pede). **O preço, declarado:**
lido cru, o histórico parece dizer "instalou 4, retirou 4, instalou 2" — a aba rotula o
par como *devolução parcial: 2 de 4* comparando a linha fechada com a sucessora, que é
trabalho de apresentação, não de schema.

---

## Riscos e armadilhas

**O `offboard` do desligamento pode esvaziar o posto.** Ligado sem filtrar por
`targetType`, desligar a Laura devolve ao estoque os 5 mouses da Mesa 1 — que continuam
fisicamente na mesa, agora com a Ana. O inventário passa a mentir e ninguém percebe,
porque o saldo "bate". **O filtro `targetType: 'USER'` nessa query é a linha mais
importante da fase.**

**Contar não é travar.** Fazer o `count` fora da `$transaction`, ou o `FOR UPDATE` fora
dela, passa no teste com um usuário e só aparece no dia do onboarding de uma turma.

**`qty` no schema de edição reabre tudo:** dois caminhos para mudar quantidade e só um
gravando `StockLog`. `strictObject` já devolve 422 a chave desconhecida — basta **não**
declarar a chave.

**Checkout para posto sem ocupante não é erro.** Recusar quebraria o caso real de preparar
o posto antes de a pessoa chegar: aceita e **lista** no alerta de posto vago.

**Alvo na lixeira.** O `create` do checkout não lê o alvo e a extension de soft delete só
escopa operação de topo — usuário/posto apagado é consulta explícita no use-case. Pelo
mesmo motivo, nada no banco impede um `Accessory` apontar para `Category` de
`type = ASSET`: guarda no use-case, `optionFilter` da spec protegendo a tela.

**`COUNT` de consumível cresce para sempre** — cada consumo é linha que nunca fecha. Com
índice em `(consumableId)` serve folgado à escala de um time interno; se um dia não
servir, a saída é linha de fechamento de período, **não** coluna de saldo (reabriria D34).

**`Decimal` continua saindo como string** e o zero à direita continua sumindo
(`1234.50` → `"1234.5"`) — nos três `purchaseCost`.

---

## Verificação

```bash
API=http://localhost:3001
PSQL="docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -t -A -c"
```

**1. O que o schema tem que provar sozinho** — o item de migração do TODO não tem objeto
(D12), o saldo não é coluna, e o consumível não tem como fechar:

```bash
$PSQL "SELECT to_regclass('public.inventory_items');"        # → vazio (NULL)
$PSQL "\d accessories" | grep -i avail                       # → nada
$PSQL "\d consumable_checkouts" | grep -ci checkedin         # → 0
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/consumables/checkouts/$C/checkin   # → 404
$PSQL "INSERT INTO accessory_checkouts (id,\"accessoryId\",\"targetType\",\"targetUserId\",\"targetLocationId\",\"checkedOutAt\")
       VALUES (gen_random_uuid(),'$ACC','USER','$LAURA','$MESA1',now());"
# → ERROR: violates check constraint "accessory_checkout_alvo_xor"   ← o XOR é do banco
```

**2. Entrega ao posto não multiplica por ocupante** (Mesa 1 com Laura e Ana abertas):

```bash
curl -s -X POST $API/api/accessories/$ACC/checkout -H 'Content-Type: application/json' \
  -d "{\"targetType\":\"LOCATION\",\"targetLocationId\":\"$MESA1\"}"
curl -s "$API/api/accessories/$ACC" | jq '{qty, disponivel}'    # 5 → 4, NÃO 3
$PSQL "SELECT COUNT(*) FROM accessory_checkouts WHERE \"accessoryId\"='$ACC' AND \"checkedInAt\" IS NULL;"   # → 1
curl -s "$API/api/users/$LAURA/holdings" | jq '[.acessorios[] | .via] | group_by(.)'
# → [["POSTO"]]   — via por item, como nos ativos. Nunca um total somado.
```

**3. A corrida** (acessório com `qty = 1`, dois checkouts simultâneos) **e o `offboard`**
(que não pode esvaziar o posto):

```bash
seq 2 | xargs -P2 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $API/api/accessories/$ACC1/checkout -H 'Content-Type: application/json' \
  -d "{\"targetType\":\"USER\",\"targetUserId\":\"$LAURA\"}"        # → um 201 e um 409
$PSQL "SELECT COUNT(*) FROM accessory_checkouts WHERE \"accessoryId\"='$ACC1' AND \"checkedInAt\" IS NULL;"  # → 1

curl -s -X POST $API/api/users/$LAURA/offboard
$PSQL "SELECT \"targetType\", \"checkedInAt\" IS NULL AS aberto FROM accessory_checkouts WHERE \"accessoryId\"='$ACC';"
# → LOCATION|t     (a unidade do posto continua aberta)
```

**4. Devolução parcial divide a linha, e `qty` só muda pelo ajuste:**

```bash
curl -s -X POST $API/api/components/$COMP/attach -H 'Content-Type: application/json' -d "{\"assetId\":\"$ATIVO\",\"qty\":4}"
curl -s -X POST $API/api/components/attachments/$ATT/detach -H 'Content-Type: application/json' -d '{"qty":2}'
$PSQL "SELECT \"assignedQty\", \"detachedAt\" IS NULL AS aberta FROM component_assets WHERE \"componentId\"='$COMP' ORDER BY \"attachedAt\";"
# → 4|f  /  2|t

curl -s -o /dev/null -w "%{http_code}\n" -X PUT $API/api/accessories/$ACC \
  -H 'Content-Type: application/json' -d '{"qty":99}'           # → 422 (chave desconhecida)
curl -s -X POST $API/api/accessories/$ACC/adjust-quantity -H 'Content-Type: application/json' -d '{"delta":10,"reason":"COMPRA"}'
$PSQL "SELECT delta, reason FROM stock_logs WHERE \"itemId\"='$ACC';"   # → 10|COMPRA
```

**5. Posto vago:** fechar as duas ocupações da Mesa 1 e conferir que `/api/stock/alerts`
lista a unidade parada lá.

---

## Commits, TODO e perguntas em aberto

Um commit por etapa, na ordem A→G; o lint passa em cada um. No `ITAM-TODO.md`:
**(1)** responder a pergunta em aberto do item do `AccessoryCheckout` apontando para o
**D33**; **(2)** trocar `GET /api/accessories/alerts` por **`/api/stock/alerts`** — o
alerta vale para os três tipos e a tela é uma só, então o tipo é filtro, e o *posto vago
com acessório* entra como segunda categoria; **(3)** reescrever *"a quantidade não é campo
do formulário"*: não é remoção, é **não nascer**; **(4)** registrar `D33`–`D38`.

Fica em aberto, de propósito:

- **Consumível entregue a um posto ou setor** ("resma para o Andar 2"): aqui o consumo é
  sempre de uma pessoa, porque a pergunta que ele responde é de rateio e orçamento tem
  dono, não móvel. Se a operação pedir, é o mesmo enum — mas aí o `userNameSnapshot`
  precisa de um par para o posto.
- **Acessório com série** (headset caro, com patrimônio) cai hoje na régua como `Asset`.
  Se aparecer volume, a alternativa é uma tabela de unidades identificadas — que é, na
  prática, reinventar `Asset`. Decidir antes de construir.
- **`minQty` por localização** ("5 na Sede, 2 na Filial") exige estoque por local, que é
  outra tabela. Fora desta fase.

---

## O que a execução mudou em relação a este plano

> Escrito **depois** de a fase fechar, contra o código que ficou. O plano acima é
> prospectivo e não foi reescrito: o que mudou está aqui, com o motivo — que é o
> que se lê quando alguém encontra a diferença daqui a seis meses.

**1. Os três índices parciais da Etapa A não entraram.** O plano previa
`("accessoryId") WHERE "checkedInAt" IS NULL` e os dois irmãos em
`component_assets`. Eles são **redundantes** com os índices compostos que o
`migrate diff` já emitiu a partir do schema: `("accessoryId", "checkedInAt")`
cobre `WHERE "accessoryId" = ? AND "checkedInAt" IS NULL` pelas duas colunas, e
ainda serve à listagem de movimentação do item — que o parcial não serviria.
Dois índices para o mesmo caminho de acesso é custo de escrita em toda entrega,
sem leitura mais rápida em lugar nenhum. O motivo está escrito na própria
migration.

**O que ENTROU à mão e o plano não previa:** cinco `CHECK` de quantidade
(`qty >= 0` nos três, `qty > 0` no consumo, `assignedQty > 0` na instalação).
São a rede embaixo do use-case, pelo mesmo argumento do XOR.

**2. Não existe `GET /api/locations/:id/occupancy`.** A Etapa F pedia que ela
ganhasse os acessórios do posto; essa rota nunca foi escrita — o *"o que este
posto tem"* mora em **`GET /api/workstations/:id`** desde a F4, e as ocupações
em `/api/locations/:id/occupants`. Foi `/api/workstations/:id` que ganhou
`acessorios` e `totalAcessorios`. Criar a rota do plano seria uma segunda fonte
para a mesma pergunta.

**3. `holdings` devolve os acessórios em UMA lista, não em dois baldes.** O
plano dizia *"com a mesma `via` que a F4 já usa nos ativos"*, e é exatamente
isso: `via` por item (`DIRETO` | `POSTO`), lista única. Os ATIVOS continuam em
dois baldes porque a devolução de cada grupo é uma operação diferente na tela
(devolver × sair do posto); uma unidade de acessório se devolve pelo
`checkoutId` nos dois casos. O D33 continua garantido pelo que **não** existe na
resposta: nenhum total.

**4. `ActivityAction` ganhou três palavras: `INSTALL`, `UNINSTALL` e `ADJUST`.**
Reusar os `ATTACH`/`DETACH` do anexo teria posto "anexo posto" para a nota
fiscal e para o pente de RAM na MESMA aba Histórico do mesmo ativo — uma linha
do tempo em que ninguém distingue documento de hardware. `ADJUST` convive com o
`StockLog` pelo mesmo motivo que `CHECKOUT` convive com `assignments`: o log
responde a pergunta de estoque, a trilha põe o evento ao lado das edições.

**5. As Etapas B, C e D saíram num commit só.** Elas não se separam: a listagem
da Etapa B já mostra a coluna derivada, que é a Etapa C, e o `adjust-quantity`
da Etapa D é a única porta para `qty` — sem ele a Etapa B ficaria com um campo
de quantidade que o plano proíbe. A ordem A→F foi mantida.

**6. O seed ganhou três categorias** (`Acessório`, `Consumível`, `Componente`),
uma por tipo. Sem elas a primeira tela de estoque de um banco novo abriria sem
nenhuma categoria selecionável, e o cadastro seria impossível até alguém
descobrir que precisava criá-la em Configurações.

### O que a verificação do plano provou

As cinco baterias da seção *Verificação* rodaram contra a API, e viraram suíte
permanente em `tests/estoque/` — 46 asserções contra Postgres real, pelo mesmo
Fastify de produção. O que o `curl` provou uma vez, o `npm test` reprova a cada
execução:

| Verificação do plano | Onde vive agora |
|---|---|
| 1 — schema: sem `inventory_items`, sem coluna de saldo, sem checkin de consumível, XOR do banco | `invariantes.test.ts` |
| 2 — entrega ao posto não multiplica por ocupante | `invariantes.test.ts` › D33 |
| 3 — a corrida, e o `offboard` que não esvazia o posto | `corridas.test.ts` + `operacoes.test.ts` |
| 4 — devolução parcial divide a linha; `qty` só muda pelo ajuste | `operacoes.test.ts` › D38 + `invariantes.test.ts` |
| 5 — posto vago com unidade parada | `invariantes.test.ts` › D33 |

---

## Correções depois do fechamento

> Escrito **depois** de uma revisão completa da fase contra o código que ficou.
> Oito achados; os quatro primeiros mexiam no dado, os quatro últimos na
> leitura. Nenhum deles quebrava um teste — é por isso que cada correção veio
> com o teste que faltava.

### 1 — A categoria mudava de tipo por baixo do item de estoque

`countUsages` da categoria contava **modelos e ativos**, e mais nada. Uma
categoria usada só por acessórios contava zero, e o `beforeWrite` deixava passar
`ACCESSORY` → `ASSET`. O acessório terminava numa categoria de tipo `ASSET`:
exatamente o estado que `assertReferenciasDoItem` recusa com 422 na criação — e
que deixava o item **ineditável** pelo próprio formulário, porque o `PUT` manda
`categoryId` e levava o 422 de volta.

A guarda existia na porta do ITEM. A da CATEGORIA estava aberta, e o comentário
do arquivo já dizia o que faltava: *"a F5/F6 somam acessórios, consumíveis,
componentes e licenças"*. A F5 não somou.

**Corrigido:** os três entram em `contarUsos`, com `INCLUINDO_LIXEIRA`.

### 2 — Nenhum `countUsages` do catálogo conhecia as tabelas de estoque

O mesmo furo, do lado do `DELETE`, em **quatro** specs. As FKs são `Restrict`,
então o dado nunca correu risco — o Postgres recusava com P2003 e o
error-handler traduzia para *"Registro está em uso por outro cadastro"*. Um 409
que não diz por quantos nem por quê, que é justamente o que o `INVARIANTES.md`
manda evitar: *escreva a mensagem antes do código*.

**Corrigido:** categoria, fabricante, fornecedor e localização contam as três
tabelas de estoque. A localização conta também as **entregas** ao posto —
abertas **e fechadas**, porque `targetLocationId` é `Restrict` e a entrega já
devolvida continua segurando a linha no banco.

### 3 — O ativo na lixeira prendia as peças dentro dele

`deleteAsset` não tinha guarda nenhuma. Com 4 pentes instalados, a exclusão
respondia 200, o `disponivel` do componente ficava em zero **para sempre** e
`GET /api/assets/:id/components` passava a responder 404 — a tela que ofereceria
a retirada deixava de existir. Unidades fora do estoque, sem caminho de volta, e
com o saldo "batendo".

O `onDelete: Restrict` de `component_assets.assetId` não cobre: apagar aqui é
`UPDATE assets SET "deletedAt"`, o Postgres não vê `DELETE` e a FK não é
consultada. É o ponto cego do soft delete que `deleteUser` e `deleteStockItem`
documentam — e `deleteStockItem` já recusava o caso **simétrico**.

**Corrigido:** 409 com a contagem, e `travarAtivoOuFalhar` antes do `count`
(`asset/use-cases/lock-asset.usecase.ts`), porque contar não é travar aqui
também. `attachComponent` passou a travar o ativo depois do componente —
**componente antes de ativo**, ordem fixada para o grafo de travas continuar
acíclico.

### 4 — A nota da retirada apagava a nota da instalação

`ComponentAsset` tinha **uma** coluna `notes` para os dois eventos da linha, e o
`detach` escrevia nela. *"Upgrade de 8 para 16 GB"* sumia no dia em que alguém
registrava *"2 pentes com defeito"* — e a movimentação, que lia a mesma coluna
nos dois eventos, passava a mostrar o texto da RETIRADA na linha da INSTALAÇÃO.

O `AccessoryCheckout` nunca teve o problema porque nasceu com o par
`checkoutNotes`/`checkinNotes`.

**Corrigido:** coluna `detachNotes` (migration `20260923213000_componente_nota_e_sucessora`).
`notes` **não** foi renomeada para `attachNotes`: o par ficaria mais simétrico no
nome em troca de reescrever uma coluna com dado dentro e zero mudança de
comportamento.

### 5 — O rótulo *"devolução parcial: 2 de 4"* que o D38 prometeu não existia

O D38 declarou o preço da divisão e disse que ele seria pago na apresentação —
*"a aba rotula o par comparando a linha fechada com a sucessora"*. Não havia
como comparar: **nada no banco ligava as duas**. O único vínculo era o
`sucessoraId` no `changes` do `ActivityLog`, que é trilha de auditoria e não
fonte para leitura de tela. E casar as duas por timestamp é a heurística que o
próprio use-case rejeita em texto.

**Corrigido:** `predecessorId` (`@unique`, self-FK `SetNull`) grava a divisão. A
movimentação passou a emitir a retirada com `parcial: { retirada, de }` e a
**não emitir** a instalação da sucessora — aquelas unidades nunca voltaram ao
estoque, e contá-las como entrada dava três movimentos para um fato só. A tela
lê *"Retirado — parcial: 2 de 4"*.

> **E uma correção da correção, achada rodando o app.** A migration da coluna
> afirmou que não havia o que preencher — *"`predecessorId` nulo é 'esta
> instalação não nasceu de uma divisão', o caso de toda linha anterior"*. Errado:
> as divisões que **já existiam** ficaram com a coluna nula e continuaram lendo
> do jeito antigo. Nenhum teste pegava — a suíte trunca e semeia, então o banco
> dela nunca tem linha legada. Quem pegou foi o primeiro `GET /movements` contra
> o banco de desenvolvimento.
>
> A `20260923220000_backfill_sucessora` preenche o vínculo a partir do
> `ActivityLog`, que sempre gravou `changes.instalacaoId` e
> `changes.sucessoraId` — **leitura de um fato registrado, não reconstrução por
> timestamp**, que é a heurística que o use-case recusa. Uma migration aplicada
> não se edita (o checksum quebraria o `migrate deploy` de quem já a rodou), por
> isso são duas, com a frase errada da primeira corrigida no cabeçalho da
> segunda.

### 6 — O alerta de posto vago enchia de localização que não é posto

A entrega aceita qualquer `Location` (a F4 também aceita, para ativos) e o
`/options` de localizações devolve tudo de propósito. Uma unidade entregue a um
prédio entrava no alerta **para sempre**: prédio não tem ocupante e nunca vai
ter, então `occupants: none` é verdade eterna para ele. Alerta é lista para
agir, e lista que nunca esvazia é lista que se para de ler — ainda por cima com
um link para `/postos`, que não mostra o que não é posto.

**Corrigido:** `targetLocation: { isWorkstation: true }` na consulta do alerta.
O checkout continua permissivo, por coerência com a F4; o que foi apontado para
o caso certo é o **sinal**.

### 7 — A movimentação escondia o evento mais recente

Cada fonte lia as `limite` linhas mais recentes por `checkedOutAt` (ou
`attachedAt`) e só depois a união era ordenada por data **do evento**. A entrega
de janeiro devolvida hoje é o evento mais novo do item e uma das linhas mais
antigas por data de saída: ela não entrava no `take`, e a devolução sumia de uma
lista que promete *"mais recente primeiro"*. Sem erro, e com um topo plausível
no lugar.

**Corrigido:** cada fonte é lida por **duas** ordenações — o topo por data de
entrada e o topo por data de saída — e as duas são unidas sem repetir linha.

### 8 — A retirada de componente engolia o erro na tela

`handleRetirarComponente` chamava `void mutateAsync(...)` sem `catch`, a única
mutação do `useAssetDetail` sem um. É o mesmo defeito que o `useEstoque`
documenta como corrigido: a ação não passa por formulário, então não há campo de
erro, e o 409 *"Esta instalação já foi retirada"* — duas abas na mesma peça —
virava *unhandled rejection* no console com a tela sem fazer nada.

**Corrigido:** `try/catch` com `alert`, como nas outras ações de lista.

### O que a correção acrescentou à suíte

Nove testes novos, todos pela porta HTTP:

| Achado | Onde |
|---|---|
| 1, 2 | `tests/invariantes/catalogo.test.ts` › o catálogo conhece as tabelas de estoque |
| 3 | `tests/estoque/operacoes.test.ts` › o ativo com peça dentro não vai para a lixeira |
| 4, 5 | `tests/estoque/operacoes.test.ts` › a linha de instalação guarda DOIS eventos |
| 6 | `tests/estoque/invariantes.test.ts` › o alerta de posto vago é sobre POSTO |
| 7 | `tests/estoque/operacoes.test.ts` › a movimentação não esconde o evento mais recente |
| 8 | sem teste: é comportamento de tela sem harness de DOM, e a defesa é o padrão do `useEstoque` repetido com o porquê ao lado |
