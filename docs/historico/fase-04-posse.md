# Plano de implementação — Fase 4: checkout e checkin

> Plano **prospectivo** da Fase 4 do [`../ROADMAP.md`](../ROADMAP.md). Contrato:
> [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md) · porquês:
> [`../decisoes/posse.md`](../decisoes/posse.md) · o que o sistema recusa:
> [`../referencia/invariantes.md`](../referencia/invariantes.md) · camadas: [`../referencia/arquitetura.md`](../referencia/arquitetura.md).
> **Parte desta fase já está em execução** — ver *O que já entrou*.
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias

## Objetivo

Fechar o ciclo de empréstimo em cima das três camadas de posse. O que já existe é a
**mecânica** — abrir e fechar `Assignment`, ocupar e desocupar posto, resolver
responsáveis. Esta fase acrescenta o que a transforma em **operação**: aceite com
EULA e assinatura, PDF do termo, e-mail, lembrete de atraso, entrega em massa,
perfil do colaborador e um desligamento que encerra **as duas** camadas — devolver
os ativos diretos e deixar as ocupações de posto abertas é desligar pela metade.

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **A base de posse** | `Assignment`, `LocationOccupant`, `AssignmentTarget` e os dois índices parciais — já aplicados (ver abaixo) |
| **F1** | `Category.requireAcceptance`, `Category.eulaText` e `Category.checkinEmail` já existem e nunca foram lidos por nada |
| **F2, Etapa G** | o armazenamento de arquivo: o PDF do termo e a imagem da assinatura não têm onde morar sem ele |
| **F3** | para `checkoutById`/`checkinById` deixarem de ser nulos. **Não bloqueia** — sem login a entrega funciona e o histórico fica sem ator (D24) |
| **`nodemailer`, `pdfkit`** | nenhum instalado; nenhum exige Chromium, e isso é requisito |

## O que já entrou

| Peça | Onde |
|---|---|
| `Assignment` polimórfico + `AssignmentTarget` e `LocationOccupant` com `shift` | `prisma/schema.prisma` |
| **Uma posse aberta por ativo** e **uma ocupação aberta por (posto, pessoa)** | índices parciais em `20260923011728_posse_e_ocupacao` |
| `IN_USE` como tipo próprio de `StatusLabelType`, logo após `DEPLOYABLE` | `20260923003100_status_em_uso` |
| Invariante estado × posse | `asset/use-cases/assert-status-posse.usecase.ts` |
| Ocupação: adicionar, encerrar, listar por local e por pessoa | `server/domain/occupancy/` |
| O contrato de posse do front, com `PosseResolvida.postoVago` | `src/domain/shared/posse.types.ts` |
| As quatro invariantes documentadas e provadas em SQL | `../referencia/invariantes.md`, `prisma/verificacoes/` |

**Em execução agora:** o domínio `assignment` (checkout/checkin polimórfico) e a
resolução de responsáveis — assumidos prontos aqui, e não replanejados.

## O que entrou (esta leva)

As Etapas **D** (parte), **E**, **F** e **G** — a metade da fase que **não**
depende de biblioteca nenhuma. O que ficou de fora está na seção seguinte, e não
por esquecimento.

### Etapa G — Desligamento (D32)

| Peça | Onde |
|---|---|
| `POST /api/users/:id/offboard` | `user/user.maestro.ts` → `user/use-cases/offboard-user.usecase.ts` |
| `GET /api/users/:id` (perfil, com o placar de posse aberta) | `user/use-cases/get-user.usecase.ts` |
| As duas contagens e a frase do 409, num lugar só | `user/use-cases/count-user-posse.usecase.ts` |
| `DELETE /api/users/:id` responde **409** contando as duas pontas | `user/use-cases/delete-user.usecase.ts` |
| As três escritas da devolução, compartilhadas pelo checkin e pelo desligamento | `assignment/use-cases/close-assignment.usecase.ts` |

**Uma transação, três passos, e o do meio é o que tem dentes:** devolve toda
`Assignment` aberta com alvo `USER`, **encerra toda `LocationOccupant` aberta**
e só então grava `terminatedAt` + `isActive = false`. Cada passo deixa a sua
linha no `ActivityLog` — `CHECKIN` por ativo, `END` por ocupação e um `OFFBOARD`
na pessoa, com o placar — **na mesma transação**. `OFFBOARD` é a única palavra
nova no union `ActivityAction`.

**`terminatedAt` nunca é `deletedAt`.** São colunas diferentes porque são fatos
diferentes: quem saiu da empresa continua no cadastro, com todo o histórico de
posse apontando para ele; a lixeira é para cadastro criado errado. O
desligamento não escreve `deletedAt` em lugar nenhum.

**O 409 do `DELETE` é obrigatoriamente de aplicação.** `Assignment.targetUserId`
e `LocationOccupant.userId` são `onDelete: Restrict`, mas apagar um usuário aqui
é `UPDATE deleted_at`: o Postgres não vê `DELETE` nenhum e a rede **não existe**.
A contagem roda **dentro** da transação que apaga — contar fora deixaria uma
janela em que uma entrega nova passaria.

**A contagem e a lista contam a MESMA coisa** — as duas filtram
`asset: { deletedAt: null }`, explicitamente. Sem isso, um ativo mandado para a
lixeira com a posse ainda aberta contaria no 409 e **não** apareceria no
`holdings` (que é escopado): o operador leria "responde por 1 ativo" ao lado de
uma lista vazia e não teria o que devolver — e o desligamento, exigido pelo 409,
estouraria com P2025 ao tentar atualizar um ativo que a extension não enxerga.
Colaborador travado para sempre, em duas rotas que pareciam certas. Provado em
runtime: com o ativo na lixeira, `holdings` e `posseAberta` batem em zero, o
desligamento passa e o `DELETE` também.

**Duas portas fecharam junto, e uma depende da outra.** Desligar duas vezes
responde 409 (reescrever `terminatedAt` apagaria a data real da saída), e isso
só é seguro porque o **checkout passou a recusar entrega a quem está
`isActive = false`** — sem essa recusa, um desligado voltaria a acumular posse e
o 409 trancaria a única operação capaz de limpá-la.

### Etapa E — Checkout em massa (D31)

`POST /api/assets/bulk-checkout` (`assignment/use-cases/bulk-checkout.usecase.ts`),
rota estática irmã de `/api/assets/:id/checkout`. Corpo = o do checkout **mais**
`assetIds`; o schema é `checkoutSchema.extend(...)`, então a coerência do alvo
continua validada em um lugar só.

Cada ativo roda na **sua** transação — `checkoutAsset` abre a dele — e o retorno
é `{ total, ok: [...], falhas: [{ assetId, erro }] }`, com **200 sempre**,
inclusive quando todas falham: o pedido foi processado, e o que o operador
precisa ver é a lista de motivos, não um 409 que os esconde atrás de uma frase.

**É o oposto declarado do bulk da F2, e não é inconsistência.** Lá é **uma**
intenção aplicada a N linhas ("mova estes 40 para Recife") — metade aplicada é
um estado que ninguém pediu. Aqui são **N entregas independentes**, cada uma com
o seu próprio motivo para falhar; um kit de 8 em que 1 está com outra pessoa
ainda entrega 7, e desfazer os 7 seria falso — as entregas aconteceram no mundo
físico antes de virarem linha.

Processamento **sequencial**: N transações em paralelo esgotam o pool do Prisma e
passam a falhar por timeout — uma falha que nada tem a ver com a entrega e que
entraria no relatório como se tivesse. Ids repetidos são deduplicados antes, para
a própria seleção não fabricar um "já está entregue".

### Etapa D (parte) — Itens vencidos

`GET /api/assignments/overdue` (`assignment/use-cases/list-overdue.usecase.ts`),
com `diasDeAtraso` (`helpers/overdue.helper.ts`, `Math.floor` — vencido hoje é
**0**, não 1) e os responsáveis resolvidos em lote, para o posto aparecer com
Laura e Ana e não só com o nome da mesa.

Mora em `/api/assignments`, e não em `/api/assets`: o ativo não tem prazo — quem
tem é a entrega. Entrega **sem** `expectedCheckinAt` nunca vence, e quem fecha
essa ponta é o desligamento, não este relatório. O `asset: { deletedAt: null }` é
explícito porque `assignments` não tem `deletedAt` e a extension não alcança
relação aninhada — é o segundo ponto cego do soft delete, e ele cai aqui.

Teto de 100 linhas com `total` contando o universo inteiro: é lista de trabalho,
não grade paginada.

### Etapa F — Perfil do colaborador

`src/pages/gestao-usuario/detalhe/` (`index.tsx`, `hooks/useUserDetail.ts`,
`components/OffboardModal.tsx`), na rota `/users/:id`; o nome na listagem virou o
link. Três listas, e o fato de serem três é o conteúdo: **em nome da pessoa**
(sai com uma devolução), **pelos postos que ela ocupa** (sai com a escala) e **os
postos ocupados** — estes últimos inclusive os que não têm ativo nenhum, porque
é uma ocupação aberta e o desligamento precisa encerrá-la.

O modal de desligamento mostra **exatamente o que vai acontecer** antes de
confirmar: a lista de ativos que serão devolvidos, a de postos que serão
desocupados, o aviso de que o cadastro **não** vai para a lixeira e — quando há
ativos por posto — o aviso de que **eles não são devolvidos**, com as etiquetas.
Depois de confirmar, o mesmo modal vira o relatório do que foi fechado.

### Frontend da entrega em massa

`src/pages/gestao-itam/components/BulkCheckoutModal.tsx` e `useBulkCheckout()` em
`src/domain/assignment/assignment.queries.ts`. O modal é **autocontido** — recebe
`assets`, `onClose` e um `onConcluido` opcional — porque a listagem é de outra
fatia de trabalho e este fluxo precisa entrar lá com uma linha. Ele mostra a
seleção antes (entregar 40 ativos para a pessoa errada só se desfaz com 40
devoluções à mão) e o relatório de ok/falhas depois, cada recusa com o seu
motivo.

Ele recebe **ids**, não objetos: a seleção da listagem atravessa a paginação
(`useBulkSelection`), e receber só os ativos da página entregaria menos do que o
operador marcou, em silêncio. Os objetos entram à parte, opcionais, só para
escrever etiqueta no lugar de uuid. O que falta na listagem é a montagem:

```tsx
const selecao = useBulkSelection(assets.map((a) => a.id));   // já existe
const [entregaEmLote, setEntregaEmLote] = useState(false);

{entregaEmLote && (
  <BulkCheckoutModal
    assetIds={selecao.ids}
    assets={assets}                       // só a página atual; opcional
    onClose={() => setEntregaEmLote(false)}
    onConcluido={selecao.limpar}
  />
)}
```

### Como foi verificado

Servidor na porta 3095 contra um banco descartável (`sentinel_audit_f4`,
migrations + seed do zero), com sessão real — a API está fechada por padrão desde
a F3.

| O que se provou | Resultado |
|---|---|
| `bulk-checkout` de 3 ativos para a Laura | 3 `ok`, 0 falhas |
| O MESMO lote outra vez, com 1 ativo novo no meio | **1 `ok` e 2 `falhas`** — "Este ativo já está entregue" |
| Campo desconhecido no corpo do lote | 422 (o `.extend` preservou o `strictObject`) |
| Id repetido na seleção | dedupe: `total: 1`, 1 `ok` |
| Laura (Manhã) e Ana (Tarde) na Mesa 1, com um ativo entregue ao posto | as duas resolvidas como responsáveis |
| `DELETE /api/users/:id` com 4 ativos e 1 posto | **409** "responde por 4 ativos e ocupa 1 posto" + as duas contagens nos `details` |
| `POST /api/users/:id/offboard` | 4 devolvidos, 1 ocupação encerrada, `isActive: false`, `terminatedAt` preenchido |
| A Mesa 1 depois do desligamento | responsável = **só a Ana** — a Laura saiu da Camada 3 |
| Segundo `offboard` | 409 "já foi desligado" |
| `checkout` para a desligada | 409 "está desligado(a) e não pode receber equipamento" |
| `DELETE` depois do desligamento | 200 |
| `GET /api/assignments/overdue` | 1 linha, `diasDeAtraso: 3`; a entrega com prazo futuro e a sem prazo **não** apareceram |

Em SQL, por fora da API: pontas abertas da Laura = **0**; `terminatedAt` marcado
com `deletedAt` nulo (só a exclusão posterior o preencheu); posses abertas da
Mesa 1 = **2** (D28 — encerrar a ocupação **não** fecha a posse do posto); zero
ativos com duas posses abertas; zero `assignedToId` fora do caso `USER`; e o
`ActivityLog` com 4 `CHECKIN` + 1 `END` + 1 `OFFBOARD`.

## O que ficou pendente — e onde foi fechado

> **Tudo desta seção entrou no fechamento conjunto das F2, F3 e F4** (levas 1B, 1C, 3 e 4) —
> ver [Fechamento da F4](#fechamento-da-f4--o-aceite-o-correio-e-as-duas-dívidas-sem-migration),
> no fim deste arquivo. A lista fica como registro do que faltava quando a fase parou.

**Aceite/EULA, assinatura, PDF e e-mail (Etapas A, B, C e o lembrete da D) NÃO
entraram** — dependiam de libs da leva seguinte, e as decisões D27, D29 e D30
continuam valendo como estão escritas acima. Junto com eles ficaram:

- **O índice parcial dos vencidos.** Ele **não sai do `migrate diff`** (o Prisma
  não expressa `WHERE` em índice) e nenhuma migration foi criada aqui — sem ele,
  `GET /api/assignments/overdue` varre `assignments`. O SQL é este, e entra à mão
  numa migration, como os outros parciais do projeto:

  ```sql
  CREATE INDEX "assignments_vencidos"
    ON "assignments"("expectedCheckinAt") WHERE "checkinAt" IS NULL;
  ```

- **O histórico da pessoa** na tela de perfil: as três listas entraram, o
  histórico não — ele pede uma leitura do `ActivityLog` por `entityId` que
  nenhuma rota expõe hoje.
- **`AppSetting.checkoutStatusId`/`checkinStatusId`** (o "qual rótulo `IN_USE`?"
  dos Riscos): continua valendo o primeiro do tipo, por nome.
- ~~**`checkoutAt` no futuro** ainda é aceito pelo schema da entrega~~ — **esta linha estava
  errada, e a Leva 1B a corrigiu:** `checkoutSchema` não tem o campo e `Assignment.checkoutAt`
  é `@default(now())`, então a data da entrega nunca vem do cliente. O buraco real era o
  **outro** campo — `expectedCheckinAt` no **passado**, que nasce vencido. A recusa que falta
  ser par do `occupancy.schema.ts` é `dataNaoPassada()`, não `dataNaoFutura()`.

## Etapa A — Aceite com EULA e assinatura · **G**

- **Schema:** model `Acceptance` — `assignmentId`, `assetId`, `token @unique`,
  `eulaSnapshot String`, `signerUserId?`, `signerName`, `signerEmail`,
  `signaturePath?`, `acceptedAt?`, `declinedAt?`, `declineReason?`, `expiresAt`,
  `remindedAt?`. Índice parcial `ON ("assignmentId") WHERE "acceptedAt" IS NULL`.
- **Nasce:** `server/domain/acceptance/` (maestro, controller, use-cases
  `issue-acceptance`, `accept-term`, `decline-term`, `helpers/token.helper.ts`) e
  `src/pages/aceite/`.
- **Regra:** o aceite nasce **dentro da transação do checkout** quando
  `category.requireAcceptance`, e o EULA é **copiado** para a linha (D29).

O token é `crypto.randomBytes(32).toString('base64url')`, de uso único e com
validade. `/aceite/:token` é a única rota pública que a F3 acrescenta além do
login — e por isso não pode mostrar nada além do termo em questão.

## Etapa B — PDF do termo · **M**

- **Schema:** `Acceptance.pdfPath String?`.
- **Nasce:** `server/domain/acceptance/helpers/termo-pdf.helper.ts`.
- **Regra:** o PDF é gerado **no instante do aceite** e guardado; nunca
  regenerado sob demanda (D30).

`pdfkit` desenha em processo: um headless browser seria 300 MB de imagem e um
Chromium para produzir uma página A4.

## Etapa C — E-mail · **M**

- **Schema:** nada muda. `Category.checkinEmail` já existe e passa a ser lido.
- **Nasce:** `server/core/mail/` (transporte e template), chamado nos use-cases de
  checkout, checkin e aceite.
- **Regra:** sem SMTP, o transporte é **no-op que registra no log o e-mail que teria
  mandado** — silêncio torna "não chegou" indepurável.

**O envio acontece depois do commit, nunca dentro da `$transaction`.** SMTP não tem
rollback: e-mail disparado por transação que reverteu avisa o colaborador de uma
entrega que não existe. E a recíproca — falha de envio não desfaz a entrega.

## Etapa D — Atraso e lembrete · **M**

- **Schema:** índice parcial à mão,
  `ON "assignments"("expectedCheckinAt") WHERE "checkinAt" IS NULL`, e
  a linha `'lembrete-de-atraso'` da tabela `JobRun` (D79 — **não** uma coluna
  `AppSetting.lastAlertRunAt`, que a F8 também usaria e que faria um dos dois
  jobs nunca executar; ver [`../decisoes/README.md`](../decisoes/README.md)).
- **Nasce:** `assignment/use-cases/list-overdue.usecase.ts` e
  `assignment/jobs/overdue-reminder.job.ts`.
- **Regra:** vencido é `checkinAt IS NULL AND expectedCheckinAt < now()`.

O job grava `lastAlertRunAt` a cada execução e decide no boot se já rodou hoje. O
`setInterval` do `zombie-cleaner.job.ts` reinicia a cada deploy — herdar esse
defeito manda o lembrete duas vezes, ou nenhuma, conforme a hora do deploy.

## Etapa E — Checkout em massa · **M**

- **Schema:** nada muda.
- **Nasce:** `use-cases/bulk-checkout.usecase.ts`,
  `src/pages/gestao-itam/components/BulkCheckoutModal.tsx`.
- **Regra:** N ativos para **um** alvo, processados **por linha**, com relatório
  do que entrou e do que foi recusado (D31).

## Etapa F — Perfil do colaborador e `holdings` · **M**

- **Schema:** nada muda.
- **Nasce:** `server/domain/assignment/use-cases/list-user-holdings.usecase.ts`,
  `src/pages/gestao-usuario/perfil/` e `src/domain/user/user.queries.ts`.
- **Regra:** `GET /api/users/:id/holdings` devolve as posses `USER` abertas **e**
  os ativos entregues aos postos que a pessoa ocupa, cada item com a sua `via`.

A distinção não é cosmética: "devolver" só existe no que é `DIRETO` — devolver um
ativo da Mesa 1 pelo perfil da Laura devolveria o da Ana junto.

## Etapa G — Desligamento: as duas camadas · **M**

- **Schema:** nada muda.
- **Nasce:** `user/use-cases/offboard-user.usecase.ts`, `components/OffboardModal.tsx`.
- **Regra:** `POST /api/users/:id/offboard` fecha, numa transação só, **todas** as
  posses `USER` abertas **e todas** as ocupações abertas da pessoa (D32); o
  `DELETE /api/users/:id` passa a responder 409 contando as duas.

O nome é `offboard`, não `checkin-all`: quem lê "check-in de tudo" não espera que
a operação mexa em posto — e é essa a metade que se esquece.

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/posse.md`](../decisoes/posse.md) — **D27–D32, mais o D87 e o D88**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.
>
> **Uma delas não ficou com o assunto desta fase:** o **D86** — e-mail é *best-effort* com
> log — foi para [`../decisoes/plataforma.md`](../decisoes/plataforma.md), porque o correio
> tem quatro clientes e três são de fases diferentes.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Riscos e armadilhas

**Corrida em READ COMMITTED no duplo checkout.** Dois pedidos simultâneos do mesmo
ativo passam por qualquer `if`: os dois leem "não há posse aberta" antes de
qualquer um gravar. Só o índice `assignments_um_aberto_por_ativo` pega — e o
`P2002` resultante cai no `error-handler` como *"Registro já existe"*, que não diz
nada a quem clicou em **Entregar**. O use-case captura o P2002 **pelo nome da
constraint** e lança a frase certa; traduzir isso no `error-handler` faria `core`
conhecer o nome de um índice de negócio.

**Os dois pontos cegos do soft delete, e os dois caem aqui.** (1)
`Assignment.targetUserId` e `LocationOccupant.userId` são `onDelete: Restrict`, mas
apagar um usuário aqui é `UPDATE deleted_at`: o Postgres não vê delete nenhum e a
rede **não existe** — o 409 do desligamento é obrigatoriamente de aplicação. (2) A
extension não alcança leitura aninhada, então uma Laura na lixeira continua vindo
como ocupante da Mesa 1 e entra em `resolverResponsaveis()` em silêncio; filtrar
`user: { deletedAt: null }` **explicitamente** na resolução e no `holdings`.

**A assinatura do `<canvas>` é um PNG base64 de centenas de KB.** Numa coluna
`Text`, toda leitura de `Acceptance` passa a mover megabytes. Vai para arquivo,
pela infraestrutura da F2, com o caminho na linha.

**O token de aceite viaja na URL**, numa rota pública, e a query string entra no
log: `core/logger/sanitize.ts` precisa mascarar path e query, não só o corpo. Uso
único e expiração são a única outra proteção que existe.

**Vencidos sem índice varrem a tabela.** `@@index([assetId, checkinAt])` não serve
para *"todas as posses abertas e vencidas"*: o índice parcial sobre
`expectedCheckinAt WHERE "checkinAt" IS NULL` é escrito **à mão** — o Prisma não
expressa `WHERE` —, e como tudo que sai do `migrate diff` aqui, é revisado antes.

**Qual rótulo `IN_USE` o checkout aplica?** Pode haver vários: `AppSetting` ganha
`checkoutStatusId` e `checkinStatusId`, com fallback para o primeiro do tipo.
Escolher "o primeiro que achar" em código faz o comportamento mudar quando alguém
renomear um status — e o `StatusLabelType` já foi palco desse erro.

**`checkoutAt` no passado é o caso normal; no futuro, não.** Carga inicial é entrega
retroativa (D17) e é suportada; data futura gravaria como posse **atual** — no
índice parcial e na resolução — algo que ninguém entregou. Recusar, como
`occupancy.schema.ts` já faz com `startedAt`.

## Verificação

```bash
API=http://localhost:3001; A=<assetId>; U=<userId>; L=<mesa1Id>

# duplo checkout simultâneo: um 200 e um 409 — com a mensagem que ENSINA
printf '%s\n' 1 2 | xargs -P2 -I{} curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$API/api/assets/$A/checkout" -H 'Content-Type: application/json' \
  -d "{\"targetType\":\"USER\",\"targetUserId\":\"$U\"}"

# D27 — POSTO sem gestor + categoria com aceite: 409 que diz o que fazer
curl -s -X POST "$API/api/assets/$A/checkout" -H 'Content-Type: application/json' \
     -d "{\"targetType\":\"LOCATION\",\"targetLocationId\":\"$L\"}" | jq -r '.error.message'

# A — o token de aceite é de uso único (a segunda chamada tem que dar 410)
curl -s -X POST "$API/api/acceptances/$TOKEN/accept" -d '{"signature":"data:image/png;base64,…"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/acceptances/$TOKEN/accept"

# G — desligamento fecha as duas camadas, e só então o DELETE passa (200)
curl -s -X POST "$API/api/users/$U/offboard" -d '{"notes":"desligamento"}' | jq
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$API/api/users/$U"
```

```sql
-- as duas invariantes de banco, por fora da API
SELECT "assetId" FROM assignments WHERE "checkinAt" IS NULL GROUP BY 1 HAVING count(*) > 1;
SELECT "locationId","userId" FROM location_occupants WHERE "endedAt" IS NULL
 GROUP BY 1,2 HAVING count(*) > 1;                                    -- ambas: 0 linhas

-- D28: encerrada a última ocupação, a posse do posto CONTINUA aberta
UPDATE location_occupants SET "endedAt" = now() WHERE "locationId" = :l AND "endedAt" IS NULL;
SELECT count(*) FROM assignments WHERE "targetLocationId" = :l AND "checkinAt" IS NULL;  -- > 0

-- D32: o desligamento não deixou nenhuma das duas pontas aberta
SELECT (SELECT count(*) FROM assignments        WHERE "targetUserId" = :u AND "checkinAt" IS NULL)
     + (SELECT count(*) FROM location_occupants WHERE "userId"       = :u AND "endedAt"   IS NULL);  -- 0

-- D17: só o checkout escreve em assignedToId — LOCATION e ASSET o deixam nulo
SELECT a.id FROM assets a JOIN assignments g ON g."assetId" = a.id AND g."checkinAt" IS NULL
 WHERE g."targetType" <> 'USER' AND a."assignedToId" IS NOT NULL;     -- 0 linhas
```

**Três provas que não são comando.** **D29:** aceitar um termo, editar o `eulaText`
da categoria e reabrir o `Acceptance` — o texto tem que estar **igual**. **D30:**
renomear o ativo depois do aceite e baixar o PDF — tem que vir o nome antigo.
**Sem SMTP:** achar no log a linha com o e-mail que *teria* sido enviado.

## Ordem de commits

**C antes de A e B**, mesmo sendo menor: o aceite manda link por e-mail, e com o
transporte no-op já no lugar não se testa o fluxo colando token à mão. Depois
A (aceite) → B (PDF) → D (vencidos) → E (massa) → F (perfil) → G (desligamento),
um commit por etapa, lint passando em cada um. A verificação é a seção acima, mais
`prisma/verificacoes/posse-invariantes.sql` para o que é invariante de banco.

---

# Fechamento da F4 — o aceite, o correio e as duas dívidas sem migration

> As F2, F3 e F4 foram fechadas **juntas**, em cinco levas, na ordem em que as pontas
> dependiam umas das outras — e não na ordem das fases. O grafo das levas e a tabela das
> catorze pontas estão no
> [Fechamento da F2](fase-02-ativos.md#fechamento-da-f2--as-pontas-que-a-fase-deixou-abertas).
> Desta fase eram quatro: as **levas 1B e 1C** (dívida sem migration), a **Leva 3** (correio e
> agendamento, Etapa C + o que faltava da D) e a **Leva 4** (aceite, assinatura e PDF, Etapas
> A e B). A Leva 4 foi a única que dependeu de duas outras: ela precisava de **onde gravar**
> (Leva 2, na F2) e de **como avisar** (Leva 3).
>
> **Com estas levas, as F0 a F4 ficaram completas.**

## Leva 1B — `expectedCheckinAt` não pode nascer no passado ✅

> ⚠️ **Correção a este plano.** A seção *O que ficou pendente* dizia que *"`checkoutAt` no
> futuro ainda é aceito pelo schema da entrega"*. **Não era:** `checkoutSchema` não tem o campo,
> e `Assignment.checkoutAt` é `@default(now())` — a data da entrega nunca vem do cliente.

- **Muda:** `shared/fields.schema.ts` ganha `meiaNoiteUTC()`, `dataNaoFutura()` e
  `dataNaoPassada()`; `occupancy.schema.ts` passa a usar o compartilhado no lugar do
  `amanhaUTC()` local; `assignment.schema.ts` aplica `dataNaoPassada` em `expectedCheckinAt`.
- **Regra:** hoje é aceito, ontem não. Uma entrega com prazo no passado **nasce vencida** —
  aparece em `GET /api/assignments/overdue` no mesmo segundo e, com a Leva 3, dispara lembrete
  de algo que acabou de sair do estoque.

O espelho é exato e é por isso que os dois construtores vão para o mesmo arquivo: ocupação
**recusa o futuro** (quem "vai ocupar" contaria como ocupante hoje); devolução **recusa o
passado** (quem "ia devolver ontem" nasce em atraso). São a mesma regra vista dos dois lados, e
duas cópias divergiriam no primeiro ajuste.

**O que entrou:** nasceram `dataNaoFutura` e `dataNaoPassada` em `shared/fields.schema.ts`, com
`meiaNoiteUTC()`/`amanhaUTC()` privados no mesmo arquivo. `occupancy.schema.ts` passou a usar o
construtor compartilhado — **a mensagem dele ficou idêntica**, porque o texto é derivado do
rótulo (`início da ocupação não pode ser uma data futura`) — e `assignment.schema.ts` aplicou o
par em `expectedCheckinAt`. A entrega em massa herdou a regra de graça: `bulkCheckoutSchema`
estende o `checkoutSchema` em vez de repetir os campos.

*(A data retroativa de entrega — `checkoutAt` no passado — passou a existir depois, na F10, e
apenas para o importador: ver o D131.)*

## Leva 1C — Histórico da pessoa ✅

- **Nasce:** `user/use-cases/user-history.usecase.ts` e `GET /api/users/:id/history`, na mesma
  forma de `asset/use-cases/asset-history.usecase.ts` (que já une `ActivityLog` e posse, e já
  resolve o teto de 200).
- **Muda:** `src/pages/gestao-usuario/detalhe/` ganha a lista.
- **Regra:** o histórico da pessoa é **o que aconteceu COM ela** — `entityType='User' AND
  entityId=:id`, unido às posses (`Assignment.targetUserId`) e às ocupações
  (`LocationOccupant.userId`).

**O que ele não é:** *"o que esta pessoa fez"*, que seria `actorId=:id` e é outro relatório — o
de auditoria de operador, que pertence à F11 junto com o RBAC. Misturar os dois na mesma lista
responde as duas perguntas pela metade: quem abre o perfil da Laura para saber o que ela tem na
mão leria, no meio, os 400 ativos que ela cadastrou.

**O que entrou, e a forma que mudou:** **três** fontes, e a novidade é que elas são **disjuntas
por construção** — a entrega é gravada com `entityType: 'Asset'` e a ocupação com
`entityType: 'LocationOccupant'`, então nenhuma cai numa consulta por `entityType: 'User'`: o
histórico do ativo precisa de uma lista de exclusão, este não. No front, a parte genérica do
`historico.helper.ts` mudou para `src/pages/helpers/`, recebendo o mapa de rótulos **por
parâmetro** (a mesma inversão do `parseListQuery`); o que ficou em `gestao-itam/detalhe/helpers/`
é o que é do ativo. E o `historyQuerySchema` saiu de `asset/schemas/asset.schema.ts` e virou
`shared/history.schema.ts` — a alternativa era o domínio `user` importar um schema do domínio
`asset`, seta que o [`../referencia/arquitetura.md`](../referencia/arquitetura.md) não desenha, ou uma segunda cópia do
teto, que divergiria do original no primeiro ajuste.

## Leva 3 — Envio e agendamento · **M** ✅

A Etapa C inteira e a metade da Etapa D que faltava.

**Migration `20260923160000_job_run_e_vencidos`:**

- model `JobRun` (`name @id`, `lastRunAt`, `updatedAt`) — a tabela do **D79**
- o índice parcial, à mão, porque o `migrate diff` não emite `WHERE`:

  ```sql
  CREATE INDEX "assignments_vencidos"
    ON "assignments"("expectedCheckinAt") WHERE "checkinAt" IS NULL;
  ```

**Nasceu:**

| Onde | O quê |
|---|---|
| `server/core/mail/mailer.ts` | transporte. Sem SMTP, **no-op que loga o e-mail que teria mandado** |
| `server/core/mail/templates/` | os quatro corpos, em texto e HTML |
| `server/core/jobs/claim-window.ts` | o CAS por linha do D79 — recebe o nome do job por parâmetro |
| `server/domain/assignment/jobs/overdue-reminder.job.ts` | a linha `'lembrete-de-atraso'` |

**Muda:** `checkout-asset.usecase.ts` e `checkin-asset.usecase.ts` passam a enviar **depois do
commit**; `Category.checkinEmail` deixa de ser coluna morta.

**Regras:**

- **O envio acontece fora da `$transaction`, sempre.** SMTP não tem rollback: um e-mail
  disparado por transação que reverteu avisa o colaborador de uma entrega que não existe. E a
  recíproca — falha de envio **não** desfaz a entrega (D86).
- Alvo `LOCATION` notifica **todos os ocupantes abertos** do posto (D27).
- Sem SMTP configurado, o transporte loga o destinatário e o assunto em nível `info`. Silêncio
  torna *"não chegou"* indepurável.
- O job **não** copia o `setInterval` solto do `zombie-cleaner.job.ts`: ele reinicia a cada
  deploy, e herdar isso manda o lembrete duas vezes ou nenhuma, conforme a hora em que se sobe o
  servidor. Quem decide se já rodou é a `JobRun` — **não** uma coluna `AppSetting.lastAlertRunAt`
  (D79).

**Uma regressão evitada:** ao unificar o `rotuloDoAlvo` — duplicado entre o histórico e o e-mail
— a versão compartilhada devolvia texto de reserva no lugar de `null`. O `tsc` aceitou (string é
atribuível a `string | null`), mas a aba Histórico teria passado a escrever *"Entregue para
colaborador"* onde antes escrevia *"Entregue"*. Separado em `rotuloDoAlvo` (null) e
`rotuloDoAlvoOuPadrao` (texto de reserva, só para o corpo do e-mail).

## Leva 4 — Aceite, assinatura e PDF · **G** ✅

As Etapas A e B, o relatório que fecha a fase, e as duas colunas de status que ficaram
pendentes.

**Migration `20260923170000_aceite`:**

- model `Acceptance` — `assignmentId`, `assetId`, `token @unique`, `eulaSnapshot String`,
  `signerUserId?`, `signerName`, `signerEmail`, `signaturePath?`, `pdfPath?`, `acceptedAt?`,
  `declinedAt?`, `declineReason?`, `expiresAt`, `remindedAt?`
- índice parcial `acceptances_um_pendente_por_posse`, `ON ("assignmentId") WHERE "acceptedAt" IS NULL`
- `AppSetting.checkoutStatusId` / `checkinStatusId` (nuláveis)

**Nasceu:** `server/domain/acceptance/` (maestro, controller, `issue-acceptance`, `accept-term`,
`decline-term`, `remind-acceptance`, `list-pending-acceptances`, `helpers/token.helper.ts`,
`helpers/termo-pdf.helper.ts`) e `src/pages/aceite/`, com assinatura em `<canvas>` e PDF por
`pdfkit`. `Category.requireAcceptance` e `eulaText`, inertes desde a F1, ganharam dono.

**Rotas:** a página `/aceite/:token` (pública), `POST /api/aceite/:token/aceitar`,
`POST /api/aceite/:token/recusar`, `GET /api/acceptances?view=pendentes`,
`POST /api/acceptances/:id/remind`, `GET /api/acceptances/:id/pdf`.

**Regras:**

- O aceite nasce **dentro da transação do checkout** quando `category.requireAcceptance`, e o
  EULA é **copiado** para `eulaSnapshot` (D29).
- O token é `crypto.randomBytes(32).toString('base64url')`, de uso único e com validade. A
  página do termo entra na `ROTAS_PUBLICAS` de `server/app.ts` **com o motivo escrito**, e não
  mostra nada além do termo em questão.
- O PDF nasce no instante do aceite e é guardado; **nunca regenerado** (D30).
- Alvo `LOCATION` → **um** termo, para o `Location.managerId`; sem gestor, o checkout é recusado
  com 409 (D27). Alvo `ASSET` → **termo nenhum** (**D87**).
- Aceite pendente **não** bloqueia a entrega (**D88**).
- `AppSetting.checkoutStatusId`/`checkinStatusId`, quando preenchidos, substituem o
  `escolherStatusPorTipo(…, 'IN_USE', 'Em uso')` — que escolhe *o primeiro do tipo, por nome*.
  Vazios, o comportamento anterior continua valendo.

**A segunda porta do PDF.** Ele sai por dois caminhos: `/api/acceptances/:id/pdf`, com sessão,
para quem administra; e pelo próprio token, para quem assinou — que não tem conta no sistema e
ainda assim precisa da via dele. O token é o **mesmo** de uso único, e quem já assinou continua
podendo buscar o documento até `expiresAt`.

**A colisão de rota que só apareceria em produção.** O plano dizia `/aceite/:token` para a API,
e `/aceite/:token` já era a rota da **página** no React Router. Em produção o Fastify
resolveria a API antes do `/*` que entrega o `index.html` e o navegador receberia JSON no lugar
da tela — em desenvolvimento não, porque o proxy do Vite só encaminha `/api`. A API passou para
`/api/aceite/*`, e `tests/aceite/fluxo.test.ts` trava a separação com `hasRoute`.

**O token é mascarado no log.** `core/logger/sanitize.ts` mascara chaves sensíveis do corpo e o
`SENSITIVE_KEY` já casava `token` — mas o token do aceite viaja no **caminho**, que o
`request-logger` gravava inteiro. Agora sai `/api/aceite/***/aceitar`, senão o `X-Request-Id`
sairia acompanhado da credencial que ele deveria proteger.

## Riscos que esta parte do fechamento acrescentou

**Duas janelas de job na mesma tabela.** O `claim-window.ts` é do D79 e recebe o nome por
parâmetro. Reusar a linha `'lembrete-de-atraso'` para o alerta da F8 reabre exatamente o
conflito que o D79 fechou — e o sintoma é um dos dois alertas **nunca** sair, sem erro em lugar
nenhum.

**`Acceptance` com `expiresAt` e o relógio.** Termo expirado não é termo recusado: `expiresAt`
vencido com `acceptedAt` nulo continua **pendente**, reemitível, e não vira `declinedAt`.
Confundir os dois faria o relatório de não aceitos esvaziar sozinho com o tempo.

## Verificação

| Leva | Arquivo | O que prova |
|---|---|---|
| 1B | `tests/formularios/datas.test.ts` | `expectedCheckinAt` de ontem → 422; de hoje → 201 |
| 1C | `tests/listagens/historico-da-pessoa.test.ts` | as três fontes entram e nenhuma se repete |
| 3 | `tests/jobs/janela.test.ts` | dois jobs de nomes diferentes ganham a janela no mesmo dia; o mesmo job duas vezes, não |
| 3 | `tests/correio/aviso.test.ts` | sem SMTP, o envio loga e **não** lança; falha de envio não desfaz o checkout |
| 4 | `tests/aceite/fluxo.test.ts` | categoria com `requireAcceptance` gera termo no checkout; alvo `ASSET` não gera (D87); alvo `LOCATION` sem gestor → 409 (D27); a entrega conclui com o termo pendente (D88); token usado duas vezes → 409; a API e a página não colidem |

Mais uma prova que só o SQL dá, no padrão de `prisma/verificacoes/`:

```sql
-- aceite pendente de assignment já devolvida: o termo ficou para trás
SELECT a.id FROM acceptances a
  JOIN assignments s ON s.id = a."assignmentId"
 WHERE a."acceptedAt" IS NULL AND s."checkinAt" IS NOT NULL;
```

**O placar do fechamento, nas quatro levas desta fase mais as da F2 e da F3:** a suíte foi de 59
para **145 asserções**, `npm run build` e `npm run lint` limpos, 5 migrations aplicadas.

## O que continuou fora, e por quê

| O quê | Por quê |
|---|---|
| **RBAC** | é a F11. Aqui, qualquer sessão válida continuava podendo tudo — inclusive baixar qualquer anexo |
| **Anexo em licença e manutenção** | `Attachment` nasceu com FK direta para `Asset`. Quando a F6 e a F8 quiserem, é uma coluna nulável e um discriminante — aditivo, o padrão do `Assignment` |
| **Outbox de e-mail** | D86, com o preço escrito: um aviso perdido está perdido |
| **Renomear `Asset.assignedToId`** | é cache do caso `USER` e está documentado como tal (D17). Mexer nele é migração sem ganho |
