# Auditoria das Fases 0 e 1 — ITAM

> Revisão linha a linha do código entregue nas Fases 0 e 1, com a suíte de testes
> executada contra o servidor de pé. Feita em 23/09/2026, sobre a árvore de
> trabalho (108 arquivos alterados, nada commitado ainda).
>
> **5 defeitos confirmados**, 6 observações. Nenhum deles é estrutural: o modelo
> de dados, as migrações e a arquitetura de camadas passaram inteiros.
>
> O defeito 2 foi apontado pelo dono do projeto durante a auditoria, não pela
> suíte — e é o mais interessante dos cinco, porque nenhum teste mecânico o
> pegaria: o código faz exatamente o que foi escrito, e o que foi escrito é que
> está errado.
>
> **Status: os 5 defeitos e as observações 6, 7 e 8 estão corrigidos.** Ver
> *Correções aplicadas*, no fim. A seção *Defeitos* fica como está — é o registro
> do que foi encontrado, não uma lista de pendências.

---

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

A suíte rodou contra um banco descartável (`sentinel_audit1`), num servidor na
porta 3999. **O banco `sentineldb` não foi tocado** — os seus 3 ativos e 5
categorias continuam lá.

---

## O que está certo — e merece ser dito

Testei adversarialmente as partes que costumam quebrar. Estas aguentaram:

- **A etiqueta automática sob concorrência.** 12 `POST /assets` simultâneos:
  12× 201, etiquetas `ATV-00012`…`ATV-00023`, zero duplicata no banco. O
  `increment` atômico faz o que o comentário promete.
- **O contador não fura.** Duas criações que falharam (FK inválida, custo
  inválido) deixaram `assetTagNext` no mesmo número. A transação devolve o
  número.
- **O *peek* não consome.** 3 chamadas seguidas a `/settings/next-asset-tag`
  devolveram `ATV-00001` nas três.
- **A aritmética de datas.** `31/01 + 1 mês = 28/02`; em ano bissexto,
  `29/02`. Sem transbordo para março. Passou nos 5 casos.
- **O recálculo das datas na edição.** Mudar só a data de compra move a
  garantia; mudar só o nome **não** apaga a garantia (era o erro mais provável
  ali). `eolExplicit` congela e descongela o cálculo corretamente.
- **A guarda de ciclo de `Location`.** Pai = ela mesma, pai = filha, pai = neta:
  409 nos três. Desvincular e revincular continua funcionando.
- **Os índices únicos parciais.** Etiqueta de ativo na lixeira é reaproveitável;
  restaurar o ativo original então dá 409 com a mensagem certa; liberada a
  etiqueta, restaura. O mesmo para `users.email`.
- **O rename `Asset`→`Endpoint` (D1).** Zero `prisma.asset` fora do domínio de
  ativos, zero `prisma.endpoint` fora do de endpoints, zero referência órfã a
  `inventory`/`folder`. O `touchEndpoint` — o caminho que derrubaria a frota
  inteira — aponta para o model certo.
- **As migrações escritas à mão.** O `DO $$ ... pg_constraint` que cobre banco
  nascido de `db push` **e** banco nascido do `0_init` resolve de verdade o
  problema que o comentário descreve: a cadeia aplica do zero.
- **A allowlist de ordenação, o teto de `perPage`, o `strictObject`.** `?sort=`
  fora da lista, `?perPage=999999`, `?ordr=` (typo), campo desconhecido no
  corpo, `?view=trashed` em domínio sem lixeira: 422 em todos.

---

## Defeitos

### 🔴 1 — A etiqueta automática é inalcançável pela tela

**O mais grave, e o mais fácil de corrigir.** A funcionalidade-título da Etapa G
não funciona pelo formulário. Funciona por `curl`, e é por isso que passou.

`AssetFormModal` monta o estado inicial com string vazia em todo campo de texto
(`src/pages/gestao-itam/components/AssetFormModal.tsx:15`):

```ts
assetTag: asset?.assetTag ?? '',
```

Nada limpa isso no caminho — `useAssets.handleSubmit` → `useCreateAsset` →
`apiClient.post` mandam o objeto do formulário como está. O servidor recebe
`assetTag: ""`, e o schema (`server/domain/asset/schemas/asset.schema.ts:43`) é:

```ts
assetTag: nomeObrigatorio('etiqueta').optional(),
```

`.optional()` só deixa passar `undefined`. `""` **não é** `undefined`: entra no
`z.string().trim().min(1)` e falha.

**Reprodução** — o corpo literal que o formulário envia ao clicar em "Salvar
Ativo" sem digitar etiqueta:

```
POST /api/assets  {"assetTag":"","serial":"","name":"", ...}
→ 422 {"error":"etiqueta não pode ser vazio","fields":{"assetTag":"etiqueta não pode ser vazio"}}
```

Isolando campo a campo, `assetTag` é o **único** que quebra — `serial`, `name`,
`orderNumber`, `purchaseDate`, `purchaseCost`, `warrantyMonths`, `eolMonths`,
`eolDate`, `locationId`, `supplierId`, `assignedToId` e `notes` todos aceitam
`""` e viram `null`. O mesmo corpo **sem a chave** `assetTag` responde 201 e
gera `ATV-00037`.

Os 3 ativos do banco de dev (`ATV-00001`…`00003`) nasceram com 15 ms de
diferença entre si — foram criados por script, não por formulário. Daí a
funcionalidade parecer verificada.

**Correção** — no schema, seguindo a convenção que `fields.schema.ts` já usa
para todo o resto (`'' ` vira o valor neutro). Aqui o neutro é `undefined`,
porque é ele que significa "gere a etiqueta":

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

e usar `etiquetaOpcional` no lugar de `nomeObrigatorio('etiqueta').optional()`
nos dois schemas (create e update).

> Corrigir no formulário (remover as chaves vazias antes de enviar) também
> resolve, mas deixa a API com uma armadilha para o próximo cliente — e a
> convenção do projeto já é o servidor normalizar.

---

### 🟠 2 — "Em Uso" está classificado como `DEPLOYABLE` — e `DEPLOYABLE` significa "pode ser entregue"

Um ativo que está com alguém **não** está disponível para ser entregue. Hoje o
seed diz que está.

A contradição aparece em três arquivos ao mesmo tempo:

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

Resultado na tela de Configurações › Status: uma linha escrita **"Em Uso |
Disponível"**, com o texto de ajuda *"Pode ser entregue a alguém"* logo abaixo.

**Estado atual do banco de dev** — os 3 ativos cadastrados estão todos nesse
status:

```
  name  |    type    | count
--------+------------+-------
 Em Uso | DEPLOYABLE |     3
```

Ou seja: 3 ativos marcados como "em uso" e classificados como "disponíveis para
entrega".

**Por que passou.** O próprio seed explica o raciocínio — e é nele que está o
erro:

```ts
// No Snipe-IT "Deployed" é derivado do checkout, não um rótulo. Aqui ele
// existe como status explícito porque o checkout só chega na F4 — até lá é
// como se marca à mão o que está com alguém.
```

A primeira frase está certa e é a resposta: no Snipe-IT *Deployed* **não é um
status label**, é estado derivado de `assigned_to`. O ativo emprestado continua
com o rótulo "Ready to Deploy"; o que muda é ter dono. É exatamente por isso que
o enum tem quatro valores e nenhum deles é "em uso" — **não falta um quinto
tipo; sobra um rótulo que não é status.**

A segunda frase é a que não se sustenta: o `Asset.assignedToId` **já existe**,
já está no `ASSET_SELECT`, já é gravável pelo schema (`uuidOpcional
('responsável')`), já é um campo do formulário ("Responsável") e já é uma coluna
da tabela de ativos. Quem está com o equipamento é registrável hoje, sem F4 e
sem rótulo.

**O que quebra.** Nada hoje — nenhuma consulta filtra por `DEPLOYABLE` ainda
(verificado: as únicas ocorrências são o seed, a allowlist do `/options` e o
rótulo da tela). O defeito é latente e detona na F4, em dois pontos que o
`ITAM-TODO.md` já lista:

- *"Regras da operação: duplo checkout"* — a regra "só `DEPLOYABLE` libera o
  checkout" deixa passar um ativo que já está com outra pessoa;
- *"Status derivado do checkout"* — o status deixa de ser derivável, porque
  passa a existir um rótulo que compete com o `Assignment`.

E um relatório trivial de "quantos ativos estão disponíveis?" — `count(type =
DEPLOYABLE)` — já responderia errado hoje.

**O custo sobe com o tempo.** É o argumento da *"janela é agora"* do
`ITAM-TODO.md`: com 3 ativos, corrigir é um `UPDATE`. Com o inventário
cadastrado, é reclassificar à mão tudo que foi marcado "Em Uso" e decidir, caso
a caso, se aquilo estava com alguém ou só mal rotulado.

**Correção aplicada — `IN_USE` vira o quinto tipo do enum.**

Duas correções anteriores foram descartadas pelo dono do projeto, e as duas
estavam erradas pelo mesmo motivo: tratavam "em uso" como algo que o sistema
deduz, em vez de algo que o usuário declara.

| Tentativa | Por que não |
|---|---|
| Remover o rótulo e derivar de `assignedToId` | `statusId` é **obrigatório** no cadastro, e a carga inicial é feita de equipamento que já está com gente — o formulário fica sem como dizer isso. E existe uso **sem responsável**: o monitor parafusado na sala de reunião ficaria marcado como disponível |
| Manter o rótulo, tipado `PENDING` | Empacota "está com um colaborador" junto com "está na assistência". Um gera valor, o outro custa dinheiro — é a distinção mais cara do inventário, e ela some. "Quantos ativos estão em uso?", a métrica principal do módulo, fica inexpressável pelo tipo |

O erro de raciocínio nas duas foi ancorar no Snipe-IT, onde *Deployed* não é tipo
porque o checkout é a fonte da verdade. Mas o `ITAM-TODO.md` da F4 já diz
*"checkout força DEPLOYABLE→em uso; checkin aplica o status escolhido"* — o
plano **já** assume que o status muda no checkout. Se ele muda, precisa de um
destino, e esse destino merece nome próprio.

```prisma
enum StatusLabelType {
  DEPLOYABLE    // no estoque, pode ser entregue — o único que libera o checkout
  IN_USE        // com alguém ou instalado em algum lugar
  PENDING       // fora do estoque por impedimento, e volta (reparo, trânsito)
  ARCHIVED      // saiu da operação
  UNDEPLOYABLE  // ainda é seu, não serve, não volta
}
```

Com isso cada rótulo do seed tem um lugar sem ambiguidade, e `PENDING` volta a
significar uma coisa só:

| Tipo | Rótulos |
|---|---|
| `DEPLOYABLE` | Pronto p/ Uso |
| `IN_USE` | Em Uso |
| `PENDING` | Aguardando, Em Diagnóstico, Manutenção |
| `UNDEPLOYABLE` | Danificado, Perdido / Roubado |
| `ARCHIVED` | Arquivado |

**A migration precisou de correção à mão.** O `migrate diff` gerou
`ALTER TYPE ... ADD VALUE 'IN_USE'` **sem posição**, o que acrescenta o valor no
fim do enum — enquanto o `schema.prisma` o declara em segundo. O Postgres usa a
ordem dos valores em `ORDER BY`, e a listagem de status é ordenável por `type`:
sem o `AFTER`, banco e schema divergiriam para sempre.

```sql
ALTER TYPE "StatusLabelType" ADD VALUE 'IN_USE' AFTER 'DEPLOYABLE';
```

Verificado: a cadeia aplica do zero, a ordem no banco é
`DEPLOYABLE, IN_USE, PENDING, ARCHIVED, UNDEPLOYABLE`, e o `migrate diff` contra
o schema volta vazio.

**No banco de dev**, a mudança é aditiva — nenhuma linha muda de valor sozinha.
Depois de aplicar a migration, um `UPDATE` de uma linha fecha o assunto, e os 3
ativos ficam onde estão:

```bash
npm run db:migrate
```
```sql
UPDATE status_labels SET type = 'IN_USE' WHERE name = 'Em Uso';
```

> Os outros sete rótulos do seed foram conferidos um a um e estão coerentes com
> o próprio comentário que os explica.

---

### 🟠 3 — Apagar fornecedor ou localização zera o vínculo de ativos na lixeira

**Perda de dado silenciosa.** O `countUsages` de cada spec conta pelo cliente
Prisma **com escopo de lixeira**, então ativo apagado é invisível para ele:

```ts
// server/domain/catalog/specs/supplier.spec.ts:24
countUsages: (client, id) => client.asset.count({ where: { supplierId: id } }),
// server/domain/catalog/specs/location.spec.ts:29
client.asset.count({ where: { locationId: id } }),
```

A extension acrescenta `deletedAt: null` a todo `count` de topo. Com o único
ativo que referencia o fornecedor na lixeira, `countUsages` devolve **0**, o
`deleteCatalog` segue em frente, e a FK `onDelete: SetNull` limpa a coluna.
Restaurar o ativo depois traz de volta um registro **sem fornecedor e sem
localização**, sem nenhum erro em lugar nenhum.

**Reprodução:**

```
ativo criado com supplierId + locationId
DELETE /api/suppliers/<id>  com o ativo VIVO      → 409 "fornecedor em uso por 1 registro"  ✅
DELETE /api/assets/<id>                            (vai para a lixeira)
supplierId na linha: 67cf3f0c-ea07-...             (continua lá)
DELETE /api/suppliers/<id>  com o ativo na LIXEIRA → 200 {"success":true}   ❌
supplierId na linha: NULL                          ← apagado em silêncio
```

O mesmo para `locations`. Com FK `Restrict` (`StatusLabel`, `AssetModel`,
`Manufacturer`, `Category`) o banco segura — a rede de segurança do D8 funciona
—, mas aí o usuário recebe **"Registro está em uso por outro cadastro"** (P2003
genérico) em vez da mensagem com a contagem. É o mesmo defeito, com sintoma
diferente conforme o `onDelete`.

**Correção** — o `countUsages` precisa contar vivos **e** lixeira. A extension
já tem o escape hatch: ela sai do caminho quando a chave `deletedAt` está
presente no `where`, **inclusive com `undefined`** (verificado: `count({ where:
{ deletedAt: undefined } })` devolveu 39 contra 36 do `count({})`).

Como isso é sutil demais para ficar implícito em sete specs, vale um nome:

```ts
// server/core/database/soft-delete.extension.ts
/**
 * Espalhe no `where` para a consulta enxergar TAMBÉM a lixeira.
 * A extension sai do caminho pela PRESENÇA da chave `deletedAt` — e a chave
 * existe mesmo valendo `undefined`, que é o que faz isto não virar filtro.
 */
export const INCLUINDO_LIXEIRA = { deletedAt: undefined } as const;
```

```ts
// nas specs
countUsages: (client, id) =>
  client.asset.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
```

Aplicar nas **cinco** specs que contam ativos: `supplier`, `location`,
`status-label`, `asset-model` e `category`.

---

### 🟡 4 — Coluna `Decimal` marca "mudança" a cada edição

`buildChanges` (`server/domain/shared/diff.helper.ts:35`) trata `Date` como caso
especial, mas não `Decimal`:

```ts
const iguais =
  valorAntigo instanceof Date && valorNovo instanceof Date
    ? valorAntigo.getTime() === valorNovo.getTime()
    : valorAntigo === valorNovo;
```

`Prisma.Decimal` é objeto: duas instâncias do mesmo valor nunca são `===`. Então
`purchaseCost` e `floorValue` entram no diff **sempre**, e como
`updateCatalog`/`updateAsset` só gravam o log quando `Object.keys(changes).length
> 0`, uma edição que não mudou nada mesmo assim escreve uma linha no
`ActivityLog`.

**Reprodução** — dois `PUT` idênticos seguidos, o segundo não muda nada:

```
ativo com purchaseCost = 1234.56
PUT {"notes":"nota um"}  → log: {"notes":{...}, "purchaseCost":{"de":"1234.56","para":"1234.56"}}
PUT {"notes":"nota um"}  → log: {"purchaseCost":{"de":"1234.56","para":"1234.56"}}   ← ruído puro
```

```
depreciação (floorValue é Decimal NOT NULL)
PUT {"name":"Linear 36 meses"} (sem mudança) → log: {"floorValue":{"de":"100","para":"100"}}
```

Controle: o mesmo teste num ativo **sem** `purchaseCost` gera 1 log para 2 PUTs,
que é o correto. Na base de teste, 2 dos 16 logs de UPDATE eram 100% ruído.

Impacto hoje é histórico poluído; o problema real é a F2, que vai montar a aba
"Histórico" da tela de detalhe em cima dessa tabela — e ela mostraria "valor de
compra alterado de R$ 1.234,56 para R$ 1.234,56".

**Correção** — comparar os valores **já normalizados**. Isso resolve `Decimal`,
mantém `Date` resolvido e dispensa o caso especial:

```ts
for (const campo of campos) {
  const de = normalizar(antes[campo]);
  const para = normalizar(depois[campo]);
  if (de !== para) mudancas[campo] = { de, para };
}
```

`normalizar` já converte `Date` para ISO e cai em `String(valor)` para o resto —
que é exatamente o que um `Decimal` precisa.

---

### 🟡 5 — Trocar o modelo não re-herda a vida útil

Na criação, `eolMonths` desce do modelo quando o ativo não define o seu
(`create-asset.usecase.ts:46`). Na edição, não:

```ts
// update-asset.usecase.ts:40 — o modelo não é consultado
const eolMonths = valorFinal(data.eolMonths, antes.eolMonths);
```

**Reprodução:** ativo criado num modelo de 48 meses (`eolMonths = 48`,
`eolDate = 2030-01-01`). Trocado para um modelo de 12 meses → continua
`eolMonths = 48`, `eolDate = 2030-01-01`.

Pela mesma razão, limpar o campo na edição grava `null` em vez de voltar a
herdar do modelo.

Pode ser decisão consciente — "o que foi materializado no ativo é dele". Mas
então a tela precisa dizer isso, porque o campo hoje tem o placeholder *"herda do
modelo"*, que descreve só o comportamento da criação. Se a intenção é herdar
sempre, a correção é ler o modelo final na edição, como a criação faz.

---

## Observações

**5 — Usuário na lixeira ainda aparece como gestor e como responsável.**
É o efeito colateral que o D8 registrou (a extension não alcança leitura
aninhada), mas o `FASE-1-PLANO-ITAM.md` o descreve só para o `assignedTo` do
inventário. Agora vale para `Location.manager` e `Asset.assignedTo`. Verificado:
apagado o usuário "Gestor", `GET /api/locations` continua devolvendo
`"manager":{"id":"90d981a1-…","name":"Gestor"}`. Severidade baixa e caminho já
previsto para fechar na F4; fica registrado porque a superfície cresceu.

**6 — `PERCENT` de depreciação sem teto.** `floorValue` aceita
`9999999999.99` com `floorType: PERCENT` — 201. A validação é só de formato
monetário. Um `superRefine` no schema resolve (`PERCENT` ⇒ 0..100).

**7 — O `<select>` tem teto de 200 e a saída documentada não existe na tela.**
`MAX_OPCOES = 200` em `list-catalog-options.usecase.ts` e
`list-user-options.usecase.ts`; o comentário diz *"acima disso, o campo de busca
(`?q=`) é o caminho"* — mas `ReferenceSelect` não tem campo de busca, e a query
nunca manda `q`. Com mais de 200 localizações, editar uma cujo pai está fora dos
200 primeiros mostra "— nenhum —" e salvar **apaga o vínculo** (`parentId` e
`managerId` são `uuidOpcional`, então `''` vira `null`). Para `modelId` e
`statusId` o dano é menor: dá 422 em vez de apagar. Longe do teto hoje (5
localizações), mas é dívida com gatilho silencioso.

**8 — Comentários apontando para arquivos que não existem mais.** Três, todos do
rename: `server/domain/shared/fields.schema.ts:7` cita `inventory.schema.ts`;
`server/core/database/soft-delete.extension.ts:11` cita `InventoryItem`;
`src/domain/shared/list.types.ts:2` cita `/inventory`.

**9 — `.env` sem `AGENT_TOKEN`.** O `.env.example` tem a chave, o `.env` local
não. Em desenvolvimento sobe com aviso (por desenho); em produção o boot para.
Vale preencher antes de esquecer.

**10 — Zeros à direita do `Decimal`.** `10.00` gravado volta `"10"` no JSON
(`10.00` no banco). Já documentado no schema e no tipo do frontend, e
`formatarMoeda` cobre a exibição. Só confirmando que o comportamento é o
descrito.

---

## Correções aplicadas

Feitas logo após o relatório, na mesma sessão. `tsc -b`, `eslint` e
`npm run build`: exit 0 nos três, depois das mudanças.

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

### Prova

Suíte de regressão nova (**34 asserções, 34 passaram**) em banco limpo:

- **1** — o corpo literal do formulário (`assetTag:""` + 17 campos) responde 201 e
  gera `ATV-00001`; `"   "` também; etiqueta digitada continua respeitada; `PUT`
  com etiqueta vazia preserva a que existe.
- **1 + concorrência** — 12 `POST` simultâneos **com `assetTag:""`**: 12× 201,
  `ATV-00033`…`ATV-00044`, zero duplicata.
- **2** (suíte própria, **21 asserções**) — `IN_USE` existe no enum do banco, na
  **posição 2**; o `<select>` do formulário oferece os 8 rótulos, "Em Uso"
  incluído; os 4 cenários reais cadastram (notebook com colaborador, monitor na
  sala **sem responsável**, equipamento em estoque, equipamento na assistência);
  as três contagens que o tipo precisa responder saem certas — *em uso* = 2,
  *disponíveis* = 1, *parados por impedimento* = 1, sem mistura; entrega e
  devolução movem o tipo nos dois sentidos; criar/editar/apagar um status novo em
  `IN_USE` pela tela funciona; `?type=DEPLOYED` (inexistente) dá 422; e o
  `ORDER BY type` sai na ordem do ciclo de vida.
- **3** — apagar fornecedor/localização com o ativo **na lixeira** agora responde
  409 e as colunas ficam intactas (conferido direto no banco). Status e modelo
  passam a dizer *"em uso por 5 registros"* em vez do P2003 genérico. O 409 com
  ativo vivo não regrediu.
- **4** — dois `PUT` idênticos num ativo com `purchaseCost`: **1 log**, não 2. O
  mesmo na depreciação. Mudança real de `Decimal` continua registrada
  (`{"floorValue":{"de":"10","para":"20"}}`). Zero logs com `de == para` no banco
  inteiro.
- **5** — ativo herdando 48 meses movido para um modelo de 12 passa a 12 e
  recalcula o `eolDate`; ativo com 60 digitado à mão **mantém** 60 na mesma
  operação; edição explícita vence; modelo inexistente dá 404.
- **6** — `PERCENT` acima de 100 → 422; `= 100` passa; `AMOUNT` alto continua
  passando; trocar só o `floorType` para `PERCENT` com valor alto guardado → 422.

E a bateria original **inteira** re-executada em banco novo, para regressão:
**Suíte 1: 30/30 · Suíte 2: 13/13 · Suíte 3: 30/30 · Suíte 6: 8/8** (era 7/8).

### ⚠ Um aviso de staging, anterior à auditoria

`src/pages/gestao-itam/index.tsx` está **staged como apagado e presente no disco
como não rastreado** (`D ` + `??` no `git status`). É o único arquivo nesse
estado — as outras 16 deleções staged são reais, do rename do `inventory/`.

Commitar assim **derruba a tela de Ativos do commit** e a mantém só no seu disco:
quem clonar o repositório pega um `App.tsx` importando um arquivo que não existe.
Não passa no `tsc` de um checkout limpo.

```bash
git add src/pages/gestao-itam/index.tsx
```

Vem de antes desta sessão (provavelmente de um `git rm --cached` durante a
reestruturação). Não mexi no seu índice — staging é decisão sua.

### O que ficou de fora, e por quê

- **O banco de desenvolvimento.** O código está corrigido, mas o seed é
  `update: {}` por construção: ele existe para garantir que a linha exista, não
  para reescrever o que já está lá. O rótulo "Em Uso" em `sentineldb` continua
  `DEPLOYABLE` até alguém mandar o contrário. São dois comandos, e **nenhum ativo
  muda de status** — a mudança é no tipo do rótulo, não na linha do ativo:

  ```bash
  npm run db:migrate   # cria o valor IN_USE no enum
  ```
  ```sql
  UPDATE status_labels SET type = 'IN_USE' WHERE name = 'Em Uso';
  ```

  Não rodei porque é escrita no seu banco. A migration é aditiva (`ADD VALUE`) e
  não toca em nenhuma linha existente.

- **Seletor com busca acima de 200 opções (observação 7).** A perda silenciosa de
  vínculo foi fechada; navegar além das 200 pede um combobox com busca, que é
  funcionalidade, não correção. Fica para a F10, junto do seletor de colunas.

- **`AGENT_TOKEN` no `.env` (observação 9).** Não toquei de propósito: definir um
  token agora faria o hub recusar o agente C# que hoje conecta sem nenhum. É
  decisão de ambiente, e o boot já avisa.

---

## O que resta

Nada dos 5 defeitos. O que sobrou são escolhas, não pendências:

1. **`db:migrate` + o `UPDATE` do "Em Uso"** no banco de dev (acima). É o único
   passo que falta para o defeito 2 estar fechado ponta a ponta.
2. **Revisar a semântica do defeito 5.** A regra implementada é "herda se estava
   herdando, preserva se foi digitado". É defensável, mas é uma decisão de
   produto tomada dentro de uma correção — vale um olhar.
3. **Ligar `IN_USE` ao checkout na F4.** O tipo existe; falta a operação que o
   escreve. A partir da F4 o checkout deve mover o ativo para um status
   `IN_USE` e o checkin de volta — é o que impede o status e a posse divergirem,
   já que agora as duas coisas são graváveis em separado.
4. **Seletor com busca** (observação 7) e **`AGENT_TOKEN`** (observação 9),
   quando fizer sentido.

---

## Teste que faltou

Não há teste automatizado nenhum no repositório — o `ARQUITETURA.md` já reconhece
isso. A suíte desta auditoria é `curl` descartável, e o defeito 1 mostra o custo:
a etiqueta automática foi verificada pelo caminho que funciona (API) e não pelo
que o usuário usa (formulário).

O teste que teria pego os defeitos 1, 3, 4 e 5 é o mesmo: **enviar o corpo
literal que o formulário monta**, não um corpo escrito à mão para a ocasião.

O defeito 2 não sairia de teste nenhum. O código faz o que foi escrito; o que
foi escrito é que contradiz a regra declarada três linhas acima, no mesmo
arquivo. Contra isso o que funciona é o que aconteceu: alguém ler a lista de
status e perguntar por que "Em Uso" aparece como "Disponível".
