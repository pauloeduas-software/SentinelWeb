# Plano de implementação — Fase 7: convergência RMM × ITAM ✅

> Fase do [`../ROADMAP.md`](../ROADMAP.md), **fechada**. Contrato de posse:
> [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md) · camadas: [`../referencia/arquitetura.md`](../referencia/arquitetura.md) ·
> o que o sistema recusa: [`../referencia/invariantes.md`](../referencia/invariantes.md).
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
[`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md), a mesma observação tem **onde cair**: o dono da
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

A migração é escrita à mão pelo caminho do [`../referencia/arquitetura.md`](../referencia/arquitetura.md) (`migrate
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

> As decisões desta fase moram em [`../decisoes/reconciliacao.md`](../decisoes/reconciliacao.md) — **D45–D51 e D95–D122**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

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

## O que esta fase acrescenta ao `../ROADMAP.md` e ao `../referencia/invariantes.md`

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
