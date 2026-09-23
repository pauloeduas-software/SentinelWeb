# Plano de implementação — Fase 8: ciclo de vida

> Plano **prospectivo** da Fase 8 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o código
> real depois da F1 e depois de o modelo de posse entrar no schema. Convenções de camada:
> [`ARQUITETURA.md`](./ARQUITETURA.md). Contrato de posse: [`MODELO-POSSE.md`](./MODELO-POSSE.md)
> e [`INVARIANTES.md`](./INVARIANTES.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D52–D57**, na
> numeração contínua do projeto (D1–D13 no TODO, D14–D17 em `DECISOES-POSSE.md`).

---

## Objetivo

Registrar o que acontece com o ativo **depois** de ele existir e estar entregue: manutenção,
conferência física, perda de valor contábil e o aviso antes de um prazo vencer. É também a
primeira fase em que o sistema **escreve sozinho**: até aqui toda operação errada tinha um autor e
um formulário; daqui em diante ela tem um horário. Por isso boa parte deste plano é sobre *quando*
o job roda e o que ele faz se acordar duas vezes no mesmo dia.

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F1 concluída** | `Asset` inteiro, `Supplier`, e `Depreciation` — que existe desde a F1 e **ninguém aponta para ela**: `depreciation.spec.ts` tem `countUsages: () => Promise.resolve(0)`. Esta fase é quem dá dono à tabela |
| **F2 concluída** | a aba Manutenções da tela de detalhe já existe renderizando *"disponível na Fase 8"* |
| **F4 concluída** | a auditoria **lê** `Assignment` e `LocationOccupant`. Sem posse escrita, a conferência volta a ser só localização — que é o estado que esta fase existe para superar |
| **`nodemailer`** | não está instalado; o `.env` hoje só tem `DATABASE_URL` e `AGENT_TOKEN`. `recharts`, ao contrário, **já está no `package.json` e nunca foi importado** — a curva de depreciação é o primeiro uso |

**Não é pré-requisito:** F3 — o job grava `actorId: null`, e alerta automático não tem autor.

---

## Etapa A — `Maintenance` e a tela global · **M**

O histórico de serviço do ativo: o que foi feito, por quem, quanto custou, se saiu na garantia.

- **Schema:** enum `MaintenanceType` (`MANUTENCAO`, `REPARO`, `UPGRADE`, `CALIBRACAO`, `SUPORTE` —
  **um valor por linha**, senão `P1012`) e model `Maintenance`: `assetId`, `supplierId?`, `type`,
  `title`, `startDate`, `completionDate?`, `cost Decimal? @db.Decimal(12,2)`, `isWarranty`,
  `notes?`, `createdById?`. `Cascade` no ativo, `Restrict` no fornecedor. **Sem `deletedAt`:**
  histórico é append-only, e a coluna ligaria a extension de soft delete numa tabela que ninguém
  quer escopada.
- **Nasce:** `server/domain/maintenance/` inteiro (maestro, controller, use-cases
  create/list/update/close/delete, `schemas/`, `helpers/maintenance-filters.helper.ts`),
  `src/pages/manutencoes/` + `src/domain/maintenance/maintenance.queries.ts`, e a aba da F2.
- **Regra:** abrir manutenção **não muda o status do ativo** — o formulário oferece "colocar em
  Manutenção" como ação explícita. Contrato de suporte anual e upgrade agendado para o mês que vem
  são manutenções que não tiram nada do chão.

**Várias manutenções abertas por ativo convivem**, de propósito: não há índice parcial aqui — é a
simetria invertida de `assignments_um_aberto_por_ativo`, onde a unicidade *é* a regra. Ainda:
`supplier.spec.ts` ganha o segundo termo no `countUsages` (409 ao apagar fornecedor com
manutenção), custo acumulado e total em aberto são `aggregate` **fora do `skip`/`take`**, e `cost`
sai da API como **string** — formatar é da tela.

---

## Etapa B — `Audit`: a conferência de três campos · **G**

Antes do modelo de posse, auditar era conferir um campo: o ativo está onde o sistema diz? Agora
são três perguntas, e cada uma diverge por um motivo diferente.

- **Schema:** enums `AuditResult` (`OK`, `DIVERGENTE`, `NAO_LOCALIZADO`) e `AuditMethod`
  (`MANUAL`, `AGENTE`); model `Audit`: `assetId`, `auditedAt`, `result`, `method`,
  `locationIdBefore?`, `locationIdFound?`, `divergenciaDePosse Boolean`, `postoVago Boolean`,
  `notes?`, `auditedById?`. `Asset` ganha **`lastAuditAt DateTime?`** — e só ela (D53). Os dois
  campos de localização são **UUID sem FK**, pelo motivo do `ActivityLog.actorId`: conferência é
  append-only e não pode depender do ciclo de vida da linha de `locations`.
- **Nasce:** `server/domain/audit/` (maestro, controller, `record-audit.usecase.ts`,
  `list-audits.usecase.ts`, `helpers/audit-divergence.helper.ts`), `POST /api/assets/:id/audit`.
- **Regra:** a auditoria escreve **`locationId`** (*onde está*) e **nunca** a `Assignment` (*quem
  responde*) — D52.

| Campo conferido | Diverge quando | O que o sistema faz |
|---|---|---|
| **Onde está** (`Asset.locationId`) | achado em outro lugar | **atualiza** `locationId`, grava o anterior em `locationIdBefore`, resultado `DIVERGENTE` |
| **De quem é o posto** (`Assignment` aberta) | está numa mesa que não é a do alvo da posse | marca `divergenciaDePosse`, **não altera nada**, oferece o checkout de correção |
| **Quem ocupa o posto** (`LocationOccupant`) | a posse aponta para local sem ocupante aberto | marca `postoVago`, oferece cadastrar ocupante ou devolver ao estoque |


Tudo numa `$transaction`. **Não se grava snapshot dos responsáveis:** `Assignment` e
`LocationOccupant` são historiadas, então *"quem respondia pela Mesa 1 em março?"* já é
respondível — snapshot seria a quarta fonte de verdade que o D16 recusou, nascendo desatualizada.

### Auditar **por posto** — a forma prática de fazer isso

Conferir a localização de um ativo, no modelo novo, é conferir **o posto**. Nascem ainda
`audit-location.usecase.ts`, `GET|POST /api/locations/:id/auditoria` (no maestro de `audit`,
**não** no CRUD do catálogo — rota com regra não é spec) e `src/pages/auditoria/`. O posto é a
**unidade de trabalho**; o registro continua sendo uma linha de `Audit` por ativo (D54). A tela mostra **duas listas separadas**, e a diferença entre elas *é* a divergência: **"é deste
posto"** (a `Assignment` aberta aponta para cá) e **"está neste posto"** (`locationId` é cá).
Fundi-las esconde o que a auditoria veio procurar. Na primeira e não na segunda: sumiu da mesa. Na
segunda e não na primeira: é o mouse reserva da gaveta, caso legítimo que a auditoria **não** deve
transformar em posse. Encerrar ocupação, acrescentar ocupante e abrir checkout de correção são as
três ações da tela que **não** viram linha de auditoria: são operações da F4, com log próprio.

---

## Etapa C — Valor contábil, calculado · **M**

- **Schema:** `AssetModel.depreciationId String? @db.Uuid`, FK `Restrict`. É a única âncora:
  `Asset` **não tem `categoryId`** (a categoria vem do modelo), e o Snipe-IT também pendura
  depreciação no modelo. `depreciation.spec.ts` deixa de devolver `0` no `countUsages`.
- **Nasce:** `server/domain/asset/helpers/depreciacao.helper.ts` (pura, sem I/O) e
  `use-cases/asset-book-value.usecase.ts`.
- **Regra:** `valor = min(custo, max(piso, custo − (custo − piso) × decorridos ÷ meses))`, tudo em
  `Prisma.Decimal`, **calculado no servidor, sempre** (D55).

`decorridos` sai de `adicionarMeses`, que já existe em `asset-dates.helper.ts` e resolve o
transbordo de 31/01 — não se escreve a segunda aritmética de datas do projeto. **Três resultados
possíveis, e nenhum é zero:** sem `purchaseCost` → `null`; modelo sem depreciação → `null`; com os
dois → o valor. O relatório separa os três baldes: somar `null` como zero barateia a frota.

---

## Etapa D — `/relatorios` nasce aqui · **M**

- **Schema:** nada muda.
- **Nasce:** `server/domain/report/` (um use-case por relatório), `src/pages/relatorios/` com uma
  aba cada, `src/domain/report/report.queries.ts`.
- **Regra:** relatório é leitura agregada — **nenhum relatório escreve**.

Quatro abas: **Depreciação** (totais + a curva em `recharts`, primeiro import da biblioteca no
projeto), **Garantias e EOL** a vencer em N dias, **Auditorias** (vencidas / a vencer / nunca) e
**Manutenções** (custo acumulado, em aberto, por tipo). *"Auditoria vencida"* é
`lastAuditAt IS NULL OR lastAuditAt < :corte`, com o corte calculado na aplicação a partir de
`auditIntervalMonths`: usa o índice de `lastAuditAt` e não envelhece quando o intervalo global
muda (D53). O `recharts` entra por import **da própria página**, nunca do `App.tsx`, e a série
vem pronta do servidor (D55). **A F10 herda esta moldura** — export, seletor de colunas e report
builder entram *nesta* página, não numa segunda.

---

## Etapa E — Alertas: `Alert`, o job e os canais · **G**

- **Schema:** enum `AlertType` (`GARANTIA_VENCENDO`, `EOL_PROXIMO`, `AUDITORIA_VENCIDA`,
  `MANUTENCAO_EM_ABERTO`) e model `Alert`: `type`, `assetId?`, `dueAt`, `dedupeKey String @unique`,
  `payload Json?`, `createdAt`, `readAt?`, `notifiedAt?`. `AppSetting` ganha `alertsEnabled`,
  `alertEmails String[]`, `alertWebhookUrl?`, `warrantyAlertDays`, `eolAlertDays`, `alertHour`,
  `auditIntervalMonths`, `auditWarningDays`, `timezone` e **`lastAlertRunAt DateTime?`**.
- **Nasce:** `server/core/mail/mailer.ts` (infraestrutura pura: transporte e envio, zero regra),
  `server/domain/alert/` (maestro, controller, `jobs/daily-alerts.job.ts`, `run-daily-alerts` e
  `list-alerts` use-cases, `helpers/alert-window.helper.ts`), `src/pages/components/AlertBell.tsx`.
> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D79.** `lastAlertRunAt` **não é coluna de `AppSetting`**: o lembrete de atraso da F4 faz CAS na mesma
> coluna, e o job que perdesse a corrida do dia nunca executaria. O CAS é por linha na tabela
> `JobRun`, com o nome do job como chave.

- **Regra:** o job acorda a cada 15 min, tenta um *compare-and-set* na linha `'alertas-diarios'`
  de `JobRun`, e **só a rodada que ganhar o `updateMany` executa** (D56 + D79).

```ts
const { count } = await prisma.appSetting.updateMany({
  where: { id: 'singleton',
           OR: [{ lastAlertRunAt: null }, { lastAlertRunAt: { lt: inicioDaJanela } }] },
  data: { lastAlertRunAt: agora },
});
if (count === 0) return;   // outra rodada, ou outro processo, já serviu a janela de hoje
```

`dedupeKey` é `${type}:${assetId}:${dueAt em YYYY-MM-DD}`, gravado por
`createMany({ skipDuplicates: true })`: rodar duas vezes no mesmo dia não duplica alerta, e o
e-mail sai só das linhas **efetivamente criadas**. `startDailyAlertsJob`/`stop…` entram no
`onShutdown`, como o `zombie-cleaner.job.ts` já faz.

---

## Decisões da fase — D52 a D57

### D52 — A auditoria corrige *onde está*. Nunca *quem responde*.

**Decidido:** grava `Asset.locationId` e `Audit.locationIdBefore`. **Descartado:** mover a
`Assignment` aberta para o local onde o ativo foi achado.

O auditor observa um fato físico — *o mouse está na Mesa 2* —, não uma decisão — *o mouse passou
a ser da Mesa 2*. Empréstimo de uma tarde e mudança de posto são indistinguíveis pela observação,
e o `MODELO-POSSE.md` já declara que **um ativo pode estar em um lugar sem ser do lugar**. Mover a
posse transferiria responsabilidade — de Laura e Ana para quem ocupa a Mesa 2 — a partir de um
palpite. Corrigir posse é **checkout**: operação com autor, data e nota.

### D53 — `lastAuditAt` é coluna. `nextAuditAt` não nasce.

**Decidido:** `Asset.lastAuditAt`, escrita só pelo use-case de auditoria. **Descartado:**
`Asset.nextAuditAt`, que o item do TODO pede.

`lastAuditAt` é **cache de evento**, no molde de `Asset.assignedToId`: escritor único, fato que
aconteceu, e existe porque *"nunca auditados"* é pergunta sobre a frota inteira. `nextAuditAt` é
outra coisa — é `lastAuditAt + intervalo`, e o intervalo é **configuração global**: no dia em que
alguém mudar de 12 para 6 meses, toda linha gravada antes passa a mentir, e a correção é um
`UPDATE` em massa que ninguém vai lembrar de rodar.

### D54 — A auditoria é registrada por ATIVO. O posto é a unidade de trabalho.

**Decidido:** uma linha de `Audit` por ativo; auditar um posto cria N linhas numa transação.
**Descartado:** uma linha de auditoria por posto. *"Quais ativos nunca foram auditados"* é a
pergunta que paga esta fase, e ela não é respondível por linhas de posto; no caminho inverso,
*"quando a Mesa 1 foi conferida?"* é `MAX(auditedAt)` sobre os ativos daquele posto — derivável,
e derivável é o lado certo de ficar.

### D55 — Valor contábil é calculado no servidor. Sempre.

**Decidido:** função pura em `server/domain/asset/helpers/`. **Descartado:** coluna `bookValue` —
e descartado também calcular na tela. A coluna é a simetria exata do **D16**: segunda fonte de verdade para o que `purchaseCost`,
`purchaseDate` e a `Depreciation` já dizem — com um agravante que a responsabilidade derivada não
tem. **A responsabilidade muda quando um evento acontece; o valor contábil muda quando nada
acontece**, então a coluna já nasce errada no dia seguinte. Calcular no navegador é o mesmo erro
mudando de lugar: o lint impede `src/` importar de `server/`, a fórmula seria escrita duas vezes,
e duas implementações divergem na primeira regra de arredondamento.

### D56 — O job diário não é `setInterval`. É tick curto com compare-and-set.

**Decidido:** tick de 15 min + `updateMany` condicional. **Descartado:** `setInterval(24h)`, no
molde do `zombie-cleaner.job.ts` — que é o modelo **errado** aqui, por três diferenças.

**(1)** Ele é idempotente e sem efeito externo: rodar duas vezes remarca os mesmos endpoints como OFFLINE — o job de alertas manda
e-mail, e e-mail não tem rollback. **(2)** O período dele é 60 s: perder uma rodada custa 60
segundos; perder a rodada diária custa o dia inteiro de aviso. **(3)** E o que mata de vez:
`setInterval` conta a partir do *boot*, então um processo que reinicia mais de uma vez por dia —
`tsx watch`, dois deploys num dia — **nunca chega aos 24 h e o job nunca dispara**. Não é atraso;
é ausência total, em silêncio. O compare-and-set resolve o problema oposto de graça: dois
processos, ou o temporizador órfão do `tsx watch`, recebem `1` e `0` do mesmo statement atômico.

### D57 — A central no app é o canal primário; SMTP mora no `.env`.

**Decidido:** toda notificação vira linha em `alerts` antes de virar mensagem, e `SMTP_*` são
variáveis de ambiente validadas em `validateEnv()`. **Descartado:** disparar e-mail direto do job;
e guardar senha de SMTP no banco. Persistir primeiro dá três coisas: *"o alerta disparou?"* vira um `SELECT`; o sistema funciona sem
SMTP (modo no-op, como o `AGENT_TOKEN` fora de produção); e o `dedupeKey` vira a defesa contra o
mesmo alerta chegando todo dia até alguém resolver o problema. Senha no banco pediria a cifra em
repouso, que só nasce na **F9** — seria criar o vazamento antes da cifra, numa coluna que o export
CSV da F10 alcança. Destinatário e threshold ficam na tela: mudam sem deploy.

---

## Riscos e armadilhas

**`min` antes de `max` no valor contábil.** O `beforeWrite` de `depreciation.spec.ts` limita o
piso `PERCENT` a 100%, mas **`AMOUNT` não tem teto**: um piso de R$ 5.000 num mouse de R$ 50
devolve valor contábil *maior* que o custo. A fórmula é `min(custo, max(piso, …))` — os dois lados.

**Fuso horário é o que decide o que é "hoje".** O processo roda em UTC; uma rodada às 21h em São
Paulo já é o dia seguinte em UTC, e a janela fecharia duas vezes no mesmo dia local. O início da
janela sai de `AppSetting.timezone`, nunca de um `new Date()` cru.

**`Decimal` morre no primeiro `Number()`.** Custo e depreciação em `Prisma.Decimal` de ponta a
ponta, convertendo só na borda — `z.coerce.number()` no caminho reintroduz o centavo que o
`Decimal` existe para impedir (armadilha nº 7 da F1, em outra roupa).

**E-mail dentro da `$transaction` é e-mail enviado num rollback.** Grava, commita, **depois**
envia e marca `notifiedAt`. Falha de SMTP deixa o alerta na central com `notifiedAt` nulo — que é
a informação de que a próxima rodada precisa.

**A extension de soft delete não escopa `maintenances` nem `audits`.** Elas não têm `deletedAt`,
então um ativo na lixeira continua somando custo no total. Filtrar por
`asset: { deletedAt: null }` **explicitamente**: relação aninhada não herda escopo (D8, verificado).

**A F7, se vier antes, muda o tamanho do relatório de auditoria da noite para o dia.** O item
*"cada handshake é uma auditoria física"* transformaria toda máquina com agente em auditada. A
fronteira: **só o handshake que confirma o número de série conta** — hostname é renomeável, MAC
muda com dock, e nenhum dos dois prova que alguém olhou o equipamento.

---

## Verificação

```bash
API=http://localhost:3001
ID=$(curl -s "$API/api/assets?perPage=1" | jq -r '.rows[0].id')

# A — manutenção com custo; e 409 ao apagar o fornecedor em uso
curl -s -X POST "$API/api/assets/$ID/maintenances" -H 'Content-Type: application/json' \
  -d '{"type":"REPARO","title":"Troca de teclado","startDate":"2026-09-01","cost":"350.00"}' | jq
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$API/api/suppliers/$FORN"        # 409

# B — a amarra da fase: auditar na Mesa 2 um ativo entregue à Mesa 1 (posse tem que ficar intacta)
curl -s -X POST "$API/api/assets/$ID/audit" -H 'Content-Type: application/json' \
  -d "{\"result\":\"DIVERGENTE\",\"locationIdFound\":\"$MESA2\"}" \
  | jq '{result, divergenciaDePosse, locationIdBefore, locationIdFound}'

# D — os três baldes separados; nenhum `null` somado como zero
curl -s "$API/api/reports/depreciacao" | jq '{semCusto, semDepreciacao, comValor, totalAtual}'

# F — idempotência: N criados na primeira chamada, 0 na segunda
curl -s -X POST "$API/api/alerts/run" | jq '.criados'
```

```sql
-- D52: a auditoria mexeu em `locationId` e NÃO na posse
SELECT a."locationId" = :mesa2 AS moveu_local, g."targetLocationId" = :mesa1 AS posse_intacta
  FROM assets a JOIN assignments g ON g."assetId" = a.id AND g."checkinAt" IS NULL
 WHERE a.id = :id;                                             -- t | t

-- D53: a coluna que não existe
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'assets' AND column_name IN ('lastAuditAt','nextAuditAt');  -- só lastAuditAt

-- D56: sobreviver ao restart — voltar a janela à mão e rodar o job de novo
UPDATE app_settings SET "lastAlertRunAt" = now() - interval '2 days';
```

**Três provas que não são comando:** matar o processo no meio da tarde, subir de novo e confirmar
que o job **ainda** roda na janela do dia (com `setInterval` de 24 h ele nunca rodaria); deixar o
`tsx watch` recarregar três vezes, conferindo em `alerts` que não houve duplicata; e cadastrar uma
depreciação `AMOUNT` com piso acima do custo de um mouse, conferindo que o valor contábil **não**
passa do custo. Mais a reconstrução do zero (`ARQUITETURA.md`): a fase muda `AppSetting` e cria
cinco tabelas.

---

## Perguntas em aberto

- **Auditoria automática pelo agente (F7).** Se a F7 vier antes, o handshake vira linha de `Audit`
  e o relatório de "nunca auditados" muda de tamanho sozinho. A proposta deste plano é que **só o
  handshake que confirma número de série** conte como auditoria; a decisão é da F7.
- **Intervalo de auditoria por categoria.** Fica de fora, com o caminho pronto
  (`Category.auditIntervalMonths`, nullable). Só entra se um cliente pedir ciclos diferentes.
- **Quem recebe o alerta quando o ativo está num posto vago?** Hoje o alerta é da frota. A resposta
  natural é o gestor da localidade, que só ganha função na **F11** (`resolverEscalonamento()`).


---

## Ordem de commits

```
A: feat(db): Maintenance — histórico de serviço do ativo e a tela global
B: feat(itam): Audit — conferência de localização, posse e ocupação, e a auditoria por posto
C: feat(itam): valor contábil calculado (depreciação linear com piso)
D: feat(web): /relatorios com depreciação, garantias, auditorias e manutenções
E: feat(alert): central de alertas, job diário e envio SMTP
```

O lint tem que passar em cada um. Não há suíte: a verificação é a seção acima.
