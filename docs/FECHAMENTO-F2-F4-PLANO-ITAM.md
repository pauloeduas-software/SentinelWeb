# Plano de fechamento — F2, F3 e F4

> Plano **prospectivo** para terminar o que ficou pela metade nas três fases já
> em execução. Não abre fase nova: a F5 continua depois daqui.
> Camadas: [`ARQUITETURA.md`](./ARQUITETURA.md) · posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) e [`INVARIANTES.md`](./INVARIANTES.md) ·
> conflitos entre planos: [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias ·
> Decisões **D83–D89**, continuando a numeração global onde a reconciliação parou (D82).

---

## Objetivo

Fechar as catorze pontas abertas das F2, F3 e F4 — e fechá-las **na ordem em que
elas dependem umas das outras**, que não é a ordem das fases.

Três coisas atravessam as três fases e explicam por que este plano existe em vez
de três revisões separadas:

1. **O armazenamento de arquivo é o gargalo.** Ele é a Etapa G da F2, e é também
   onde moram a assinatura e o PDF do termo da F4. Enquanto ele não existir, a
   Etapa A da F4 não tem onde gravar nada.
2. **O envio de e-mail tem quatro clientes** — checkout, checkin, aceite e
   lembrete de atraso — e três deles são de fases diferentes.
3. **A porta fechada da F3 mudou o desenho da Etapa G da F2**, que foi escrita
   antes dela. Ver **D84**: é um furo de segurança real, não um detalhe de estilo.

---

## O que falta, verificado contra o código

Levantado lendo o repositório, não o `ITAM-TODO.md` — que está desatualizado e
marca a F2 e a F3 inteiras como pendentes.

| # | O que falta | Fase | Prova de que falta |
|---|---|---|---|
| 1 | Ator em `catalog` e `occupancy` | F3 | as 5 chamadas de `recordActivity` sem o 3º parâmetro |
| 2 | `expectedCheckinAt` no passado é aceito | F4 | `assignment.schema.ts` não tem `refine` |
| 3 | Histórico da pessoa no perfil | F4 | nenhuma rota lê `ActivityLog` por `entityId` de `User` |
| 4 | Vista "arquivados" | F2 | `ASSET_VIEWS = ['active','trashed','retired']` |
| 5 | `Attachment` + `imagePath` | F2 (G) | `@fastify/multipart` instalado, **zero imports** |
| 6 | `createdById`/`updatedById` no `Asset` | F3 (F) | nenhuma das duas colunas no `schema.prisma` |
| 7 | `core/mail/` | F4 (C) | `nodemailer` instalado, **zero imports** |
| 8 | `JobRun` + janela de execução | F4 (D) | D79 decidido, tabela não criada |
| 9 | Índice parcial dos vencidos | F4 (D) | `GET /api/assignments/overdue` varre `assignments` |
| 10 | Lembrete automático de atraso | F4 (D) | não existe `overdue-reminder.job.ts` |
| 11 | `Acceptance` + `/aceite/:token` | F4 (A) | `Category.requireAcceptance` e `eulaText` **nunca lidos** |
| 12 | PDF do termo | F4 (B) | `pdfkit` instalado, **zero imports** |
| 13 | Relatório de não aceitos + reenvio | F4 | depende do 11 |
| 14 | `ApiToken` por agente | F3 (G) | `/agent-hub` com o `AGENT_TOKEN` compartilhado da F0 |

Quatro itens do `ITAM-TODO.md` **não** entram aqui porque já estão feitos e o
documento não foi atualizado: painel de ocupantes no posto, checkout em massa,
perfil do colaborador (menos o histórico) e o desligamento.

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F1, F2 (menos a G), F3 (menos a G) e F4 (menos A–D)** | é o estado de hoje; nada aqui recomeça |
| **A suíte `tests/`** | este plano é o primeiro que nasce **depois** dela: cada leva entrega teste, não `curl` |
| **`nodemailer`, `pdfkit`, `@fastify/multipart`** | já instalados, todos sem uso — nada a instalar |
| **`UPLOAD_DIR`, `SMTP_URL`, `MAIL_FROM`, `APP_URL`** | nenhuma existe no `.env.example`; entram nas levas 2 e 3 |

---

## Por que levas, e não fases

```
Leva 1  dívida sem migration ────────────┐
                                         │
Leva 2  armazenamento ───┬───────────────┼──▶ Leva 4  aceite + assinatura + PDF
                         │               │
Leva 3  e-mail + job ────┘───────────────┘

Leva 5  ApiToken por agente  (independente de tudo; por último por causa da frota)
```

A Leva 4 é a única que depende de duas outras: ela precisa de **onde gravar**
(Leva 2) e de **como avisar** (Leva 3). As levas 1 e 5 não dependem de nada e
poderiam rodar em paralelo — a 1 vem primeiro porque é barata e a 5 por último
porque é a única que exige coordenar com um binário que **não está neste
repositório**.

---

## Leva 1 — A dívida que não pede migration · **P** ✅ CONCLUÍDA

Quatro itens, nenhum toca no banco. É a leva que se faz numa tarde e que tira do
caminho as três pendências que deixariam código novo nascendo torto.

### 1A — O ator chega a `catalog` e `occupancy`, e o `= null` morre

- **Muda:** `catalog/use-cases/{create,update,delete}-catalog.usecase.ts` e
  `occupancy/use-cases/{add-location-occupant,end-location-occupancy}.usecase.ts`
  ganham `actorId: string | null` como **último** parâmetro; os dois controllers
  passam `atorDaRequisicao(request)`.
- **Depois, e só depois:** apagar o `= null` da assinatura de `recordActivity`.
- **Regra:** a ordem é essa e não a inversa. Apagar o default primeiro quebra a
  compilação em cinco pontos de uma vez e o trabalho passa a ser feito sem rede;
  propagando antes, o compilador fica **quieto até o fim** e então aponta
  exatamente o que sobrou.

É o fechamento do **D23**: a partir daqui, esquecer o ator é erro de compilação,
não linha de log com `actorId: null` que ninguém lê.

### 1B — `expectedCheckinAt` não pode nascer no passado

> ⚠️ **Correção ao [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md).** A seção *O que ficou pendente*
> diz que *"`checkoutAt` no futuro ainda é aceito pelo schema da entrega"*. **Não é:**
> `checkoutSchema` não tem o campo, e `Assignment.checkoutAt` é `@default(now())` —
> a data da entrega nunca vem do cliente. O buraco real é o **outro** campo.

- **Muda:** `shared/fields.schema.ts` ganha `meiaNoiteUTC()`, `dataNaoFutura()` e
  `dataNaoPassada()`; `occupancy.schema.ts` passa a usar o compartilhado no lugar
  do `amanhaUTC()` local; `assignment.schema.ts` aplica `dataNaoPassada` em
  `expectedCheckinAt`.
- **Regra:** hoje é aceito, ontem não. Uma entrega com prazo no passado **nasce
  vencida** — aparece em `GET /api/assignments/overdue` no mesmo segundo e, com a
  Leva 3, dispara lembrete de algo que acabou de sair do estoque.

O espelho é exato e é por isso que os dois construtores vão para o mesmo arquivo:
ocupação **recusa o futuro** (quem "vai ocupar" contaria como ocupante hoje);
devolução **recusa o passado** (quem "ia devolver ontem" nasce em atraso). São a
mesma regra vista dos dois lados, e duas cópias divergiriam no primeiro ajuste.

### 1C — Histórico da pessoa

- **Nasce:** `user/use-cases/user-history.usecase.ts` e `GET /api/users/:id/history`,
  na mesma forma de `asset/use-cases/asset-history.usecase.ts` (que já une
  `ActivityLog` e posse, e já resolve o teto de 200).
- **Muda:** `src/pages/gestao-usuario/detalhe/` ganha a lista.
- **Regra:** o histórico da pessoa é **o que aconteceu COM ela** — `entityType='User'
  AND entityId=:id`, unido às posses (`Assignment.targetUserId`) e às ocupações
  (`LocationOccupant.userId`).

**O que ele não é:** *"o que esta pessoa fez"*, que seria `actorId=:id` e é outro
relatório — o de auditoria de operador, que pertence à F11 junto com o RBAC.
Misturar os dois na mesma lista responde as duas perguntas pela metade: quem abre
o perfil da Laura para saber o que ela tem na mão leria, no meio, os 400 ativos
que ela cadastrou.

### 1D — A vista "arquivados" (**D85**)

- **Muda:** `asset/helpers/asset-filters.helper.ts` (`ASSET_VIEWS` ganha
  `'archived'`, e `whereDaVista` passa a olhar `status.type`),
  `asset/use-cases/asset-stats.usecase.ts` (o contador) e
  `src/pages/gestao-itam/index.tsx` (a quarta aba).
- **Regra:** `active` exclui `retiredAt` **e** `status.type = ARCHIVED`;
  `archived` mostra só o segundo; `trashed` continua sem olhar status nenhum —
  lixeira é lixeira.

A invariante que impede arquivar ativo entregue **já existe** e não muda:
`assert-status-posse.usecase.ts` recusa `ARCHIVED` com responsável resolvido.
O que falta é só a vista.

---

### O que entrou · ✅ CONCLUÍDA

> Escrito **depois** da implementação, contra o código que está no repositório.
> O plano acima continua como foi planejado; esta seção diz o que virou código e
> o que mudou de forma no caminho.

**1A** — `actorId` virou parâmetro obrigatório nos cinco pontos que faltavam:
`catalog/use-cases/{create,update,delete}-catalog` e
`occupancy/use-cases/{add-location-occupant,end-location-occupancy}`, com os dois
controllers passando `atorDaRequisicao(request)`. O `= null` da assinatura de
`recordActivity` foi apagado, e a rede foi **verificada quebrando de propósito**:
tirar o ator de uma chamada responde `TS2554: Expected 3 arguments, but got 2`.
Era isso que o D23 queria.

**1B** — nasceram `dataNaoFutura` e `dataNaoPassada` em `shared/fields.schema.ts`,
com `meiaNoiteUTC()`/`amanhaUTC()` privados no mesmo arquivo. `occupancy.schema.ts`
passou a usar o construtor compartilhado — **a mensagem dele ficou idêntica**,
porque o texto é derivado do rótulo (`início da ocupação não pode ser uma data
futura`) — e `assignment.schema.ts` aplicou o par em `expectedCheckinAt`. A
entrega em massa herdou a regra de graça: `bulkCheckoutSchema` estende o
`checkoutSchema` em vez de repetir os campos.

**1C** — nasceram `user/use-cases/user-history.usecase.ts` e
`GET /api/users/:id/history`, na forma do histórico do ativo. **Três** fontes, e
a novidade é que elas são **disjuntas por construção**: a entrega é gravada com
`entityType: 'Asset'` e a ocupação com `entityType: 'LocationOccupant'`, então
nenhuma cai numa consulta por `entityType: 'User'` — o histórico do ativo precisa
de uma lista de exclusão, este não. No front, a parte genérica do
`historico.helper.ts` mudou para `src/pages/helpers/`, recebendo o mapa de
rótulos **por parâmetro** (a mesma inversão do `parseListQuery`); o que ficou em
`gestao-itam/detalhe/helpers/` é o que é do ativo, e `gestao-usuario/detalhe/`
ganhou o seu.

**1D** — `ASSET_VIEWS` ganhou `'archived'`, `whereDaVista` passou a receber se
há `statusId` explícito, e `/stats` ganhou o contador `archived` com `total`
deixando de incluí-lo. `AssetStats.byStatus` ganhou `type`, que é o que deixa a
tela saber que aquele contador é de arquivo.

**O que mudou de forma:** o `historyQuerySchema` saiu de
`asset/schemas/asset.schema.ts` e virou `shared/history.schema.ts`. A alternativa
era o domínio `user` importar um schema do domínio `asset` — seta que o
[`ARQUITETURA.md`](./ARQUITETURA.md) não desenha — ou uma segunda cópia do teto,
que divergiria do original no primeiro ajuste.

**A armadilha que apareceu escrevendo o teste, e que o plano já previa:** com
`active` excluindo `ARCHIVED`, clicar no contador de um status arquivado no
cabeçalho abriria lista vazia. A regra do D85 (`statusId` explícito vence a
exclusão) está implementada e é o teste
`?statusId= do arquivado DEVOLVE o ativo, em vez de uma lista vazia`.

**Verificado:** 29 asserções novas em quatro arquivos —
`tests/invariantes/ator.test.ts`, `tests/formularios/datas.test.ts`,
`tests/listagens/vistas-do-ativo.test.ts` e
`tests/listagens/historico-da-pessoa.test.ts`. A suíte foi de 59 para **88**,
toda verde; `npm run build` e `npm run lint` limpos.

---

## Leva 2 — Armazenamento de arquivo · **M** ✅ CONCLUÍDA

A Etapa G da F2, mais as duas colunas de ator da Etapa F da F3 — que pegam carona
por serem a mesma migration.

**Migration `..._anexos_e_autoria`:**

- `imagePath String?` em `Asset`, `AssetModel`, `Manufacturer` e `Category`
- model `Attachment`: `assetId` (`onDelete: Cascade`), `path`, `originalName`,
  `mimeType`, `sizeBytes Int`, `uploadedById String?`, `createdAt`
- `createdById String?` e `updatedById String?` **no `Asset`, e só** (D26)

**Nasce:**

| Onde | O quê |
|---|---|
| `server/core/storage/storage.ts` | gravar, apagar e resolver caminho. Não sabe o que é anexo (**D83**) |
| `server/core/storage/mime.ts` | a allowlist MIME → extensão |
| `server/domain/attachment/` | maestro, controller, `upload-attachment`, `delete-attachment`, `list-asset-attachments`, `attachment-select.helper.ts` |
| `src/pages/gestao-itam/detalhe/components/FilesTab.tsx` | a aba que já existe desabilitada |

**Rotas:** `GET|POST /api/assets/:id/attachments`,
`GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`,
`PUT|DELETE /api/assets/:id/image`.

**Regras:**

- O nome no disco é `uuid` + extensão derivada do **MIME da allowlist**, nunca o
  nome que o cliente mandou. O original vai para `originalName`, só para exibir.
- O arquivo **não participa da `$transaction`**: valida → grava a linha → commita
  → **só então** move do temporário para o definitivo. Gravar antes deixa órfão
  no disco quando a transação reverte.
- **Soft delete não apaga arquivo.** Mandar o ativo para a lixeira e restaurar
  não pode devolver um link quebrado.
- `uploadedById` nasce **preenchido** — ao contrário do que a Etapa G previa:
  quando ela foi escrita a F3 não existia, e agora existe.
- Trocar a imagem apaga a anterior **depois** do commit, pela mesma razão.

**A mudança de desenho:** a Etapa G dizia *"`@fastify/static` numa segunda raiz"*.
**Isso não vai acontecer** — ver **D84**.

---

## Leva 3 — Envio e agendamento · **M** ✅ CONCLUÍDA

A Etapa C da F4 inteira e a Etapa D pela metade que falta.

**Migration `..._job_run_e_vencidos`:**

- model `JobRun` (`name @id`, `lastRunAt`, `updatedAt`) — a tabela do **D79**
- o índice parcial, à mão, porque o `migrate diff` não emite `WHERE`:

  ```sql
  CREATE INDEX "assignments_vencidos"
    ON "assignments"("expectedCheckinAt") WHERE "checkinAt" IS NULL;
  ```

**Nasce:**

| Onde | O quê |
|---|---|
| `server/core/mail/mailer.ts` | transporte. Sem SMTP, **no-op que loga o e-mail que teria mandado** |
| `server/core/mail/templates/` | os quatro corpos, em texto e HTML |
| `server/core/jobs/claim-window.ts` | o CAS por linha do D79 — recebe o nome do job por parâmetro |
| `server/domain/assignment/jobs/overdue-reminder.job.ts` | a linha `'lembrete-de-atraso'` |

**Muda:** `checkout-asset.usecase.ts` e `checkin-asset.usecase.ts` passam a
enviar **depois do commit**; `Category.checkinEmail` deixa de ser coluna morta.

**Regras:**

- **O envio acontece fora da `$transaction`, sempre.** SMTP não tem rollback: um
  e-mail disparado por transação que reverteu avisa o colaborador de uma entrega
  que não existe. E a recíproca — falha de envio **não** desfaz a entrega.
- Alvo `LOCATION` notifica **todos os ocupantes abertos** do posto (D27).
- Sem SMTP configurado, o transporte loga o destinatário e o assunto em nível
  `info`. Silêncio torna *"não chegou"* indepurável.
- O job **não** copia o `setInterval` solto do `zombie-cleaner.job.ts`: ele
  reinicia a cada deploy, e herdar isso manda o lembrete duas vezes ou nenhuma,
  conforme a hora em que se sobe o servidor. Quem decide se já rodou é a `JobRun`.

---

## Leva 4 — Aceite, assinatura e PDF · **G** ✅ CONCLUÍDA

As Etapas A e B da F4, o relatório que fecha a fase, e as duas colunas de status
que ficaram pendentes.

**Migration `..._aceite`:**

- model `Acceptance` — `assignmentId`, `assetId`, `token @unique`,
  `eulaSnapshot String`, `signerUserId?`, `signerName`, `signerEmail`,
  `signaturePath?`, `pdfPath?`, `acceptedAt?`, `declinedAt?`, `declineReason?`,
  `expiresAt`, `remindedAt?`
- índice parcial `ON ("assignmentId") WHERE "acceptedAt" IS NULL`
- `AppSetting.checkoutStatusId` / `checkinStatusId` (nuláveis)

**Nasce:** `server/domain/acceptance/` (maestro, controller, `issue-acceptance`,
`accept-term`, `decline-term`, `remind-acceptance`, `list-pending-acceptances`,
`helpers/token.helper.ts`, `helpers/termo-pdf.helper.ts`) e `src/pages/aceite/`.

**Rotas:** `GET /aceite/:token` (pública), `POST /api/acceptances/:token/accept`,
`POST /api/acceptances/:token/decline`, `GET /api/acceptances?view=pendentes`,
`POST /api/acceptances/:id/remind`, `GET /api/acceptances/:id/pdf`.

**Regras:**

- O aceite nasce **dentro da transação do checkout** quando
  `category.requireAcceptance`, e o EULA é **copiado** para `eulaSnapshot` (D29).
- O token é `crypto.randomBytes(32).toString('base64url')`, de uso único e com
  validade. `/aceite/:token` entra na `ROTAS_PUBLICAS` de `server/app.ts` **com o
  motivo escrito**, e não mostra nada além do termo em questão.
- O PDF nasce no instante do aceite e é guardado; **nunca regenerado** (D30).
- Alvo `LOCATION` → **um** termo, para o `Location.managerId`; sem gestor, o
  checkout é recusado com 409 (D27). Alvo `ASSET` → **termo nenhum** (**D87**).
- Aceite pendente **não** bloqueia a entrega (**D88**).
- `AppSetting.checkoutStatusId`/`checkinStatusId`, quando preenchidos, substituem
  o `escolherStatusPorTipo(…, 'IN_USE', 'Em uso')` de hoje — que escolhe *o
  primeiro do tipo, por nome*. Vazios, o comportamento atual continua valendo.

**A segunda porta do PDF.** Ele sai por dois caminhos: `/api/acceptances/:id/pdf`,
com sessão, para quem administra; e pelo próprio token, para quem assinou — que
não tem conta no sistema e ainda assim precisa da via dele. O token é o **mesmo**
de uso único, e quem já assinou continua podendo buscar o documento até `expiresAt`.

---

## Leva 5 — `ApiToken` por agente · **M** ✅ CONCLUÍDA

A Etapa G da F3, por último e sozinha, porque é a única que depende de um binário
que **não está neste repositório**.

**Migration `..._api_token`:** o model `ApiToken`, o enum `ApiTokenOwner` e o
CHECK de coerência do dono — exatamente como o **D80** os escreve, e não uma
segunda versão deles.

**Nasce:** `auth/use-cases/authenticate-api-token.usecase.ts`,
`auth/use-cases/{issue,revoke}-api-token.usecase.ts`, e a tela de tokens em
`src/pages/configuracoes/`.

**Muda:** `agent/helpers/authenticate-agent.helper.ts`.

**Regras:**

- O token viaja como `prefixo.segredo`. O lookup é pelo **prefixo**; a comparação
  do segredo é em tempo constante contra um **sha256**, não argon2 — 32 bytes
  aleatórios não têm dicionário a proteger, e 100 ms de KDF por handshake é
  transformar a defesa da senha humana em lentidão da frota.
- `endpointId` nasce **nulo** e é preenchido no primeiro handshake. O mesmo token
  chegando depois de outra máquina é sinal de token copiado: vira alerta, **não**
  um `UPDATE` silencioso do vínculo (D80).
- A troca pelo `AGENT_TOKEN` é **por convivência**, com prazo e log de
  depreciação (**D89**).

---

## Decisões — D83 a D89

### D83 — O armazenamento é `core/storage/`; a linha é do domínio.

**Decidido:** gravar bytes, derivar nome seguro e apagar arquivo moram em
`server/core/storage/`. O model `Attachment` e as regras sobre ele moram em
`server/domain/attachment/`.
**Descartado:** `domain/attachment/helpers/storage.helper.ts`, como a Etapa G da
F2 previa.
**Por quê:** quando a Etapa G foi escrita, anexo de ativo era o único cliente. A
Leva 4 acrescenta dois que **não são anexos de ativo** — a imagem da assinatura e
o PDF do termo, que pertencem a `Acceptance`. Com o helper dentro de
`attachment/`, o domínio `acceptance` importaria de outro domínio para gravar um
arquivo; e `domain → domain` não é uma seta que o
[`ARQUITETURA.md`](./ARQUITETURA.md) desenha. Guardar bytes é infraestrutura: não
sabe o que é um anexo, um termo nem um ativo.

### D84 — Anexo não é rota estática. Ele sai por `/api/`, com sessão.

**Decidido:** `GET /api/attachments/:id/download` lê a linha, confere a sessão e
transmite o arquivo. `UPLOAD_DIR` fica **fora** de qualquer raiz do
`@fastify/static`.
**Descartado:** `@fastify/static` numa segunda raiz servindo `/uploads/*`, que é
o que a Etapa G da F2 mandava fazer.
**Por quê:** a F2 foi planejada **antes** da porta fechada da F3, e a regra dela é

```ts
if (estaticoPublico && request.method === 'GET' && !path.startsWith('/api')) return;
```

`estaticoPublico` é `isProduction`. Um `GET /uploads/<uuid>.pdf` **não** começa
com `/api` — então, em produção e só em produção, **toda nota fiscal, todo
contrato, toda assinatura e todo termo assinado seriam legíveis sem sessão**, por
quem adivinhasse ou vazasse o caminho. Em desenvolvimento nada disso aparece,
porque lá quem serve o estático é o Vite: é um furo que só existe onde dói.

**Descartado também: acrescentar `/uploads/*` à `ROTAS_PUBLICAS`** — seria
escrever o furo à mão. E **descartado: inverter o `estaticoPublico`** para uma
allowlist de caminhos estáticos; ele está certo para o que faz (o bundle do
painel é código público), e o que está errado é pendurar arquivo privado nele.

**O preço, e ele é real:** servir por rota custa uma consulta e um `stream` por
download, contra um `sendFile` direto. Para nota fiscal e termo assinado, num
sistema interno, é barato — e é o único desenho em que a resposta a *"quem pode
ler este arquivo?"* não depende de `NODE_ENV`.

### D85 — `?view=archived` é a quarta vista, e a listagem padrão passa a excluir `ARCHIVED`.

**Decidido:** `ASSET_VIEWS` vira `['active','trashed','retired','archived']`, e
`active` passa a excluir também `status.type = ARCHIVED`.
**Descartado:** uma coluna `archivedAt`, espelhando `retiredAt`.
**Por quê:** arquivar **já é** um tipo de `StatusLabel` desde a F1, e a invariante
que impede arquivar ativo entregue já lê `status.type`. Uma coluna nova seria uma
segunda verdade sobre o mesmo fato — o erro do D17 uma camada acima.

**É uma mudança de comportamento, e está declarada:** ativo arquivado hoje aparece
na listagem padrão e a partir daqui não aparece mais. É o que o
[`ITAM-TODO.md`](./ITAM-TODO.md) sempre pediu (*"sai das listagens por padrão"*) e
o que nunca foi implementado.

**A armadilha, e a regra que a fecha:** a exclusão de `ARCHIVED` vale **só quando
não há `?statusId=` explícito**. Sem isso, clicar no contador de um status
arquivado abriria uma lista vazia — um filtro que o próprio sistema ofereceu e
que não devolve nada. Pedir um status pelo id é dizer que se quer aquele status.

**O preço:** `active` deixa de ser um predicado de coluna e passa a ter um join
com `status_labels`. A tabela é pequena e `assets_statusId_idx` existe; se um dia
doer, o caminho é desnormalizar o `type` para `assets`, não voltar atrás na regra.

### D86 — E-mail é *best-effort* com log. O que não pode se perder tem linha em tabela.

**Decidido:** o envio acontece depois do commit; a falha é registrada em `warn`
com destinatário e motivo, e **não** é retentada na hora.
**Descartado:** tabela de *outbox* com job de reenvio.
**Por quê:** dos quatro e-mails, dois já têm estado durável e um relatório que os
persegue — o aceite pendente aparece em `GET /api/acceptances?view=pendentes` e
tem `remindedAt`; o atraso é recalculado pelo job todo dia. Os outros dois
(aviso de entrega e de devolução) são cortesia: perder um numa queda de SMTP não
deixa o inventário errado.

**O preço, dito com todas as letras:** um aviso de entrega perdido numa
indisponibilidade de SMTP está perdido, e ninguém é notificado disso além do log.
Um *outbox* custaria uma tabela, um job e uma política de retentativa para
proteger a mensagem **menos** importante das quatro. Quando houver um e-mail cuja
perda quebre um processo, ele nasce com linha em tabela — como o aceite nasceu.

### D87 — Entrega com alvo `ASSET` não emite termo.

**Decidido:** `targetType = ASSET` nunca gera `Acceptance`, mesmo que a categoria
exija aceite.
**Descartado:** emitir o termo para o responsável resolvido do ativo detentor.
**Por quê:** o D27 decidiu quem assina quando o alvo é um posto e deixou o alvo
`ASSET` de fora — porque nele **não há pessoa nenhuma**. A dock foi entregue ao
notebook; quem responde pelo notebook pode mudar amanhã por um checkout que não
menciona a dock, e o termo ficaria assinado por alguém que não tem mais relação
com o equipamento.

O documento segue o notebook: quem assinou o termo dele assinou por um conjunto,
e é essa a leitura que a aba Posse já mostra com o salto de um nível do D16.
Emitir um segundo termo para o mesmo objeto físico é pedir duas assinaturas para
um fato.

### D88 — Aceite pendente não bloqueia a entrega.

**Decidido:** o checkout conclui, a `Assignment` abre, o status vai para `IN_USE`
e o `Acceptance` nasce pendente ao lado. Pendência é **linha de relatório**, não
estado da posse.
**Descartado:** a entrega ficar em estado intermediário até a assinatura.
**Por quê:** é o **D28 aplicado ao documento**. O equipamento já está na mão da
pessoa — o fato é do mundo, não do banco. Um sistema que recusa registrar o que
aconteceu produz dado falso na hora seguinte: quem precisa entregar o notebook
hoje entregaria e cadastraria depois, ou cadastraria como se não exigisse termo.

**E é o que torna o D27 coerente no tempo:** com alvo `LOCATION`, o termo espera
o gestor, que pode estar de férias. Travar a entrega até ele assinar é travar a
Mesa 1 por uma assinatura — exatamente o que o D27 recusou ao descartar *"cada
ocupante assina o seu"*.

**O que a pendência faz:** aparece em `GET /api/acceptances?view=pendentes`, é
reenviável, e expira. `resolverResponsaveis()` **não** muda — quem está com o
equipamento responde por ele, assinado ou não.

### D89 — A troca do `AGENT_TOKEN` pelo `ApiToken` é por convivência, com prazo.

**Decidido:** durante a transição, `authenticate-agent.helper.ts` aceita **os
dois**: o `ApiToken` por prefixo e, se não casar, o `AGENT_TOKEN` compartilhado —
este último logando `warn` com o IP a cada uso. Quando o log parar de aparecer, o
caminho antigo sai, num commit só, deliberado.
**Descartado:** corte seco na subida da migration.
**Por quê:** o agente é um binário C# que **não está neste repositório** e roda em
máquinas que ninguém desliga para atualizar em bloco. Cortar o token compartilhado
num deploy derruba a frota inteira e, pior, derruba o canal por onde se
descobriria que ela caiu: quem não conecta não reporta.

**O log de depreciação é a parte que não pode faltar.** Sem ele, a convivência
vira permanente por esquecimento — o token compartilhado fica no `.env` por mais
um ano e a fase é dada como concluída. Com ele, a pergunta *"já dá para cortar?"*
tem resposta observável.

---

## Riscos e armadilhas

**`@fastify/static` registrado duas vezes derruba o boot.** Continua valendo caso
alguém reintroduza a segunda raiz apesar do D84: sem `decorateReply: false`, o
Fastify lança `FST_ERR_DEC_ALREADY_PRESENT` porque `sendFile` já foi decorado.

**`../../` no nome do arquivo.** O nome no disco é `uuid` + extensão da allowlist
e `path.join` **não** protege sozinho: o caminho final é conferido contra a raiz
resolvida antes de qualquer escrita ou leitura.

**O token de aceite viaja na URL.** `core/logger/sanitize.ts` mascara chaves
sensíveis do corpo, e o `SENSITIVE_KEY` já casa `token` — mas `/aceite/<token>`
está no **caminho**, que o `request-logger` grava inteiro. O caminho precisa ser
mascarado antes de virar log, senão o `X-Request-Id` sai acompanhado da credencial
que ele deveria proteger.

**Duas janelas de job na mesma tabela.** O `claim-window.ts` é do D79 e recebe o
nome por parâmetro. Reusar a linha `'lembrete-de-atraso'` para o alerta da F8
reabre exatamente o conflito que o D79 fechou — e o sintoma é um dos dois alertas
**nunca** sair, sem erro em lugar nenhum.

**`imagePath` em quatro tabelas é quatro caminhos de exclusão.** Apagar o
fabricante não pode deixar o arquivo, e apagar o arquivo não pode deixar a coluna
apontando para o vazio. O catálogo **não** tem lixeira (D8): ali o delete é real e
o arquivo vai junto, depois do commit.

**`Acceptance` com `expiresAt` e o relógio.** Termo expirado não é termo recusado:
`expiresAt` vencido com `acceptedAt` nulo continua **pendente**, reemitível, e não
vira `declinedAt`. Confundir os dois faria o relatório de não aceitos esvaziar
sozinho com o tempo.

**`migrate diff` de novo.** Enum novo não compila em uma linha (`P1012`) — um valor
por linha em `ApiTokenOwner`. O CHECK do D80 e os dois índices parciais **não saem
do gerador** e entram à mão. E revisar o SQL antes de aplicar continua valendo: o
gerador já emitiu `DROP TABLE` onde era rename, neste repositório.

**O `= null` do `recordActivity` some no meio da Leva 1.** Qualquer trabalho em
paralelo que chame `recordActivity` durante a leva vai quebrar na compilação — que
é o efeito desejado, mas é melhor saber antes do que descobrir num merge.

---

## Verificação

Este é o primeiro plano que nasce depois de `tests/` existir, e por isso a
verificação **não** é um roteiro de `curl`: é arquivo de teste, rodando contra
Postgres de verdade pelo `app.inject()`, com o banco semeado antes de cada
arquivo ([`TESTES.md`](./TESTES.md)).

| Leva | Arquivo | O que prova |
|---|---|---|
| 1 | `tests/invariantes/ator.test.ts` | as 5 operações de catálogo e ocupação gravam `actorId` |
| 1 | `tests/formularios/datas.test.ts` | `expectedCheckinAt` de ontem → 422; de hoje → 201 |
| 1 | `tests/listagens/vistas-do-ativo.test.ts` | arquivado some de `active`, aparece em `?view=archived`, e `?statusId=` do arquivado **devolve** o ativo |
| 2 | `tests/anexos/upload.test.ts` | anônimo em `/api/attachments/:id/download` → 401; MIME fora da allowlist → 422; `../../` no nome não escapa da raiz; soft delete do ativo **não** apaga o arquivo |
| 3 | `tests/jobs/janela.test.ts` | dois jobs de nomes diferentes ganham a janela no mesmo dia; o mesmo job duas vezes, não |
| 3 | `tests/correio/no-op.test.ts` | sem SMTP, o envio loga e **não** lança; falha de envio não desfaz o checkout |
| 4 | `tests/aceite/fluxo.test.ts` | categoria com `requireAcceptance` gera termo no checkout; alvo `ASSET` não gera (D87); alvo `LOCATION` sem gestor → 409 (D27); a entrega conclui com o termo pendente (D88); token usado duas vezes → 409 |
| 5 | `tests/invariantes/api-token.test.ts` | token revogado → 401; prefixo inexistente → 401 sem diferença de tempo; o CHECK do dono recusa `USER` com `endpointId` |

Além dos testes, duas provas que só o SQL dá, no padrão de
`prisma/verificacoes/`:

```sql
-- anexo órfão: linha apontando para arquivo que não existe mais no disco
-- (roda pelo script, comparando com o listado de UPLOAD_DIR)

-- aceite pendente de assignment já devolvida: o termo ficou para trás
SELECT a.id FROM acceptances a
  JOIN assignments s ON s.id = a."assignmentId"
 WHERE a."acceptedAt" IS NULL AND s."checkinAt" IS NOT NULL;
```

---

## Ordem de commits

```
Leva 1
  1. feat(activity): ator em catalog e occupancy; remove o default de recordActivity
  2. fix(assignment): recusa devolução prevista no passado
  3. feat(user): histórico da pessoa
  4. feat(asset): vista de arquivados

Leva 2
  5. feat(db): imagePath, Attachment e autoria do ativo
  6. feat(core): storage — gravação, allowlist de MIME e nome seguro
  7. feat(attachment): upload, download autenticado e exclusão
  8. feat(web): aba Arquivos e imagem do ativo

Leva 3
  9. feat(db): JobRun e índice parcial dos vencidos
 10. feat(core): correio com transporte no-op; janela de execução de job
 11. feat(assignment): e-mail de entrega e devolução
 12. feat(assignment): lembrete diário de atraso

Leva 4
 13. feat(db): Acceptance e status de entrega/devolução no AppSetting
 14. feat(acceptance): emissão dentro do checkout e página pública do termo
 15. feat(acceptance): assinatura e PDF
 16. feat(acceptance): relatório de pendentes e reenvio

Leva 5
 17. feat(db): ApiToken com dono polimórfico
 18. feat(auth): autenticação por token de API, com convivência
 19. feat(web): tela de tokens do agente
```

Dezenove commits, quatro migrations. Cada leva fecha compilando e com a suíte
verde: nenhuma delas deixa o repositório num estado que exija a seguinte.

---

## O que este plano NÃO faz

| O quê | Por quê |
|---|---|
| **RBAC** | é a F11. Aqui, qualquer sessão válida continua podendo tudo — inclusive baixar qualquer anexo |
| **Anexo em licença e manutenção** | `Attachment` nasce com FK direta para `Asset`. Quando a F6 e a F8 quiserem, é uma coluna nulável e um discriminante — aditivo, o padrão do `Assignment` |
| **Backfill de ator** | D24, e continua valendo: o que é anterior ao login segue sem ator |
| **Renomear `Asset.assignedToId`** | é cache do caso `USER` e está documentado como tal (D17). Mexer nele agora é migração sem ganho |
| **Tirar o `AGENT_TOKEN` do `.env`** | é o commit seguinte à Leva 5, depois de o log de depreciação silenciar (D89) |
| **Sincronizar o `ITAM-TODO.md`** | é trabalho de documentação, não deste plano — mas precisa acontecer: ele marca a F2 e a F3 inteiras como pendentes |

---

# O que entrou — Levas 2 a 5 ✅ F0–F4 COMPLETAS

> Escrito **depois** da implementação, contra o código que está no repositório.

## Leva 2 — armazenamento

Migration `20260923150000_anexos_e_autoria`: `imagePath` nas quatro tabelas,
`Attachment` e `createdById`/`updatedById` no `Asset`. Nasceram
`server/core/storage/` (bytes) e `server/domain/attachment/` (a linha), com
`POST|GET /api/assets/:id/attachments`, `GET /api/attachments/:id/download`,
`DELETE /api/attachments/:id` e `GET|PUT|DELETE /api/images/:alvo/:id`. A aba
Arquivos saiu de "próxima leva" para funcional.

**O D84 está provado em teste:** `tests/anexos/upload.test.ts` verifica que
anônimo leva 401 no download **e** que `GET /uploads/*` não é rota nenhuma. Se
alguém registrar `@fastify/static` ali, o teste cai.

**Um defeito latente corrigido de passagem:** `assets_retiredAt_idx` e
`locations_isWorkstation_idx` foram criados à mão numa migration e nunca
declarados no schema — então **todo** `migrate diff` emitia `DROP INDEX` deles.
Declarados, os DROPs sumiram das quatro migrations desta leva.

## Leva 3 — correio e agendamento

Migration `20260923160000_job_run_e_vencidos`: `JobRun` (D79) e o índice parcial
`assignments_vencidos`, à mão porque o Prisma não expressa `WHERE`. Nasceram
`core/mail/mailer.ts` (no-op que loga sem SMTP), `core/jobs/claim-window.ts` e
`assignment/jobs/overdue-reminder.job.ts`. O checkout e o checkin passaram a
avisar **depois do commit**, e `Category.checkinEmail` deixou de ser coluna morta.

**Uma regressão evitada:** ao unificar o `rotuloDoAlvo` — duplicado entre o
histórico e o e-mail — a versão compartilhada devolvia texto de reserva no lugar
de `null`. O `tsc` aceitou (string é atribuível a `string | null`), mas a aba
Histórico teria passado a escrever *"Entregue para colaborador"* onde antes
escrevia *"Entregue"*. Separado em `rotuloDoAlvo` (null) e
`rotuloDoAlvoOuPadrao` (texto de reserva, só para o corpo do e-mail).

## Leva 4 — aceite, assinatura e PDF

Migration `20260923170000_aceite`: `Acceptance`, o índice parcial
`acceptances_um_pendente_por_posse` e `AppSetting.checkoutStatusId`/`checkinStatusId`.
Nasceram `server/domain/acceptance/` e `src/pages/aceite/` com assinatura em
`<canvas>` e PDF por `pdfkit`. `Category.requireAcceptance` e `eulaText`, inertes
desde a F1, ganharam dono.

**A colisão de rota que só apareceria em produção.** O plano dizia
`/aceite/:token` para a API, e `/aceite/:token` já é a rota da **página** no
React Router. Em produção o Fastify resolveria a API antes do `/*` que entrega o
`index.html` e o navegador receberia JSON no lugar da tela — em desenvolvimento
não, porque o proxy do Vite só encaminha `/api`. A API passou para
`/api/aceite/*`, e `tests/aceite/fluxo.test.ts` trava a separação com
`hasRoute`.

**O token é mascarado no log.** `/api/aceite/<32 bytes>/aceitar` é um POST, e o
`request-logger` gravava o caminho inteiro. Agora sai `/api/aceite/***/aceitar`.

## Leva 5 — `ApiToken` por agente

Migration `20260923180000_api_token`: a tabela única do D80, com o enum, o CHECK
de coerência do dono e o índice parcial `api_tokens_um_ativo_por_endpoint`.
Nasceram `auth/helpers/api-token.helper.ts` (sha256, não argon2),
`authenticate-api-token`, `manage-api-tokens`, `bind-agent-token` e a tela
`/tokens`. O `/agent-hub` aceita **os dois** caminhos, e cada uso do
`AGENT_TOKEN` compartilhado sai como `warn` com o IP (D89).

## Verificação

```
tests/anexos/upload.test.ts             15   D84, travessia de caminho, lixeira
tests/jobs/janela.test.ts                6   D79 — dois jobs no mesmo dia
tests/correio/aviso.test.ts              7   D86 — entrega não depende do SMTP
tests/aceite/fluxo.test.ts              15   D27, D87, D88, uso único, PDF
tests/invariantes/api-token.test.ts     14   D80 — segredo nunca volta, CHECK

Suíte: 88 → 145 asserções. `npm run build` e `npm run lint` limpos.
5 migrations, todas aplicadas.
```

## O que continua fora, e por quê

| O quê | Por quê |
|---|---|
| **RBAC** | é a F11. Qualquer sessão válida ainda pode tudo, inclusive emitir token de agente |
| **Anexo em licença e manutenção** | `Attachment` nasceu com FK direta para `Asset`; F6 e F8 acrescentam coluna nulável e discriminante |
| **Tirar o `AGENT_TOKEN` do `.env`** | é o commit seguinte, depois de o log de depreciação silenciar (D89) |
| **Outbox de e-mail** | D86, com o preço escrito: um aviso perdido está perdido |
