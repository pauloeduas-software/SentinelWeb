# Plano de implementação — Fase 7: convergência RMM × ITAM ✅

> Fase do [`ITAM-TODO.md`](./ITAM-TODO.md), **fechada**. Contrato de posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) · camadas: [`ARQUITETURA.md`](./ARQUITETURA.md) ·
> o que o sistema recusa: [`INVARIANTES.md`](./INVARIANTES.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
>
> **Decisões em CINCO levas, e as cinco ficam aqui:** `D45`–`D51` foram escritas **antes**,
> contra o código de depois da F1; `D95`–`D103` foram escritas no desenho desta fase,
> contra a árvore com F2–F6 dentro; `D104`–`D108` foram escritas **durante a execução**,
> quando o código provou coisas que nem o plano revisado sabia; e `D109`–`D112` saíram da
> **auditoria da fase fechada**, quando quatro erros de lógica apareceram sob teste — o
> pior deles gravando no histórico de posse uma devolução que nunca aconteceu; e `D113`–`D122`
> saíram de uma **segunda auditoria**, que procurou o que a fase tinha de motor pronto e
> INALCANÇÁVEL pela tela — três entregas inteiras nesse estado — mais dois erros de lógica,
> sendo um deles o turno da noite rotulado como "Manhã" todas as noites. Onde as novas contrariam
> as antigas, a contradição está **escrita na decisão antiga e justificada na nova** —
> nunca corrigida em silêncio. É a mesma regra que manteve a fórmula errada do D43 visível
> na F6: apagá-la esconderia por que a certa é a certa.

---

## Objetivo

**Esta é a fase em que o produto deixa de ser um clone.** O Snipe-IT é um CMDB manual:
alguém digita o que existe e o sistema acredita. Nós temos um agente instalado na máquina
mandando handshake e telemetria desde antes do ITAM existir — e até hoje os dois lados
nunca se falaram. O `Endpoint` sabe o que a máquina *é*; o `Asset` sabe o que a empresa
*comprou e de quem cobra*. A convergência é ligar os dois **sem fundi-los**.

E há uma segunda coisa, que é a mais valiosa e que nenhum ITAM de prateleira faz: **o
agente vê quem está logado**. Num modelo `Asset ⟷ User`, essa observação só sabe dizer
"o dono está errado" — e quando duas pessoas usam a mesma máquina em turnos, ela fica
oscilando entre dois nomes e acaba descartada como ruído. Com as três camadas do
[`MODELO-POSSE.md`](./MODELO-POSSE.md), a mesma observação tem **onde cair**: o dono da
máquina é o **posto**, e as pessoas são **ocupantes** dele. Duas pessoas na mesma máquina
deixam de ser um conflito e viram a descrição correta da operação — que o sistema pode
**propor cadastrar**.

A fase entrega, nesta ordem: o vínculo (D45), a coleta de identidade pelo agente, o motor
de matching e a fila, fantasma e Shadow IT, **a ocupação sugerida** (D47), **o posto
compartilhado detectado** (D48), o software normalizado alimentando a conformidade da F6,
o merge de duplicados e o ativo ocioso.

---

## O que mudou entre o plano antigo e a árvore de hoje

As `D45`–`D51` foram desenhadas quando só existiam F0 e F1. Entraram cinco fases desde
então, e **doze coisas na árvore contrariam ou precisam o que aquele plano supunha**. As
etapas abaixo já estão reescritas contra o código real; estas doze são a razão de existirem
`D95`–`D103`.

| # | O que o plano de então assumia | O que a árvore diz hoje | Onde entra |
|---|---|---|---|
| 1 | `lastSeenByAgentAt` escrito no handshake, com teto diário (D50) | `touchEndpoint` roda a **cada** mensagem de **cada** máquina e já faz um `UPDATE`; um segundo `UPDATE` condicional em `assets` ali multiplica por máquinas × mensagens | D95 / Etapa D |
| 2 | Uma `ReconciliationSuggestion` com `endpointId` + `assetId` | A Etapa E sugere **pessoa**, a F sugere **posto + turno**, a H sugere **outro endpoint** — quatro formas de alvo na mesma fila | D96 / Etapa B |
| 3 | "Sem memória do `REJECTED` o job reoferece" | Certo, e **incompleto**: sem chave da evidência, recusar uma vez enterra a sugestão para sempre, mesmo quando o serial muda depois | D97 / Etapa C |
| 4 | `AgentStatus { ONLINE OFFLINE NEVER_SEEN }` (o item do TODO) | Uma linha de `Endpoint` **nasce de um handshake**: `NEVER_SEEN` seria um valor que nenhuma linha jamais tem. "Nunca visto" é pergunta do **ativo** | D98 / Etapa B |
| 5 | "Até a F3/F11 darem `username` ao `User`, é sempre sugestão" | **A F3 já deu**: `User.username` existe, nulável, com unicidade por índice **parcial** (`WHERE deleted_at IS NULL`) | Etapa E |
| 6 | Conformidade cruza `SoftwareInstallation → Endpoint → Asset → LicenseSeat` | O assento não aponta para o ativo: quem aponta é **`LicenseSeatCheckout.assignedAssetId`**, com `checkinAt IS NULL` (F6, D40) | Etapa G |
| 7 | "Conformidade responde instalado sem assento" | **Falta a ponte**: nada no banco liga a licença "Office 365 E3" ao pacote "Microsoft 365 Apps for enterprise" | D102 / Etapa G |
| 8 | `SoftwarePackage` único por `(name, version, publisher)` | Em Postgres dois `NULL` **não são iguais**: a tupla com `publisher` nulo não deduplica, e o mesmo pacote entra N vezes | D100 / Etapa B |
| 9 | `ActivityLog` com ação nova | `ActivityAction` é **união fechada** (`record-activity.usecase.ts`) e não tem `LINK`, `UNLINK` nem `MERGE` — mesmo caso do `VIEW_KEY` na F6 | Etapa C / H |
| 10 | O handshake é testável como o resto | **Nenhum teste da suíte atravessa o `/agent-hub`**: `api-token.test.ts` usa `inject` e para no 401 do `preHandler`. `inject` não faz upgrade de WebSocket | D99 / Verificação |
| 11 | "Specs de hardware como atributo do **ativo**" (o item do TODO) | Copiar RAM e disco coletados para `assets` é a segunda fonte de verdade que o D16 proíbe — o dado é do lado que **descobre** | Etapa B |
| 12 | "Conta de serviço e técnico de TI: fora desta fase" | Sem a allowlist, o técnico que loga em 40 máquinas gera 40 sugestões de posto compartilhado **no primeiro dia** e a fila nasce como ruído | D101 / Etapa F |

E duas coisas que a árvore **já resolveu** e que o plano antigo tratava como trabalho:

- **A janela de job existe** (`core/jobs/claim-window.ts`, D79): `executarUmaVezPorJanela`
  sobrevive a deploy. O job de reconciliação e o expurgo dos 90 dias (D49) usam-na, sem
  inventar agendamento novo.
- **A lixeira é automática**: a extensão do Prisma escopa `findMany`/`count` em todo model
  com `deletedAt` — então ativo na lixeira **não entra** na cascata de matching sem
  ninguém escrever filtro. As tabelas novas não têm `deletedAt` e ficam fora do escopo, que
  é o certo: sugestão não vai para a lixeira, é resolvida.

---

## O que a execução corrigiu — e o que ela confirmou

As doze diferenças da tabela acima foram encontradas **lendo** a árvore. Estas cinco só
apareceram **escrevendo** contra ela, e são a razão de existirem `D104`–`D108`.

| # | O que este plano dizia | O que o código provou | Onde |
|---|---|---|---|
| 1 | Cascata de quatro sinais: serial → UUID → **MAC** → hostname | **`Asset` não tem coluna de MAC.** Não existe lado cadastrado para comparar: MAC responde outra pergunta — *estas duas MÁQUINAS são a mesma?* | D104 |
| 2 | Uma coluna `softwareHash` | Com uma só, o job teria que **re-hashear o JSON de 500 máquinas por hora** para descobrir quem mudou — e o hash existe para esse trabalho não acontecer | D105 |
| 3 | "Campo novo é opcional no parser" | Opcional no parser **não basta**: `null` no Prisma é `APAGUE`, e um agente que voltasse à versão antiga apagaria o serial que já tinha mandado | D106 |
| 4 | "Aceitar a sugestão" | A ação e o fechamento **não cabem na mesma transação** (os use-cases da F4 abrem a própria), e a ordem entre elas decide para que lado o erro cai | D107 |
| 5 | O merge "preserva o `createdAt` mais antigo" | **`Endpoint` não tem `createdAt`.** O que existe para preservar é o `lastSeen` mais recente | D108 |

E três coisas que o plano previu e a execução **confirmou na prática**, o que vale registrar
porque as três eram apostas:

- **O `migrate diff` emitiu exatamente o `DROP COLUMN "status"` + `ADD COLUMN` previsto** no
  risco. Aplicar sem ler teria devolvido a frota inteira para `ONLINE` — inclusive as
  máquinas que o `zombie-cleaner` tinha acabado de marcar `OFFLINE`. O SQL foi trocado à
  mão pelo `ALTER … TYPE … USING`, e o comentário do porquê ficou na migração.
- **O `present-endpoint.helper.ts` teria derrubado `/api/endpoints`.** O teste
  `handshake.test.ts` cobre isso com a asserção mais chata do arquivo (`ramTotalBytes` sai
  como string), porque a falha apareceria na tela que o painel consulta a cada 5 segundos.
- **O `ActivityAction` não compilou** com `LINK`, `UNLINK` e `MERGE` — que é o comportamento
  desejado da união fechada, e o mesmo tropeço que a F6 levou com o `VIEW_KEY`.

---

## Pré-requisitos, conferidos na árvore

| Precisa estar pronto | Por quê | Estado |
|---|---|---|
| **F1** — `Asset` inteiro, `Endpoint` renomeado | os dois lados do vínculo | ✅ |
| **F4** — `Assignment`, `LocationOccupant`, `resolverResponsaveisEmLote()` | sem a Camada 2 não existe "sugerir ocupação", e a fase perde o que tem de próprio | ✅ `assignment/use-cases/resolve-responsibles.usecase.ts`, domínio `occupancy/` |
| **F6** — assento com alvo ativo | só para a conformidade por software instalado; o resto da fase não depende | ✅ `LicenseSeatCheckout.assignedAssetId` |
| **`JobRun` + janela** | o job de hora em hora e o expurgo diário | ✅ `core/jobs/claim-window.ts` |
| **`AppSetting` singleton** | ganha os botões da descoberta | ✅ `settings/helpers/app-setting.helper.ts` |
| **Agente Sentinel (C#)** | **fora deste repositório**: a coleta nova é deploy coordenado, e agente antigo continua mandando o payload velho por semanas | externo |

---

## Os nove commits

Um por etapa, `npm run lint` e `npm test` verdes em cada um. A ordem não é gosto: a **A**
vem primeiro porque é a única que depende de deploy externo e precisa do maior tempo de
convivência; a **E** e a **F** vêm antes das telas porque são elas que decidem o que a tela
mostra.

### Etapa A — O agente passa a mandar identidade · **M**

`server/domain/shared/agent-protocol.types.ts` — `HandshakeData` ganha oito campos, **todos
opcionais**:

```ts
biosSerial: string | null;       // Win32_BIOS.SerialNumber
systemUuid: string | null;       // Win32_ComputerSystemProduct.UUID
manufacturer: string | null;     // Win32_ComputerSystem.Manufacturer
hardwareModel: string | null;    // Win32_ComputerSystem.Model      ← NÃO `model`, ver abaixo
chassisType: string | null;      // Win32_SystemEnclosure.ChassisTypes
ramTotalBytes: bigint | null;    // Win32_ComputerSystem.TotalPhysicalMemory
diskTotalBytes: bigint | null;
loggedOnUser: string | null;     // Win32_ComputerSystem.UserName → "DOMINIO\ana.silva"
```

**`hardwareModel`, e nunca `model`.** É o D13 outra vez: `endpoint.model` lê-se como a
relação de catálogo do ativo (`Asset.model → AssetModel`), e o dia em que alguém escrever
`endpoint.model.name` esperando "Latitude 5440" o compilador **não** vai ajudar se o campo
existir com esse nome. Nome diferente, erro de compilação.

`server/domain/agent/helpers/payload.helper.ts` ganha **`readOptionalBigInt`**: o
`readBigInt` de hoje devolve `0n` quando o campo falta, e gravar `ramTotalBytes = 0` para
agente velho é afirmar "esta máquina tem zero bytes de RAM" — que é diferente de "não sei",
e é o valor que o painel de cobertura somaria.

`server/domain/agent/helpers/normalize-payload.helper.ts` — os oito entram na mesma tabela
de sinônimos que já resolve PascalCase × camelCase.

**Regra em uma linha:** todo campo novo é opcional no parser e o handshake antigo continua
válido — agente velho em campo é a regra durante o rollout, não a exceção.

### Etapa B — Schema e migração · **M**

```prisma
enum AgentStatus     { ONLINE OFFLINE }                      // dois valores — D98
enum ReviewState     { UNREVIEWED ALLOWED BLOCKED }
enum DiscoveryMode   { OFF SUGGEST ON }
enum MatchSignal     { SERIAL UUID MAC HOSTNAME }
enum SuggestionKind  { LINK MERGE CHECKOUT OCCUPANCY SHARED_POST }
enum SuggestionState { PENDING ACCEPTED REJECTED SUPERSEDED }
```

| Onde | O que nasce | Regra em uma linha |
|---|---|---|
| `Endpoint` | os oito da Etapa A + `assetId String? @unique @db.Uuid`, `softwareHash String?`, `reviewState`, `mergedIntoId String?` | o lado descoberto aponta para o lado cadastrado (D45) |
| `Endpoint.status` | `String` → `AgentStatus @default(ONLINE)` | eixo do agente, separado do ciclo de vida (`StatusLabel`) |
| `Asset` | **só** `lastSeenByAgentAt DateTime?` | **nunca** `lastSeen` (D13); quem escreve é o job (D95). `lastAuditAt` é coluna da F8 e não nasce aqui |
| `ReconciliationSuggestion` | `kind`, `endpointId`, `assetId?`, `targetUserId?`, `targetLocationId?`, `mergeIntoEndpointId?`, `score`, `signal?`, `shift?`, `evidence Json`, `evidenceHash`, `state`, `resolvedAt?`, `resolvedById?` | **uma** fila para as cinco formas (D96) |
| `EndpointUserDaily` | `endpointId`, `userKey`, `userId?`, `day @db.Date`, `firstSeenAt`, `lastSeenAt`, `samples` | **agregado por dia**, não log de sessão (D49) |
| `AssetChange` | `assetId`, `endpointId?`, `field`, `oldValue?`, `newValue`, `detectedAt` | mudança de hardware **detectada**, não digitada |
| `SoftwarePackage` | `name`, `version`, `publisher?`, `normalizedKey @unique` | a chave é derivada, porque `NULL` não deduplica (D100) |
| `SoftwareInstallation` | `endpointId`, `packageId`, `firstSeenAt`, `lastSeenAt`, `removedAt?` | o `installedSoftware` deixa de ser JSON write-only |
| `LicenseSoftware` | `licenseId`, `packageId` | a ponte licença↔pacote, **explícita** (D102) |
| `AssetUsageDaily` | `assetId`, `day @db.Date`, `activeMinutes`, `samples` | agregado por dia, pelo mesmo motivo do D49 |
| `AppSetting` | `discoveryMode @default(SUGGEST)`, `ghostDays @default(30)`, `shadowHours @default(24)`, `userDailyRetentionDays @default(90)`, `ignoredUserKeys String[] @default([])` | os botões da descoberta moram no singleton que já existe |

**As specs coletadas ficam no `Endpoint`, não no `Asset`** — e isso corrige a redação do
item do TODO (#11 da tabela acima). RAM e disco coletados são fato do lado que descobre; o
que a empresa comprou é outro dado, e pode divergir legitimamente (o pente foi trocado). A
tela do ativo mostra os dois pelo vínculo. Copiar para `assets` criaria uma coluna que
**ninguém consegue contestar** — o D16 uma camada abaixo. O que o item do TODO queria de
verdade — "isso some no expurgo da telemetria" — está resolvido: coluna no `Endpoint` não
é expurgada com a métrica.

O SQL que o Prisma não expressa:

```sql
-- Uma sugestão PENDENTE por (tipo, endpoint, alvo). O job roda de hora em hora e
-- não pode empilhar a mesma sugestão para sempre. COALESCE porque três das FKs de
-- alvo são nuláveis e NULL não colide com NULL.
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" (
    "kind", "endpointId",
    COALESCE("assetId",            '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetUserId",       '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetLocationId",   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("mergeIntoEndpointId",'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "state" = 'PENDING';

CREATE UNIQUE INDEX ON "endpoint_user_daily" ("endpointId","userKey","day");
CREATE UNIQUE INDEX ON "software_installations" ("endpointId","packageId");
CREATE UNIQUE INDEX ON "asset_usage_daily" ("assetId","day");

-- String → enum: FALHA se alguma linha tiver valor fora do enum. Conferir antes:
--   SELECT DISTINCT status FROM endpoints;   → hoje só ONLINE e OFFLINE
ALTER TABLE "endpoints" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "endpoints" ALTER COLUMN "status" TYPE "AgentStatus" USING "status"::"AgentStatus";
ALTER TABLE "endpoints" ALTER COLUMN "status" SET DEFAULT 'ONLINE';

CREATE INDEX ON "assets" ("lastSeenByAgentAt");
```

A migração é escrita à mão pelo caminho do [`ARQUITETURA.md`](./ARQUITETURA.md) (`migrate
diff` → **revisar** → `db:migrate`), e **nunca** `migrate dev`. Conferir no SQL gerado que
o rename de `status` não virou `DROP COLUMN` + `ADD COLUMN`: seria a frota inteira voltando
a `ONLINE` de graça.

### Etapa C — O motor de matching e a fila · **G**

```
server/domain/reconciliation/
├── reconciliation.maestro.ts
├── controllers/reconciliation.controller.ts
├── schemas/reconciliation.schema.ts
├── helpers/normalize-identity.helper.ts   # serial/UUID/MAC limpos + listas de lixo (puro)
├── helpers/match-cascade.helper.ts        # a cascata e a pontuação (puro)
├── helpers/evidence.helper.ts             # o evidenceHash (puro) — D97
├── helpers/suggestion-select.helper.ts
├── jobs/reconcile.job.ts                  # de hora em hora, por janela (D79)
└── use-cases/ match-endpoint · upsert-suggestion · accept-suggestion · reject-suggestion
             list-suggestions · link-endpoint-asset · unlink-endpoint-asset · coverage-stats
```

| Sinal | Ponto | Vale para vincular sozinho? |
|---|---|---|
| `biosSerial` = `asset.serial` | 100 | sim, **se** `discoveryMode = ON` |
| `systemUuid` = `asset.serial` | 100 | idem |
| MAC normalizado | 85 | não — sugestão |
| hostname ≈ `asset.name` ou `assetTag` | 60 | não — sugestão |

**Regra em uma linha:** evidência que casa com **mais de um** candidato não é evidência —
pontua **zero** e vira alerta de colisão, nunca "pega o primeiro".

Rotas no maestro (todas fechadas por sessão, como toda rota nova nasce):

```
GET    /api/reconciliation/suggestions?state=&kind=&endpointId=
POST   /api/reconciliation/suggestions/:id/accept     DESTRUCTIVE_RATE_LIMIT
POST   /api/reconciliation/suggestions/:id/reject
GET    /api/reconciliation/coverage
POST   /api/endpoints/:id/link       { assetId }      DESTRUCTIVE_RATE_LIMIT
DELETE /api/endpoints/:id/link
PATCH  /api/endpoints/:id/review     { reviewState }
```

`ActivityAction` ganha **`LINK`** e **`UNLINK`** (e `MERGE` na Etapa H): a união é fechada
de propósito, e a linha entra com `entityType: 'Asset'` — quem abre o histórico do ativo
quer ver "passou a ser a máquina X", não um log pendurado numa entidade que a tela não abre.

### Etapa D — Fantasma, Shadow IT, cobertura e o carimbo no ativo · **M**

**Regra em uma linha:** *fantasma* é ativo cadastrado sem endpoint vinculado (ou com
`lastSeenByAgentAt` mais velho que `ghostDays`); *Shadow IT* é endpoint sem `assetId` visto
há mais de `shadowHours`, com `reviewState` para triagem.

O carimbo `Asset.lastSeenByAgentAt` é propagado **pelo job**, em uma instrução para a frota
inteira (D95):

```sql
UPDATE "assets" a
   SET "lastSeenByAgentAt" = e."lastSeen"
  FROM "endpoints" e
 WHERE e."assetId" = a.id
   AND (a."lastSeenByAgentAt" IS NULL OR a."lastSeenByAgentAt" < e."lastSeen");
```

O item *"cada handshake é uma auditoria física"* do TODO **não** cria coluna aqui: quando a
F8 existir, ele grava uma linha de `Audit` com `method = AGENTE`, e `Asset.lastAuditAt` é
dela. Duas fases escrevendo a mesma coluna é o começo de duas fontes de verdade.

### Etapa E — O usuário logado sugere **posse ou ocupação** · **M**

É aqui que o modelo de posse muda o comportamento. A observação é sempre a mesma
(`loggedOnUser` num endpoint vinculado a um ativo); **o que ela sugere depende de para quem
o ativo está entregue** — e quem responde isso é o `resolverResponsaveis()` que a F4 já
entregou, não uma consulta nova:

```
observado: usuário U logado no endpoint E, vinculado ao ativo A

  A sem assignment aberta          → sugere CHECKOUT de A para U        (o caso do Snipe-IT)
  A com assignment USER = U        → nada: o cadastro já bate
  A com assignment USER ≠ U        → sugere REATRIBUIÇÃO (ou é um posto — ver D48)
  A com assignment LOCATION L      → U não é dono de A. Sugere OCUPAÇÃO:
                                     LocationOccupant(L, U, turno inferido)      ← o novo
  A com assignment ASSET           → ignora: quem responde é o hospedeiro
```

**Regra em uma linha:** quando o ativo é do **posto**, quem o agente vê logado é um
**ocupante do posto**, não um dono do ativo — e é essa sugestão que o sistema cria.

`DOMINIO\ana.silva` vira `userKey = "ana.silva"` e casa em cascata, agora que a F3 existe:

| Sinal | Ponto |
|---|---|
| `User.username` exato (unicidade parcial garante um só) | 100 |
| parte local do `User.email` exata | 85 |
| **ambíguo em qualquer um dos dois** | **0** (D46) |

Aceitar a sugestão **chama o use-case que já existe** (`occupancy/use-cases/add-location-occupant`,
`assignment/use-cases/checkout-asset`), nunca escreve na tabela: é o zod da borda, o
`ActivityLog` e as invariantes 1, 2 e 4 de graça — e uma segunda escrita direta divergiria
delas no primeiro ajuste.

### Etapa F — Dois usuários na mesma máquina = **posto compartilhado** · **M**

```
janela de 14 dias, a partir de EndpointUserDaily, ignorando AppSetting.ignoredUserKeys:
  ≥ 2 usuários distintos, cada um em ≥ 3 dias  →  máquina compartilhada
     ativo já entregue a uma LOCATION  →  sugere as ocupações que faltam, com turno
     ativo entregue a um USER, ou sem posse  →  sugere PROMOVER: criar/escolher o posto,
                                                mover a posse para LOCATION e abrir as
                                                duas ocupações
```

Turno inferido pelo histograma de horas (`firstSeenAt`/`lastSeenAt` por dia, em hora
**local**): concentração antes das 12h → `"Manhã"`, entre 12h e 18h → `"Tarde"`, depois →
`"Noite"`. `shift` é **texto livre** (D15) e a sugestão escreve um rótulo que uma pessoa
confirma ou troca.

**Regra em uma linha:** o sistema não escolhe um vencedor entre Laura e Ana — ele propõe
o cadastro que explica as duas.

Aceitar um `SHARED_POST` é **uma `$transaction`**: fecha a assignment de `USER` (checkin),
abre a de `LOCATION` (checkout) e cria as ocupações — pelos use-cases da F4, na ordem que a
invariante 1 exige (uma posse aberta por ativo).

### Etapa G — Software normalizado e conformidade · **G**

**Regra em uma linha:** o handshake só re-normaliza a lista quando o `softwareHash` muda —
diferenciar 800 linhas de software a cada mensagem de 500 máquinas é o caminho mais curto
para derrubar o banco.

O hash é **calculado no servidor** sobre a lista normalizada e ordenada (D100). A
normalização roda em **job**, nunca no handler da mensagem: o handshake grava o JSON e o
hash; o job pega quem mudou e escreve `SoftwarePackage`/`SoftwareInstallation`.

A conformidade cruza, com a forma real que a F6 deixou:

```
SoftwareInstallation → Endpoint → Asset
                                    ↕
  LicenseSeatCheckout (assignedAssetId, checkinAt IS NULL) → LicenseSeat → License
                                                                              ↕
                                                                  LicenseSoftware → SoftwarePackage
```

e responde duas perguntas: **instalado sem assento** e **assento pago sem instalação**. É o
pagamento do D39: assento ancorado em ativo tem caminho até a instalação; ancorado num
posto, não teria.

Rotas: `GET /api/assets/:id/software`, `GET /api/licenses/:id/compliance`,
`PUT /api/licenses/:id/software` (a ponte do D102).

### Etapa H — Merge de duplicados e as telas · **M**

**Regra em uma linha:** quando o serial casa com um ativo que **já tem** endpoint
vinculado, isso não é vínculo, é **MERGE** — reimagem ou troca de placa mudou o `hwid`.

A fusão move `Telemetry.endpointId`, `EndpointUserDaily` e `SoftwareInstallation`, preserva
o `createdAt` mais antigo, carimba `mergedIntoId` no perdedor (D103) e grava `MERGE` no
`ActivityLog` com o antes — tudo em uma `$transaction`, com confirmação humana, **nunca**
automática.

**As telas.** `src/pages/descobertas/` em `/descobertas` — e o nome não é `/reconciliacao`
de propósito: a tela leva o nome **do que ela lista** (máquinas descobertas e as sugestões
sobre elas), não o do processo. É a mesma correção que aposentou `/itam` em favor de
`/ativos` na F6. A tela tem a fila, o painel de cobertura, a triagem de Shadow IT e o merge.

No ativo, a aba **Máquina** (`src/pages/ativos/detalhe/components/`) mostra o que o agente
vê: specs, último contato, software instalado e o botão de desvincular.

### Etapa I — Ativo ocioso · **M**

`AssetUsageDaily` agregado por dia a partir da telemetria do endpoint vinculado — pelo mesmo
motivo do D49: sem agregação, a pergunta "quem não usa este notebook há 30 dias" varre
milhões de linhas.

**Regra em uma linha:** cruzado com o `postoVago` que o `resolverResponsaveis()` já devolve,
isto separa **"ninguém usa"** de **"ninguém responde"** — duas conversas diferentes com duas
pessoas diferentes.

---

## Decisões da fase

### D45 — A FK mora no `Endpoint`, e as tabelas não se fundem

**Decidido:** `Endpoint.assetId String? @unique`, `onDelete: SetNull`.
**Descartado:** fundir as duas tabelas; e pôr a FK no `Asset`.

**Por quê não fundir:** a maioria dos ativos nunca terá agente (monitor, cadeira, cabo,
switch) e parte dos endpoints nunca terá cadastro (a máquina do estagiário que ninguém
registrou). Uma tabela só obrigaria metade das linhas a carregar colunas de RMM nulas e a
outra metade a carregar colunas de patrimônio nulas — e, pior, faria o agente **criar
patrimônio** só por existir.

**Por quê no `Endpoint`:** é o lado que a reconciliação escreve, e é o lado menor. No
`Asset` a coluna ficaria nula na maioria esmagadora das linhas. O `@unique` já garante o
1:1, e `SetNull` garante que apagar um ativo não leve junto a telemetria da máquina.

### D46 — Evidência ambígua é evidência **zero**

**Decidido:** qualquer sinal que case com mais de um candidato pontua zero e vira alerta.
Além disso, listas de lixo conhecidas **antes** da comparação.

**Por quê:** os identificadores de hardware mentem de formas específicas e repetidas.
**Serial de fábrica em branco** — `To Be Filled By O.E.M.`, `System Serial Number`,
`Default string`, `None`, `0123456789` — é compartilhado literalmente por dezenas de
máquinas, e casar por ele vincularia a frota inteira ao mesmo ativo. **UUID de template de
VM** se repete em toda máquina clonada daquele template, e
`00000000-0000-0000-0000-000000000000` aparece em hardware barato. **MAC de dock** é o
caso mais traiçoeiro: a dock passa o MAC *dela* ao notebook encaixado, e três notebooks que
revezam a mesma dock parecem a mesma máquina — é por isso que MAC vale 85 e não 100, e que
MAC repetido vale 0. **Hostname** é renomeável e volta atrás.

Pegar o primeiro candidato numa colisão é pior do que não vincular: cria vínculo errado
que ninguém revisa, porque o sistema disse que estava certo.

> **O que a árvore acrescentou:** a mesma regra vale para o casamento de pessoa da Etapa E,
> que hoje tem **dois** sinais e não um, porque a F3 entregou `User.username`.

### D47 — O usuário logado sugere **ocupação** quando a posse é do posto

**Decidido:** a árvore da Etapa E. Quando a `Assignment` aberta do ativo tem alvo
`LOCATION`, a sugestão gerada é `LocationOccupant`, não checkout.

**Descartado:** sugerir sempre checkout do ativo para o usuário logado — que é o que o
item do TODO dizia antes do modelo de posse existir, e o que qualquer ITAM faria.

**Por quê:** porque a sugestão errada aqui **desfaz cadastro certo**. Se o desktop da Mesa 1
está corretamente entregue ao posto e o sistema sugere "atribuir para a Ana", aceitar essa
sugestão fecha a assignment do posto e transforma um ativo compartilhado em ativo pessoal
— perdendo a Laura, o turno dela e a responsabilidade solidária. O operador clica em
"aceitar" achando que está corrigindo o inventário e está degradando o modelo. A sugestão
tem que **respeitar a camada em que a posse já está**.

E na direção certa ela é útil de um jeito que não tinha como existir antes: ninguém cadastra
ocupação de posto com prazer. A observação do agente é exatamente a fonte de dado que
falta para a Camada 2 sair do papel.

### D48 — Dois usuários na mesma máquina é **evidência de posto compartilhado**

**Decidido:** duas ou mais pessoas com presença recorrente no mesmo endpoint geram uma
sugestão de **posto compartilhado** — criar/escolher a `Location`, mover a posse para ela
e abrir as ocupações com turno inferido.

**Descartado:** tratar como conflito e escolher a pessoa mais frequente (ou a mais
recente), que é o comportamento padrão de quem só tem `Asset ⟷ User`.

**Por que nenhum ITAM de prateleira faz isso:** não é falta de dado — o dado é o mesmo, o
usuário logado está no WMI de qualquer coleta. É falta de **onde guardar**. Num modelo com
uma única aresta ativo→pessoa, "duas pessoas" é uma contradição: o software precisa
escolher um vencedor, e escolher errado toda semana faz o vínculo oscilar. O jeito de não
oscilar é descartar a observação — e é por isso que ela é tratada como ruído.

Com as três camadas, a mesma observação é **consistente**: o ativo é do posto (uma
assignment), as pessoas são ocupantes (duas linhas), e o turno é um rótulo no vínculo
pessoa↔posto. Não há contradição para resolver, então não há nada para descartar. **O
modelo de posse não é enfeite de modelagem: é o que transforma uma observação descartada
em cadastro.** É a capacidade mais difícil de copiar desta fase, porque copiá-la exige
copiar o modelo inteiro.

**O limite, declarado:** é sugestão. Duas pessoas numa máquina também podem ser um técnico
de TI logando para dar suporte, ou uma conta de serviço — e é por isso que o D101 traz a
allowlist para dentro da fase. A sugestão entra na fila com a evidência visível (quais dias,
quais horas, quantas amostras) e alguém confirma. O auto-provisionamento **nunca** cria
ocupação sozinho, em nenhum modo.

### D49 — Observação de usuário é agregada por dia, com retenção

**Decidido:** `EndpointUserDaily` — uma linha por (endpoint, usuário, dia), com primeira e
última hora vistas e contagem de amostras. Expurgo aos 90 dias.
**Descartado:** uma linha por handshake (log de sessão).

**Por quê:** volume e privacidade, nessa ordem de esforço e na ordem inversa de importância.
Uma linha por mensagem faria a consulta varrer milhões de linhas para responder "quem usa
essa máquina". E, sendo dado de pessoa, o formato certo é o menor que responde à pergunta:
**em que dias e em que faixa de hora**, não um rastro minuto a minuto. O propósito é
declarado (identificar posto e ocupante), a retenção é curta, e o que sai dali é sugestão
para um humano — não vigilância de produtividade, que este sistema não se propõe a fazer.

### D50 — `lastSeenByAgentAt` existe e **nunca** se chama `lastSeen`

**Decidido:** a coluna do último contato no `Asset` chama `lastSeenByAgentAt` (D13). A
consulta de *fantasma* usa essa coluna; o `Endpoint.lastSeen` continua sendo o batimento do
RMM e não é copiado a cada mensagem.

**Por quê o nome:** é a regra permanente do D13 e a rede de segurança é o compilador. Se o
`Asset` tivesse uma coluna `lastSeen`, o `markStaleEndpointsOffline` apontando para o model
errado **compilaria** — e marcaria a frota inteira como OFFLINE em silêncio. Com o nome
diferente, o mesmo erro é 11 erros de compilação (provado na F1).

**Por quê uma coluna, e não só derivar pelo `Endpoint`:** porque reimagem cria endpoint
novo (`hwid` muda) e o histórico de "um agente já viu este ativo" não pode zerar junto.

> ⚠️ **O mecanismo desta decisão está corrigido pelo D95.** Ela dizia "escrita no handshake,
> no máximo uma vez por dia"; a árvore mostra que `touchEndpoint` é um `UPDATE` por
> mensagem por máquina, e que o teto diário ainda custa um `UPDATE` condicional em `assets`
> nesse mesmo caminho. **O nome e o teto continuam valendo; quem escreve mudou.**

### D51 — Auto-provisionamento nasce em `SUGGEST`

**Decidido:** `discoveryMode` com `OFF | SUGGEST | ON`, default **SUGGEST**.

**Por quê:** em `ON`, a primeira VM de teste que alguém subir vira patrimônio — e **consome
uma etiqueta do contador**, que o `nextAssetTag()` nunca devolve (F1, e o `MAX_PULOS` do
`app-settings.usecase.ts` prova que a sequência já é assunto delicado). O estrago não é a
linha a mais: é a sequência de etiquetas furada para sempre.

---

### D95 — Quem carimba o ativo é o **job**, não o handshake

**Decidido:** `Asset.lastSeenByAgentAt` é propagado pelo `reconcile.job.ts`, num único
`UPDATE … FROM` que cobre a frota inteira (Etapa D). O `touchEndpoint` continua tocando
**só** `endpoints`.
**Descartado:** escrever em `assets` dentro do `touchEndpoint`, com teto diário (o
mecanismo que o D50 previa).

**Por quê:** `touchEndpoint` é o caminho mais quente do sistema — roda a cada Handshake,
Telemetry e Ping de **cada** máquina. O teto diário não evita o custo, só evita a escrita:
a instrução condicional é executada em toda mensagem de qualquer jeito, e são máquinas ×
mensagens por dia de `UPDATE` que quase sempre não casa. Pior, ela acopla a tabela de
patrimônio ao caminho de ingestão: um lock em `assets` (um `bulk-update` rodando) passa a
poder atrasar o batimento do RMM, e o `zombie-cleaner` marcaria máquinas vivas como OFFLINE.

**A precisão perdida é de uma hora, e a pergunta tolera dias.** Fantasma é "não é visto há
`ghostDays` (padrão 30)". Uma coluna com até uma hora de atraso responde isso exatamente
igual — e é por isso que a propagação por job não é um atalho, é o desenho certo.

### D96 — **Uma** tabela de sugestão, com discriminante

**Decidido:** `ReconciliationSuggestion` com `kind SuggestionKind` e FKs de alvo nuláveis
(`assetId`, `targetUserId`, `targetLocationId`, `mergeIntoEndpointId`), no padrão que a
`Assignment` já usa.
**Descartado:** uma tabela por tipo de sugestão (vínculo, checkout, ocupação, posto,
merge).

**Por quê:** o que essas cinco coisas têm em comum é **tudo o que dá trabalho** — nascer
de um job idempotente, não duplicar, guardar evidência, ser aceita ou recusada por uma
pessoa, lembrar da recusa, expirar quando a evidência muda, aparecer numa fila só. Cinco
tabelas seriam cinco cópias disso, e invariante copiada é invariante que um dia diverge (é
o mesmo argumento que uniu os três tipos de estoque, D35, e as duas naturezas de `ApiToken`,
D80). O que varia — qual FK está preenchida — é justamente a parte barata.

**O preço, declarado:** a coerência entre `kind` e qual FK está preenchida não é
expressável no schema do Prisma e é validada no use-case, exatamente como o `assertAlvoCoerente`
da `Assignment`. Se a fila crescer para além de uma tela, vira CHECK na migration.

### D97 — A recusa tem memória, e a memória tem chave

**Decidido:** a sugestão guarda `evidenceHash` (sha256 da evidência normalizada). O job não
reoferece um par cujo `REJECTED` mais recente tenha o **mesmo** hash; com hash diferente,
reoferece. Aceita ou recusada, a linha fica.
**Descartado:** recusa como booleano permanente por par; e recusa sem memória nenhuma.

**Por quê:** sem memória, o job de hora em hora reoferece o mesmo par para sempre e a fila
vira ruído — quem a usa aprende a ignorá-la, que é o pior estado possível de uma fila de
revisão. Com memória burra (par enterrado para sempre), a recusa certa de hoje esconde a
sugestão certa de amanhã: recusar "este endpoint é o ATV-00012" porque o serial estava em
branco é correto; quando a máquina passar a mandar o serial de verdade, **é outra
afirmação**, e enterrá-la junto seria perder exatamente o caso que o rollout do agente vai
criar às centenas.

O hash é a diferença entre "já me disseram não sobre **isto**" e "já me disseram não sobre
este par, faça o que fizer".

### D98 — `AgentStatus` tem **dois** valores; "nunca visto" é pergunta do ativo

**Decidido:** `enum AgentStatus { ONLINE OFFLINE }`. A pergunta *"cadastrado e nunca visto
pelo agente"* é respondida pelo `Asset` (sem endpoint vinculado, ou `lastSeenByAgentAt IS
NULL`), no painel de cobertura.
**Descartado:** `NEVER_SEEN` no enum, como o item do TODO pedia.

**Por quê:** uma linha de `endpoints` **só existe porque um handshake chegou**. Um valor que
nenhuma linha jamais pode ter não é um estado: é uma coluna mentindo sobre o que a tabela
significa — e alguém, um dia, escreveria a consulta `WHERE status = 'NEVER_SEEN'` para
procurar fantasmas na tabela onde eles, por construção, não estão. A resposta viria vazia e
pareceria boa notícia.

O enum descreve o **agente**; fantasma é fato do **patrimônio**. São eixos diferentes, e
misturá-los é a mesma confusão que o próprio item do TODO existe para desfazer.

### D99 — O teste do agente entra por **WebSocket de verdade**

**Decidido:** os testes desta fase abrem `app.listen({ port: 0 })` e falam com `/agent-hub`
por um cliente `ws` real, num helper `tests/helpers/agente.ts`. `ws` entra como
`devDependency` explícita.
**Descartado:** chamar `handleAgentMessage()` direto; e simular o handshake com
`prisma.endpoint.create`.

**Por quê:** hoje **nenhum teste atravessa o hub** — `invariantes/api-token.test.ts` usa
`inject` e para no 401 do `preHandler`, porque `inject` não faz upgrade de WebSocket. E é
justamente a borda do agente que esta fase inteira mexe: `parse-agent-message` →
`normalize-payload` → `registerHandshake`. Chamar o use-case direto pularia o parser, os
sinônimos PascalCase/camelCase e o `readOptionalBigInt` — ou seja, pularia exatamente onde
o agente velho e o novo se distinguem, que é o risco número um do rollout. É o mesmo
princípio que fez o [`TESTES.md`](./TESTES.md) exigir cenário pela API e não por
`prisma.create`: o teste tem que exercitar o que roda em produção.

Depender de `ws` transitivamente (por `@fastify/websocket`) funcionaria e é o tipo de
dependência que some num `npm update` sem aviso.

### D100 — A chave do pacote é derivada, e o hash do software é do **servidor**

**Decidido:** `SoftwarePackage.normalizedKey` (minúsculo, `nome|versão|fabricante ?? ''`)
com `@unique`, e `Endpoint.softwareHash` calculado no servidor sobre a lista normalizada e
ordenada.
**Descartado:** `@@unique([name, version, publisher])`; e confiar num hash mandado pelo
agente.

**Por quê a chave derivada:** em Postgres, `NULL` **não é igual a `NULL`** dentro de um
índice único. `UNIQUE(name, version, publisher)` deduplica "Chrome 120 / Google" e **não**
deduplica "Chrome 120 / (sem fabricante)" — e software sem fabricante declarado é comum.
O catálogo ganharia uma linha nova por máquina, por handshake, e a conformidade contaria
instalações que são a mesma.

**Por quê o hash no servidor:** agente velho não manda hash nenhum, e o que ele manda é o
que ele acha da própria lista — se ele errar (cache, coleta parcial), a normalização **nunca
mais** roda para aquela máquina e o inventário de software congela em silêncio. Calcular
sobre a lista recebida custa um sha256 de string por handshake e é a única forma de o hash
descrever **o que chegou**.

### D101 — A allowlist de usuários ignorados nasce **nesta** fase

**Decidido:** `AppSetting.ignoredUserKeys String[]`, aplicada antes da detecção de posto
compartilhado e da sugestão de posse.
**Descartado:** deixar para depois, como o plano anterior previa.

**Por quê:** o técnico de TI loga em todas as máquinas que atende, e a conta de serviço
aparece em todas as que rodam o serviço. Sem o filtro, a Etapa F entrega **no primeiro dia**
uma fila com dezenas de "posto compartilhado" falsos misturados aos verdadeiros — e uma
fila cujo primeiro contato é ruído não é revisada uma segunda vez. O custo é uma coluna e
um `NOT IN`; o custo de adiar é a única entrega desta fase que o concorrente não copia
nascer desacreditada.

Ela nasce **vazia**: preencher com palpites (`admin`, `administrator`) esconderia um
administrador que é uma pessoa de verdade usando a máquina dela.

### D102 — Licença ↔ pacote é vínculo **explícito**, nunca casamento por nome

**Decidido:** tabela `LicenseSoftware (licenseId, packageId)`, preenchida por uma pessoa
escolhendo entre os pacotes que a descoberta já normalizou.
**Descartado:** casar `License.name` com `SoftwarePackage.name` por semelhança.

**Por quê:** o nome comercial e o nome instalado quase nunca coincidem — "Office 365 E3" no
contrato é "Microsoft 365 Apps for enterprise" no Programas e Recursos, e "Adobe Acrobat
Pro" convive com "Adobe Acrobat (64-bit)" e com o Reader, que é grátis. Casamento
aproximado erra nos dois sentidos, e os dois erros são caros: um falso **"instalado sem
licença"** manda comprar assento que já existe; um falso **"coberto"** entrega auditoria de
fornecedor com resposta errada — que é exatamente a pergunta que o módulo de licença existe
para responder valendo dinheiro (F6).

Um vínculo explícito é trabalho humano uma vez por licença, e é o único que alguém pode
**conferir**. É a mesma régua do D46, um andar acima: evidência que não distingue não é
evidência.

### D103 — Merge não apaga: o endpoint perdedor ganha `mergedIntoId`

**Decidido:** a fusão move telemetria, presença e instalações, e **mantém a linha** do
endpoint antigo com `mergedIntoId` preenchido, fora das listagens.
**Descartado:** `DELETE` no endpoint antigo depois de mover o que interessa.

**Por quê:** merge é destrutivo e não tem desfazer. Com a linha viva, o `hwid` antigo
continua existindo — e isso importa por dois motivos concretos: o agente antigo pode
**voltar** (a reimagem não pegou, a placa foi devolvida) e recriaria um endpoint órfão sem
saber que já foi fundido; e o `ApiToken` daquela instalação aponta para `endpointId` (D80),
que com `DELETE` viraria FK pendurada. A linha preservada é também a única testemunha de
que a fusão aconteceu, ao lado do `ActivityLog`.

### D104 — MAC é sinal de **MERGE**, não de vínculo

**Decidido:** duas cascatas. `endpoint × ativo` pontua `SERIAL` (100), `UUID` (100) e
`HOSTNAME` (60); `endpoint × endpoint` pontua `SERIAL`, `UUID` e **`MAC` (85)**.
**Descartado:** a cascata única de quatro sinais que este plano desenhou.

**Por quê:** escrevendo o helper, o sinal de MAC não tinha contra o que comparar — **o
`Asset` não tem coluna de endereço MAC**. Ele tem `assetTag`, `serial` e `name`, todos
digitados por gente. Não existe MAC do lado cadastrado, e não vai existir: ninguém vai
digitar o MAC de 500 máquinas num formulário.

O que o MAC de fato responde é outra pergunta — *estas duas MÁQUINAS são a mesma?* —, e
essa pergunta é a do merge: reimagem ou troca de placa muda o `hwid` e cria linha nova.
Deixá-lo na cascata errada não seria só inútil: seria pontuar 85 num sinal que **nunca
casa**, e a partir daí a pontuação descreveria uma coisa que não acontece.

O `HOSTNAME`, pelo caminho inverso, **saiu** da cascata de merge: máquina reimaginada quase
sempre mantém o nome, e fundir duas linhas por 60 pontos de um campo renomeável é
destrutivo demais para o que o sinal garante. Merge não tem desfazer (D103), então o piso
dele é mais alto que o do vínculo.

### D105 — Dois hashes de software: o que **chegou** e o que foi **normalizado**

**Decidido:** `Endpoint.softwareHash` (a lista que o agente mandou) e
`Endpoint.softwareNormalizedHash` (a lista que as tabelas refletem). O job processa quem
tem os dois diferentes.
**Descartado:** uma coluna só, como o D100 previa.

**Por quê:** com uma coluna, a pergunta "quem mudou?" não tem resposta barata — o job
teria que **ler e re-hashear o JSON de software de 500 máquinas a cada hora** só para
descobrir que 498 não mudaram. O hash existe exatamente para esse trabalho não acontecer, e
uma coluna só o devolvia pela porta dos fundos.

Com duas, a varredura é `WHERE "softwareNormalizedHash" IS NULL OR <> "softwareHash"` —
comparação de duas colunas, e numa frota estável ela devolve zero linhas. O D100 continua
valendo inteiro no que ele decidiu: o hash é calculado **no servidor**, nunca aceito do
agente.

### D106 — O que o agente velho não sabe, ele **não desfaz**

**Decidido:** todo campo de identidade é gravado com `?? undefined`, nunca `?? null`.
**Descartado:** `?? null`, que é o que "campo opcional" sugere em quase toda outra situação.

**Por quê:** em Prisma, `undefined` significa **não escreva esta coluna** e `null` significa
**apague o que está nela**. A diferença é a fase inteira durante o rollout do agente C#:
uma máquina que já mandou o serial e reconecta com a versão antiga do agente — rollback,
reinstalação, imagem desatualizada — **apagaria o próprio serial**, e com ele o vínculo que
a reconciliação já tinha resolvido. O operador veria a máquina voltar para a fila de
descobertas sem nada ter acontecido no mundo real.

"Opcional no parser" (que o plano dizia) protege contra o agente velho **quebrar**; isto
protege contra ele **destruir**. São coisas diferentes e as duas eram necessárias.

### D107 — O aceite **age e depois fecha**, e a ordem erra para o lado certo

**Decidido:** `aceitarSugestao` executa a ação (que abre a própria transação) e só então
marca a sugestão como `ACCEPTED`, em duas operações separadas.
**Descartado:** as duas na mesma transação.

**Por quê o descarte é forçado:** as ações chamam use-cases da F4 e da F6 que **já abrem
transação** — o checkout tem seis passos e uma trava de linha —, e transação aninhada não é
suportada. Reimplementar o checkout aqui dentro para caber numa transação só seria a
segunda cópia da posse, que é o que o `accept-suggestion` inteiro existe para evitar.

**Por quê a ordem escolhida:** entre as duas falhas possíveis, elas não são simétricas.
Com *agir → fechar*, um processo que morra no meio deixa a sugestão `PENDING` sobre um
cadastro que já mudou — alguém a vê de novo numa fila que reflete o mundo novo, e a
descarta. Com *fechar → agir*, sobra uma sugestão marcada como **aceita que nunca
aconteceu**: o sistema afirma ter feito algo que não fez, e ninguém tem como descobrir.

### D108 — A fusão preserva o `lastSeen` mais recente, não o `createdAt` mais antigo

**Decidido:** o vencedor fica com o **maior** `lastSeen` dos dois, e as colisões de
`endpoint_user_daily` e `software_installations` são **consolidadas** (somando amostras,
esticando as datas), não movidas.
**Descartado:** "preservar o `createdAt` mais antigo", que era a promessa deste plano.

**Por quê:** **`Endpoint` não tem `createdAt`.** A tabela nasceu na F0 como registro de
presença, e o que ela guarda é `lastSeen`. A promessa do plano descrevia um campo que não
existe — e escrever a fusão foi o que revelou isso.

**A consolidação, que o plano não previa:** `endpoint_user_daily` é única por (máquina,
conta, dia) e `software_installations` por (máquina, pacote). As duas linhas podem ter
registros do MESMO dia e do MESMO pacote — é o caso **normal**, aliás, porque a reimagem
acontece no meio de um dia de trabalho. Mover cegamente violaria o índice e derrubaria a
fusão inteira na metade. E consolidar não é só evitar o erro: `firstSeenAt` de um software
é fato da MÁQUINA, não da linha — se o Office estava instalado antes da reimagem,
"instalado desde" é a data antiga.


### D109 — O hash é da **afirmação**, não da evidência

**Decidido:** `ReconciliationSuggestion.evidenceHash` guarda o sha256 de uma
**afirmação** — o subconjunto que identifica o que a sugestão diz —, e não da
evidência inteira. `proporSugestao` recebe os dois campos separados, e a
`afirmacao` é obrigatória.
**Descartado:** hashear o objeto de evidência, que era o que esta fase fazia.

**Por quê:** a evidência de posse carrega o que **sustenta** a afirmação — em
quantos dias a pessoa apareceu, quantas amostras, em que horas, qual foi o último
dia. Esses números **crescem sozinhos**. Com o hash sobre eles, um único dia a
mais de presença produzia hash novo, e a sugestão que alguém já tinha **recusado
voltava para a fila** como se fosse outra afirmação. Não era: era a mesma frase
("a Laura usa esta máquina") com o contador incrementado.

O efeito é que o D97 valia só para `LINK` e `MERGE`, cujas evidências são
estáveis — e é justamente para as três de posse que a fila é usada todo dia. A
regra para montar uma afirmação cabe numa linha: **se o valor muda sozinho com o
tempo, ele não entra.** Quem é a pessoa, qual é o ativo, qual foi o sinal e qual
o valor que casou entram; contador, histograma e data não. O turno também fica
fora — é palpite que uma pessoa corrige (D15), não parte da frase.

**E a evidência visível continua crescendo:** quando a afirmação já está na fila,
o `evidence` é atualizado e o hash não. Congelar a evidência para proteger o hash
resolveria a memória mentindo na tela, que é trocar um defeito por outro.

**A consulta da memória também mudou:** ela procura pelo **hash**, e não pela
linha mais recente do par. Com "a mais recente", uma recusa ficava **escondida**
atrás de qualquer linha posterior — um `SUPERSEDED` de ontem mascarava o
`REJECTED` de anteontem, e a sugestão recusada voltava por esse caminho também.
Memória se consulta pela chave que a define.

### D110 — A fila tem **três** portas de saída, e a terceira é o mundo

**Decidido:** `encerrarSugestoesObsoletas()` roda no começo de cada rodada do job
e marca `SUPERSEDED` toda sugestão pendente que deixou de descrever o mundo. O
`desvincular` faz o mesmo para a máquina dele, na própria transação. E o aceite
recusa com 409 o que a varredura ainda não alcançou.
**Descartado:** confiar que a sugestão só sai da fila por aceite ou recusa.

**Por quê:** uma sugestão sai da fila quando alguém a aceita, quando alguém a
recusa — e quando **o mundo muda e ela deixa de descrever qualquer coisa**. A
terceira é a mais comum das três (alguém entrega o ativo à mão, alguém desfaz um
vínculo, a posse passa para um posto) e era a que não existia: `proporSugestao`
só substituía quando chegava uma proposta **nova** para o mesmo alvo, e
`sugerirPosseOuOcupacao` desistia com `return 0` deixando a sugestão velha viva.

**E o estrago não era fila suja.** O aceite de `CHECKOUT` é checkin + checkout,
então aceitar "entregar à Ana" um ativo **já entregue à Ana** gravava no histórico
de posse uma **devolução que nunca aconteceu**. Num sistema cujo núcleo é o razão
de posse, isso é pior que um inventário errado: é uma afirmação falsa sobre o
passado, e ninguém tem como descobrir que ela é falsa. A mesma guarda existe nos
dois lugares de propósito — o job cobre o caso normal, o aceite cobre a janela de
até uma hora entre o mundo mudar e a varredura seguinte.

**`SUPERSEDED` e nunca `REJECTED`:** ninguém disse não. Recusa é ato de gente e
tem memória (D97); isto é o mundo tendo andado, e enterrar por isso uma afirmação
que amanhã pode valer de novo seria inventar uma recusa que não houve.

> **O expurgo que veio com ela:** `SUPERSEDED` com mais de 180 dias é apagado, e
> só ele. `REJECTED` é a memória do D97 e apagá-lo reoferece o que uma pessoa já
> recusou; `ACCEPTED` é a trilha de quem mandou o sistema mudar o cadastro. O que
> sobra — a linha substituída porque o mundo andou — não responde pergunta
> nenhuma depois de meio ano. Constante e não coluna de `AppSetting`: a retenção
> que **é** de pessoa (D49) continua configurável porque aquela é sobre gente.

### D111 — A janela da agregação corta na **meia-noite**, não em "há N×24 horas"

**Decidido:** `agregarUsoDosAtivos` calcula `desde` como a meia-noite UTC do dia
mais antigo da janela.
**Descartado:** `Date.now() - dias × 24h`, que era o que estava escrito.

**Por quê:** o corte por horas cai **no meio** do dia mais antigo. O
`GROUP BY … ::date` então recalculava aquele dia usando só a telemetria posterior
ao corte, e o `ON CONFLICT DO UPDATE` sobrescrevia o total certo por um parcial.
Rodando de hora em hora o dia **encolhia a cada rodada** até sair da janela e
congelar truncado: um dia de trabalho inteiro virava a última hora dele, para
sempre, e nenhum erro aparecia em lugar nenhum.

A palavra que a agregação promete é **idempotente**, e idempotente quer dizer que
a segunda passada escreve o **mesmo** valor. Alinhado à meia-noite, todo dia que
entra na janela entra completo — e é o mesmo eixo do
`(t."timestamp" AT TIME ZONE 'UTC')::date` do agrupamento, o que torna a
propriedade legível no próprio SQL em vez de depender de quando o job acordou.

### D112 — `discoveryMode = OFF` desliga a descoberta

**Decidido:** em `OFF`, `reconciliarEndpoint` desiste antes da cascata: não nasce
`LINK` nem `MERGE`, e não há vínculo automático. Posse e posto compartilhado
continuam, porque falam de máquina que **já tem** cadastro.
**Descartado:** ler só o `ON`, que era o comportamento real — `OFF` se comportava
exatamente como `SUGGEST`.

**Por quê:** um enum de três valores em que um não é lido por ninguém é pior que
uma configuração que falta. A que falta é pedida; esta é **procurada,
encontrada, ajustada — e o problema continua**, com a pessoa achando que
desligou. Quem põe `OFF` está dizendo "pare de me propor coisas sobre máquina que
eu não cadastrei", e é exatamente isso que a chave passa a fazer.

**O limite é o que o enum diz que ele governa:** *o que o sistema faz quando
descobre máquina sem cadastro*. Estender `OFF` para calar também a sugestão de
ocupação seria desligar a entrega mais valiosa da fase (D48) por uma chave cujo
nome não anuncia isso — e ela responde outra pergunta, sobre máquina que o
cadastro já conhece.

### D113 — O turno é a **moda** dos turnos, não a média das horas

**Decidido:** `turnoPelaHora` classifica cada hora observada num dos três turnos
(madrugada conta como **Noite**) e devolve o que mais aparece; empate devolve `null`.
**Descartado:** a média aritmética das horas com corte em 12 e 18, que era o que estava
escrito.

**Por quê:** hora é grandeza **circular**, e a média de grandeza circular não significa
nada. Quem trabalha 22h–2h aparece nas horas `[22, 23, 0, 1]` — média 11,5, e `11,5 < 12`
rotulava o plantão da noite como **"Manhã"**. Não era caso de borda: era o turno da noite,
todas as noites. E o erro tinha a pior forma possível — o sistema apresentava um rótulo
calculado, que ninguém contesta.

O corte de `hora < 12` também jogava a madrugada inteira (0h–5h) para "Manhã", então metade
das horas de um turno noturno contava para o turno oposto. Classificar primeiro e contar
depois é o que faz a meia-noite deixar de ser um precipício no meio da conta.

**Empate devolve `null`, e isso é o D46 aplicado ao turno:** a escala 12x36 produz horas em
dois turnos com a mesma frequência (`[7, 19]`), e a média dizia "Tarde" — errado para os
dois lados. Sem rótulo, a ocupação nasce sem turno e quem cadastra escreve o que é, que é
exatamente por que a coluna é texto livre (D15). O plano já declarava 12x36 fora de escopo;
o que ele não podia aceitar é uma resposta errada em vez de nenhuma.

### D114 — O seletor de posto oferece **posto**, e a spec de localizações já dizia onde

**Decidido:** o `SHARED_POST` monta o seletor com `GET /api/workstations`.
**Descartado:** `GET /api/locations/options`, que era o que estava ligado — com um comentário
ao lado afirmando "só os postos de trabalho".

**Por quê:** `/options` devolve **todas** as localizações, de propósito e documentado em
`catalog/specs/location.spec.ts` ("o pai de uma mesa é uma sala, e uma sala não é posto").
O seletor oferecia a filial e o andar ao lado da Mesa 1 — e o comentário do código afirmava
o contrário, que é a forma de defeito mais caro de achar: quem lê acredita.

**E o estrago passava até o fim.** Nem o aceite nem o `checkoutAsset` checam `isWorkstation`,
então escolher "Matriz — São Paulo" criava uma posse de **posto** apontando para uma
localização que não é posto. A `Assignment` fica válida, `/postos` nunca mostra aquele ativo,
e o `postoVago` — o sinal de "ninguém responde por este equipamento" — não tem como falar
dele. A entrega mais valiosa da fase produzindo cadastro que a fase seguinte não enxerga.

A própria spec aponta o caminho certo, e a correção é usá-lo em vez de abrir `optionFilter`
para booleano (que o `z.enum` de valores de texto não expressa, e que a spec já tinha
recusado com motivo).

### D115 — A rota da aba chama `/machine`, e devolve o que a aba mostra

**Decidido:** `GET /api/assets/:id/machine` devolve especificações, os **dois** carimbos de
último contato, as mudanças de hardware detectadas e a lista de software.
**Descartado:** `GET /api/assets/:id/software` devolvendo só a lista de programas, que era o
que o plano escreveu.

**Por quê:** a aba Máquina prometia "specs, último contato, software e desvincular" e
entregava dois dos quatro. Pior: o cabeçalho do componente gastava oito linhas explicando
**por que** as specs aparecem ali (o D16 — o dado do lado que descobre não vira coluna do
ativo) e elas não apareciam em lugar nenhum. Documentação de uma decisão que o código não
executa é pior que ausência das duas.

Com quatro conteúdos na resposta, `software` nomeava um quarto dela. É a mesma regra que
aposentou `/itam` em favor de `/ativos` e que fez a tela se chamar `/descobertas`: **o nome
é do que a coisa é, não do que ela era quando nasceu.** O use-case saiu de
`license-compliance.usecase.ts` junto — vizinhança de tabela (`SoftwareInstallation`) não é
vizinhança de assunto.

**As duas datas vão lado a lado, com a diferença escrita na tela.** `Endpoint.lastSeen` é o
batimento; `Asset.lastSeenByAgentAt` é o carimbo que o **job** propaga (D95), e ele fica até
uma hora atrás. Sem a frase que explica isso, quem vê a segunda data atrasada conclui que o
batimento falhou.

### D116 — A `AssetChange` ganha escritor, e ele mora no handshake

**Decidido:** o `registerHandshake` devolve a fotografia das specs que ele estava por
sobrescrever, e o roteador do agente compara e grava — ao lado de onde já grava a observação
de usuário.
**Descartado:** deixar a tabela esperando "quando a comparação de specs entrar".

**Por quê:** a tabela nasceu na Etapa B com FK, índice e nenhuma linha. **Tabela sem escritor
não é meio caminho andado** — é uma promessa no schema que a tela não cumpre, e é o mesmo
defeito que o `installedSoftware` tinha antes da Etapa G (três ocorrências no código, todas
de escrita). O item estava marcado `[x]` no TODO por causa da tabela existir.

**Tem que ser no handshake**, porque é o único instante em que o ANTES e o DEPOIS existem ao
mesmo tempo: depois do `upsert`, o valor velho não está em lugar nenhum. A alternativa seria
guardar uma segunda cópia das specs para comparar contra — segunda fonte de verdade para o
mesmo dado, que é o que o D16 recusa. O preço é **uma** leitura por `hwid` (coluna `@unique`,
busca por índice) num caminho que roda quando o agente sobe, não a cada amostra.

**E isto não contraria o D95.** O D95 tirou do caminho de ingestão a escrita em `assets` — a
tabela de patrimônio, que a tela tranca em `bulk-update` e cujo lock atrasaria o batimento do
RMM. `asset_changes` é tabela de **log**: append-only, sem ninguém trancando, sem ninguém
editando. São dois custos diferentes com o mesmo nome. E numa frota estável a comparação
devolve zero e não há `INSERT` nenhum.

**Três coisas não são mudança:** `null` → valor é a **primeira coleta** (o rollout do agente
C# produziria isso às centenas no mesmo dia, transformando o histórico de cada ativo num
relatório de deploy); valor → `null` é o D106 do lado da detecção ("não sei" não é "sumiu");
e diferença só de espaço ou caixa vazia não é diferença. Sem ativo vinculado não nasce linha —
`AssetChange.assetId` é obrigatório porque a pergunta é do patrimônio, e máquina órfã não tem
patrimônio para contestar.

### D117 — A conformidade ganha **porta de entrada**: o catálogo de pacotes

**Decidido:** nasce `GET /api/software-packages` (com busca, ordenado por número de
instalações) e `GET /api/licenses/:id/software`, e a tela da licença ganha o formulário da
ponte mais o relatório.
**Descartado:** considerar a Etapa G entregue porque as rotas de escrita e de relatório
existiam.

**Por quê:** a Etapa G entregou `PUT /api/licenses/:id/software` e
`GET /api/licenses/:id/compliance`, e faltava a pergunta do meio — *quais pacotes existem
para eu ligar?* Sem ela, nenhuma tela tinha de onde tirar um `packageId`: `LicenseSoftware`
não recebia linha por caminho de produto nenhum, e `calcularConformidade` respondia
`semVinculoDeSoftware: true` **para sempre**. Motor completo, resposta vazia.

É o **defeito 1** do [`TESTES.md`](./TESTES.md) na forma mais pura: funcionalidade verificada
pelo caminho da API e inalcançável pelo caminho do formulário. O teste da fase provava a
ponte pegando o `packageId` direto do Prisma — coisa que nenhuma tela pode fazer —, e foi
justamente esse atalho que escondeu a lacuna. Os testes novos entram pela rota.

**Ordena por instalação e não por nome**, porque a pergunta de quem abre a lista é "que
licença eu amarro primeiro". O catálogo de uma frota real tem milhares de linhas (cada
runtime, cada driver, cada atualização), e em ordem alfabética as primeiras cem são todas
`7-Zip` e `Adobe AIR`.

### D118 — A configuração da descoberta ganha tela, e a allowlist com ela

**Decidido:** o painel de `/descobertas` ganha os cinco controles — modo, `ghostDays`,
`shadowHours`, `userDailyRetentionDays` e `ignoredUserKeys`.
**Descartado:** deixá-los só na rota, como estavam.

**Por quê:** as cinco colunas existiam no `AppSetting`, a rota existia com zod e tetos, o
hook do front existia — e a página **nunca desenhou nada disso**: ela não desestruturava nem
`configuracao` nem `handleSalvarModo`. Configuração sem tela é o mesmo que configuração que
não funciona, e é pior que uma que falta: a que falta é pedida; esta é procurada no código,
encontrada, e continua sem jeito de mexer. É o mesmo raciocínio do D112, uma camada acima —
lá era o enum que ninguém lia, aqui é o formulário que ninguém desenhou.

**A allowlist é a que dói.** O TODO chama as três guardas da fila de "não opcionais", e ela é
a terceira: sem ela, o técnico de TI que loga em 40 máquinas gera 40 sugestões de posto
compartilhado no primeiro dia — e fila cujo primeiro contato é ruído não é revisada uma
segunda vez. A guarda estava implementada no servidor e inalcançável.

**Fica ao lado do painel de cobertura, não numa tela de ajustes:** os controles explicam os
números que a pessoa acabou de ler. "Por que tenho 12 fantasmas?" se responde mexendo em
`ghostDays`, e separar as duas coisas em telas diferentes esconderia a resposta da pergunta.

### D119 — Assinatura na `key`, nunca `setState` em efeito

**Decidido:** os dois formulários novos (a configuração e o seletor de pacotes) semeiam
estado com inicializador **preguiçoso** e remontam por uma `key` derivada do dado do
servidor.
**Descartado:** `useEffect` copiando a resposta da consulta para `useState`.

**Por quê:** o lint desta casa reprova `setState` dentro de efeito, e com razão — encadeia
renders. Mas o motivo de o padrão importar aqui é outro, e é de correção: o
`PUT /api/licenses/:id/software` recebe o **conjunto inteiro** e desliga o que não está nele.
Um conjunto marcado que abrisse vazio por um instante e fosse salvo naquele instante apagaria
a ponte toda, em silêncio. Com `key`, o componente só existe depois de o dado existir.

O efeito colateral é o certo: salvar invalida a consulta, o servidor responde o que ele
**aceitou**, a assinatura muda e o formulário reexibe o valor gravado — não o digitado. Quem
mandou `ghostDays: 0` e levou 422 vê o número que continua valendo, em vez de um campo
mentindo que a mudança pegou.

### D120 — `proporSugestao` não recebe cliente, porque abre transação

**Decidido:** a função perde o parâmetro `client` e usa o `prisma` global.
**Descartado:** manter o `Pick<typeof prisma, 'reconciliationSuggestion'>`, que aceitava um
`tx`.

**Por quê:** o tipo dizia que dava para chamar de dentro de uma transação, e no ramo da
**substituição** a função abria `prisma.$transaction` por conta própria, ignorando o cliente
recebido. Os seis chamadores passavam `prisma`, então não havia defeito — havia uma **promessa
falsa na assinatura**, do tipo que só cobra no ramo que roda quando uma sugestão substitui
outra, em produção.

A substituição precisa da própria transação (`SUPERSEDED` + `create`, ou o par fica sem
nenhuma pendente), então a honestidade é dizer que esta função abre transação e não roda
dentro de uma. Parâmetro removido em vez de tipo alargado: um `client` que só aceita o
`prisma` global não é parâmetro, é decoração.

### D121 — Casar a conta busca os **candidatos**, não o cadastro inteiro

**Decidido:** `registrarUsuarioObservado` filtra no banco por `username` igual ou parte local
de e-mail igual, e entrega esse recorte ao `casarPessoa`.
**Descartado:** `findMany` sem `where`, que era o que estava lá.

**Por quê:** a consulta carregava **todos** os usuários a cada handshake para comparar duas
strings. Numa empresa de 2.000 pessoas são 2.000 linhas trafegadas por handshake de cada
máquina, para responder "quem é ana.silva".

**O filtro preserva a ambiguidade, e é isso que o torna aceitável:** ele reproduz os dois
sinais do helper, então duas pessoas que casam pela mesma chave entram as duas no recorte e é
o `casarPessoa` puro que conclui "não sei" (D46). Um `take: 1` é que romperia a regra, e é
justamente o que não está lá. `mode: 'insensitive'` nos dois porque o helper compara em
minúsculas — sem isso, `ANA.SILVA` no Windows deixaria de casar com `ana.silva` no cadastro,
e um filtro de desempenho teria mudado o resultado.

### D122 — `Asset.suggestions`, e não o nome que o `prisma format` escreveu

**Decidido:** o campo de relação em `Asset` chama `suggestions`.
**Descartado:** `ReconciliationSuggestion ReconciliationSuggestion[]`, que o gerador escreveu
sozinho e que ficou.

**Por quê:** os outros três lados da mesma relação (`Endpoint`, `User`, `Location`) já a
chamavam de `suggestions`. Nome de campo de relação **não existe no banco**, então a troca não
pede migração — `migrate diff` contra o banco com todas as migrações aplicadas volta vazio. O
que ela muda é o que se lê num `include`, e nome gerado por ferramenta é o que se copia na
próxima vez.

---

## Riscos e armadilhas

**O `touchEndpoint` é o caminho mais quente do sistema.** Ele roda a cada mensagem de cada
agente. Qualquer escrita nova ali — inclusive em `assets` — multiplica por máquinas ×
mensagens. É o D95: o carimbo no ativo sai do job; a sugestão de ocupação e a normalização
de software rodam em **job**, nunca no handler da mensagem.

**`BigInt` novo no `Endpoint` derruba `/api/endpoints`.** O `present-endpoint.helper.ts`
converte `ramTotal`/`ramUsed` da **telemetria** e devolve `{ ...endpoint }` inteiro no
resto: `ramTotalBytes` e `diskTotalBytes` vão crus para o `JSON.stringify` e a rota morre
com *"Do not know how to serialize a BigInt"* — na tela que o painel consulta a cada 5s.
Os dois campos entram no helper **no mesmo commit** em que entram no schema.

**A troca de `status` para enum atravessa o frontend.** `EndpointCard.tsx` e
`EndpointDetailModal.tsx` comparam `endpoint.status === 'ONLINE'` contra um `status: string`
em `src/domain/shared/endpoint.types.ts`. O tipo vira a união de dois valores no mesmo
commit; caso contrário o enum fica correto no banco e a tela continua aceitando qualquer
string. E no banco: `ALTER COLUMN … USING` **recusa** se alguma linha tiver valor fora do
enum — `SELECT DISTINCT status FROM endpoints` antes, derrubando e recriando o `DEFAULT` em
volta.

**`ActivityAction` é união fechada.** `LINK`, `UNLINK` e `MERGE` não existem: gravar sem
acrescentá-las não compila — que é o comportamento desejado, e o mesmo tropeço que a F6
levou com o `VIEW_KEY`. Acrescentar vem com o comentário dizendo o que a palavra significa,
como as outras dezenove.

**A fila vira ruído sem três guardas.** O índice parcial de `PENDING` (não empilhar), a
memória do `REJECTED` com hash (não reoferecer, sem enterrar para sempre — D97) e a
allowlist (D101). E **aceitar sugestão de reatribuição em ativo de posto destrói cadastro**
(D47): a sugestão de checkout nem deve ser *gerada* quando a assignment aberta é `LOCATION`.

**Turno inferido depende de fuso.** Os timestamps são UTC e o turno é da hora **local**
(`America/Sao_Paulo`): inferir sobre UTC joga o turno da manhã para a madrugada e rotula
tudo errado. A conversão é do helper, com o fuso explícito, nunca do `Date` do servidor.

**Ativo na lixeira não é candidato — e isso já está de graça.** A extensão de soft delete
escopa `findMany`/`count` em todo model com `deletedAt`, então a cascata não casa com ativo
apagado sem ninguém escrever filtro. O cuidado é o inverso: ao usar `INCLUINDO_LIXEIRA` em
alguma consulta desta fase, saber que se está reabrindo essa porta de propósito.

**`onDelete: SetNull` desvincula em silêncio.** Apagar um ativo de verdade zera o `assetId`
do endpoint, e na hora seguinte o job oferece de novo o vínculo — agora contra outro
candidato. É o caso que o `ActivityLog` de `UNLINK` precisa registrar, e um dos motivos de
a recusa ter chave (D97).

**Agente antigo continua em campo.** Enquanto o rollout do C# não termina, chega handshake
sem os campos novos; nenhum deles pode ser obrigatório no parser, e um endpoint sem serial
simplesmente não pontua por serial — não vira erro. `readOptionalBigInt` existe por isso.

**`ASSET_SORTABLE` em `endpoint-filters.helper.ts` é nome herdado do D1** (quando `asset/`
era o RMM). Esta fase mexe no arquivo para acrescentar filtro de vínculo e de `reviewState`:
renomear para `ENDPOINT_SORTABLE` no mesmo commit, antes que a fase seguinte copie o nome
errado.

---

## Verificação

**O que rodou de verdade, no fechamento:** `npm run lint` limpo, `npm test` com **295
asserções verdes** (eram 266 antes da fase — 29 novas em `tests/descoberta/`), `npm run
build` completo, a cadeia de migrations aplicada **do zero** num banco descartável
(`sentinel_audit`) com o seed em seguida, e o processo real subindo com o job novo
agendado. Os comandos abaixo continuam sendo a verificação manual, contra um servidor de
pé com agente conectado.

```bash
API=http://localhost:3001
PSQL="docker exec -i sentinel-postgres psql -U sentinel -d sentineldb -t -A -c"
```

**1. O caminho crítico não pode quebrar** (o mesmo teste que a F1 exigiu em maiúsculas):
subir o servidor com um agente conectado, confirmar que o `lastSeen` do `Endpoint` avança
a cada mensagem, esperar o `zombie-cleaner.job` rodar e confirmar que a máquina **continua
ONLINE**. Junto, o nome proibido e o custo da escrita no ativo:

```bash
$PSQL "SELECT hostname, status, \"lastSeen\" FROM endpoints ORDER BY \"lastSeen\" DESC LIMIT 3;"
$PSQL "SELECT column_name FROM information_schema.columns
       WHERE table_name='assets' AND column_name IN ('status','lastSeen','hwid');"   # → 0 linhas
$PSQL "SELECT indexdef FROM pg_indexes WHERE tablename='endpoints' AND indexdef ILIKE '%assetId%';"
# → CREATE UNIQUE INDEX ... ("assetId")     ← o vínculo é 1:1

# O D95 em uma medida: nenhuma escrita em assets vinda do handshake.
$PSQL "SELECT COUNT(*) FROM assets WHERE \"lastSeenByAgentAt\" > now() - interval '1 minute';"
# → 0 entre rodadas do job, mesmo com a frota mandando telemetria
```

**2. A cascata, com os três casos de lixo:**

```bash
# serial de fábrica em branco em dois endpoints e um ativo com o mesmo texto
$PSQL "UPDATE endpoints SET \"biosSerial\"='To Be Filled By O.E.M.' WHERE hwid IN ('$H1','$H2');"
curl -s "$API/api/reconciliation/suggestions?endpointId=$E1" | jq '.rows[] | {signal,score}'
# → nenhuma sugestão por SERIAL (lixo conhecido), e nenhuma por colisão

# MAC de dock compartilhado por dois endpoints
$PSQL "UPDATE endpoints SET \"macAddress\"='00:1A:2B:3C:4D:5E' WHERE hwid IN ('$H1','$H2');"
curl -s "$API/api/reconciliation/suggestions?endpointId=$E1" | jq '[.rows[]|select(.signal=="MAC")]|length'
# → 0   (evidência ambígua = zero, D46)

# serial legítimo e único
curl -s "$API/api/reconciliation/suggestions?endpointId=$E3" | jq '.rows[0] | {signal,score}'
# → {"signal":"SERIAL","score":100}
```

**3. O item que só existe por causa do modelo de posse — ocupação sugerida:**

```bash
# ativo entregue à Mesa 1 (assignment LOCATION), agente vê a Ana logada
$PSQL "SELECT \"targetType\" FROM assignments WHERE \"assetId\"='$ATIVO' AND \"checkinAt\" IS NULL;"  # → LOCATION
curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '.rows[0] | {kind, targetLocationId, targetUserId, shift}'
# → {"kind":"OCCUPANCY","targetLocationId":"…mesa1…","targetUserId":"…ana…","shift":"Tarde"}
curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '[.rows[]|select(.kind=="CHECKOUT")]|length'   # → 0
```

**4. Posto compartilhado detectado a partir da observação:**

```bash
# Laura de manhã e Ana à tarde, 5 dias, na mesma máquina
$PSQL "SELECT \"userKey\", COUNT(*) dias, min(extract(hour from \"firstSeenAt\")) h1
       FROM endpoint_user_daily WHERE \"endpointId\"='$E4' GROUP BY 1;"
# → laura.silva|5|7   ana.souza|5|13

curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '.rows[] | {kind, evidence}'
# → kind "SHARED_POST", com os dois usuários, os dias e as faixas de hora na evidência
curl -s -X POST $API/api/reconciliation/suggestions/$SUG/accept
$PSQL "SELECT u.name, o.shift FROM location_occupants o JOIN users u ON u.id=o.\"userId\"
       WHERE o.\"locationId\"='$MESA1' AND o.\"endedAt\" IS NULL;"
# → Laura|Manhã     Ana|Tarde        ← as duas, com turno. Nenhum vencedor escolhido.
```

**5. Fila idempotente, cobertura e conformidade:**

```bash
# rodar o job três vezes: a contagem de PENDING não pode crescer
$PSQL "SELECT COUNT(*) FROM reconciliation_suggestions WHERE state='PENDING';"
# recusar uma sugestão, rodar de novo: ela NÃO volta — e volta se a evidência mudar (D97)
curl -s "$API/api/reconciliation/coverage" | jq
# → {cadastrados, comAgente, semAgente, nuncaVistos, fantasmas,
#    descobertas, orfaos, shadowIt, bloqueados, sugestoesPendentes}
# `nuncaVistos` é o D98 em número (a pergunta é do ATIVO, não do endpoint) e
# `fantasmas` conta só quem JÁ foi visto e sumiu — os dois separados, porque
# "nunca chegou" e "parou de chegar" são conversas diferentes.
$PSQL "SELECT hostname FROM endpoints WHERE \"assetId\" IS NULL
       AND \"lastSeen\" < now() - interval '24 hours';"      # → os Shadow IT

# software: normalizar duas vezes com o mesmo hash não escreve nada
$PSQL "SELECT \"normalizedKey\" FROM software_packages ORDER BY 1 LIMIT 5;"
$PSQL "SELECT COUNT(*) FROM software_packages WHERE publisher IS NULL GROUP BY \"normalizedKey\" HAVING COUNT(*) > 1;"
# → 0 linhas   (o NULL não duplicou — D100)
```

Com a ponte do D102 preenchida: instalar um pacote numa máquina sem assento e conferir que
aparece em *instalado sem licença*; devolver o assento de um ativo que continua com o
software e conferir o inverso.

### Os testes que entram em `tests/`

Pasta `tests/descoberta/` — nome do que ela prova, como as outras. Todos abrem a aplicação
com `criarApi()` e o hub com o helper novo `tests/helpers/agente.ts` (D99).

| Arquivo | O que ele prova |
|---|---|
| `handshake.test.ts` | o payload **antigo** continua válido; os campos novos chegam em PascalCase e camelCase; RAM ausente vira `null` e não `0`; `/api/endpoints` **não** estoura com os `BigInt` novos |
| `cascata.test.ts` | os três casos de lixo do D46, a colisão valendo zero e o serial único valendo 100 |
| `fila.test.ts` | rodar o job três vezes não empilha; recusar não reoferece; **mudar a evidência reoferece** (D97) |
| `posse-sugerida.test.ts` | a árvore do D47 nos cinco ramos — e, no ramo `LOCATION`, que **nenhuma** sugestão de checkout é gerada |
| `posto-compartilhado.test.ts` | duas pessoas em 5 dias viram `SHARED_POST` com turno; aceitar abre as **duas** ocupações e fecha a posse pessoal na mesma transação; `ignoredUserKeys` suprime o técnico |
| `software.test.ts` | hash igual não renormaliza; `publisher` nulo não duplica; a conformidade responde as duas perguntas |
| `merge.test.ts` | telemetria migra, o **`lastSeen` mais recente** sobrevive (D108 — `Endpoint` não tem `createdAt`), as colisões de presença e de software são **consolidadas**, `mergedIntoId` fica, `ActivityLog` grava o antes |
| `ciclo-de-vida-da-fila.test.ts` | recusar posse resiste ao calendário (D109); o cadastro mudando sozinho encerra a sugestão e o aceite não fabrica devolução (D110); desvincular encerra o que se dizia pela máquina; `OFF` desliga a descoberta (D112) |
| `uso-agregado.test.ts` | o dia mais antigo da janela não encolhe a cada rodada (D111) |
| `turno.test.ts` | o plantão que **atravessa a meia-noite** é Noite e não Manhã; a moda vence a média; empate devolve `null` (D113) |
| `hardware.test.ts` | primeira coleta **não** é troca de peça; campo que sumiu **não** é peça que sumiu (D106); a troca vira `AssetChange` só quando há ativo; a aba Máquina devolve os `BigInt` como string (D115) |

---

## O que fica de fora, declarado

- **A coleta no agente C#.** O binário vive fora deste repositório. A Etapa A é o contrato
  do lado do servidor; o deploy é coordenado e o servidor atende aos dois formatos por todo
  o rollout (D89 é o precedente: o corte seco derrubaria a frota).
- **Auditoria física automática.** *"Cada handshake é uma auditoria"* é `Audit` com
  `method = AGENTE` na F8. Nenhuma coluna de auditoria nasce aqui.
- **Sugerir *fechar* ocupação** (a pessoa parou de aparecer há 60 dias). É simétrico e útil,
  mas encerrar vínculo por ausência de sinal é bem mais arriscado do que abrir por presença
  — férias, licença, máquina trocada. Decidir com dado real.
- **Onde mora o `systemUuid` do lado do ativo.** O `Asset` só tem `serial`. Este plano
  assume que o UUID vive só no `Endpoint` e que o vínculo passa por ele; uma coluna no ativo
  se decide quando a aba Máquina mostrar o dado coletado ao lado do digitado.
- **Escala 12x36 no turno inferido.** Não cai em "Manhã/Tarde/Noite": o helper propõe o
  rótulo mais próximo e a pessoa corrige, que é a razão de `shift` ser texto livre (D15).

---

## O que esta fase acrescenta ao `ITAM-TODO.md` e ao `INVARIANTES.md`

No **TODO**: registrar `D45`–`D51`, `D95`–`D103` e `D104`–`D108` no índice de decisões;
marcar que o item
*"posse sugerida pelo usuário logado"* virou **dois** itens distintos (posse **ou**
ocupação, D47); que o do posto compartilhado é `M`, não `P` (traz tabela, job e tela); que
o `AgentStatus` tem **dois** valores e não três (D98); e que *"specs de hardware como
atributo do ativo"* está entregue **no `Endpoint`**, de propósito, com o porquê.

Nas **invariantes**, três entraram — com o mesmo critério das onze que já estavam lá
(*regra que o banco recusa, não regra que a aplicação lembra de checar*):

1. **`endpoints_assetId_key`** — o `@unique` em `Endpoint.assetId`: um ativo tem no máximo
   uma máquina, uma máquina no máximo um ativo.
2. **`sugestao_pendente_por_alvo`** — o índice parcial de `PENDING`: a mesma sugestão não
   empilha, e o histórico continua podendo repetir o par.
3. **`endpoint_user_daily` único por (endpoint, usuário, dia)** — a agregação do D49 é
   garantida pelo índice, não pelo `upsert` lembrar de acertar a chave.

O que **não** vira invariante, e por isso fica escrito aqui: "sugestão de checkout não é
gerada para ativo de posto" (D47) é regra de **geração**, mora no use-case e é provada por
teste — o banco não tem como recusar uma linha por causa do estado de outra tabela sem
trigger, e trigger é a fonte de verdade escondida que este projeto recusa.
