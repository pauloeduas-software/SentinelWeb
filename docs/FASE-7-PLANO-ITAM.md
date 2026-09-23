# Plano de implementação — Fase 7: convergência RMM × ITAM

> Plano **prospectivo** da Fase 7 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o
> código real depois da F1 e contra [`MODELO-POSSE.md`](./MODELO-POSSE.md). Convenções de
> camada: [`ARQUITETURA.md`](./ARQUITETURA.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias
>
> **Decisões `D45`–`D51`**, continuando a sequência global depois das da F6 (D39–D44).

---

## Objetivo

**Esta é a fase em que o produto deixa de ser um clone.** O Snipe-IT é um CMDB manual:
alguém digita o que existe e o sistema acredita. Nós temos um agente instalado na máquina
mandando handshake e telemetria desde antes do ITAM existir — e até aqui os dois lados
nunca se falaram. O `Endpoint` sabe o que a máquina *é*; o `Asset` sabe o que a empresa
*comprou e de quem cobra*. A convergência é ligar os dois sem fundi-los.

E há uma segunda coisa, que é a mais valiosa e que nenhum ITAM de prateleira faz: **o
agente vê quem está logado**. Num modelo `Asset ⟷ User`, essa observação só sabe dizer
"o dono está errado" — e quando duas pessoas usam a mesma máquina em turnos, ela fica
oscilando entre dois nomes e acaba descartada como ruído. Com as três camadas do
`MODELO-POSSE.md`, a mesma observação tem **onde cair**: o dono da máquina é o **posto**,
e as pessoas são **ocupantes** dele. Duas pessoas na mesma máquina deixam de ser um
conflito e viram a descrição correta da operação — que o sistema pode **propor cadastrar**.

A fase entrega, nesta ordem: o vínculo (D45), a coleta de identidade pelo agente, o motor
de matching e a fila de reconciliação, fantasma e Shadow IT, **a ocupação sugerida** (D47),
**o posto compartilhado detectado** (D48), e o software normalizado alimentando a
conformidade de licença da F6.

---

## Pré-requisitos

| Precisa estar pronto | Por quê | Estado |
|---|---|---|
| **F1** — `Asset` inteiro e `Endpoint` renomeado | os dois lados do vínculo | ✅ |
| **F4** — `Assignment`, `LocationOccupant`, `resolverResponsaveis()` | sem a Camada 2 não existe "sugerir ocupação", e a fase perde o que tem de próprio | tabelas ✅, use-cases na F4 |
| **F6** — `LicenseSeat` com alvo `Asset` | só para a conformidade por software instalado; o resto da fase não depende | F6 |
| **Agente Sentinel (C#)** | **está fora deste repositório**: a coleta nova é deploy coordenado, e agente antigo continua mandando o payload velho por semanas | externo |
| `AppSetting` | ganha os botões de descoberta (`discoveryMode`, `ghostDays`, `shadowHours`) | ✅ |

---

## Etapas

### Etapa A — O agente passa a mandar identidade · **M**

`HandshakeData` (`server/domain/shared/agent-protocol.types.ts`) ganha `biosSerial`,
`systemUuid`, `manufacturer`, `model`, `chassisType`, `ramTotalBytes`, `diskTotalBytes`,
`loggedOnUser`. No agente: `Win32_BIOS.SerialNumber`, `Win32_ComputerSystemProduct.UUID`,
`Win32_ComputerSystem.Manufacturer/Model/UserName`, `Win32_SystemEnclosure.ChassisTypes`.

**Regra em uma linha:** todo campo novo é opcional no parser e o handshake antigo continua
válido — agente velho em campo é a regra durante o rollout, não a exceção.

`server/domain/agent/helpers/normalize-payload.helper.ts` já resolve PascalCase ×
camelCase; os campos novos entram na mesma tabela de sinônimos.

### Etapa B — Schema · **M**

| Onde | O que nasce | Regra em uma linha |
|---|---|---|
| `Endpoint` | os campos da Etapa A + `assetId String? @unique`, `softwareHash?`, `reviewState ReviewState @default(UNREVIEWED)` | o lado descoberto aponta para o lado cadastrado (D45) |
| `Endpoint.status` | `String` → `enum AgentStatus { ONLINE OFFLINE NEVER_SEEN }` | eixo do agente, separado do ciclo de vida (`StatusLabel`) |
| `Asset` | **só** `lastSeenByAgentAt DateTime?` | **nunca** `lastSeen` (D13) — ver D50. `lastAuditAt` é coluna da F8 (D53) e não nasce aqui |
| `ReconciliationSuggestion` | `endpointId`, `assetId`, `score Int`, `signal MatchSignal`, `state`, `evidence Json`, `resolvedAt?`, `resolvedById?` | uma sugestão pendente por par, garantida por índice parcial |
| `EndpointUserDaily` | `endpointId`, `userKey`, `userId?`, `day Date`, `firstSeenAt`, `lastSeenAt`, `samples Int` | **agregado por dia**, não log de sessão (D49) |
| `AssetChange` | `assetId`, `field`, `oldValue?`, `newValue`, `detectedAt` | mudança de hardware detectada, não digitada |
| `SoftwarePackage` / `SoftwareInstallation` | `(name, version, publisher)` normalizado / `endpointId`, `packageId`, `firstSeenAt`, `lastSeenAt`, `removedAt?` | o `installedSoftware` deixa de ser JSON write-only |
| `AppSetting` | `discoveryMode`, `ghostDays @default(30)`, `shadowHours @default(24)` | os botões da descoberta moram no singleton que já existe |

```sql
-- Uma sugestão PENDENTE por par: o job roda de hora em hora e não pode
-- empilhar a mesma sugestão para sempre.
CREATE UNIQUE INDEX "sugestao_pendente_por_par"
  ON "reconciliation_suggestions"("endpointId","assetId") WHERE "state" = 'PENDING';

CREATE UNIQUE INDEX ON "endpoint_user_daily"("endpointId","userKey","day");

-- String → enum: FALHA se alguma linha tiver valor fora do enum. Conferir antes:
--   SELECT DISTINCT status FROM endpoints;
ALTER TABLE "endpoints" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "endpoints" ALTER COLUMN "status" TYPE "AgentStatus" USING "status"::"AgentStatus";
ALTER TABLE "endpoints" ALTER COLUMN "status" SET DEFAULT 'ONLINE';
```

### Etapa C — Motor de matching · **M**

```
server/domain/reconciliation/
├── reconciliation.maestro.ts
├── controllers/reconciliation.controller.ts
├── helpers/normalize-identity.helper.ts   # serial/UUID/MAC limpos + listas de lixo (puro)
├── helpers/match-cascade.helper.ts        # a cascata e a pontuação (puro)
├── jobs/reconcile.job.ts                  # varre endpoints sem vínculo
└── use-cases/  match-endpoint · accept-suggestion · reject-suggestion
                link-endpoint-asset · merge-endpoints · coverage-stats
```

| Sinal | Ponto | Vale para vincular sozinho? |
|---|---|---|
| `biosSerial` = `asset.serial` | 100 | sim, se `discoveryMode = ON` |
| `systemUuid` = `asset.serial` ou UUID guardado | 100 | sim |
| MAC normalizado | 85 | não — sugestão |
| hostname ≈ `asset.name` | 60 | não — sugestão |

**Regra em uma linha:** evidência que casa com **mais de um** candidato não é evidência —
pontua **zero** e vira alerta de colisão, nunca "pega o primeiro".

### Etapa D — Fantasma, Shadow IT e cobertura · **P**

**Regra em uma linha:** *fantasma* é ativo cadastrado sem endpoint vinculado (ou com
`lastSeenByAgentAt` mais velho que `ghostDays`); *Shadow IT* é endpoint sem `assetId` visto
há mais de `shadowHours`, com `reviewState` para triagem.

O item *"cada handshake é uma auditoria física"* do TODO **não** cria coluna aqui: quando a
F8 existir, ele grava uma linha de `Audit` com `method = AGENTE`, e `Asset.lastAuditAt` é
dela (D53). Duas fases escrevendo a mesma coluna é o começo de duas fontes de verdade.

### Etapa E — O usuário logado sugere **posse ou ocupação** · **M**

É aqui que o modelo de posse muda o comportamento. A observação é sempre a mesma
(`Win32_ComputerSystem.UserName` num endpoint vinculado a um ativo); **o que ela sugere
depende de para quem o ativo está entregue**:

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

Casar `DOMINIO\ana.silva` com um `User` é por parte local do e-mail, exato; **ambíguo
pontua zero** (mesma regra do D46). Até a F3/F11 darem `username`/LDAP ao `User`, isso é
sempre sugestão, nunca vínculo automático.

### Etapa F — Dois usuários na mesma máquina = **posto compartilhado** · **M**

```
janela de 14 dias, a partir de EndpointUserDaily:
  ≥ 2 usuários distintos, cada um em ≥ 3 dias  →  máquina compartilhada
     ativo já entregue a uma LOCATION  →  sugere as ocupações que faltam, com turno
     ativo entregue a um USER, ou sem posse  →  sugere PROMOVER: criar/escolher o posto,
                                                mover a posse para LOCATION e abrir as
                                                duas ocupações
```

Turno inferido pelo histograma de horas (`firstSeenAt`/`lastSeenAt` por dia, em hora
local): concentração antes das 12h → `"Manhã"`, entre 12h e 18h → `"Tarde"`, depois →
`"Noite"`. `shift` é **texto livre** (D15) e a sugestão escreve um rótulo que uma pessoa
confirma ou troca.

**Regra em uma linha:** o sistema não escolhe um vencedor entre Laura e Ana — ele propõe
o cadastro que explica as duas.

### Etapa G — Software instalado e conformidade · **G**

**Regra em uma linha:** o handshake só re-normaliza a lista quando o `softwareHash` muda —
diferenciar 800 linhas de software a cada mensagem de 500 máquinas é o caminho mais curto
para derrubar o banco.

Conformidade cruza `SoftwareInstallation → Endpoint → Asset → LicenseSeat` (F6) e responde
duas perguntas: **instalado sem assento** e **assento pago sem instalação**. É o pagamento
do D39: assento ancorado em ativo tem caminho até a instalação; ancorado num posto, não
teria.

### Etapa H — Merge de duplicados e painel · **M**

**Regra em uma linha:** quando o serial casa com um ativo que **já tem** endpoint
vinculado, isso não é vínculo, é **MERGE** — reimagem ou troca de placa mudou o `hwid`, e a
fusão (que move `Telemetry.endpointId` e preserva o `createdAt` mais antigo) é ação humana
dentro de uma `$transaction`, nunca automática.

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
caso mais traiçoeiro: a dock station passa o MAC *dela* ao notebook encaixado, e três
notebooks que revezam a mesma dock parecem a mesma máquina — é por isso que MAC vale 85 e
não 100, e que MAC repetido vale 0. **Hostname** é renomeável e volta atrás.

Pegar o primeiro candidato numa colisão é pior do que não vincular: cria vínculo errado
que ninguém revisa, porque o sistema disse que estava certo.

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
de TI logando para dar suporte, ou uma conta de serviço. Por isso entra na fila com a
evidência visível (quais dias, quais horas, quantas amostras) e alguém confirma. O
auto-provisionamento **nunca** cria ocupação sozinho, em nenhum modo.

### D49 — Observação de usuário é agregada por dia, com retenção

**Decidido:** `EndpointUserDaily` — uma linha por (endpoint, usuário, dia), com primeira e
última hora vistas e contagem de amostras. Expurgo aos 90 dias.
**Descartado:** uma linha por handshake (log de sessão).

**Por quê:** volume e privacidade, nessa ordem de esforço e na ordem inversa de importância.
Uma linha por mensagem é a mesma armadilha que o `AssetUsageDaily` do TODO já evita — a
consulta varreria milhões de linhas para responder "quem usa essa máquina". E, sendo dado
de pessoa, o formato certo é o menor que responde à pergunta: **em que dias e em que faixa
de hora**, não um rastro minuto a minuto. O propósito é declarado (identificar posto e
ocupante), a retenção é curta, e o que sai dali é sugestão para um humano — não vigilância
de produtividade, que este sistema não se propõe a fazer.

### D50 — `lastSeenByAgentAt` existe, é escrito uma vez por dia, e **nunca** se chama `lastSeen`

**Decidido:** a coluna do último contato no `Asset` chama `lastSeenByAgentAt` (D13) e é
atualizada **no máximo uma vez por dia**, quando o handshake chega por um endpoint
vinculado. A consulta de *fantasma* usa essa coluna; o `Endpoint.lastSeen` continua sendo
o batimento do RMM e não é copiado a cada mensagem.

**Por quê o nome:** é a regra permanente do D13 e a rede de segurança é o compilador. Se o
`Asset` tivesse uma coluna `lastSeen`, o `markStaleEndpointsOffline` apontando para o model
errado **compilaria** — e marcaria a frota inteira como OFFLINE em silêncio. Com o nome
diferente, o mesmo erro é 11 erros de compilação (provado na F1).

**Por quê uma coluna, e não só derivar pelo `Endpoint`:** porque reimagem cria endpoint
novo (`hwid` muda) e o histórico de "um agente já viu este ativo" não pode zerar junto. A
denormalização é bancada por essa razão específica — e limitada por escrita diária, porque
o `touchEndpoint` roda a **cada mensagem de cada máquina** e não pode virar uma escrita na
tabela de ativos.

### D51 — Auto-provisionamento nasce em `SUGGEST`

**Decidido:** `discoveryMode` com `OFF | SUGGEST | ON`, default **SUGGEST**.

**Por quê:** em `ON`, a primeira VM de teste que alguém subir vira patrimônio — e **consome
uma etiqueta do contador**, que o `nextAssetTag()` nunca devolve (F1). O estrago não é a
linha a mais: é a sequência de etiquetas furada para sempre.

---

## Riscos e armadilhas

**O `touchEndpoint` é o caminho mais quente do sistema.** Ele roda a cada mensagem de cada
agente. Qualquer escrita nova ali — inclusive em `assets` — multiplica por máquinas ×
mensagens. `lastSeenByAgentAt` é guardado com teto diário (D50); a sugestão de ocupação e
a normalização de software rodam em **job**, nunca no handler da mensagem.

**Duas migrações que falham de jeitos diferentes.** `ALTER COLUMN status TYPE "AgentStatus"
USING` recusa se alguma linha tiver valor fora do enum (`SELECT DISTINCT status FROM
endpoints` antes, e derrubar/recriar o `DEFAULT` em volta). E coluna `BigInt` nova
(`ramTotalBytes`, `diskTotalBytes`) que não passe pelo `present-endpoint.helper.ts`
derruba a rota com *"Do not know how to serialize a BigInt"*.

**A fila vira ruído sem duas guardas.** Sem memória do `REJECTED`, o job reoferece o mesmo
par de hora em hora; sem o índice parcial de `PENDING`, empilha duplicatas. E **aceitar
sugestão de reatribuição em ativo de posto destrói cadastro** (D47): a sugestão de checkout
nem deve ser *gerada* quando a assignment aberta é `LOCATION`.

**Turno inferido depende de fuso.** Os timestamps são UTC e o turno é da hora **local**
(`America/Sao_Paulo`): inferir sobre UTC joga o turno da manhã para a madrugada e rotula
tudo errado. A conversão é do helper, com o fuso explícito, nunca do `Date` do servidor.

**Merge é destrutivo e não tem desfazer.** Mover telemetria, fechar o endpoint antigo e
manter o histórico é uma transação só, com confirmação humana e `ActivityLog` do antes.

**Agente antigo continua em campo.** Enquanto o rollout do C# não termina, chega handshake
sem os campos novos; nenhum deles pode ser obrigatório no parser, e um endpoint sem serial
simplesmente não pontua por serial — não vira erro.

---

## Verificação

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
$PSQL "SELECT COUNT(*) FROM assets WHERE \"lastSeenByAgentAt\" > now() - interval '1 minute';"
# → 0 ou 1 por ativo por DIA — nunca uma escrita por mensagem (D50)
$PSQL "SELECT column_name FROM information_schema.columns
       WHERE table_name='assets' AND column_name IN ('status','lastSeen','hwid');"   # → 0 linhas
$PSQL "SELECT indexdef FROM pg_indexes WHERE tablename='endpoints' AND indexdef ILIKE '%assetId%';"
# → CREATE UNIQUE INDEX ... ("assetId")     ← o vínculo é 1:1
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
curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '.rows[0] | {tipo, locationId, userId, shift}'
# → {"tipo":"OCCUPANCY","locationId":"…mesa1…","userId":"…ana…","shift":"Tarde"}
# e NENHUMA sugestão de checkout do ativo para a Ana (D47)
curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '[.rows[]|select(.tipo=="CHECKOUT")]|length'   # → 0
```

**4. Posto compartilhado detectado a partir da observação:**

```bash
# Laura de manhã e Ana à tarde, 5 dias, na mesma máquina
$PSQL "SELECT \"userKey\", COUNT(*) dias, min(extract(hour from \"firstSeenAt\")) h1
       FROM endpoint_user_daily WHERE \"endpointId\"='$E4' GROUP BY 1;"
# → laura.silva|5|7   ana.souza|5|13

curl -s "$API/api/reconciliation/suggestions?endpointId=$E4" | jq '.rows[] | {tipo, evidencia}'
# → tipo "SHARED_POST", com os dois usuários, os dias e as faixas de hora na evidência
curl -s -X POST $API/api/reconciliation/suggestions/$SUG/accept
$PSQL "SELECT u.name, o.shift FROM location_occupants o JOIN users u ON u.id=o.\"userId\"
       WHERE o.\"locationId\"='$MESA1' AND o.\"endedAt\" IS NULL;"
# → Laura|Manhã     Ana|Tarde        ← as duas, com turno. Nenhum vencedor escolhido.
```

**5. Fila idempotente, cobertura e conformidade:**

```bash
# rodar o job três vezes: a contagem de PENDING não pode crescer
$PSQL "SELECT COUNT(*) FROM reconciliation_suggestions WHERE state='PENDING';"
# recusar uma sugestão, rodar de novo: ela NÃO volta
curl -s "$API/api/reconciliation/coverage" | jq
# → {cadastrados, comAgente, semAgente, orfaos, fantasmas, naoAutorizados}
$PSQL "SELECT hostname FROM endpoints WHERE \"assetId\" IS NULL
       AND \"lastSeen\" < now() - interval '24 hours';"      # → os Shadow IT
```

Com a F6 pronta: instalar um pacote numa máquina sem assento e conferir que aparece em
*instalado sem licença*; devolver o assento de um ativo que continua com o software e
conferir o inverso.

---

## Commits, TODO e perguntas em aberto

Um commit por etapa (A→H). A Etapa A é a única que depende de deploy do agente C#, que
vive fora deste repositório — ela entra **antes** do resto e o servidor precisa atender aos
dois formatos por todo o período de rollout.

No `ITAM-TODO.md`: registrar `D45`–`D51`; marcar que o item *"posse sugerida pelo usuário
logado"* virou **dois** itens distintos (posse **ou** ocupação, D47) e que o item do posto
compartilhado (D48) é `M`, não `P` — ele traz tabela nova (`EndpointUserDaily`), job e
tela; e apontar no item do `AgentStatus` que o campo de último contato do ativo chama
`lastSeenByAgentAt` (D50).

Fica em aberto, de propósito:

- **Onde mora o `systemUuid`.** O ativo só tem `serial`; guardar o UUID nele exigiria
  coluna nova. Este plano assume que o UUID vive só no `Endpoint` e o vínculo passa por
  ele — confirmar quando a tela de detalhe do ativo (F2) mostrar os dados coletados.
- **Conta de serviço e técnico de TI** poluem a detecção de posto compartilhado; a saída
  provável é uma allowlist de usuários ignorados no `AppSetting`, fora desta fase.
  No mesmo espírito, **turno de escala 12x36** não cai em "Manhã/Tarde/Noite": o helper
  propõe o rótulo mais próximo e a pessoa corrige, que é a razão de `shift` ser texto
  livre (D15).
- **Sugerir *fechar* ocupação** (a pessoa parou de aparecer há 60 dias) não existe aqui.
  É simétrico e útil, mas encerrar vínculo por ausência de sinal é bem mais arriscado do
  que abrir por presença — férias, licença, máquina trocada. Decidir com dado real.
