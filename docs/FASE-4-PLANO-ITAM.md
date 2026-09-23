# Plano de implementação — Fase 4: checkout e checkin

> Plano **prospectivo** da Fase 4 do [`ITAM-TODO.md`](./ITAM-TODO.md). Contrato:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) · porquês:
> [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) · o que o sistema recusa:
> [`INVARIANTES.md`](./INVARIANTES.md) · camadas: [`ARQUITETURA.md`](./ARQUITETURA.md).
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
| As quatro invariantes documentadas e provadas em SQL | `INVARIANTES.md`, `prisma/verificacoes/` |

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

## O que ficou pendente

**Aceite/EULA, assinatura, PDF e e-mail (Etapas A, B, C e o lembrete da D) NÃO
entraram** — dependem de libs da próxima leva, e as decisões D27, D29 e D30
continuam valendo como estão escritas acima. Junto com eles ficam:

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
- **`checkoutAt` no futuro** ainda é aceito pelo schema da entrega — a recusa que
  o `occupancy.schema.ts` já faz com `startedAt` não tem par aqui.

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
  jobs nunca executar; ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md)).
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

## Decisões da fase — D27 a D32

### D27 — Num posto com duas pessoas, quem assina o termo é o gestor da localidade.

**Decidido.** Com `targetType = LOCATION` e categoria que exige aceite, sai **um**
termo, para o `Location.managerId` — coluna que existe desde a F1 e nunca foi lida
por nada. Os ocupantes recebem **ciência por e-mail**, não assinatura.

**Descartado: cada ocupante assina o seu.** São N documentos para **um** fato: o
ativo ficaria com aceite "parcialmente pendente" enquanto um dos N não assina — e
ele já está na mesa desde o primeiro dia. Pior no tempo: quem entra em março
reabriria o aceite de um ativo entregue em janeiro, ou trabalharia sob um termo
que nunca viu.

**Descartado: posto não tem termo.** É justamente o equipamento compartilhado que
some — o de todos e de ninguém; dispensar o documento aí é dispensá-lo onde serve.
**Descartado: o primeiro ocupante assina pelos outros** — cria responsabilidade que
a pessoa não escolheu e que o modelo não reconhece: a Camada 3 devolve Laura e Ana
como iguais, sem primeiro nem segundo.

**Por que o gestor.** `Location.managerId` já nomeia o responsável formal daquele
lugar — nasceu com `onDelete: SetNull` porque *"desligar o gestor não pode derrubar
a filial"*, ou seja, a localidade sempre teve dono no schema. E porque o
`MODELO-POSSE.md` recusa N detentores diretos com a frase *"responsabilidade
compartilhada sem um posto no meio é responsabilidade de ninguém"*: o termo do
posto é a mesma frase no plano documental — um nome no papel.

**O que esta decisão NÃO faz, e é o que impede a contradição:** assinar o termo
**não** torna o gestor responsável resolvido. `resolverResponsaveis()` continua
devolvendo os ocupantes, e só — o `DECISOES-POSSE.md` declara responsabilidade
hierárquica fora do modelo, e esta decisão é sobre **quem firma o documento**,
camada que não existe na resolução.

**Sem gestor, o checkout é recusado com 409** — *"defina o gestor de «Mesa 1» antes
de entregar equipamento com termo de aceite"*. Não se emite termo para ninguém.
Categoria **sem** `requireAcceptance` entrega normalmente: não há documento.

### D28 — Quando o último ocupante sai, a posse continua aberta.

**Decidido.** Encerrar a última `LocationOccupant` aberta de um posto **não** fecha
as `Assignment` daquele posto. Os ativos passam a aparecer no relatório de **posto
vago** (F2, Etapa E) e `resolverResponsaveis()` devolve lista vazia com
`postoVago: true` — que é exatamente o que `posse.types.ts` já declara.

**Descartado: fechar as assignments automaticamente.** Seria o sistema fazendo um
check-in que ninguém fez. O equipamento continua fisicamente na mesa, e a devolução
tem data, estado, nota e — com a F3 — quem recebeu. É o raciocínio que
`assert-status-posse.usecase.ts` já aplica ao recusar mandar ativo entregue para
`DEPLOYABLE`: **bloqueia, nunca limpa sozinho** — limpar sozinho é perda de dado
silenciosa.

**Descartado: recusar a saída do último ocupante enquanto houver ativo no posto.**
A pessoa já saiu; o fato é do mundo, não do banco. Sistema que recusa registrar o
que aconteceu produz dado falso na hora seguinte — alguém encerra por SQL, ou deixa
a Laura "ocupando" há seis meses um posto onde não trabalha.
**Descartado: transferir a responsabilidade ao gestor** — contradiz o
`DECISOES-POSSE.md` e faria dele responsável por um parque inteiro sem ato nenhum.
Ele assina o termo (D27); não herda a guarda.

**O que a saída do último ocupante faz:** grava `ActivityLog` no local e, com o
alerta da F8, avisa o gestor de que há N ativos em posto vago. É **sinal**, não
erro, e nenhuma invariante é violada: a posse continua aberta, e o que esvaziou
foi a Camada 2.

### D29 — O EULA é copiado para o `Acceptance`, não referenciado.

**Decidido:** `eulaSnapshot` guarda o texto no instante da emissão.
**Descartado:** FK para `Category` e ler `eulaText` na hora de exibir.
**Por quê:** editar o EULA da categoria mudaria, retroativamente, o que centenas de
pessoas assinaram — sem log em `assets` e sem ninguém perceber. Um termo que muda
depois de assinado não é termo.

### D30 — O PDF é gerado no aceite e guardado. Nunca regenerado.

**Decidido:** o arquivo nasce no `accept-term.usecase.ts`; o caminho vai em `pdfPath`.
**Descartado:** gerar sob demanda em `GET /api/acceptances/:id/pdf`.
**Por quê:** regenerar monta o documento com os dados de **hoje** — o ativo pode ter
mudado de nome, de local e de dono. O PDF existe para provar o que foi assinado, e
prova que se recalcula não prova nada. É o D29 no arquivo.

### D31 — Entrega em massa é por linha, com relatório. (O oposto da F2.)

**Decidido:** `bulk-checkout` processa cada ativo na sua transação e devolve o que
entrou e o que foi recusado, com o motivo. **Descartado:** tudo ou nada, como a
ação em massa da F2 (D21).
**Por quê:** não é inconsistência, é a natureza da operação. Edição em massa é
**uma** intenção aplicada a N linhas — metade aplicada é estado que ninguém pediu.
Checkout em massa são **N entregas independentes**: um kit de 8 itens em que 1
está com outra pessoa ainda entrega 7, e refazer os 7 à mão é pior que ler um
relatório de uma linha.

### D32 — Desligamento é uma operação com nome próprio, e fecha as duas camadas.

**Decidido:** `POST /api/users/:id/offboard` fecha posses `USER` abertas **e**
ocupações abertas, na mesma transação, com uma nota comum. **Descartado:**
`checkin-all` só sobre `Assignment`, como o TODO descrevia.
**Por quê:** devolver os ativos diretos e deixar a pessoa ocupando a Mesa 1 mantém
um desligado como responsável resolvido por todo equipamento daquele posto — o
`resolverResponsaveis()` continua devolvendo o nome dele, e o 409 de exclusão
dispara sem que ninguém entenda por quê. Por isso o 409 do `DELETE` conta **as
duas** coisas, não só as posses.

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
