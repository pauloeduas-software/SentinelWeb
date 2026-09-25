# Plano de implementação — Fase 6: licenças de software ✅

> Fase do [`ITAM-TODO.md`](./ITAM-TODO.md), **fechada**. Contrato de posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) · camadas: [`ARQUITETURA.md`](./ARQUITETURA.md) ·
> o que o sistema recusa: [`INVARIANTES.md`](./INVARIANTES.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
>
> **Decisões em duas levas, e é de propósito que as duas estejam aqui:**
> `D39`–`D44` foram escritas **antes**, contra o código de depois da F1;
> `D90`–`D94` foram escritas **durante a execução**, contra a árvore com F3, F4, F5 e o
> fechamento F2–F4 já dentro. Onde as segundas contrariam as primeiras, a contradição
> está escrita na decisão antiga e justificada na nova — **não corrigida em silêncio**.
> É por isso que o D43 continua no documento com a fórmula errada visível: apagá-la
> esconderia por que a certa é a certa.

---

## Objetivo

Um módulo inteiro do Snipe-IT que aqui não existia em nenhuma forma. O que a licença tem
e o ativo não tem é **assento**: a licença não é entregue, ela é *consumida N vezes*, e a
pergunta que o módulo existe para responder é **"quantos assentos sobraram e quem está
com eles"** — com a resposta valendo em auditoria de fornecedor.

Três coisas decidem o desenho:

1. **O assento é materializado** — uma linha por assento, não um contador. É o que permite
   travar *o assento* e não *a licença* na hora de entregar.
2. **O assento vai para uma pessoa OU para um ativo**, nunca para os dois, nunca para um
   posto (D39). É o XOR que o TODO pede, e ele é também uma afirmação sobre o que
   licença é.
3. **A chave é segredo em repouso** — cifrada, mascarada na resposta, e quem a revela
   deixa rastro.

---

## O que mudou entre o plano e a execução

As decisões D39–D44 e as etapas foram desenhadas quando só existiam F0 e F1. Quando a
fase entrou em execução já havia mais quatro, e **três delas mudaram o que a F6 tinha
que fazer**. As dez diferenças abaixo são a razão de existirem D90–D94; as etapas neste
documento já estão reescritas contra a árvore real.

| # | O que este plano assumia (D39–D44) | O que a árvore diz hoje | Onde entra |
|---|---|---|---|
| 1 | Assento é assunto da licença | **O desligamento e o `DELETE` de pessoa não sabem que assento existe** | Etapa G |
| 2 | "Anexos de licença dependem do upload da F2" | `Attachment.assetId` é `NOT NULL` com FK para `assets` — upload é **só de ativo** | Fora da fase |
| 3 | "O campo entra no `sanitize.ts`" | O regex de lá **não casa** com `productKey` | Etapa B |
| 4 | `ActivityLog` com `action: 'VIEW_KEY'` | `ActivityAction` é união fechada e **não tem** `VIEW_KEY` | Etapa F |
| 5 | `id` do Prisma serve para o AAD | D81 amarra a cifra ao `id` — que o `@default(uuid())` só devolve **depois** do INSERT | Etapa B / C |
| 6 | `livres = seatsTotal − ocupados − queimados − aposentados` (D43) | A conta **dá errado depois de um encolhimento** | D92 |
| 7 | Reconciliar `seatsTotal` "na mesma transação" basta | Transação sem trava **não impede** o checkout concorrente de levar o assento que ela vai aposentar | D90 |
| 8 | `seatsTotal` sobe → insere os assentos que faltam | `seatNumber` novo tem que ser `MAX+1`, não `COUNT+1`: linha aposentada **continua na tabela** | Etapa E |
| 9 | `APP_ENCRYPTION_KEY`, uma variável | D81 exige `kid` no valor, ou seja, **um chaveiro** — uma variável não expressa dois | D91 |
| 10 | "O export CSV precisa ser fechado no mesmo commit" | **Não existe export CSV no projeto** (a F10 não chegou) | Fora da fase, anotado |

---

## Pré-requisitos, conferidos na árvore

| Precisa | Estado | Onde está |
|---|---|---|
| `Category` com `type = LICENSE` | ✅ | `prisma/schema.prisma`, `CategoryType` |
| `Manufacturer`, `Supplier` | ✅ | idem |
| `Asset` — metade do alvo do assento | ✅ | `model Asset` |
| `AppError`, `error-handler`, `parseListQuery` | ✅ | `server/core/` |
| `recordActivity(tx, input, actorId)` | ✅ | ator **obrigatório** desde a F3 |
| `buildChanges` / `buildSnapshot` | ✅ | `server/domain/shared/diff.helper.ts` |
| Escopo de lixeira automático | ✅ | `soft-delete.extension.ts` — lê o DMMF, **nada a registrar** |
| `travarUsuarioOuFalhar` / `travarAtivoOuFalhar` | ✅ | `user/use-cases/lock-user.usecase.ts`, `asset/use-cases/lock-asset.usecase.ts` |
| `WRITE_RATE_LIMIT`, `atorDaRequisicao`, `idParamSchema` | ✅ | `core/http/`, `auth/helpers/`, `shared/` |
| Harness de teste contra Postgres real | ✅ | `tests/helpers/app.ts` — só `app.inject()` |
| `APP_ENCRYPTION_KEY` | **novo** | nasce na Etapa B |

**Quando a fase começou, nada de licença existia.** Zero tabela, zero rota, zero tipo no
front. O único vestígio era a aba desabilitada `{ id: 'licencas', …, fase: 'Fase 6' }` em
`abas.helper.ts` — que a Etapa H fez perder o `fase` e ganhar conteúdo.

---

## Os oito commits

Um por etapa, `npm run lint` e `npm test` verdes em cada um. A ordem não é gosto: cada
etapa só depende das anteriores, e a G — a que costura com a posse — vem **antes** das
telas de propósito, porque é ela que decide o que a tela do colaborador mostra.

### Etapa A — Schema e migração · **M**

`prisma/schema.prisma` ganha três models, e a migração escrita à mão ganha o que o
Prisma não expressa.

```prisma
model License {
  id          String  @id @db.Uuid     // ← SEM @default(uuid()). Ver D91.
  name        String
  seatsTotal  Int
  reassignable Boolean @default(true)
  maintained   Boolean @default(false)
  expirationDate  DateTime?
  terminationDate DateTime?
  licensedToName  String?
  licensedToEmail String?
  productKey      String?              // enc:v1:<kid>:<iv>:<tag>:<ct> — nunca claro
  minSeats        Int?
  categoryId     String  @db.Uuid
  manufacturerId String? @db.Uuid
  supplierId     String? @db.Uuid
  orderNumber  String?
  purchaseDate DateTime?
  purchaseCost Decimal? @db.Decimal(12, 2)
  notes String?
  createdById String? @db.Uuid
  updatedById String? @db.Uuid
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  seats LicenseSeat[]
  @@map("licenses")
}

model LicenseSeat {
  id         String @id @default(uuid()) @db.Uuid
  licenseId  String @db.Uuid
  seatNumber Int
  burnedAt   DateTime?
  retiredAt  DateTime?
  notes      String?
  // Cascade: assento não existe fora do contrato.
  license   License @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  checkouts LicenseSeatCheckout[]
  @@map("license_seats")
}

model LicenseSeatCheckout {
  id       String @id @default(uuid()) @db.Uuid
  seatId   String @db.Uuid
  assignedUserId  String? @db.Uuid     // Restrict
  assignedAssetId String? @db.Uuid     // Restrict
  checkoutAt DateTime  @default(now())
  checkinAt  DateTime?
  checkoutNotes String?
  checkinNotes  String?
  checkoutById String? @db.Uuid
  checkinById  String? @db.Uuid
  // Cascade no assento dono da ocupação; Restrict nos ALVOS: não se apaga quem
  // ainda segura assento, e é a rede embaixo do 409 da Etapa G.
  seat          LicenseSeat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  assignedUser  User?       @relation(fields: [assignedUserId], references: [id], onDelete: Restrict)
  assignedAsset Asset?      @relation(fields: [assignedAssetId], references: [id], onDelete: Restrict)
  @@index([assignedUserId, checkinAt])
  @@index([assignedAssetId, checkinAt])
  @@map("license_seat_checkouts")
}
```

**Três ausências, cada uma é uma regra:**

- **`LicenseSeat` e `LicenseSeatCheckout` não têm `deletedAt`.** A `softDeleteExtension`
  aplica o escopo a todo model que tenha a coluna, lido do DMMF. Dar lixeira ao assento
  faria o saldo parar de enxergar uma ocupação aberta e **a licença passaria a mostrar
  assento livre que não está**. Ocupação é histórico: fecha, não some (D40).
- **`License.id` não tem `@default(uuid())`.** O AAD do D81 amarra a cifra a
  `"licenses:productKey:<id>"`, e o id precisa existir **antes** do INSERT. Ver D91.
- **`minSeats`, e não o `minAmt` do TODO.** `minQty` é o nome que a F5 já usa para a
  mesma ideia; duas palavras para o mesmo conceito é o que o D5 recusa.

`AppSetting` ganha uma coluna: `cryptoCanary String?` (D91).

**Escrito à mão na migration** — nada disto sai do `migrate diff`:

```sql
-- O XOR do alvo. As duas afirmações numa linha, como em `assignments_alvo_coerente`.
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_alvo_xor"
  CHECK (num_nonnulls("assignedUserId", "assignedAssetId") = 1);

-- Um assento em duas mãos ao mesmo tempo. Mesma forma do
-- `assignments_um_aberto_por_ativo` (D14), um nível abaixo.
CREATE UNIQUE INDEX "license_seat_uma_aberta_por_assento"
  ON "license_seat_checkouts"("seatId") WHERE "checkinAt" IS NULL;

CREATE UNIQUE INDEX "license_seats_numero" ON "license_seats"("licenseId","seatNumber");

-- `unique_undeleted` pela quarta vez no projeto.
CREATE UNIQUE INDEX "licenses_name_unico_ativo"
  ON "licenses"("name") WHERE "deletedAt" IS NULL;

-- A devolução não antecede a entrega — o mesmo CHECK que `assignments` tem, e pelo
-- mesmo motivo: posse de duração negativa quebra todo relatório de tempo médio.
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkin_nao_antecede"
  CHECK ("checkinAt" IS NULL OR "checkinAt" >= "checkoutAt");

-- Contrato não é negativo, e assento é numerado a partir de 1.
ALTER TABLE "licenses"      ADD CONSTRAINT "licenses_seats_nao_negativo" CHECK ("seatsTotal" >= 0);
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seat_numero_positivo" CHECK ("seatNumber" >= 1);
```

Índices de leitura: `license_seats(licenseId, seatNumber)` já sai do único acima;
acrescentar `license_seat_checkouts(assignedUserId, checkinAt)` e
`(assignedAssetId, checkinAt)` — são as duas consultas da Etapa G, e sem eles o
`holdings` de cada pessoa varre a tabela inteira.

> **Migração pelo procedimento do `ARQUITETURA.md`**, nunca `prisma migrate dev`:
> `migrate diff` para um arquivo, **revisar**, acrescentar o bloco acima à mão,
> `npm run db:migrate && npm run db:generate`. E a reconstrução do zero em
> `sentinel_audit` antes de fechar o commit.

### Etapa B — `core/crypto` e a chave que não pode vazar · **P**

```
server/core/crypto/cipher.ts     # cifrar(claro, aad) / decifrar(pacote, aad)
server/core/crypto/keyring.ts    # as chaves configuradas, indexadas por kid
server/core/config/env.ts        # + APP_ENCRYPTION_KEY (e as antigas)
server/core/logger/sanitize.ts   # + o campo no regex
server/server.ts                 # + o canário no boot
```

Mora em `core/` porque **não sabe o que é uma licença**: recebe texto e um AAD, devolve
pacote. É o mesmo arquivo que a F9 vai usar para campo customizado cifrado (D81). Zero
dependência nova — `node:crypto` faz AES-256-GCM.

Formato, do D81, **em um lugar só**: `enc:v1:<kid>:<iv b64>:<tag b64>:<ct b64>`.

**A linha de uma palavra que a Etapa F pedia e que não funcionaria:**
`sanitize.ts` esconde valor cujo *nome de campo* casa com

```
/senha|password|passwd|token|secret|segredo|apikey|api_key|authorization|cookie|jwt/i
```

`productKey` **não casa com nada disso**. Um `logger.error({ dados })` num caminho de
erro publicaria a chave em claro no log estruturado. O regex passa a incluir
`chave|productkey|product_key`, e `tests/invariantes/` prova que `sanitizeForLog({
productKey: 'X' })` esconde.

### Etapa C — O domínio `license` · **G**

```
server/domain/license/
├── license.maestro.ts
├── controllers/license.controller.ts
├── schemas/license.schema.ts              # strictObject; productKey entra, nunca sai
├── helpers/license-status.helper.ts       # ATIVA|VENCENDO|EXPIRADA|ENCERRADA (puro)
├── helpers/mask-product-key.helper.ts     # ••••-••••-AB12 (puro)
├── helpers/license-seats.helper.ts        # a conta dos assentos + as travas
├── helpers/license-select.helper.ts       # allowlist de resposta
└── use-cases/
    list-licenses · get-license · create-license · update-license
    delete-license · restore-license · list-license-seats
    checkout-seat · checkin-seat · reconcile-seats · reveal-product-key
    list-license-alerts · count-user-seats · checkin-user-seats · list-asset-seats
```

**Fatia vertical inteira, e não uma spec no motor do catálogo** — pelo mesmo motivo do
D35: a coluna principal da listagem é **derivada** (`livres/total`) e o `select` da
`CatalogSpec` é allowlist estática. Nem a ideia de spec local da F5 se aplica: ali havia
três tipos com uma invariante; aqui há **um** tipo.

O CRUD segue linha por linha o de `stock/use-cases/`: `findFirst` e nunca `findUnique`
(o escopo da lixeira não alcança o `findUnique`), `assertLicenseReferences` conferindo
que a `Category` é do tipo `LICENSE`, `buildChanges`/`buildSnapshot` no `ActivityLog`,
409 com frase própria no `DELETE`.

**Rotas — a ordem importa**, literal antes de parâmetro, como o `stock.maestro.ts`
documenta:

```
GET    /api/licenses                       listagem + livres/ocupados/queimados
GET    /api/licenses/alerts                ← ANTES de /:id
POST   /api/licenses/seats/:seatId/checkin ← ANTES de /:id
GET    /api/licenses/:id
GET    /api/licenses/:id/seats
GET    /api/licenses/:id/product-key       revela — e grava VIEW_KEY
GET    /api/licenses/:id/history
POST   /api/licenses                       PUT /:id · DELETE /:id · POST /:id/restore
POST   /api/licenses/:id/checkout-seat     { assignedUserId } XOR { assignedAssetId }
GET    /api/assets/:id/licenses            a aba Licenças do ativo (registrada aqui)
```

`LicenseMaestro.setupRoutes(server)` entra em **`app.ts`**, depois de `StockMaestro`: as
rotas dele pendem de `/api/assets/:id` e de `/api/users/:id`, e a ordem de registro
segue a ordem em que o conceito nasce.

### Etapa D — Pegar um assento livre sem corrida · **M**

**Regra em uma linha:** o primeiro assento livre é escolhido **e travado na mesma
instrução**, dentro da transação, e quem chegou junto pega o *próximo* em vez de esperar.

```sql
SELECT s.id, s."seatNumber"
  FROM license_seats s
 WHERE s."licenseId" = $1
   AND s."burnedAt" IS NULL AND s."retiredAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM license_seat_checkouts c
                    WHERE c."seatId" = s.id AND c."checkinAt" IS NULL)
 ORDER BY s."seatNumber"
 LIMIT 1
 FOR UPDATE OF s SKIP LOCKED;
```

`NOT EXISTS` e `FOR UPDATE OF s` não são estilo: `LEFT JOIN … GROUP BY` faz o Postgres
recusar com *"FOR UPDATE cannot be applied to the nullable side of an outer join"*.

**Ordem de travamento, a mesma da F4 e da F5:** alvo primeiro, assento depois —
`travarUsuarioOuFalhar` no alvo `USER`, `travarAtivoOuFalhar` no alvo `ASSET`, e só
então o `SELECT … SKIP LOCKED`. Duas transações que travam os mesmos dois recursos em
ordens opostas travam uma à outra.

**O checkin também trava o assento** (`SELECT … FROM license_seats WHERE id FOR UPDATE`,
sem `SKIP LOCKED`) — ele precisa da linha de qualquer forma para escrever `burnedAt`, e
travá-la sempre fecha a segunda corrida que o D41 não menciona. Ver Riscos.

**A queima** (`reassignable = false`): o checkin carimba `burnedAt` no assento **na mesma
transação** que fecha a ocupação, e grava `ActivityLog` próprio. Assento queimado nunca
mais aparece no `SELECT` acima — o `burnedAt IS NULL` do `WHERE` é a regra inteira.

**O alvo é recusado pelo estado, não só pela existência:** pessoa desligada
(`isActive = false`) responde **409**, como em `checkout-accessory.usecase.ts`; ativo na
lixeira responde 404 pelo `findFirst`. Entregar assento a quem saiu reabre, uma linha
depois do desligamento, a pendência que o desligamento fechou.

### Etapa E — Reconciliação de `seatsTotal` · **M** *(era P)*

**Regra em uma linha:** mudar `seatsTotal` cria ou aposenta linhas na mesma transação —
**com a licença e todos os assentos dela travados antes de contar** (D90).

- **Subir:** insere os que faltam, com `seatNumber = MAX(seatNumber) + 1` em diante.
  **Não `COUNT + 1`:** a linha aposentada continua na tabela, e `COUNT + 1` colidiria com
  `license_seats_numero`, virando um `P2002` que o `error-handler` traduz para "Registro
  já existe" — inútil para quem só aumentou o contrato.
- **Descer:** marca `retiredAt` nos **livres de maior `seatNumber`**, e recusa com 409
  quando não há livres suficientes, com os números na frase.
- **Invariante:** `COUNT(*) WHERE retiredAt IS NULL` **é** `seatsTotal`, sempre, dentro da
  transação. É ela que entra no `INVARIANTES.md` e em `tests/licencas/`.

Sobe de **P** para **M** porque o travamento correto (D90) e a aritmética do D92 são o
grosso do trabalho, não o `createMany`.

### Etapa F — Chave, status e alertas · **M**

**A chave sai por um caminho só.** A resposta de listagem e de detalhe carrega
`productKeyMask` e `hasProductKey`, **nunca** `productKey` — garantido pelo `select` da
allowlist, não por um `delete` no objeto. `GET /:id/product-key` decifra, responde e
grava `ActivityLog` com `action: 'VIEW_KEY'`.

`VIEW_KEY` **não existe** na união `ActivityAction` de
`activity/use-cases/record-activity.usecase.ts` — entra ali, com o comentário do porquê,
como `INSTALL`/`UNINSTALL` entraram na F5. E ele é a primeira ação do projeto que
registra uma **leitura**: as outras todas registram escrita. O comentário tem que dizer
isso, senão a próxima fase acrescenta `VIEW_*` para tudo.

**A chave não entra em `audited`** (D42). O diff do `ActivityLog` grava valor antigo e
novo; `productKey` na lista publicaria o segredo em claro numa tabela que ninguém pensa
em proteger. O que entra no diff é `hasProductKey: false → true`.

**Status derivado** (D44), helper puro sobre `terminationDate`, `expirationDate` e hoje:
`ENCERRADA` vence tudo (contrato rescindido), depois `EXPIRADA`, depois `VENCENDO` (N
dias), senão `ATIVA`. Nenhuma coluna — `\d licenses` não mostra `status`, e é isso que o
teste verifica.

**Alertas** em `/api/licenses/alerts`, no formato do `list-stock-alerts.usecase.ts`: duas
categorias (`vencendo`, `assentosAbaixoDoMinimo`), teto de 200 por categoria, filtro
grosso no banco e o fino em memória — `livres` não é coluna, e esse é o preço declarado
do D34 aplicado aqui.

### Etapa G — A costura com a posse · **M**

**É a etapa que a primeira versão deste plano não tinha, e é a mais importante.**

A F5 já viveu isto: o acessório entregue só passou a existir de verdade quando
`holdings`, o 409 do `DELETE` e o desligamento passaram a enxergá-lo. Assento de licença
é posse pelos mesmos três critérios — alguém responde por ele, ele impede o cadastro de
sumir, e ele tem que fechar quando a pessoa sai.

Sem esta etapa, **um desligado continua com assento de licença para sempre** e nada
acusa: o `offboard` fecha posses, ocupações e acessórios, e a licença ficaria de fora —
paga, ocupada por quem não trabalha mais ali, e invisível na única tela que alguém
consulta antes de comprar assento novo.

Cinco pontos, todos já existentes, todos ganhando uma linha:

| Arquivo | Hoje | Passa a |
|---|---|---|
| `user/use-cases/count-user-posse.usecase.ts` | conta ativos, postos, acessórios | **+ assentos de licença**, e a frase do 409 ganha a quarta ponta |
| `user/use-cases/offboard-user.usecase.ts` | fecha posse, ocupação, acessório | **+ `devolverAssentosDoUsuario(tx, …)`**, na mesma transação |
| `asset/use-cases/delete-asset.usecase.ts` | 409 por componente instalado | **+ 409 por assento de licença atribuído** |
| `assignment/use-cases/list-user-holdings.usecase.ts` | ativos (dois baldes) e acessórios | **+ `assentos`**, com o MESMO `where` do desligamento |
| `src/pages/gestao-usuario/` (aba de posse) | três blocos | **+ os assentos da pessoa**, e o modal de desligamento ganha o passo 3 e o aviso de queima |

`devolverAssentosDoUsuario` mora em `license/use-cases/checkin-user-seats.usecase.ts` e
é o espelho de `stock/use-cases/checkin-user-accessories.usecase.ts` — **inclusive na
armadilha**: ele fecha só as ocupações cujo alvo é `assignedUserId`. Assento atribuído a
um **ativo** não se devolve no desligamento, porque ele não é da pessoa — é da máquina, e
a máquina continua lá. Fechar os dois devolveria licença de um desktop que ninguém
mexeu, e é o mesmo erro que o `targetType: 'USER'` da F5 existe para impedir.

E a queima vale no desligamento: `reassignable = false` + desligamento **queima o
assento**. É perda de dinheiro acontecendo num fluxo automático, então o `ActivityLog`
registra e o retorno do `offboard` diz quantos assentos foram queimados — a tela mostra
antes de confirmar.

### Etapa H — As telas · **M**

```
src/domain/shared/license.types.ts
src/domain/license/license.queries.ts        # licenseKeys, prefixo ['licenses']
src/pages/licencas/
├── index.tsx                                # markup, nenhum fetch
├── hooks/useLicencas.ts                     # modal, seleção, confirmações
├── helpers/licenca.helper.ts                # cor do status, texto do mascarado
└── components/  LicencaTable · LicencaFormModal · AssentosGrade
                 EntregaAssentoModal · RevelarChaveModal · AlertasLicenca
```

- `src/App.tsx`: rota `/licencas`. `src/pages/components/AppHeader.tsx`: o item de menu.
- `abas.helper.ts`: `{ id: 'licencas', … }` **perde o `fase`** e ganha conteúdo — a
  moldura da tela não muda, que é o que a decisão da F2 prometia.
- `historico.helper.ts`: nada muda no arquivo compartilhado. `VIEW_KEY` entra no mapa de
  `extras` **da tela de licença**, que é onde ele significa alguma coisa — uma lista
  central com o vocabulário de todos os domínios é o que aquele arquivo recusa.
- A grade de assentos no padrão `font-mono text-xs`: livre · pessoa · ativo · queimado ·
  aposentado, cada estado com sua cor.
- **Dois avisos com confirmação**, e os dois mostram o número que importa:
  *revelar chave* ("esta leitura fica registrada"), e *queima* antes do checkin quando
  `reassignable = false` ("restarão 4 de 5 assentos utilizáveis — isto não tem volta").

---

## Decisões da fase

### D39 — Assento de licença **não** vai para um posto

**Decidido:** o alvo do assento é `User` **XOR** `Asset`. `Location` não é alvo.
**Descartado:** acrescentar `assignedLocationId` para o caso real do posto com desktop fixo.

**Por quê — três argumentos, o terceiro é o que fecha:**

1. **Licença é consumida por uma instalação.** O fornecedor licencia *por dispositivo* ou
   *por usuário nomeado*; não existe EULA que licencie um móvel. Quando o auditor da
   Microsoft pergunta onde o assento está, "na Mesa 1" não é uma resposta que conte.
2. **A F7 quebraria.** A conformidade alimentada pelo software instalado é o join
   `LicenseSeat → Asset → Endpoint → SoftwareInstallation`. Um assento apontando para uma
   `Location` não tem caminho até uma instalação: seria um buraco exatamente no relatório
   que justifica o módulo.
3. **O caso do posto compartilhado já tem resposta, e a resposta é mais honesta.** O
   desktop fixo da Mesa 1 é um `Asset`: o assento vai **para o ativo**, a `Assignment`
   daquele ativo aponta para a `Location`, e os responsáveis saem da Camada 2. A cadeia
   inteira já existe — acrescentar `LOCATION` criaria um **segundo caminho** para o mesmo
   fato, que é o que este projeto recusa desde o D16.
   E se a licença for *por usuário nomeado*, então Laura e Ana precisam de **dois**
   assentos, não de um pendurado na mesa. Um assento no posto **esconderia** duas pessoas
   atrás de um móvel — que é precisamente a exposição de conformidade que o módulo deveria
   estar apontando. O modelo está certo em fazer esse custo aparecer.

**O que se perde, declarado:** contar "quantos assentos estão na Sala 3" exige o salto pelo
ativo (`seat → asset → assignment → location`). É um join a mais num relatório, contra uma
coluna que tornaria o dado ambíguo.

### D40 — Assento materializado, ocupação em tabela própria

**Decidido:** `LicenseSeat` é a linha do assento (existe mesmo vazio) e
`LicenseSeatCheckout` é a ocupação, aberta/fechada como toda posse do projeto.
**Descartado:** `assignedUserId`/`assignedAssetId` mutáveis **no próprio assento**, com um
log ao lado — que é o que o Snipe-IT faz.

**Por quê:** as colunas mutáveis guardam só o *agora*; o "quem pegou, quem devolveu" viraria
responsabilidade do log, e log e colunas divergem sem nada detectar — o mesmo par de
fontes de verdade que o D17 tirou do `assignedToId`. Com a ocupação em linhas, o histórico
é o próprio dado e `UPDATE` nunca apaga fato nenhum.

**Por que então materializar o assento, se a ocupação já é linha?** Porque é preciso ter
**o que travar**. Sem a linha do assento, "pegue um livre" é uma conta sobre um contador e
duas requisições simultâneas chegam ao mesmo número (D34, um andar acima). A linha existe
para ser bloqueada.

### D41 — `FOR UPDATE SKIP LOCKED`, e o preço dele

**Decidido:** a escolha do assento livre é `$queryRaw` com `FOR UPDATE OF s SKIP LOCKED`,
**dentro** de `$transaction`. **Descartado:** `isolationLevel: 'Serializable'` no Prisma.

**Por quê não o Serializable:** ele resolve, mas exige laço de repetição para o erro 40001
em toda operação de checkout, e serializa mais do que o necessário. `SKIP LOCKED` faz duas
requisições simultâneas pegarem assentos **diferentes** sem nenhuma esperar.

**O preço, declarado:** sob contenção alta, `SKIP LOCKED` pode devolver "sem assento livre"
mesmo havendo um assento cuja transação concorrente vai cair no rollback um instante
depois — um 409 falso e raro. A alternativa (`FOR UPDATE` sem skip) troca isso por fila:
todo mundo espera o primeiro. Para entrega de licença, falhar rápido e mandar tentar de
novo é melhor do que enfileirar requisições HTTP.

### D42 — Chave cifrada numa coluna versionada, sem plano B em claro

> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D81.** O formato é `enc:v1:<kid>:<iv>:<tag>:<ct>`, com o identificador da chave e AAD amarrando o
> valor ao lugar onde ele mora — o mesmo da F9, num arquivo só (`core/crypto/cipher.ts`).

**Decidido:** AES-256-GCM, chave de 32 bytes em `APP_ENCRYPTION_KEY`, valor guardado como
`enc:v1:<kid>:<iv>:<tag>:<ct>` numa coluna só. **Descartado:** três colunas (`iv`, `tag`, `ct`) e
"se a chave não estiver configurada, grava em claro".

**Por quê uma coluna versionada:** três colunas precisariam de uma quarta no dia da rotação
de algoritmo — o prefixo já é essa quarta, e ele viaja junto com o dado.

**Por que sem plano B:** gravar em claro quando falta configuração é como o `/agent-hub`
aberto que a F0 fechou — o sistema funciona, ninguém percebe, e o segredo está no banco. Se
`APP_ENCRYPTION_KEY` não existir, **o campo de chave é recusado com 422** e a licença é
criada sem chave. Em produção o boot para, exatamente como já para sem `AGENT_TOKEN`.

**A chave nunca entra em `audited`.** O diff do `ActivityLog` grava valor antigo e novo em
`changes`; um `productKey` na lista de campos auditados publicaria o segredo em claro numa
tabela que ninguém pensa em proteger. O campo também entra no `core/logger/sanitize.ts`.

**Duas coisas desta decisão mudaram na execução, e as duas estão no D91:** "uma chave em
`APP_ENCRYPTION_KEY`" virou **chaveiro** (o `kid` do formato só serve para alguma coisa
se existir mais de uma chave), e "o campo entra no `sanitize.ts`" era uma linha que **não
funcionaria** — o regex de lá não casa com `productKey`.

### D43 — `burnedAt` e `retiredAt` são fatos diferentes

> ⚠️ **A aritmética desta decisão está ERRADA e foi corrigida pelo D92.** A fórmula
> continua escrita abaixo, tachada, porque apagá-la esconderia o erro que ela causa — e
> ele é o tipo de erro que volta: subtrair o aposentado de um total do qual ele já saiu.
> O **modelo** do D43 (duas colunas, dois fatos) continua valendo inteiro.

**Decidido:** duas colunas nuláveis. `burnedAt` = devolvido numa licença
`reassignable = false`, e o assento **não volta** ao contrato; `retiredAt` = o contrato
encolheu e este assento não existe mais.

**Por quê não uma coluna só com motivo:** queima é **perda de dinheiro** ("compramos 50,
temos 43 utilizáveis") e aposentadoria é **mudança de contrato** — relatórios diferentes.
Empacotadas num enum, a primeira consulta que quiser só uma delas volta a separar por
string. ~~`livres = seatsTotal − ocupados − queimados − aposentados`~~, sempre calculado
— **a subtração está errada, ver D92**: `livres` sai das LINHAS, e `aposentados` é número
exibido, nunca subtraído.

### D44 — Status da licença é derivado, nunca coluna

**Decidido:** `ATIVA / VENCENDO / EXPIRADA / ENCERRADA` sai de um helper puro sobre
`terminationDate`, `expirationDate` e a data de hoje.

**Por quê:** o status muda **pela passagem do tempo**, sem ninguém escrever nada. Coluna
exigiria um job diário para continuar verdadeira, e no dia em que o job falhasse o
inventário mentiria sem sintoma. É o D16 aplicado ao tempo em vez de à posse.

### D90 — Quem reconcilia trava tudo; quem entrega trava um assento

**Decidido:** `reconcile-seats` trava a linha da licença **e todos os assentos dela**
(`FOR UPDATE`, sem `SKIP LOCKED`, `ORDER BY "seatNumber"`) antes de contar.
`checkout-seat` continua travando **um** assento, com `SKIP LOCKED`.
**Descartado:** reconciliar "dentro de uma transação", como a Etapa E dizia, sem
dizer o que se trava.

**Por quê:** transação não é trava. Encolher de 5 para 3 lê "2 livres", marca os dois
`retiredAt`, e uma entrega simultânea — que trava **o assento**, não a licença — leva um
deles no meio. O resultado é um assento ocupado e aposentado ao mesmo tempo: some da
conta de livres, some da conta de comprados, e continua na mão de alguém. Em READ
COMMITTED nada acusa, e é o mesmo tipo de falha muda do D34.

**Por que assimétrico:** entregar é o caminho quente e reconciliar é edição de contrato,
que acontece quando chega nota fiscal. Travar a licença inteira na entrega enfileiraria
todo checkout da mesma licença e jogaria fora o D41; travar nada na reconciliação
corrompe a conta. Cada um paga onde é barato.

**Sem deadlock, e o argumento é a ordem:** os dois tomam assentos em `seatNumber`
crescente, e ninguém segura assento esperando a licença — a licença é sempre a primeira.
Uma reconciliação que esbarra num assento em uso **espera** aquela entrega terminar e
recomeça a contagem já enxergando o resultado dela.

**O preço, declarado:** enquanto a reconciliação está de pé, todo checkout daquela
licença vê os assentos travados, o `SKIP LOCKED` pula todos e responde 409 "sem assento
livre". É o mesmo falso 409 do D41, na mesma moeda: falhar rápido em vez de enfileirar.

### D91 — Chaveiro, não chave: o `kid` vem da própria chave

**Decidido:** `APP_ENCRYPTION_KEY` é a chave **ativa** (32 bytes, hex ou base64) e
`APP_ENCRYPTION_KEYS_ANTIGAS` é a lista separada por vírgula das chaves que ainda
**decifram** e não cifram mais. O `kid` de cada uma é derivado dela —
`sha256(chave).hex.slice(0, 8)` — e nunca configurado à mão.
**Descartado:** `APP_ENCRYPTION_KEY_ID` ao lado de cada chave.

**Por quê:** o D81 exige o `kid` dentro do valor para que rotação seja gradual. Isso
implica chaveiro, e chaveiro implica identificar cada chave. Um `kid` **configurado**
pode ser digitado errado, repetido entre duas chaves ou trocado sem trocar a chave — e
qualquer um dos três produz o erro que a rotação existia para evitar, mais tarde e com
uma causa a mais para procurar. Derivado, o `kid` **não pode discordar** da chave: ele é
uma função dela.

**Por que só 8 caracteres:** ele identifica entre as duas ou três chaves configuradas,
não no universo. E ele fica gravado em toda linha cifrada — o valor inteiro do hash
custaria 56 bytes por linha para não responder nenhuma pergunta a mais.

**O canário, e o que ele derruba.** `AppSetting.cryptoCanary` guarda um texto conhecido
cifrado. No boot: coluna vazia → é gravada com a chave ativa; preenchida → é decifrada,
e o `kid` de dentro escolhe a chave no chaveiro. `kid` desconhecido ou tag que não
confere **para o boot** com a frase do que houve. Sem ele, trocar a chave é um sistema
que sobe perfeito e só falha semanas depois, na primeira tentativa de revelar — com um
500 no meio de uma tela e nenhuma pista.

**Sem plano B em claro** (D42, mantido): sem chave configurada, o campo `productKey` é
recusado com **422** e a licença é criada sem chave. Em produção o boot para, como já
para sem `AGENT_TOKEN`.

**O id gerado pela aplicação é consequência disto, não capricho.** O AAD é
`"licenses:productKey:<id>"`, então o id tem que existir antes do INSERT: `License.id`
perde o `@default(uuid())` e `create-license` gera com `randomUUID()`. Uma linha, contra
uma chave que se pode copiar de uma licença para outra e o sistema revela como legítima.

### D92 — `livres` sai das linhas; `aposentados` não entra na subtração

**Decidido:** `livres = COUNT(assentos sem burnedAt, sem retiredAt, sem ocupação aberta)`,
e a invariante do contrato é `COUNT(retiredAt IS NULL) = seatsTotal`.
**Corrige** a fórmula do D43, que subtrai os aposentados de `seatsTotal`.

**Por quê:** a fórmula do D43 funciona enquanto ninguém encolhe o contrato e passa a
mentir no instante em que alguém encolhe. Contrato de 5 vira 3, dois assentos ganham
`retiredAt`, `seatsTotal = 3`: `livres = 3 − 0 − 0 − 2` dá **1**, e a resposta certa é
**3**. O aposentado já saiu de `seatsTotal` quando o contrato encolheu — subtraí-lo de
novo é contá-lo duas vezes.

**O que o D43 acerta, e continua valendo:** `burnedAt` e `retiredAt` são fatos
diferentes e precisam de colunas diferentes. Queima é perda de dinheiro ("compramos 50,
temos 43 utilizáveis"); aposentadoria é mudança de contrato. A correção é na aritmética,
não no modelo.

**Aposentado vira número exibido, não subtraído:** a tela mostra
`livres / seatsTotal`, com `queimados` e `aposentados` ao lado — o segundo explica por
que a tabela tem mais linhas que o contrato.

**E a aposentadoria só alcança assento livre**, o que mantém `burnedAt` e `retiredAt`
disjuntos na prática sem precisar de um CHECK para isso.

### D93 — Assento é posse, e a posse do projeto já tem três lugares

**Decidido:** assento de licença entra em `count-user-posse`, no `offboard` e no 409 do
`DELETE` de ativo, na Etapa G — antes das telas.
**Descartado:** tratar licença como módulo isolado, que é o que a Etapa C fazia
ao não mencionar nenhum dos três.

**Por quê:** a pergunta que decide se algo é posse não é "tem tabela própria?", é
*"alguém responde por isto quando a pessoa sai?"*. Assento responde sim — ele custa
dinheiro por mês e é nominal. A F5 já respondeu essa pergunta para o acessório e a
resposta mudou quatro arquivos fora do domínio dela; a F6 responde igual.

**O que aconteceria sem isto**, e é o motivo de a etapa vir antes das telas: o
desligamento fecharia tudo **menos** a licença, e o sintoma não é um erro — é um número
de assentos ocupados que nunca desce. A empresa compra assento novo porque "não tem
livre", e os livres estão com gente que saiu. É o D82 outra vez: o passo que não dá erro
quando falta é o que precisa estar escrito no mesmo lugar dos outros.

**A assimetria declarada:** assento de alvo `ASSET` **não** é fechado pelo desligamento.
Ele não é da pessoa.

### D94 — Anexo de licença sai da fase

**Decidido:** a F6 não entrega anexo de licença. O item continua no `ITAM-TODO.md`, com
o pré-requisito escrito.
**Descartado:** "depende do upload que nasce na F2", como os pré-requisitos anotavam.

**Por quê:** o upload da F2 nasceu, e nasceu **de ativo**. `Attachment.assetId` é
`NOT NULL` com FK para `assets` e `onDelete: Cascade` — não há onde pendurar uma licença
sem tornar o dono polimórfico, o que significa migração, discriminante, CHECK e uma
decisão sobre o que acontece com o arquivo quando o dono some. Isso é do tamanho de uma
etapa inteira, e não é sobre licença: é sobre anexo.

**O que se perde, declarado:** a nota fiscal e o contrato da licença continuam fora do
sistema por mais uma fase. Contra isso, `orderNumber`, `purchaseDate` e `purchaseCost`
já entram na F6 — a *referência* ao documento existe, o arquivo é que não.

---

## Riscos e armadilhas

**A segunda corrida do assento, a que o D41 não cita.** O checkin fecha
`license_seat_checkouts` e, sem travar `license_seats`, não disputa linha nenhuma com o
checkout. Em READ COMMITTED o `SELECT … FOR UPDATE OF s` só reavalia o `WHERE` para
linhas que uma transação concorrente tenha **atualizado na tabela travada** — e o
checkin não atualiza nenhuma. Resultado: um assento liberado um instante antes pode não
ser visto, e a entrega responde 409 com assento livre no banco. **Defesa:** o checkin
trava a linha do assento primeiro — ele precisa dela de qualquer jeito para a queima, e
travar sempre custa nada.

**`$queryRaw` fora da transação é um lock de zero milissegundo.** Em autocommit o
`FOR UPDATE` é liberado no fim da própria instrução: o código parece certo, o teste com
um usuário passa, e a corrida continua aberta.

**O 409 genérico esconde o motivo.** `license_seat_uma_aberta_por_assento` levanta
`P2002`, que o `error-handler` traduz para "Registro já existe" — inútil para quem
tentou entregar. O use-case checa antes e lança `AppError` com a frase certa; o índice é
a rede, não a mensagem.

**Queimar acontece num clique de devolução, e também num desligamento.** O segundo é
pior porque ninguém está olhando para a licença naquele momento. Ambos registram
`ActivityLog` próprio, e o retorno do `offboard` diz quantos assentos queimaram.

**A chave vaza por quatro caminhos além da resposta**, e três precisam ser fechados no
commit em que a coluna nasce, porque depois ninguém lembra: o diff do `ActivityLog`
(D42 — fora de `audited`), o log estruturado (`sanitize.ts` — o regex **não** casava), e
o `select` de toda leitura (allowlist, nunca `delete` no objeto). O quarto é o export CSV
da F10, **que não existe** — fica anotado no TODO da F10, ao lado do item de export.

**Trocar `APP_ENCRYPTION_KEY` torna toda chave existente ilegível**, e sem o canário a
falha só aparece na primeira revelação. Com ele, o boot para com a frase certa.

**`Decimal` de `purchaseCost` continua saindo como string** — mesma armadilha nº 7 da F1.

**`seatsTotal = 0` é legítimo** (contrato cadastrado antes da compra) e o CHECK permite.
O que não pode é o checkout achar assento onde não há: o `SELECT` devolve zero linhas e
o 409 sai com a frase de sempre.

---

## Verificação

```bash
API=http://localhost:3001
PSQL="docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -t -A -c"
```

**1. O que o banco garante sozinho** — o XOR não passa nem pelo `psql`:

```bash
$PSQL "SELECT conname FROM pg_constraint
       WHERE conrelid='license_seat_checkouts'::regclass AND contype='c';"
# → license_seat_alvo_xor, license_seat_checkin_nao_antecede
$PSQL "INSERT INTO license_seat_checkouts (id,\"seatId\",\"assignedUserId\",\"assignedAssetId\",\"checkoutAt\")
       VALUES (gen_random_uuid(),'$SEAT','$LAURA','$ATIVO',now());"
# → ERROR: violates check constraint "license_seat_alvo_xor"
```

**2. A corrida** — licença com 5 assentos, 8 checkouts simultâneos:

```bash
seq 8 | xargs -P8 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $API/api/licenses/$LIC/checkout-seat -H 'Content-Type: application/json' \
  -d "{\"assignedAssetId\":\"$ATIVO\"}"
# → exatamente cinco 201 e três 409

$PSQL "SELECT \"seatId\", COUNT(*) FROM license_seat_checkouts WHERE \"checkinAt\" IS NULL
       GROUP BY 1 HAVING COUNT(*) > 1;"                                   # → 0 linhas
```

**3. A chave está cifrada em repouso e mascarada na resposta:**

```bash
curl -s "$API/api/licenses/$LIC" | jq '{productKey, productKeyMask, hasProductKey}'
# → {"productKey":null,"productKeyMask":"••••-••••-••••-AB12","hasProductKey":true}

$PSQL "SELECT left(\"productKey\",7) FROM licenses WHERE id='$LIC';"            # → enc:v1:
$PSQL "SELECT \"productKey\" FROM licenses WHERE \"productKey\" LIKE '%AAAA%';" # → 0 linhas
$PSQL "SELECT changes::text FROM activity_logs WHERE \"entityId\"='$LIC';" | grep -c AAAA  # → 0
curl -s "$API/api/licenses/$LIC/product-key" | jq -r .productKey                # → AAAA-…-AB12
$PSQL "SELECT action FROM activity_logs WHERE \"entityId\"='$LIC' ORDER BY \"createdAt\" DESC LIMIT 1;"
# → VIEW_KEY
```

**4. O AAD amarra a chave ao lugar** — copiar entre licenças não revela:

```bash
$PSQL "UPDATE licenses SET \"productKey\" = (SELECT \"productKey\" FROM licenses WHERE id='$LIC')
       WHERE id='$OUTRA';"
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/licenses/$OUTRA/product-key"   # → 500/409, NUNCA 200
```

**5. Sem `APP_ENCRYPTION_KEY` nada é gravado em claro:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/api/licenses \
  -H 'Content-Type: application/json' -d '{"name":"X","seatsTotal":1,"categoryId":"'$CAT'","productKey":"K"}'
# → 422 (chave de criptografia não configurada) — nunca 201
```

**6. `reassignable = false` queima na devolução:**

```bash
curl -s -X POST $API/api/licenses/seats/$SEAT/checkin
$PSQL "SELECT \"burnedAt\" IS NOT NULL FROM license_seats WHERE id='$SEAT';"   # → t
curl -s "$API/api/licenses/$LIC" | jq '{seatsTotal, livres, queimados}'        # → 5, 4, 1
```

**7. Reconciliação e a aritmética do D92** — subir de 5 para 8, depois descer para 6:

```bash
$PSQL "SELECT COUNT(*) FILTER (WHERE \"retiredAt\" IS NULL) FROM license_seats
       WHERE \"licenseId\"='$LIC';"          # → igual a seatsTotal, SEMPRE
```

Com 5 ocupados, descer para 6 responde **409**; com 3 ocupados, marca `retiredAt` em dois
livres e **mantém as linhas**. Depois: `expirationDate` daqui a 10 dias → `VENCENDO`;
ontem → `EXPIRADA`; `terminationDate` **já passada** → `ENCERRADA` mesmo com vencimento
futuro — e nenhuma coluna de status em `\d licenses`. `terminationDate` **futura** não
encerra nada: o contrato foi rescindido *para* aquele dia e vale até lá, então o status
continua saindo do vencimento. (O texto dizia só "preenchida"; quem manda é a
comparação com hoje, em `license-status.helper.ts`.)

**8. O desligamento leva o assento junto (D93):**

```bash
curl -s -X POST $API/api/users/$LAURA/offboard
$PSQL "SELECT COUNT(*) FROM license_seat_checkouts WHERE \"assignedUserId\"='$LAURA'
       AND \"checkinAt\" IS NULL;"                                      # → 0
# e o assento do ATIVO dela continua aberto — ele não é dela:
$PSQL "SELECT COUNT(*) FROM license_seat_checkouts WHERE \"assignedAssetId\"='$ATIVO'
       AND \"checkinAt\" IS NULL;"                                      # → 1
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $API/api/users/$OUTRA  # → 409 citando o assento
```

### Os testes que entram em `tests/`

Pelo harness de [`TESTES.md`](./TESTES.md) — `app.inject()`, nunca use-case direto.

| Arquivo | O que prova |
|---|---|
| `tests/licencas/corridas.test.ts` | 8 entregas simultâneas em 5 assentos → placar `{201:5, 409:3}`, e zero assentos com duas ocupações abertas |
| `tests/licencas/reconciliacao.test.ts` | `COUNT(retiredAt IS NULL) = seatsTotal` depois de subir, descer e tentar descer demais (409); `seatNumber` sem colisão depois de aposentar |
| `tests/licencas/chave.test.ts` | a chave não sai em nenhuma listagem nem no `changes`; `sanitizeForLog({ productKey })` esconde; AAD trocado não decifra |
| `tests/licencas/operacoes.test.ts` | queima na devolução, status derivado nas quatro bordas, 409 do alvo desligado |
| `tests/licencas/historico.test.ts` | a trilha da licença, `VIEW_KEY` inclusive |
| `tests/licencas/posse.test.ts` | o desligamento fecha assento de alvo `USER` e não fecha o de alvo `ASSET`; o 409 do `DELETE` de pessoa e de ativo; **e o `holdings` devolve exatamente o conjunto que o `offboard` fecha, `reassignable` inclusive** |
| `tests/licencas/canario.test.ts` | o canário grava no primeiro boot, DERRUBA a troca acidental e **se regrava com a chave ativa na rotação** — sem isso a antiga nunca pode sair do ambiente |

---

## O que fica de fora, declarado

- **Anexo de licença** — D94. Exige dono polimórfico em `Attachment`.
- **Export CSV mascarado** — não há export no projeto. Anotado no item da F10.
- **`maintained` não tem efeito**, como já estava escrito aqui desde o começo: atributo
  informativo e filtro, até aparecer a pergunta que ele responde.
- **Licenciamento por núcleo/processador** (SQL Server, VMware) não cabe em "um assento =
  uma atribuição". É o primeiro caso real que quebraria o modelo — nada aqui deve
  dificultá-lo, e nada aqui o implementa.
- **Chave por assento** (OEM) não existe: a chave é da licença. Se aparecer, é
  `productKey` no `LicenseSeat` com a mesma função de `core/crypto` — aditivo.
- **O CHECK do `Assignment`** deixou de estar em aberto: ele entrou em
  `20260923105500_check_do_assignment`. A assimetria que este plano apontava
  não existe mais.

## O que esta fase acrescentou ao `ITAM-TODO.md` e ao `INVARIANTES.md`

No **TODO**: `D90`–`D94` registradas; o item de anexo de licença marcado como dependente
de dono polimórfico em `Attachment` (D94); o item de export CSV da F10 anotado com a
chave mascarada; e `core/crypto/` registrado como nascendo aqui, para a F9 reusar.

Nas **INVARIANTES**, "As oito" virou "As onze":

- **9 — `license_seat_alvo_xor`**: o alvo do assento é pessoa **ou** ativo, nunca os dois,
  nunca nenhum. Garantida pelo banco, explicada pelo use-case.
- **10 — `license_seat_uma_aberta_por_assento`**: um assento não está em duas mãos.
  Índice único parcial, a mesma forma da invariante 1 um nível abaixo.
- **11 — `COUNT(assentos sem retiredAt) = seatsTotal`**: o contrato e as linhas não
  divergem (D90, D92). É a única das três que o banco **não** garante sozinho — ela
  atravessa duas tabelas — então mora no use-case e é provada por
  `tests/licencas/reconciliacao.test.ts`.
