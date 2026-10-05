# Plano de implementação — Fase 8: ciclo de vida

> Plano da Fase 8 do [`../ROADMAP.md`](../ROADMAP.md), **reescrito contra a árvore depois de a F7
> fechar**. Convenções de camada: [`../referencia/arquitetura.md`](../referencia/arquitetura.md). Contrato de posse:
> [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md) e [`../referencia/invariantes.md`](../referencia/invariantes.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D52–D57**
> (as originais, revisadas) e **D123–D128** (as que a revisão contra o código obrigou), na numeração
> contínua do projeto.
>
> ⚠️ **A primeira versão deste plano foi escrita depois da F1** e descrevia um código que não existe
> mais: dizia que o `nodemailer` não estava instalado, que o `.env` só tinha duas variáveis, que a F3
> não era pré-requisito, que não havia suíte de testes e que o *compare-and-set* era numa coluna de
> `AppSetting`. Nada disso vale — a F4 trouxe o correio e a janela de job, a F6 a cifra, a F7 a
> convergência. O que **não** mudou foram as seis decisões: D52 a D57 seguem de pé, e é por isso que
> este arquivo é uma revisão e não um plano novo.

---

## Objetivo

Registrar o que acontece com o ativo **depois** de ele existir e estar entregue: manutenção,
conferência física, perda de valor contábil e o aviso antes de um prazo vencer.

A fase tem um traço que nenhuma anterior tem inteiro: aqui o sistema **avisa sozinho sobre coisa que
não aconteceu**. Até a F7 todo job reagia a um fato (o agente bateu, a máquina sumiu, o prazo
venceu); o alerta de garantia dispara porque o calendário andou. É por isso que boa parte deste
plano é sobre *quando* o job roda, em que fuso, e o que ele faz se acordar duas vezes no mesmo dia.

---

## Pré-requisitos — o que JÁ existe (verificado na árvore)

| O quê | Situação |
|---|---|
| **F1** | `Asset`, `Supplier` e `Depreciation` completos. A `Depreciation` está órfã desde então: `depreciation.spec.ts` tem `countUsages: () => Promise.resolve(0)`. **Esta fase é quem dá dono à tabela** |
| **F2** | a aba Manutenções da tela de detalhe existe, desabilitada, dizendo *"Fase 8"* (`abas.helper.ts`). São **oito** abas hoje, não sete — a Máquina entrou na F7 |
| **F3** | fechada. O guard é **hook global com allowlist** (`core/http/require-auth.ts`), então rota nova nasce **fechada** — não há `preHandler` para lembrar. E `recordActivity` **não tem default de `actorId`**: quem esquecer o ator não compila (D23) |
| **F4** | `Assignment` e `LocationOccupant` escritos e lidos — é o que faz a conferência ser de três campos e não de um |
| **`core/mail/mailer.ts`** | **já existe** (F4). `enviar()` é *best-effort* com log, nunca lança, e o envio é **depois do commit** por contrato (D86). Modo no-op sem `SMTP_URL`. A Etapa E **não cria o correio** |
| **`core/jobs/claim-window.ts`** | **já existe** (D79). `tomarJanela`, `executarUmaVezPorJanela`, `inicioDoDia`, e a tabela `JobRun` com uma linha por job. Coberto por `tests/jobs/janela.test.ts` |
| **`nodemailer`** | instalado (`^10.0.10` + `@types`). `recharts` também está no `package.json` e **continua sem um único import** — a curva de depreciação é o primeiro uso |
| **`.env`** | o **`.env.example`** documenta `DATABASE_URL`, `JWT_SECRET`, `AGENT_TOKEN`, `APP_ENCRYPTION_KEY` como obrigatórias e `SMTP_URL`, `MAIL_FROM`, `APP_URL` como **opcionais comentadas** (sem SMTP o correio é no-op, D86). A Etapa E acrescenta **zero** variável. ⚠️ A frase original dizia que o `.env` "já tem" as sete — o arquivo de exemplo tem; um `.env` local pode não ter, e o boot não reclama das três do correio de propósito |
| **Suíte de testes** | existe: `npm test` roda contra Postgres real pelo mesmo Fastify de produção ([`../referencia/testes.md`](../referencia/testes.md)). A fase entrega pasta de teste, não uma lista de `curl` |

**O que ainda não existia quando este plano foi revisado:** `Maintenance`, `Audit`, `Alert`,
`AssetModel.depreciationId`, `Asset.lastAuditAt`, os campos de alerta no `AppSetting`, e as telas
`/manutencoes`, `/auditorias`, `/relatorios`. **Tudo isso existe agora** — ver *O que a execução
mudou*, no fim.

---

## Etapa A — `Maintenance` e a tela global · **M**

O histórico de serviço do ativo: o que foi feito, por quem, quanto custou, se saiu na garantia.

- **Schema:** enum `MaintenanceType` (`MANUTENCAO`, `REPARO`, `UPGRADE`, `CALIBRACAO`, `SUPORTE` —
  **um valor por linha** no arquivo, senão `P1012`) e model `Maintenance`: `assetId`, `supplierId?`,
  `type`, `title`, `startDate`, `completionDate?`, `cost Decimal? @db.Decimal(12,2)`, `isWarranty`,
  `notes?`, `createdById?`, `updatedById?`. `Cascade` no ativo, `Restrict` no fornecedor.
  **Sem `deletedAt`:** histórico é append-only, e a coluna ligaria a extension de soft delete numa
  tabela que ninguém quer escopada.
- **Nasce:** `server/domain/maintenance/` inteiro (maestro, controller, use-cases
  create/list/get/update/close/delete, `schemas/`, `helpers/maintenance-select.helper.ts` e
  `helpers/maintenance-audited.helper.ts`), `src/pages/manutencoes/` +
  `src/domain/maintenance/maintenance.queries.ts`, e a aba da F2 sai de desabilitada.
- **Regra:** abrir manutenção **não muda o status do ativo**. Contrato de suporte anual e upgrade
  agendado para o mês que vem são manutenções que não tiram nada do chão. Quem quiser o ativo em
  Manutenção troca o `StatusLabel` pela tela de sempre.

**Várias manutenções abertas por ativo convivem**, de propósito: não há índice parcial aqui — é a
simetria invertida de `assignments_um_aberto_por_ativo`, onde a unicidade *é* a regra.

Três acertos que a revisão do código obrigou:

1. **`supplier.spec.ts` ganha o QUINTO termo no `countUsages`**, não o segundo: hoje ele conta
   ativo, acessório, consumível e componente. E, **de passagem, conserta um furo da F6**:
   `License.supplierId` é `Restrict` e **não está** na contagem — apagar um fornecedor usado só por
   licença hoje devolve 409 pelo `P2003`, com mensagem genérica em vez da frase que conta quantos
   registros seguram a linha.
2. **`deleteAsset` NÃO passa a recusar ativo com manutenção aberta.** É a pergunta que o 409 do
   componente instalado levanta, e a resposta é diferente: o componente preso é *unidade de estoque
   que não volta*; manutenção aberta é histórico, e histórico não vaza saldo. Escrito aqui porque a
   ausência de uma regra também é decisão.
3. **A listagem global filtra `asset: { deletedAt: null }` explicitamente.** `maintenances` não tem
   `deletedAt`, então a extension não a escopa, e relação aninhada **não herda** escopo (D8,
   verificado). Sem o filtro, um ativo na lixeira continua somando custo no total.

Custo acumulado e total em aberto são `aggregate` **fora do `skip`/`take`**, e `cost` sai da API como
**string** — o `Decimal` só vira número na hora de formatar, na tela.

---

## Etapa B — `Audit`: a conferência de três campos · **G**

Antes do modelo de posse, auditar era conferir um campo: o ativo está onde o sistema diz? Agora são
três perguntas, e cada uma diverge por um motivo diferente.

- **Schema:** enums `AuditResult` (`OK`, `DIVERGENTE`, `NAO_LOCALIZADO`) e `AuditMethod`
  (`MANUAL`, `AGENTE`); model `Audit`: `assetId`, `auditedAt`, `result`, `method`,
  `locationIdBefore?`, `locationIdFound?`, `divergenciaDePosse Boolean`, `postoVago Boolean`,
  `notes?`, `auditedById?`. `Asset` ganha **`lastAuditAt DateTime?`** — e só ela (D53) — **com
  `@@index([lastAuditAt])`**, que a Etapa D usa e que a primeira versão deste plano prometia sem
  declarar (`retiredAt` e `lastSeenByAgentAt` têm o deles, pelo mesmo motivo).
  Os dois campos de localização são **UUID sem FK**, pelo motivo do `ActivityLog.actorId`:
  conferência é append-only e não pode depender do ciclo de vida da linha de `locations`.
- **Nasce:** `server/domain/audit/` (maestro, controller, `record-audit.usecase.ts`,
  `list-audits.usecase.ts`, `audit-location.usecase.ts`, `audit-by-agent.usecase.ts` (D124),
  `helpers/audit-divergence.helper.ts`, `helpers/audit-select.helper.ts`),
  `POST /api/assets/:id/audit`, `GET /api/assets/:id/audits`.
- **Regra:** a auditoria escreve **`locationId`** (*onde está*) e **nunca** a `Assignment` (*quem
  responde*) — D52.

| Campo conferido | Diverge quando | O que o sistema faz |
|---|---|---|
| **Onde está** (`Asset.locationId`) | achado em outro lugar | **atualiza** `locationId`, grava o anterior em `locationIdBefore`, resultado `DIVERGENTE` |
| **De quem é o posto** (`Assignment` aberta) | está numa mesa que não é a do alvo da posse | marca `divergenciaDePosse`, **não altera nada**, oferece o checkout de correção |
| **Quem ocupa o posto** (`LocationOccupant`) | a posse aponta para local sem ocupante aberto | marca `postoVago`, oferece cadastrar ocupante ou devolver ao estoque |

Tudo numa `$transaction`. **Não se grava snapshot dos responsáveis:** `Assignment` e
`LocationOccupant` são historiadas, então *"quem respondia pela Mesa 1 em março?"* já é respondível —
snapshot seria a quarta fonte de verdade que o D16 recusou, nascendo desatualizada.

### Auditar **por posto** — a forma prática de fazer isso

Conferir a localização de um ativo, no modelo novo, é conferir **o posto**. Nascem ainda
`GET|POST /api/locations/:id/auditoria` (no maestro de `audit`, **não** no CRUD do catálogo — rota
com regra não é spec) e `src/pages/auditorias/`. O posto é a **unidade de trabalho**; o registro
continua sendo uma linha de `Audit` por ativo (D54).

A tela mostra **duas listas separadas**, e a diferença entre elas *é* a divergência: **"é deste
posto"** (a `Assignment` aberta aponta para cá) e **"está neste posto"** (`locationId` é cá).
Fundi-las esconde o que a auditoria veio procurar. Na primeira e não na segunda: sumiu da mesa. Na
segunda e não na primeira: é o mouse reserva da gaveta, caso legítimo que a auditoria **não** deve
transformar em posse. Encerrar ocupação, acrescentar ocupante e abrir checkout de correção são as
três ações da tela que **não** viram linha de auditoria: são operações da F4, com log próprio.

> **O nome da pasta é `auditorias/`, no plural.** As telas levam o substantivo do que listam
> (`ativos`, `postos`, `estoque`, `licencas`, `descobertas`); `auditoria/` nomearia o processo.

---

## Etapa C — Valor contábil, calculado · **M**

- **Schema:** `AssetModel.depreciationId String? @db.Uuid`, FK `Restrict`. É a única âncora:
  `Asset` **não tem `categoryId`** (a categoria vem do modelo), e o Snipe-IT também pendura
  depreciação no modelo. `depreciation.spec.ts` deixa de devolver `0` no `countUsages`.
- **Nasce:** `server/domain/asset/helpers/depreciacao.helper.ts` (pura, sem I/O) e o valor contábil
  embutido na leitura de detalhe do ativo (`find-asset-by-id`, com a regra já no `ASSET_SELECT` para
  não custar uma segunda consulta por ativo).
- **Regra:** `valor = min(custo, max(piso, custo − (custo − piso) × decorridos ÷ meses))`, tudo em
  `Prisma.Decimal`, **calculado no servidor, sempre** (D55).

`decorridos` sai de `adicionarMeses`, que já existe em `asset-dates.helper.ts` e resolve o transbordo
de 31/01 — não se escreve a segunda aritmética de datas do projeto. **Três resultados possíveis, e
nenhum é zero:** sem `purchaseCost` → `null`; modelo sem depreciação → `null`; com os dois → o
valor. O relatório separa os três baldes: somar `null` como zero barateia a frota.

---

## Etapa D — `/relatorios` nasce aqui · **M**

- **Schema:** nada muda **porque as colunas de configuração que esta etapa lê nascem na Etapa B**
  (`auditIntervalMonths`, `auditWarningDays`) — ver a ordem de commits no fim. A primeira versão
  deste plano as punha na Etapa E e mandava rodar D antes: o relatório de auditoria não compilaria.
- **Nasce:** `server/domain/report/` (um use-case por relatório), `src/pages/relatorios/` com uma aba
  cada, `src/domain/report/report.queries.ts`.
- **Regra:** relatório é leitura agregada — **nenhum relatório escreve**.

Quatro abas: **Depreciação** (totais + a curva em `recharts`, primeiro import da biblioteca no
projeto), **Garantias e EOL** a vencer em N dias, **Auditorias** (vencidas / a vencer / nunca) e
**Manutenções** (custo acumulado, em aberto, por tipo). *"Auditoria vencida"* é
`lastAuditAt IS NULL OR lastAuditAt < :corte`, com o corte calculado na aplicação a partir de
`auditIntervalMonths`: usa o índice de `lastAuditAt` e não envelhece quando o intervalo global muda
(D53). O `recharts` entra por import **da própria página**, nunca do `App.tsx`, e a série vem pronta
do servidor (D55). **A F10 herda esta moldura** — export, seletor de colunas e report builder entram
*nesta* página, não numa segunda.

**Todo relatório de prazo exclui ativo fora do parque** (D127): `retiredAt: null` e o `deletedAt` da
extension. Um notebook vendido com garantia acabando não é um aviso, é ruído — e o precedente já está
fixado em `coverage-stats.usecase.ts` (`const vivos = { retiredAt: null }`, com a nota "ativo vendido
não é fantasma").

---

## Etapa E — Alertas: `Alert`, o job e os canais · **G**

- **Schema:** enum `AlertType` (`GARANTIA_VENCENDO`, `EOL_PROXIMO`, `AUDITORIA_VENCIDA`,
  `MANUTENCAO_EM_ABERTO`) e model `Alert`: `type`, `assetId?` (**FK, `Cascade`**), `dueAt`,
  `dedupeKey String @unique`, `payload Json?`, `createdAt`, `readAt?`, `notifiedAt?`.
  `AppSetting` ganha `alertsEnabled`, `alertEmails String[]`, `alertWebhookUrl?`,
  `warrantyAlertDays`, `eolAlertDays`, `alertHour`, `maintenanceOpenDays` e `timezone`.
  **`lastAlertRunAt` NÃO existe** — é o D79, e a janela mora em `JobRun`.
- **Nasce:** `server/domain/alert/` (maestro, controller, `jobs/daily-alerts.job.ts`,
  `run-daily-alerts` e `notify-alerts` use-cases, `list-alerts` com a marcação de leitura,
  `helpers/alert-dedupe.helper.ts`, `helpers/alert-message.helper.ts`),
  `server/core/webhook/` (`webhook.ts` + `destino-seguro.ts`, a allowlist),
  `server/core/time/local-day.ts` (em que fuso é "hoje"),
  `server/domain/settings/helpers/lifecycle-settings.helper.ts`, `GET|PUT /api/settings/alerts`,
  `src/pages/components/AlertBell.tsx` e a aba Alertas de `/relatorios`.
- **Regra:** o job acorda de hora em hora — **o mesmo período dos outros três jobs**, não os 15 min
  da primeira versão —, tenta tomar a janela do dia na linha `'alertas-diarios'` de `JobRun` e só a
  rodada que ganhar executa (D56 + D79). A janela começa **hoje às `alertHour`, no fuso configurado**
  (D123), e antes dela o job não faz nada.

```ts
// O helper JÁ EXISTE — server/core/jobs/claim-window.ts. A fase só acrescenta a linha.
await executarUmaVezPorJanela('alertas-diarios', inicioDaJanelaDeAlertas(config), async () => {
  const { criados } = await rodarAlertasDiarios();
});
```

`dedupeKey` tem **uma regra por tipo** (D125), porque os quatro sinais não têm a mesma origem: dois
são datas do ativo, um é a ausência de um fato e o outro é uma linha de outra tabela. Gravado por
`createMany({ skipDuplicates: true })`: rodar duas vezes no mesmo dia não duplica alerta.

O e-mail e o webhook saem **depois do commit**, para as linhas com `notifiedAt IS NULL` — as desta
rodada e as que uma falha de SMTP deixou para trás (D126). `startDailyAlertsJob`/`stop…` entram no
`server.ts` e no `onShutdown`, como os outros três.

---

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/ciclo-de-vida.md`](../decisoes/ciclo-de-vida.md) — **D52–D57 e D123–D128**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Riscos e armadilhas

**`min` antes de `max` no valor contábil.** O `beforeWrite` de `depreciation.spec.ts` limita o piso
`PERCENT` a 100%, mas **`AMOUNT` não tem teto**: um piso de R$ 5.000 num mouse de R$ 50 devolve valor
contábil *maior* que o custo. A fórmula é `min(custo, max(piso, …))` — os dois lados.

**`Decimal` morre no primeiro `Number()`.** Custo e depreciação em `Prisma.Decimal` de ponta a ponta,
convertendo só na borda — `z.coerce.number()` no caminho reintroduz o centavo que o `Decimal` existe
para impedir (armadilha nº 7 da F1, em outra roupa). O construtor a usar é
`valorMonetarioOpcional`, que já mantém a string.

**E-mail dentro da `$transaction` é e-mail enviado num rollback.** Grava, commita, **depois** envia e
marca `notifiedAt`. É o contrato do D86, e o `mailer` já foi escrito assim.

**A extension de soft delete não escopa `maintenances` nem `audits`.** Elas não têm `deletedAt`, então
um ativo na lixeira continua somando custo no total. Filtrar por `asset: { deletedAt: null }`
**explicitamente**: relação aninhada não herda escopo (D8, verificado).

**O `AlertBell` entra num menu que já tem dez itens.** `AppHeader.tsx` mostra Telemetria, Ativos,
Postos, Estoque, Licenças, Descobertas, Usuários, Tokens e Config, num `nav` que já é
`hidden md:flex`. Três entradas novas mais o sino passariam de treze, e a F10 acrescenta mais. A fase
entra com **duas** entradas de menu — **Manutenções** e **Relatórios** — e a auditoria por posto é
alcançada **de dentro de Postos** (é lá que a unidade de trabalho está) e por `/auditorias`, que
existe como rota mas não ocupa lugar na barra. O sino fica no cabeçalho, do lado do usuário, onde
sino é sino.

**O relatório de auditoria muda de tamanho quando o D124 entrar em operação.** É esperado, e é o
ponto: toda máquina com agente e serial conferido passa a contar como auditada no dia em que o job
rodar. O que o D124 garante é que isso não aconteça por hostname.

---

## Verificação

A verificação é a **suíte**, não uma lista de `curl` — este é o item mais desatualizado da primeira
versão, que dizia "não há suíte". Nasce `tests/ciclo-de-vida/`:

| Arquivo | O que ele impede de voltar |
|---|---|
| `manutencao.test.ts` | manutenção com custo em string atravessa e volta como string; 409 ao apagar fornecedor com manutenção (o quinto termo do `countUsages`); a listagem global **não** soma ativo na lixeira |
| `auditoria.test.ts` | **a amarra da fase (D52)**: auditar na Mesa 2 um ativo entregue à Mesa 1 move `locationId` e **não** toca a `Assignment`; `divergenciaDePosse` e `postoVago` ligam nos casos certos; `lastAuditAt` avança e `nextAuditAt` não existe |
| `valor-contabil.test.ts` | piso `AMOUNT` acima do custo **não** devolve valor maior que o custo; os três baldes (`null` ≠ 0) |
| `alertas.test.ts` | a idempotência do `dedupeKey` (N criados na primeira rodada, 0 na segunda); ativo nunca auditado gera **um** alerta e não um por dia (D125); duas manutenções abertas no mesmo ativo geram **dois** alertas |
| `alertas-recorte.test.ts` | ativo **retirado** não gera alerta e ativo na lixeira sai da central (D127); desligado a rodada não grava nada; o webhook `http` e o fuso inválido são 422. Arquivo separado porque `POST /api/alerts/run` tem teto de 10/min e o harness cria uma instância por ARQUIVO — o rate limit conta por instância |
| `webhook.puro.test.ts` | a allowlist do D126 recusa `http://`, loopback, link-local e RFC 1918 |
| `fuso.puro.test.ts` | ⚠️ **acrescentado pela revisão**: a travessia hora de parede ↔ instante UTC (D123), incluindo as duas viradas de horário de verão. Não existia |
| `auditoria-pelo-agente.test.ts` | ⚠️ **acrescentado pela revisão**: os seis "nãos" do D124 — serial normalizado casa, serial diferente não gera linha nenhuma, uma por dia, sem `locationId`, sem as divergências e sem `ActivityLog`. Nenhum estava coberto |

~~A janela do job **já está coberta** por `tests/jobs/janela.test.ts` — não se refaz.~~

⚠️ **Esta frase estava errada.** `tests/jobs/janela.test.ts` exercita `inicioDoDia()`, que usa o
relógio do PROCESSO. As funções que esta fase criou — `inicioDoDiaLocal` e `inicioDaJanelaLocal` — são
outras, e não tinham teste nenhum. `fuso.puro.test.ts` cobre as duas.

Mais a reconstrução do zero (`../referencia/arquitetura.md`): a fase muda `AppSetting`, cria **três** tabelas
(`maintenances`, `audits`, `alerts`) e duas colunas (`asset_models.depreciationId`,
`assets.lastAuditAt`).

**Uma prova que não é comando:** deixar o `tsx watch` recarregar três vezes no mesmo dia e conferir
em `alerts` que não houve duplicata — com `setInterval` de 24 h não haveria alerta nenhum.

---

## Perguntas em aberto

- **Intervalo de auditoria por categoria.** Fica de fora, com o caminho pronto
  (`Category.auditIntervalMonths`, nullable). Só entra se um cliente pedir ciclos diferentes.
- **Quem recebe o alerta quando o ativo está num posto vago?** Hoje o alerta é da frota. A resposta
  natural é o gestor da localidade, que só ganha função na **F11** (`resolverEscalonamento()`).
- **Licença e estoque na central.** O caminho é o alvo polimórfico do D128, e o gatilho é alguém
  querer e-mail de licença vencendo.

---

## Ordem de commits

```
A: feat(db): Maintenance — histórico de serviço do ativo e a tela global
B: feat(itam): Audit — conferência de localização, posse e ocupação, e a auditoria por posto
C: feat(itam): valor contábil calculado (depreciação linear com piso)
D: feat(web): /relatorios com depreciação, garantias, auditorias e manutenções
E: feat(alert): central de alertas, job diário, webhook e envio SMTP
```

**A ordem só fecha porque `auditIntervalMonths` e `auditWarningDays` nascem na Etapa B**, junto da
auditoria de que elas falam — e não na E, como a primeira versão dizia. Com elas na E, o commit D não
compilaria: o relatório de auditorias vencidas lê o corte da configuração.

O lint e a suíte têm que passar em cada commit.

---

## O que a execução mudou

Sete coisas que o plano não previa e que a árvore obrigou. Ficam aqui, e não reescritas acima, porque
a diferença entre o que se planejou e o que se construiu é a informação mais útil para a próxima fase.

**1. O fuso virou parâmetro de uma função que já existia, e mudou um job da F4.** O D123 previa
`AppSetting.timezone`; a execução mostrou que `shift.helper.ts` (F7) já tinha `FUSO_PADRAO`
embutido e que `inicioDoDia()` (F4) usava o relógio do processo. As duas coisas mudaram junto:
`core/time/local-day.ts` nasceu com a travessia "hora de parede ↔ instante UTC", `horaLocal` passou a
delegar para ela, o fuso viaja na configuração da descoberta (uma leitura por rodada do job, não uma
por máquina) — e **o lembrete de atraso da F4 passou a usar a janela do fuso**, porque ele tinha o
mesmo defeito que o D123 descreve.

**2. `ActivityAction` ganhou três valores: `SERVICE`, `SERVICE_CLOSE` e `AUDIT`.** O plano não disse
como a manutenção apareceria na aba Histórico do ativo, e a resposta é a do `INSTALL`: gravar em
`entityType: 'Asset'` — um log pendurado numa entidade que a tela não abre não aparece em consulta
nenhuma. A manutenção grava **duas** linhas (uma na manutenção, uma no ativo) e nenhuma é cópia da
outra. **A auditoria pelo AGENTE não grava log nenhum**: ela roda para toda máquina vinculada, todo
dia, e uma linha por ativo por dia afogaria a trilha — o registro dela é a linha em `audits`.

**3. A depreciação acumulada precisou de um terceiro total.** `custoTotal − valorAtualTotal` parecia
certo e estava errado: um ativo com preço e **sem** regra tem custo e não tem valor contábil, então a
subtração contaria como "depreciado" o preço de todo equipamento sem regra — um parque sem nenhuma
regra cadastrada apareceria 100% depreciado. O relatório passou a expor `custoDepreciavel`, e a
acumulada sai dele.

**4. A janela dos alertas de prazo ficou simétrica.** "Garantia vencendo nos próximos 30 dias" sem
piso no passado inclui toda garantia já vencida — e na primeira rodada de um sistema com anos de
histórico isso são centenas de alertas permanentes sobre 2022 (a central não tem lixeira). A janela
virou N dias para cada lado; o passado inteiro continua no relatório, que é quem responde "quantas
já venceram".

**5. `notifiedAt` virou a fila, e isso substituiu um outbox.** O critério de envio não é "criado nesta
rodada", é "ainda não entregue". Os dois coincidem no dia normal e divergem no dia que importa — o
SMTP fora do ar. Sem tabela de outbox e sem política de retentativa: a coluna nula **é** o estado
pendente, e o job diário **é** a retentativa.

**6. O `recharts` saiu do chunk de entrada.** O plano dizia "import da própria página, nunca do
`App.tsx`" — e isso não basta: `App.tsx` importa a página, então a biblioteca entra no bundle de
entrada de qualquer jeito. O gráfico virou `lazy()`, e o chunk de entrada caiu de 1.030 kB para
694 kB, com os 336 kB do gráfico descendo só para quem abre a aba.

**7. A verificação virou seis arquivos, e um deles não fala com o banco.** `webhook.puro.test.ts` testa
a allowlist de destino (D126) como função pura: é a única coisa da fase que um atacante alcança, e um
teste que precisasse subir a aplicação para prová-la rodaria devagar e acabaria pulado. Os alertas
ficaram em **dois** arquivos porque `POST /api/alerts/run` tem teto de 10/min e o rate limit conta por
instância do Fastify — o harness cria uma por arquivo.

> ⚠️ **E o arquivo puro não estava puro na prática.** O `globalSetup` do vitest roda em TODA
> invocação, então rodá-lo sozinho morria com `PrismaClientInitializationError` antes do primeiro
> `it` — o oposto do que separá-lo pretendia. A revisão dividiu a suíte em dois projetos
> (`puro` e `banco`) e o arquivo ganhou o sufixo `.puro`; ver `../referencia/testes.md`.

### O que ficou pendente na escrita da fase — e como fechou

- **A suíte não rodou quando a fase foi escrita.** O Postgres de desenvolvimento estava fora do ar
  (`localhost:3002` recusando conexão, sem daemon de contêiner), então as quatro migrations foram
  escritas **à mão** em vez de geradas por `migrate diff`, e os arquivos de `tests/ciclo-de-vida/`
  **não foram executados**. O que foi verificado ali: `prisma validate`, `prisma generate`, `tsc` nos
  quatro projetos, `eslint` na árvore inteira, o build de produção, e as funções puras exercitadas
  direto (35 asserções).
- ✅ **FECHADO na revisão.** O contêiner subiu e as duas coisas foram provadas: as quatro migrations
  aplicam (`migrate deploy`) e `migrate diff` entre o banco resultante e o `schema.prisma` devolve
  **"No difference detected"** — as migrations à mão produzem exatamente o schema declarado, que era o
  risco nº 1 da fase. E a suíte inteira passa: **46 arquivos, 419 testes**. Como o harness faz
  `CREATE DATABASE` + `migrate deploy` num banco descartável, a reconstrução do zero que a
  `../referencia/arquitetura.md` pede está provada junto.
- ⚠️ **`prisma/migrations/migration_lock.toml` não existe no repositório.** É anterior à F8 e o
  `migrate deploy` não precisa dele — mas sem o arquivo, `migrate diff --from-migrations` recusa a
  rodar ("Could not determine the connector from the migrations directory"). Quem quiser comparar
  *migrations × schema* sem um banco de pé precisa criá-lo.

---

## Revisão da fase — o que a releitura do código encontrou

Feita depois de a fase fechar, contra a árvore, com `tsc`, `eslint`, o build, as funções puras
exercitadas direto — e, no fim, **a suíte inteira contra Postgres de verdade**, que era o que a fase não
tinha conseguido rodar.

**Onze correções no código de produção**, em três famílias, mais **quatro defeitos de teste** que só
apareceram quando a suíte finalmente executou (no fim desta seção). As decisões D52–D57 e D123–D128
seguem todas de pé: nenhuma correção mudou uma decisão, e três delas existem porque o código **não
fazia o que a decisão dizia** — o que é o tipo de divergência que só uma releitura pega, porque
compila, passa no lint e parece certo.

### Família 1 — número errado em silêncio, que é o pior tipo num relatório

**1. A curva de depreciação contava ativo que ainda não havia sido comprado, a custo cheio.**
`calcularValorContabil` com `agora` anterior à compra devolve `mesesDecorridos: 0`, e zero mês
decorrido é *"não depreciou nada"* — o valor é o preço integral. O ponto de doze meses atrás somava o
custo de tudo que foi comprado desde então. Sistemático e sempre para o mesmo lado: quanto mais
compras recentes, mais inflado o passado, e a curva ficava achatada exatamente onde deveria mostrar a
frota crescendo. Cada ponto passou a pular quem não era patrimônio naquele mês, e ganhou o campo
`ativos` — sem ele, um trecho ascendente parece defeito de cálculo em vez de compra.

**2. "Garantias a vencer" podia não conter nenhuma garantia a vencer.** A consulta tinha teto
(`lte: hoje + N`), **nenhum piso no passado**, ordenação crescente e `take: 500`. Num parque com anos
de histórico as vagas eram tomadas pelas garantias mais antigas, e o motivo da tela ficava de fora. O
job de alertas já nascera com a janela simétrica (item 4 de *O que a execução mudou*); o relatório
não, e agora os dois usam **a mesma função** — `haDiasUTC`, em `report-scope.helper.ts`. O passado
profundo não foi escondido: virou um `count` ao lado da lista.

**3. Os indicadores dos relatórios saíam de `.length` de listas capadas em 500.** Ao lado de `emDia` e
`total`, que são `count` de verdade. Num parque com mais de quinhentas auditorias vencidas o número
travava em "500", os quatro paravam de fechar com o total, e nada na tela dizia que havia corte. Os
três baldes de auditoria e as duas listas de prazo ganharam `count` próprios, do **mesmo `where`** da
lista, mais um aviso de amostra quando os dois divergem.

### Família 2 — o código não fazia o que a decisão dizia

**4. A auditoria pelo AGENTE marcava as duas divergências que o D124 diz que ela não marca.** O
caminho do job passava a posse lida do banco, `calcularDivergencias` comparava `Asset.locationId` com
o alvo da `Assignment`, e a linha diária nascia afirmando `divergenciaDePosse` que **ninguém
observou** — derivada de estado de cadastro, não de alguém ter olhado a mesa. Era o D52 furado por
dentro de um job. A regra passou para dentro de `registrarAuditoriaNaTransacao`, decidida pelo
`method`: quem chama não consegue mais errar. De brinde, a leitura de posse em lote saiu do job — era
uma consulta por rodada para um valor que a função descarta.

**5. Havia TRÊS definições de "no parque", e a da auditoria era a mais frouxa.** `report-scope.helper.ts`
usava `retiredAt: null` + `status.type != ARCHIVED`; `audit-location` e `audit-by-agent` usavam só
`retiredAt: null`. Consequência: um ativo `ARCHIVED` entrava na conferência de posto, era auditado, o
agente avançava o `lastAuditAt` dele todo dia — e ele **nunca aparecia em relatório de auditoria nem
gerava alerta**. Conferi-lo era trabalho que o relatório não via. É o D16 numa constante, e a resposta
mora agora em `asset/helpers/asset-scope.helper.ts`, no domínio dono das colunas, importada pelos
três. O job do agente também ganhou `deletedAt: null` à mão: ele alcança o ativo por relação
aninhada, e relação aninhada não herda o escopo da extension (D8).

**6. `HTTPS://` maiúsculo era recusado na borda e aceito no runtime.** O `refine` do schema fazia
`startsWith('https://')`, sensível a caixa; esquema de URL é case-insensitive por especificação, e
`destino-seguro.ts` usa `url.protocol`. As duas metades do D126 discordavam, e a borda era mais
estrita pelo motivo errado — dizendo *"somente https é aceito"* a quem acabou de digitar https.

**7. Encerrar e reabrir pelo PUT não deixava rastro no histórico do ativo.** `closeMaintenance` grava
`SERVICE_CLOSE` em `entityType: 'Asset'`; o PUT alcança a mesma coluna e não gravava nada lá, nem
passava pelo 409 de *"já encerrada"*. Consertado pelo lado do **log** e não proibindo o campo —
corrigir uma data digitada errada é edição legítima —, comparando a transição e não o corpo recebido.

**8. Trocar `alertHour` no meio do dia disparava uma segunda rodada.** Rodou às 8h (`lastRunAt` =
08:05), alguém troca para 20, e às 20h o `updateMany` casa e o e-mail do dia sai outra vez. O
`dedupeKey` protege o banco de duplicar linha; não protege a caixa de entrada. A janela tomada em
`job_runs` passou a ser a **meia-noite local**, e `alertHour` ficou sendo só a guarda de *quando* a
rodada pode começar — a pergunta que o `job_runs` responde voltou a ser "já rodou HOJE?", que não
depende de uma configuração que alguém pode mexer entre duas tentativas.

**9. `marcarTodosComoLidos` marcava mais do que o sino mostra.** Sem o `DE_ATIVO_VIVO` das outras
quatro consultas do arquivo, ele alcançava alertas de ativo na lixeira e devolvia um `count` maior que
o `naoLidos` que a tela acabou de exibir.

**10. `encontrados: [X, X]` gravava duas linhas de auditoria para o mesmo ativo.** O schema recusa o
mesmo id nas **duas** listas (é contradição); o id repetido dentro de uma passava, e a segunda linha
nascia dizendo que o ativo veio do lugar onde a primeira acabou de o colocar. Um `Set` no `ids`.

### Família 3 — custo que a fase não precisava pagar

**11. `ASSET_SELECT` carregava a regra de depreciação para nove consumidores que não a usam.** A
justificativa escrita era evitar N+1 *"na listagem e no relatório da frota inteira"* — mas a listagem
não calcula valor contábil e o relatório tem `SELECT` próprio. A listagem, a busca por série, a tela
do posto, as posses do colaborador e os seis use-cases de escrita ganhavam um `LEFT JOIN` em
`depreciations` e quatro colunas por um número que nenhum deles mostra. A regra foi para
`ASSET_DETAIL_SELECT`, com o único leitor que a usa.

E o relatório de depreciação ganhou **teto na tabela** (não nos totais, que continuam da frota
inteira) e um filtro antes do laço da curva: só os depreciáveis entram, o que troca 12 × frota por
12 × frota depreciável.

### O que a revisão mediu

`tsc` nos quatro projetos, `eslint` na árvore inteira, o build de produção — entrada em **694,51 kB**
com os 336 kB do gráfico em chunk próprio, o *code splitting* da fase preservado —, **33 asserções**
minhas contra as funções puras (incluindo as duas viradas de horário de verão de `America/New_York`)
e, depois de o contêiner subir, **a suíte inteira: 46 arquivos, 419 testes, tudo verde**.

23 dessas asserções rodam **sem banco nenhum**, em dois arquivos `*.puro.test.ts` — a allowlist de
webhook (que antes exigia Postgres, ver `../referencia/testes.md`) e o fuso, que não tinha teste nenhum.

### Os quatro defeitos que só a suíte encontrou

Nenhum era de produção, e é por isso que eles merecem estar escritos: os quatro estavam **nos testes**,
e um deles era uma correção minha mal calibrada.

**1. `auditoria.test.ts` falhava em sete dos oito `it`, e nunca chegava a testar nada.** Ele monta o
cenário de posse dentro de cada `it`, e `cenarioDePosse` cria fabricante, posto e dois colaboradores
com nomes FIXOS — `Manufacturer.name` e `Location.name` são `@unique`, e o e-mail tem índice único
parcial. Da segunda chamada em diante era 409 "Registro já existe" vindo de dentro do fixture. A
função ganhou um `sufixo` opcional, **com padrão vazio**: quatro testes já passando dependem dos nomes
literais (`invariantes/posse.test.ts` compara `['Ana Lima', 'Laura Souza']`, `aceite/fluxo.test.ts`
confere o `signerName`, `listagens/historico-da-pessoa.test.ts` espera `locationLabel === 'Mesa 1'`),
e trocá-los por gerados quebraria quatro para consertar um.

**2. O sufixo legível não cabia num e-mail.** `laura (posto-vago)@teste.local` é 422 no zod da borda, e
o teste morria dizendo "e-mail inválido" — que não tem relação com o que ele testa. A sanitização
passou para dentro do fixture, pela mesma razão do `method` na auditoria pelo agente: a regra mora onde
ninguém pode esquecer dela, porque quem chama é quem erra.

**3. Três asserções de status estavam simplesmente erradas.** `DELETE /api/assets/:id` devolve **200**
com `{ success: true }` — apagar é `UPDATE`, e quem chama quer saber que o `UPDATE` casou;
`tests/estoque/operacoes.test.ts` já afirmava isso. E `POST /api/endpoints/:id/link` devolve **201**,
porque o vínculo cria a ligação. Duas eram da fase, uma era minha.

**4. A minha correção da curva quebrou um invariante — e a suíte o pegou.** Ancorar cada ponto no
PRIMEIRO dia do mês conserta o ativo-comprado-depois, mas faz o último ponto valer o dia 1º enquanto o
indicador ao lado dele diz "Valor contábil hoje": os dois passam a discordar por um mês de
depreciação, exatamente onde o leitor os compara. Pior, um ativo comprado no dia 15 sumia do ponto do
próprio mês da compra. A série virou de **fechamento** — cada ponto é o último instante do seu mês, e o
mês corrente fecha em `agora` —, e o teste ganhou a asserção que faltava:
`curva[11].valor === valorAtualTotal`. O comentário de `CurvaDeDepreciacao.tsx` declarava esse
invariante desde a F8 e nada o verificava.
