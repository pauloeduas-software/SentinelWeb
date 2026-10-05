# Plano de implementação — Fase 10: etiquetas, relatórios e importação ✅ CONCLUÍDA

> Fase 10 do [`../ROADMAP.md`](../ROADMAP.md). Convenções de camada:
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md). Contrato de posse: [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md).
>
> Escrito em **24/09/2026** como plano prospectivo e **revisado em 01/10/2026** contra a
> árvore com a F8 e a F9 fechadas (`28b9125`), antes de qualquer linha desta fase existir.
> A revisão achou **5 afirmações caducadas** e **11 defeitos** (3 🔴, 5 🟠, 3 🟡), três deles
> mudando o que seria entregue — e está **incorporada aqui**: as etapas, o SQL da view, os
> riscos e a ordem de execução são os revisados. O que caducou ficou registrado em
> *A revisão do plano*, não apagado.
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões
> **D65–D71** (do plano) e **D129–D134** (da revisão), na numeração contínua do projeto
> (D1–D13 no TODO, D14–D17 em [`../decisoes/posse.md`](../decisoes/posse.md)).
>
> **A FASE FECHOU.** As oito levas (D0 e A–G) estão aplicadas — ver o
> [Fechamento da F10](#fechamento-da-f10), no fim deste arquivo, com o que a execução
> decidiu por conta própria, os cinco defeitos que a revisão do código encontrou depois, e
> o que ficou de fora com o motivo.

---

## Objetivo

Fazer o dado **entrar e sair** do sistema: importar a realidade de uma empresa inteira de um CSV,
exportar qualquer listagem, montar relatório por coluna escolhida, e colar uma etiqueta que o
leitor ache em um bipe. Duas coisas aqui existem por causa do modelo de posse e não existiriam num
ITAM de prateleira: o importador sabe carregar **ocupação de posto** (Mesa, pessoa, turno), que é
a forma prática de dizer quem responde por 300 equipamentos de uma vez; e o report builder sabe
agrupar por **responsável resolvido**, que não é coluna de tabela nenhuma.

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F4 concluída** | posse importada passa pelo **checkout** (D17), não por `UPDATE` em `assignedToId`. Sem o use-case de checkout, o importador não tem como gravar posse |
| **F8 concluída** | `/relatorios` e `AppSetting.timezone` nascem lá; esta fase acrescenta abas, não cria a moldura |
| **F9 concluída** | `Asset.customFields` em JsonB, índice GIN, filtro `cf[slug]` e cifra por campo. Campo customizado no import e no export deixou de ser "se der" e **é item da fase** |
| **Nada a instalar** | `bwip-js`, `qrcode`, `pdfkit` e `papaparse` (com os `@types`) **já estão** no `package.json`. O parser de CSV já foi escolhido por quem instalou: `papaparse`, não um `split(';')` à mão |
| **A suíte `tests/`** | 51 arquivos e 522 testes antes desta fase, em dois projetos (`puro` sem banco, `banco` com Postgres real). Toda etapa daqui entrega teste — o `curl` é complemento, não a verificação |

---

## A revisão do plano — 01/10/2026

Nada aqui é opinião sobre o texto antigo: cada linha aponta para o arquivo que a contradiz.
Nenhuma linha da F10 estava no código quando a revisão rodou — o que ela confere é o **plano**
contra o que as fases seguintes construíram.

### Como a revisão foi feita

| Verificação | Resultado |
|---|---|
| `tsc -b` (app + server + node, `strict`) | ✅ exit 0 |
| `eslint .` (inclui as regras de camada) | ✅ exit 0 |
| `npm test` (suíte contra Postgres real) | ✅ 51 arquivos, **522 testes**, 173 s — baseline verde antes da fase |
| Dependências do plano × `package.json` | ❌ o plano dizia "nenhum instalado"; os três estavam |
| Rotas de `/api/settings` × `settings.maestro.ts` | ❌ são 5, não 1 |
| `?q=` dos três `/options` | ❌ já existia no servidor; faltava só na tela |
| SQL da view × `resolve-responsibles.usecase.ts` | ❌ divergiam em dois pontos (lixeira e nulo) |
| `CheckoutData` × "posse importada passa pelo checkout" | ❌ faltava `checkoutAt`; e o checkout manda e-mail |
| Índices que o D66 promete | ✅ os três existem desde a migration de posse |
| `locations.name @unique` (chave do import de ocupação) | ✅ `schema.prisma:551` |

A suíte **não encontrou defeito nenhum** nesta revisão — não havia código desta fase para ela
exercitar. Ela serviu de linha de base: o que a F10 quebrasse, quebraria contra uma árvore verde.

### O que caducou — o plano falava de 24/09

| O plano dizia | A árvore de 01/10 | O que mudou |
|---|---|---|
| *"`bwip-js`, `qrcode`, `pdfkit`: **nenhum instalado**"* | os três estão no `package.json`, com os `@types`. `pdfkit` já roda no termo de entrega (`acceptance/helpers/termo-pdf.helper.ts`); `bwip-js` e `qrcode` estão instalados e **sem um único import**. `papaparse` + `@types/papaparse` também — e o plano nem o citava | O pré-requisito sumiu. A Etapa G e a D não começam por `npm i`, e o parser de CSV **já estava escolhido**: `papaparse` |
| *"Não há suíte: a verificação é a seção acima"* | **51 arquivos de teste**, dois projetos, `app.inject()` pelo mesmo Fastify de produção ([`../referencia/testes.md`](../referencia/testes.md)) | A verificação por `curl` virou **complemento**. Toda etapa desta fase tem pasta de teste, e a seção *Verificação* diz qual |
| *"hoje só existe `/api/settings/next-asset-tag`"* | são **cinco** rotas: `next-asset-tag`, `GET`/`PUT /discovery` (F7) e `GET`/`PUT /alerts` (F8) | `GET /api/settings` não nasceu num espaço vazio: nasceu ao lado de dois pares que já leem e escrevem o mesmo singleton. A Etapa A entrega o **terceiro recorte**, não uma rota que devolve o registro inteiro |
| *"F9 (desejável) … sem a F9 nada trava"* | F9 fechada | Campo customizado no import e no export deixou de ser opcional e virou item da fase |
| Ordem de commits em `feat(settings):`, `feat(api):`, `feat(web):` … | as cinco últimas fases são **um commit cada**, `feat: <frase em português>`, **sem escopo** (`28b9125`, `567d175`, `8cac187`…) | A seção de commits descrevia uma convenção que o histórico abandonou. Refeita em *Ordem de execução* |

Nenhum dos cinco é erro de raciocínio: é um plano prospectivo que o projeto ultrapassou. Os onze
abaixo são outra coisa.

### Os onze defeitos

#### 🔴 1 — A view do D66 não filtrava a lixeira. O próprio plano exigia isso

A seção *Riscos* escrevia, com todas as letras: *"A view precisa do `deletedAt IS NULL` **dentro
dela**, ou o relatório de responsáveis vai contar ativos que estão na lixeira"*. O SQL impresso
três parágrafos acima **não tinha o filtro** — nenhuma das três pernas tocava em `assets`.

Não é redundância do risco: `$queryRaw` não passa pela `softDeleteExtension`
(`core/database/soft-delete.extension.ts`), então o relatório contaria ativo apagado, e a planilha
fecharia com um número que a tela de ativos não produz. É o D8 por outro caminho — exatamente como
o risco dizia, e o SQL não fazia.

**Correção:** `JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL` nas três pernas. O
SQL inteiro, corrigido, está na Etapa F.

#### 🔴 2 — A view emitia responsável NULO. A tela nunca emitiu

A terceira perna (o salto de `ASSET`) projetava `COALESCE(h."targetUserId", o2."userId")`. Os dois
lados são nulos em dois casos reais:

- a dock está entregue a um **posto sem ocupante aberto** (o `LEFT JOIN` não casa);
- a dock está entregue a **outro ativo** (`h."targetType" = 'ASSET'`), que é onde o salto para por
  decisão (D16).

Nos dois, `resolverResponsaveisEmLote` devolve `responsaveis: []` — `responsaveisPeloAtivoAlvo()`
retorna lista vazia e a tela não mostra ninguém. A view devolveria **uma linha com `userId` nulo**,
e o `GROUP BY r."userId"` da própria seção de Verificação criaria um balde `NULL` que a tela nunca
teve.

Duas respostas para "quem responde por este ativo" é o D16 renascendo como view — a mesma coisa que
o D66 existe para evitar.

**Correção:** `AND COALESCE(h."targetUserId", o2."userId") IS NOT NULL` na terceira perna, mais o
teste de equivalência da *Verificação*, que é o que impede as duas definições de divergirem de novo
na fase seguinte.

#### 🔴 3 — Posse importada passava pelo checkout — e o checkout manda e-mail e emite termo

O plano estava certo no princípio (D17: posse importada é `Assignment`, nunca `UPDATE` em
`assignedToId`) e não olhou o que `checkoutAsset` faz. Ele faz três coisas que o importador não
pode fazer 500 vezes:

1. **emite o termo de entrega** (`issueAcceptance`, dentro da transação) e
2. **dispara o convite de assinatura por e-mail** para o signatário, mais o aviso de entrega
   (`checkout-asset.usecase.ts:212-233`);
3. **recusa o ativo que não está `DEPLOYABLE`**: *"Só ativo disponível pode ser entregue, e este
   está como X"* (409).

Importar a realidade de uma empresa com 500 equipamentos já entregues mandaria, como estava
escrito, **500 convites para assinar termo de equipamento que a pessoa recebeu há dois anos** — e a
primeira reação de quem recebe é abrir chamado. É o tipo de efeito de segunda ordem que a própria
Etapa E se orgulha de ter previsto para a ocupação; aqui ele passou.

E faltavam duas peças para a ideia funcionar:

- **`CheckoutData` não tinha `checkoutAt`.** A coluna existe (`@default(now())`), mas nada no
  caminho da entrega aceitava uma data: `checkoutAt` retroativo é parâmetro novo, e
  `expectedCheckinAt` é validado por `dataNaoPassada()` — o validador de uma data retroativa é
  outro.
- **O ativo precisa estar `DEPLOYABLE` no instante do checkout.** Isso responde a *Pergunta em
  aberto* nº 2 do plano, e responde melhor do que ela propunha: o importador **cria o ativo no
  status disponível e passa o status do CSV como `statusId` da entrega** — que é um parâmetro que
  `checkoutAsset` já aceita e aplica. A invariante 4 fica satisfeita pelo caminho normal, sem o
  importador escrever status nenhum à mão, e sem exigir do CSV uma coluna *Status* coerente que
  ninguém revisa.

**Correção:** uma leva própria **antes** da Etapa D (a Etapa D0), com `checkoutAt?` e um modo
silencioso explícito em `CheckoutData` (D131). O `bulk-checkout.usecase.ts` já é o precedente do
"N entregas independentes com relatório" (D31) — o importador é o terceiro chamador do mesmo
caminho, não um quarto jeito de abrir posse.

#### 🟠 4 — "Posto vago" já tinha duas implementações. A view seria a terceira

O plano dizia que os três relatórios próprios *"saem dessa view"*. **Posto vago não sai**: a
segunda perna é `JOIN` com `location_occupants`, e posto vago é precisamente o posto **sem**
ocupante aberto — ele não produz linha nenhuma na view, por construção.

E ele já existia duas vezes, escrito e revisado:

- `POSTO_VAGO` em `asset/helpers/asset-filters.helper.ts` — filtro do Prisma, exposto como
  `?relatorio=posto-vago` na listagem de ativos;
- `ehPostoVago()` em `workstation/helpers/workstation-row.helper.ts`, que é o que a tela `/postos`
  pinta.

Uma terceira versão em SQL cru é o D16 pela terceira vez na mesma fase. **Correção:** a aba
*Posto vago* consome `POSTO_VAGO` (D130). A view responde as outras duas perguntas — *ativos por
posto* e *o que cada pessoa responde* —, que são as que precisam **agrupar**.

#### 🟠 5 — `via` em dois vocabulários

A view projetava `'USER' | 'LOCATION' | 'ASSET'`. A aplicação inteira — tipo `ViaPosse`, resposta
da API, tela de ativo, de posto e de ociosos — fala `'DIRETO' | 'POSTO' | 'ATIVO'`. O relatório
sairia com uma terceira língua para um fato que o resto do sistema já nomeia, e a primeira pessoa a
comparar as duas telas vai perguntar se são a mesma coisa.

**Correção:** a view projeta `DIRETO`/`POSTO`/`ATIVO`.

#### 🟠 6 — O casamento por e-mail não tinha `@unique` para casar

A Etapa E diz, certíssima, que a pessoa casa **por e-mail, nunca por nome**. Só que `User.email`
**não é `@unique` no Prisma**: a unicidade é índice **parcial** (`users_email_unique_undeleted`,
`WHERE deleted_at IS NULL`), justamente para que um usuário na lixeira não trave o recadastro do
mesmo endereço (`schema.prisma:148-157`).

Consequência prática: `prisma.user.findUnique({ where: { email } })` **não compila** — tem de ser
`findFirst`, que a extension de soft delete já escopa. E o caso que o índice parcial permite (duas
linhas com o mesmo e-mail, uma na lixeira) tem de virar linha `IGNORADA` com motivo, não um
`findFirst` que pega a primeira que aparecer (D132).

#### 🟠 7 — A Etapa B era metade do que estava escrito: a busca do servidor já existia

O plano pedia *"busca server-side no `ReferenceSelect.tsx`"* como se o servidor não a tivesse. Tem,
nos três: `listCatalogOptions(spec, q, filtro)`, `listAssetOptions(q)` e `listUserOptions(q)`
aceitam `q` e o aplicam no `where`, com `take: 200`.

O que faltava era **só a tela**, e um detalhe que é onde a implementação tropeçaria:
`useCatalogOptionsQuery(rota, tipo)` (`src/domain/catalog/catalog.queries.ts:36`) **não repassava
`q`** e tinha `staleTime: 60_000` com a chave de cache sem o termo — digitar no campo novo sem mexer
nisso devolveria a mesma lista de sempre, em silêncio. A etapa encolheu de **M** para **P**, e o
`useDebouncedValue` que o plano citava de fato já existia (`src/pages/hooks/useDebouncedValue.ts`,
usado por cinco telas).

#### 🟠 8 — O teto do multipart é o do anexo, e é global

`@fastify/multipart` está registrado **uma vez, na aplicação inteira**, com `fileSize: 10 MB`,
`files: 1` e `fields: 10` (`server/app.ts`). Para o import isso significa:

- o **mapeamento tem de viajar como UM campo** (JSON em string), não como um campo por coluna — um
  CSV de 15 colunas mapeadas estouraria `fields: 10` no transporte, antes de qualquer handler, e o
  erro não falaria de mapeamento;
- 10 MB é teto de **anexo**, escolhido para PDF e imagem. Um CSV de 5.000 linhas cabe com folga; um
  de 200 mil, não — e a recusa viria com a mensagem de anexo.

A rota de import declara os próprios `limits` na leitura do arquivo (`request.file({ limits: {
fileSize, files: 1 } })`, que o `@fastify/multipart` aceita por chamada), e isso ficou escrito antes
de ser descoberto pelo usuário (D134).

#### 🟡 9 — `format.helper.ts` tem `pt-BR` e `BRL` escritos à mão em quatro lugares

A Etapa A está certa ao dizer que `src/lib/format.ts` não nasce e que o arquivo certo é
`src/pages/helpers/format.helper.ts`. Vale escrever o tamanho do trabalho: são **quatro funções**
com `'pt-BR'`/`'BRL'` literais (`formatarResidual`, `formatarMoeda`, `formatarMeses`,
`formatarData`) — e `formatarData` **fatia a string ISO de propósito**, para não deslocar o dia num
fuso a oeste. Trocá-la por `Intl.DateTimeFormat` sem o cuidado equivalente reintroduz o bug que o
comentário dela documenta.

#### 🟡 10 — O QR precisa de `urlDoPainel()`, que morava no correio

O D70 manda o QR levar `${APP_URL}/ativos/:id`. A função que resolve isso já existia —
`urlDoPainel()` — mas dentro de `core/mail/mailer.ts`, porque até então só o e-mail precisava de
link absoluto. Um domínio de **etiqueta** importando do **correio** passa no lint e mente sobre a
dependência.

**Correção:** mover para `core/config/app-url.ts` e o `mailer` passa a importar de lá. Uma linha,
feita antes de existir o segundo chamador.

#### 🟡 11 — O export de licença: a allowlist existia e o plano não a citava

O `../ROADMAP.md` marca em ⚠️ que `productKey` não pode entrar no CSV; o plano da F10 não repetia
isso em lugar nenhum. E a peça certa já existia: `license/helpers/license-select.helper.ts` devolve
**`productKeyMask`** e nunca a coluna cifrada.

A regra do export fica sendo: **export não monta `select` próprio** — ele reusa o
`*-select.helper.ts` do domínio, que é onde a allowlist da resposta foi revisada (D133). Vale para
licença hoje e para custo de compra quando a F11 chegar.

### O que o plano acertou, e merece ficar escrito

As partes que costumam estar erradas num plano escrito antes do código. Estas passaram:

- **Os índices que o D66 promete existem todos**, desde a migration do modelo de posse:
  `assignments(assetId, checkinAt)`, `location_occupants(locationId, endedAt)` e — que o plano nem
  citava, e a terceira perna precisa — `assignments(targetAssetId, checkinAt)`.
- **`locations.name` é `@unique` de verdade** (`schema.prisma:551`), então a frase *"o nome **é**
  chave"* do import de ocupação se sustenta. É o oposto do caso do e-mail (defeito 6) — e os dois
  estavam no mesmo parágrafo do plano.
- **O índice que torna a reimportação idempotente existe com o nome citado**,
  `location_occupants_um_aberto_por_pessoa_local`, e `addLocationOccupant` já traduz o `P2002` em
  frase de gente — o importador reusa esse caminho em vez de checar antes.
- **Uma VIEW não quebra o harness.** `tests/setup/database.ts` monta o `TRUNCATE` a partir de
  `pg_tables`, que lista tabela e não view. Era a pergunta prática que o D66 não respondia.
- **A moldura de `/relatorios` existe e já estava escrita esperando esta fase** —
  `report.maestro.ts` e `src/pages/relatorios/index.tsx` dizem, em comentário, que o export, o
  seletor de colunas e o builder entram como abas dali.
- **O BOM nos dois sentidos, o escape de fórmula, o dry-run em dois passos e o token→fragmento**
  não tinham correção a receber. São o miolo do plano, e continuam certos.

---

## Etapa D0 — O checkout aprende data retroativa e silêncio · **P**

> *Nasce antes de tudo que grava posse. É a leva que o plano não tinha, e ela mexe na F4, que é
> fundação — misturá-la com o parser de CSV faria uma revisão não conseguir separar as duas.*

- **Schema:** nada muda.
- **Muda:** `CheckoutData` ganha `checkoutAt?: Date` (validado como data **passada**, não futura) e
  `semAviso?: boolean`. `executarCheckout` grava `checkoutAt` quando vier; `checkoutAsset` pula o
  `issueAcceptance` e os dois `dispararAviso` quando `semAviso`.
- **Regra:** o silêncio é **explícito e só para importação**. A tela nunca o passa — entrega feita
  pela tela continua emitindo termo e e-mail (D131).
- **Teste:** `tests/importacao/checkout-retroativo.test.ts` — posse com `checkoutAt` de 2024 entra;
  com data futura, 422; com `semAviso`, **zero** `Acceptance` criado.

---

## Etapa A — `AppSetting` cresce; a tela de sistema e o backup · **M**

- **Schema:** `AppSetting` ganha `companyName`, `logoPath?`, `faviconPath?`, `primaryColor`,
  `locale @default("pt-BR")`, `dateFormat`, `currency @default("BRL")`,
  `csvDelimiter @default(";")` e `backupRetentionDays`. **Nenhuma tabela `Setting` nova** (D65).
- **Nasce:** aba *Sistema* em `src/pages/configuracoes/`, `server/domain/backup/`
  (`create-backup.usecase.ts`, `list-backups`, `prune-backups`), e `GET`/`PUT /api/settings`.
- **Regra:** `pg_dump` roda por `execFile('pg_dump', [...])`, **nunca** `exec` com string montada —
  e o diretório de dump fica **fora** de `dist/` e de `UPLOAD_DIR`, fora de qualquer raiz do
  `@fastify/static`. A rota nasce atrás de `BACKUP_ENABLED` (default desligado) e, na **F11**, atrás
  da permissão de dado sensível.
- **Revisado:** as cinco rotas de `/api/settings` que já existem **ficam onde estão** —
  `/discovery` e `/alerts` têm donos (F7 e F8) e telas próprias. O que nasce é o **terceiro
  recorte**, não uma rota que devolve o singleton inteiro: `cryptoCanary` e `assetTagNext` não vão
  para a tela. E hoje **não há nenhum `child_process` no projeto** — este é o primeiro.
- **Teste:** `tests/configuracoes/sistema.test.ts` — `PUT` recusa `locale` fora da lista; `GET` não
  devolve `cryptoCanary`; com `BACKUP_ENABLED` ausente, a rota de backup responde 404.

O `src/lib/format.ts` que o TODO pede **não nasce**: `src/pages/helpers/format.helper.ts` já
existe e é o arquivo certo pelo `../referencia/arquitetura.md` — ele passa a ler `locale`, `dateFormat` e
`currency` do `AppSetting` por hook, nas quatro funções que hoje têm `pt-BR`/`BRL` literais
(defeito 9), preservando o fatiamento da string ISO em `formatarData`. `pg_dump` roda pelo container
do Postgres — versão de cliente menor que a do servidor recusa o dump.

---

## Etapa B — Catálogo de colunas, seletor salvo e combobox com busca · **P** *(era M)*

- **Schema:** nada muda.
- **Nasce:** `src/pages/ativos/helpers/asset-columns.ts` (catálogo de INTERFACE),
  `src/domain/asset/asset.store.ts` (zustand + `persist`), campo de busca no `ReferenceSelect.tsx`
  usando o `useDebouncedValue` que já existe.
- **Regra:** o cliente manda **token** de coluna; o servidor casa contra allowlist e responde 422
  listando os válidos quando não casar (D71).
- **Revisado:** o servidor **não muda** — os três `/options` já aceitam `?q=` e o aplicam no
  `where`. O trabalho é `useCatalogOptionsQuery` passar `q`, entrar com ele na `queryKey` e o
  `staleTime` deixar de esconder a digitação (defeito 7). A allowlist de ordenação já existe
  (`ASSET_SORTABLE`, cinco colunas) e **não é** o catálogo de export — o catálogo é maior, e o nome
  de cada um tem de dizer isso.
- **Teste:** `tests/listagens/opcoes-com-busca.test.ts` — `?q=` filtra no servidor e o vínculo
  atual continua aparecendo acima de 200 opções.

O `/options` tem teto de 200 — acima de 200 localizações, escolher a 201ª é impossível pela tela. A
busca é do servidor, não filtro local sobre 200 linhas, senão o problema só muda de número. A
preferência de colunas é **client state**: ninguém a busca, só existe naquele navegador — é o caso
que o `../referencia/arquitetura.md` já nomeia para o zustand.

---

## Etapa C — Export CSV com BOM UTF-8 · **P**

- **Schema:** nada muda.
- **Nasce:** o helper de CSV e `GET /api/<listagem>/export` por domínio.
- **Regra:** o corpo começa com o BOM, o cabeçalho é `Content-Type: text/csv; charset=utf-8` +
  `Content-Disposition` com `filename*=UTF-8''…`. **Número cru** (ponto decimal), **data ISO**, e
  **todo valor que começa com `=`, `+`, `-` ou `@` é prefixado** — senão a célula vira fórmula ao
  abrir (D69). Export por stream com cursor: o teto de `perPage` não vale aqui, e a rota tem rate
  limit próprio.
- **Revisado:** o export **reusa o `*-select.helper.ts` do domínio** (D133). Em licença isso é a
  diferença entre exportar `productKeyMask` e vazar a chave num arquivo que circula por e-mail — a
  quarta porta que o TODO nomeia.
- **Teste:** `tests/relatorios/export.puro.test.ts` (BOM, escape de fórmula, delimitador, data ISO
  — função pura, sem banco) + `tests/relatorios/export.test.ts` (a rota de licença **não** traz
  `productKey`; os filtros da listagem valem no export).

Sem o BOM, o Excel em português lê o arquivo como Windows-1252 e todo acento sai quebrado — é a
razão declarada no TODO. E **o mesmo BOM é armadilha do outro lado** (Etapa D).

---

## Etapa D — Importador: `Import` + `ImportRow`, dry-run obrigatório · **G**

- **Schema:** enums `ImportTarget` (`ASSETS`, `USERS`, `OCCUPANTS`) e `ImportRowStatus` (`OK`,
  `ERRO`, `IGNORADA`); `Import` (`filename`, `target`, `mapping Json`, `status`, totais,
  `actorId?`) e `ImportRow` (`importId`, `lineNumber`, `raw Json`, `status`, `message?`,
  `entityId?`), `Cascade` do `Import` para as linhas.
- **Nasce:** `server/domain/import/` (maestro, controller, `parse-csv.usecase.ts`,
  `dry-run-import.usecase.ts`, `apply-import.usecase.ts`, `helpers/csv-parse.helper.ts` sobre
  `papaparse`, `helpers/row-mapper.helper.ts`), `src/pages/importacao/`.
- **Regra:** **dois passos** — `POST /api/imports` (arquivo + mapeamento, roda o dry-run) e
  `POST /api/imports/:id/apply` (aplica). Nada é gravado no primeiro (D68). Chave de atualização é
  **declarada no mapeamento** (`assetTag` ou `serial`), nunca o nome. E **ausência de linha no CSV
  não encerra, não apaga e não desvincula nada**: um arquivo com 300 das 500 pessoas não pode
  demitir 200.
- **Revisado:** posse importada chama o checkout **com `checkoutAt` e `semAviso`** (D0) e **com o
  status do CSV como `statusId` da entrega** — o ativo nasce disponível e a própria entrega o move,
  que é como a invariante 4 fica satisfeita sem o importador escrever status à mão (defeito 3). A
  rota declara os **próprios `limits` de multipart**, e o mapeamento vai como **um** campo JSON
  (D134).
- **Teste:** `tests/importacao/dry-run.test.ts` (nada gravado), `apply.test.ts` (5.000 linhas não
  estouram a transação), `mapeamento.puro.test.ts` (strip do BOM no primeiro cabeçalho, detecção de
  delimitador, recusa de arquivo que não é UTF-8).

O relatório por linha **precisa** de tabela: uma resposta HTTP de 5.000 erros não sobrevive ao
fechamento da aba, e depois do apply ela é a única trilha do que entrou — é também o caminho do
desfazer à mão, junto com o `ActivityLog` de cada gravação.

**Posse importada passa pelo checkout** (D17): a coluna *Responsável* vira uma `Assignment` com
`checkoutAt` retroativo, nunca um `UPDATE` em `assets.assignedToId` — a coluna é cache, tem um
único escritor, e o importador não vai ser o segundo.

---

## Etapa E — Importar ocupação de posto · **M**

- **Schema:** nada muda — escreve em `LocationOccupant`, que já existe.
- **Nasce:** `import/use-cases/import-occupants.usecase.ts` e o modelo de CSV baixável pela tela.
- **Regra:** colunas `Local;Colaborador;Turno;Inicio;Fim`. O local casa por `locations.name` (que é
  `@unique` ✅, então o nome **é** chave); a pessoa casa por **e-mail** com `findFirst` — a
  unicidade é parcial —, e e-mail repetido em linha da lixeira é `IGNORADA` com motivo (D132).
  `Fim` preenchido encerra a ocupação; `Fim` vazio não encerra nada.
- **Teste:** `tests/importacao/ocupacao.test.ts` — reimportar o mesmo arquivo dá tudo `IGNORADA`;
  turno diferente **atualiza** a linha aberta; o contador de ativos que trocam de responsável bate
  com `resolverResponsaveisEmLote` antes e depois.

A idempotência não é escrita aqui: **já está no banco**. O índice
`location_occupants_um_aberto_por_pessoa_local` recusa a segunda ocupação aberta do mesmo par, e o
importador traduz o `P2002` em *"linha já existente, ignorada"* em vez de erro — reimportar o mesmo
arquivo é seguro por construção, não por checagem. Reimportar com turno diferente **atualiza o
`shift` da linha aberta**: encerrar e reabrir fabricaria histórico falso a partir de um typo.

**O efeito de segunda ordem é o ponto desta etapa, e o mais perigoso da fase.** Importar ocupação
**muda quem responde por todo ativo entregue àquele posto**, sem tocar em uma `Assignment` sequer —
é exatamente o que o modelo promete (*"chega um headset na mesa: zero linhas, herda os dois
responsáveis"*) e é o que torna um nome de mesa errado em 300 linhas uma transferência de
responsabilidade do andar inteiro. Por isso o dry-run desta etapa informa, além de linhas novas e
alteradas, **quantos ativos passam a ter responsável resolvido** e **quantos deixam de ter**. É o
único lugar do plano onde o efeito de segunda ordem aparece antes de acontecer, e não teve correção
a receber.

---

## Etapa F — Relatórios: a view de responsáveis e o builder · **G**

- **Schema:** a view `vw_asset_responsibles`, criada **à mão na migration** (o `migrate diff` não a
  conhece e não a derruba — confirmar com um diff vazio depois de criada), sobre as tabelas e os
  índices que já existem.
- **Nasce:** `server/domain/report/use-cases/` (um por relatório pronto),
  `custom-report.usecase.ts`, `helpers/report-columns.ts` (o mapa token → fragmento).
- **Regra:** o cliente manda **token**; o servidor troca por um fragmento `Prisma.sql` **declarado
  em código**. Token fora do mapa é 422 com a lista dos válidos (D67).
- **Revisado:** o SQL mudou nos quatro pontos dos defeitos 1, 2 e 5; *posto vago* sai de
  `POSTO_VAGO`, não da view (D130); e o recorte do parque ganha **versão SQL no mesmo arquivo da
  versão Prisma** (`asset/helpers/asset-scope.helper.ts`), senão o relatório em `$queryRaw` escreve
  a quarta cópia de `ATIVO_NO_PARQUE` — o defeito que a revisão da F8 já pagou uma vez.

```sql
CREATE VIEW vw_asset_responsibles AS
  -- DIRETO: a posse é da pessoa.
  SELECT g."assetId",
         g."targetUserId" AS "userId",
         'DIRETO'::text   AS via,
         NULL::uuid       AS "locationId",
         NULL::text       AS shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
   WHERE g."checkinAt" IS NULL
     AND g."targetType" = 'USER'
     AND g."targetUserId" IS NOT NULL
  UNION ALL
  -- POSTO: uma linha por ocupante aberto. Posto VAZIO não produz linha — é o
  -- motivo de "posto vago" não sair daqui (D130).
  SELECT g."assetId", o."userId", 'POSTO'::text, o."locationId", o.shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
    JOIN location_occupants o
      ON o."locationId" = g."targetLocationId" AND o."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL AND g."targetType" = 'LOCATION'
  UNION ALL
  -- ATIVO: o salto de UM nível — dock → notebook → (pessoa | posto).
  SELECT g."assetId",
         COALESCE(h."targetUserId", o2."userId"),
         'ATIVO'::text,
         o2."locationId",
         o2.shift
    FROM assignments g
    JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL
    JOIN assignments h ON h."assetId" = g."targetAssetId" AND h."checkinAt" IS NULL
    LEFT JOIN location_occupants o2
      ON o2."locationId" = h."targetLocationId" AND o2."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL
     AND g."targetType" = 'ASSET'
     -- Sem isto, dock em posto vazio (ou presa a outro ativo) vira uma linha com
     -- responsável NULO, que a tela nunca produziu. É o defeito 2.
     AND COALESCE(h."targetUserId", o2."userId") IS NOT NULL;
```

- **Teste:** `tests/relatorios/view-responsaveis.test.ts` — **a view ≡ o resolver**, nos quatro
  cenários do [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md) (direto, posto com dois ocupantes, posto vago,
  salto de ativo), mais ativo na lixeira fora da view. É o teste que impede a Camada 3 de ter duas
  definições.

Os relatórios que agrupam — *ativos por posto* e *o que cada pessoa responde (direto × por posto)* —
saem dessa view. Os do Snipe-IT continuam em Prisma normal: **raw SQL fica confinado a um arquivo**.

---

## Etapa G — Etiquetas, QR e a busca do leitor · **G**

- **Schema:** `AppSetting` ganha o layout de etiqueta (`labelPageSize`, `labelCols`, `labelRows`,
  margens, `labelFields String[]`).
- **Nasce:** `server/domain/label/` (`render-label-sheet.usecase.ts` com `pdfkit` + `bwip-js` +
  `qrcode`), `src/pages/etiquetas/`, e `GET /api/search?q=` global.
- **Regra:** o **preview é o PDF de verdade**, renderizado pela mesma função da impressão, uma
  página, com debounce. A busca tenta `assetTag` exato → `serial` exato → `ILIKE`, nessa ordem e por
  esse motivo: os dois primeiros usam os índices únicos parciais, o `ILIKE '%x%'` não usa índice
  nenhum. O leitor digita rápido e manda `Enter`: o campo não pode ter debounce que engula a
  submissão nem `trim` que coma zero à esquerda.
- **Revisado:** `urlDoPainel()` muda de casa antes (defeito 10). E
  `GET /api/assets/by-serial/:serial` **já existe** e já faz match exato por série — a busca global
  passa a ser a porta única e `by-serial` fica como o que é: a rota da reconciliação. Nenhuma tela a
  consome.
- **Teste:** `tests/etiquetas/busca.test.ts` — etiqueta exata resolve em uma consulta; `ILIKE` só
  quando os dois exatos falham; QR de ativo leva `/ativos/:id` (o caminho novo, D70).

Um preview em HTML que discorda do PDF é pior que nenhum: o objetivo declarado é *não gastar a
folha*.

---

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/relatorios-import-etiquetas.md`](../decisoes/relatorios-import-etiquetas.md) — **D65–D71 e D129–D134**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Riscos e armadilhas

**O BOM é armadilha nos dois sentidos.** Escreve-se no export; **tira-se no import**. Sem o strip,
o primeiro cabeçalho vira `"﻿Asset Tag"`, o mapeamento perde a primeira coluna e o importador
diz que o arquivo não tem etiqueta — com a etiqueta ali, visível, na tela.

**Excel em pt-BR salva com `;` e pode salvar em Windows-1252.** O delimitador é detectado na linha
de cabeçalho; o encoding, não: arquivo que não for UTF-8 válido é **recusado** com a instrução
*"salvar como CSV UTF-8"*, em vez de importado com acento quebrado que ninguém revisa.

**`$transaction` do Prisma tem timeout de 5 s.** Um CSV de 5.000 linhas não cabe numa transação
só. O plano previa lotes com transação por lote e `Import.status` registrando até onde foi; a
execução descobriu que, passando pelos use-cases do domínio (D17), cada um abre a própria transação
e o timeout deixa de ser alcançável — ver o item 2 do fechamento.

**`$queryRaw` não passa pela extension de soft delete.** A view precisa do `deletedAt IS NULL`
**dentro dela**, ou o relatório de responsáveis conta ativos que estão na lixeira. É o mesmo
buraco que o D8 já documentou para relação aninhada, agora por outro caminho — e é o defeito 1
desta fase: o risco estava escrito e o SQL não o cumpria.

**Allowlist em objeto literal não é allowlist.** `token in MAPA` e `MAPA[token]` percorrem a cadeia
de protótipos: `constructor`, `__proto__`, `toString`, `valueOf` e `hasOwnProperty` passam. Use
`Object.hasOwn`. Foi o segundo defeito que a revisão do código encontrou depois da execução, em
quatro allowlists de uma vez.

**A impressora escala para caber, por padrão.** Alguns milímetros de deslocamento desalinham a
folha inteira de etiquetas. O PDF é gerado no tamanho exato da página e a tela precisa dizer, em
letras visíveis: *imprimir em 100%, sem ajustar à página*.

**Export grande é negação de serviço acidental.** Sem stream e sem rate limit próprio, dois
cliques em *exportar tudo* montam a resposta inteira em memória: cursor paginado, `reply.send` com
stream, limite separado do global de 300/min.

---

## Verificação

Os testes da fase, pela regra do [`../referencia/testes.md`](../referencia/testes.md) (sufixo `.puro` só para o que não abre
conexão):

```
tests/importacao/   checkout-retroativo · dry-run · apply · ocupacao · mapeamento.puro
tests/relatorios/   view-responsaveis · export · export.puro
tests/etiquetas/    busca
tests/configuracoes/sistema
```

Os três que valem mais que os outros, porque são os que falhariam **em silêncio**:

1. **`view-responsaveis`** — a view contra `resolverResponsaveisEmLote`, mesmo cenário, mesmo
   resultado. Sem ele, as duas definições divergem na primeira fase que mexer em posse, e ninguém
   percebe pela tela.
2. **`checkout-retroativo`** com a asserção de **zero `Acceptance`** — o defeito 3 não dá erro:
   ele manda e-mail.
3. **`export.puro`** do escape de fórmula — uma célula `=cmd|...` só mostra o que é quando alguém
   abre o arquivo no Excel.

O `curl` e o SQL abaixo continuam valendo como conferência de borda, não como a verificação:

```bash
API=http://localhost:3001

# C — o arquivo começa com o BOM (EF BB BF) e o delimitador é `;`
curl -s "$API/api/assets/export" -o /tmp/ativos.csv && head -c 3 /tmp/ativos.csv | xxd
head -1 /tmp/ativos.csv

# D/E — dry-run não grava nada; o apply grava; reimportar o mesmo arquivo dá tudo IGNORADA
IMP=$(curl -s -X POST "$API/api/imports" -F 'target=OCCUPANTS' -F 'file=@postos.csv' | jq -r '.id')
curl -s "$API/api/imports/$IMP" | jq '{ativosQueGanhamResponsavel, ativosQuePerdem}'
curl -s -X POST "$API/api/imports/$IMP/apply" | jq '{ok, erro, ignorada}'
curl -s -X POST "$API/api/imports" -F 'target=OCCUPANTS' -F 'file=@postos.csv' | jq '.resumo'

# F — o builder recusa token fora da allowlist, listando os válidos
curl -s -w '\n%{http_code}\n' -X POST "$API/api/reports/custom" -H 'Content-Type: application/json' \
  -d '{"columns":["assetTag","assets.purchaseCost; DROP TABLE"]}'      # 422

# G — o bipe: etiqueta exata acha em uma consulta; o resto cai no ILIKE
curl -s "$API/api/search?q=ATV-00042" | jq '{tipo, total}'
```

```sql
-- D66: a view resolve os três casos e NÃO inclui ativo na lixeira
SELECT via, count(*) FROM vw_asset_responsibles GROUP BY via;
SELECT count(*) FROM vw_asset_responsibles r
  JOIN assets a ON a.id = r."assetId" WHERE a."deletedAt" IS NOT NULL;        -- 0

-- O custo que a F9 avisou e esta fase mede: agrupar por responsável resolvido
EXPLAIN ANALYZE SELECT r."userId", count(*) FROM vw_asset_responsibles r GROUP BY r."userId";

-- A invariante que o importador usa em vez de checar: nenhuma ocupação aberta duplicada
SELECT "locationId", "userId", count(*) FROM location_occupants
 WHERE "endedAt" IS NULL GROUP BY 1,2 HAVING count(*) > 1;                    -- 0 linhas
```

**Três provas que não são comando:** abrir o CSV exportado no Excel em pt-BR e conferir acento e
colunas; imprimir uma folha em 100% e medir com régua contra o preview; e importar ocupação com
**uma** mesa de nome errado, conferindo que o número de ativos que mudam de responsável denuncia o
erro ainda no dry-run.

---

## Perguntas em aberto

| Pergunta | Situação depois da revisão |
|---|---|
| **Materializar `vw_asset_responsibles`** | **Continua aberta**, e o gatilho continua sendo o `EXPLAIN` com volume real. Nada muda: a saída está pré-escrita no D66, e quem materializar pendura o refresh no job diário da F8, não em trigger |
| **Import de posse retroativa e o status do ativo** | **Respondida** (defeito 3): o ativo nasce `DEPLOYABLE` e o status do CSV vai como `statusId` **da entrega**. Não é preciso exigir coluna *Status* coerente nem escolher status pelo usuário |
| **Export por permissão** | **Continua aberta até a F11** — mas deixou de ser "está aceito porque não há login": **há login desde a F3**. O que não há é permissão por módulo. O `report-columns.ts` nasce com o mapa que a F11 vai filtrar (D67), e isso é o que torna o filtro uma linha e não uma refatoração |

Uma pergunta que a revisão abriu: **o importador aparece no `ActivityLog` como quem?** `actorId` é
parâmetro obrigatório desde o D23, e a importação tem ator (quem clicou em aplicar). O que falta
decidir é se cada linha gravada leva `actorId` da pessoa — e a resposta provável é sim, com o
`importId` nos `details`, porque é isso que torna o `ImportRow` o caminho do desfazer à mão que o
D68 promete.

---

## Ordem de execução

```
D0 → A → B → C → D → E → F → G
```

`D0` antes de `D` porque mexe na F4. `B` antes de `C` porque o export consome o catálogo de
colunas. `E` depois de `D` porque reusa o maestro e a tabela. `F` e `G` não dependem uma da outra e
podem trocar de lugar.

Esforço revisto: **D0** P · **A** M · **B** P *(era M)* · **C** P · **D** G · **E** M · **F** G ·
**G** G.

**Commit**, pela convenção que o histórico usa — um por fase, `feat:` sem escopo, corpo em bullets
curtos:

```
feat: etiquetas, relatórios por responsável e importação de CSV com dry-run
```

O lint e o `tsc` têm de passar; a suíte, também — ela existe, e é essa a diferença mais importante
entre este plano e o que foi escrito em 24/09.

---

# Fechamento da F10

> As **oito levas** foram implementadas na ordem desta revisão. Árvore verde: `tsc -b` ✅ ·
> `eslint .` ✅ · `npm run build` ✅ · `npm test` ✅ **62 arquivos, 673 testes** (eram 51/522 antes
> da fase).

| Leva | O que entrou |
|---|---|
| **D0** | `checkoutAsset` ganhou `checkoutAt` (data retroativa) e `semAviso` (sem termo, sem e-mail). Nenhuma das duas está no `checkoutSchema`: a borda as recusa com 422, e há teste para isso |
| **A** | 9 colunas no `AppSetting`, `GET`/`PUT /api/settings`, marca (logo e favicon) por rota com sessão, aba *Sistema*, `server/domain/backup/` atrás de `BACKUP_ENABLED` |
| **B** | Catálogo de colunas + store zustand com `persist`, menu de colunas na listagem, busca no `ReferenceSelect` (aparece só quando a lista volta cheia) |
| **C** | `shared/csv.helper.ts` (BOM, escape de fórmula, stream com cursor), export de ativos e de licenças, botão nas duas telas |
| **D** | `Import`/`ImportRow`, parser com UTF-8 estrito e detecção de delimitador, dry-run + apply, adaptadores de ativos e pessoas, tela `/importacao` em três passos |
| **E** | Adaptador de ocupação, `endLocationOccupancy` com data retroativa, `updateOccupantShift`, e o **contador do efeito de segunda ordem** no dry-run |
| **F** | A view corrigida, `report-columns.ts` (token → fragmento), builder com agrupamento, relatório de responsabilidade, duas abas novas em `/relatorios` |
| **G** | Layout de etiqueta no `AppSetting`, `server/domain/label/` com pdfkit + bwip-js + qrcode, prévia que **é** o PDF, `GET /api/search`, campo do bipe no cabeçalho, tela `/etiquetas` |

## O que a execução mudou em relação ao plano

1. **O `csv.helper.ts` foi para `domain/shared/`, não para `report/helpers/`.** Quem
   exporta é cada domínio, e o mapa de colunas mora no domínio dono delas — com o
   arquivo em `report/`, `asset` e `license` passariam a importar `report` para
   escrever um CSV.

2. **O apply roda uma transação por LINHA, não por lote.** O plano previa lotes por
   causa do timeout de 5 s do `$transaction`. Como a gravação passa pelos
   use-cases do domínio (D17) e cada um abre a própria transação, o timeout deixou
   de ser alcançável e o `appliedUpTo` passou a ser exato. É o D31 outra vez.

3. **`OCCUPANTS` não tem chave de atualização.** A identidade é o par
   (local, colaborador), garantida pelo índice único parcial. Mandar uma chave ali
   é 422 — em vez de um campo ignorado em silêncio.

4. **O casamento por nome é insensível a maiúsculas, e a ambiguidade é recusada.**
   Descoberto por teste: o seed cadastra "Em Uso" e a planilha escreve "Em uso".
   Dois cadastros que diferem só na caixa viram erro de linha, não sorteio.

5. **"Posto vago" e "ativos por posto" NÃO nasceram.** Os dois já estavam
   respondidos desde a F4/F7 por `GET /api/workstations?view=vagos`, com a
   definição que `ehPostoVago()` guarda. O D130 foi além do que a revisão
   escreveu: além de não sair da view, o relatório não existe — a tela aponta para
   `/postos`.

6. **O piso da etiqueta depende do que vai impresso.** Um piso único de 15×8 mm
   deixava passar uma grade 10×30 que produz QR de 5 mm, ilegível. Agora são três
   pisos (texto, Code128 de 30 mm de largura, QR de 10 mm de lado) e cada recusa
   diz qual elemento não cabe.

7. **Três extrações que a fase pagou adiantado:** `domain/shared/multipart.helper.ts`
   (as quatro recusas de upload, antes copiadas), `core/storage/mime.ts`
   `mimeDoArquivo()` e `core/config/app-url.ts` (o `urlDoPainel()` que estava no
   correio — defeito 10).

## Revisão da fase — os cinco defeitos corrigidos depois

> Leitura da F10 **já escrita**, contra o código, procurando defeito de lógica e
> inconsistência. Árvore verde antes de começar (`tsc -b` ✅ · `eslint .` ✅ ·
> `npm test` ✅ 62 arquivos / 673 testes), o que significa que **nenhum dos cinco
> defeitos abaixo era pego por um teste** — os cinco falham em silêncio, que é por
> que sobreviveram.

### 1. 🔴 A soma do agrupamento contava o mesmo ativo uma vez por responsável

`custom-report.usecase.ts`. O `LEFT JOIN` com `vw_asset_responsibles` multiplica
linhas de propósito — um ativo entregue a um posto com duas pessoas aparece duas
vezes. O `COUNT(DISTINCT a.id)` sabia disso; o `SUM(a."purchaseCost")` ao lado
**não**. A contagem saía certa e o dinheiro saía dobrado.

É o pior tipo de defeito que esta fase podia ter: o relatório que existe para
somar custo por categoria, por fornecedor e por pessoa fechava com um número
plausível e maior que o parque, e o erro **cresce com o uso do modelo de posse** —
quanto mais mesa compartilhada, mais inflado. Ninguém confere a soma de um
relatório contra o banco.

**Correção:** deduplicar por `(ativo, grupo)` numa subconsulta `SELECT DISTINCT`,
que é a mesma granularidade que o `COUNT(DISTINCT a.id)` já tinha — então o
`COUNT(*)` de fora é idêntico ao de antes. `SUM(DISTINCT …)` seria pior: ele
descartaria dois ativos de **mesmo preço**.
**Teste:** `tests/relatorios/builder-agrupamento.test.ts` (reprova com o SQL
antigo: 2250,50 onde o parque tem 1250,50).

### 2. 🔴 `'constructor' in MAPA` é `true` — quatro allowlists de token tinham porta

`token in COLUNAS` e `COLUNAS[token]` seguido de `if (!encontrado)` percorrem a
**cadeia de protótipos**: `constructor`, `__proto__`, `toString`, `valueOf` e
`hasOwnProperty` passavam pelas allowlists de colunas do export de ativos, do
export de licenças, do report builder e dos campos de etiqueta.

O que vinha depois era pior que um 422 feio:

- no **export**, a validação passava, os cabeçalhos já tinham ido com **status
  200**, e o `TypeError` estourava **dentro do stream** — o cliente recebia um CSV
  truncado que diz ter dado certo. É exatamente o que a
  validação-antes-do-primeiro-byte existe para evitar, e os dois controllers têm
  um comentário prometendo isso;
- no **builder**, `COLUNAS['constructor'].expr` era `undefined` e o `Prisma.sql`
  quebrava com **500**, em vez do 422 com a lista que o D67 promete.

Não é injeção — o apelido interpolado continua saindo do mapa —, mas é a
allowlist deixando de ser a allowlist. **Correção:** `Object.hasOwn` nos quatro.
**Teste:** `tests/relatorios/allowlist.puro.test.ts`.

### 3. 🟠 O dry-run prometia uma entrega que o apply recusava

`import-assets.usecase.ts`. `checkoutAsset` recusa com 409 o ativo que não está
`DEPLOYABLE` (invariante 4, e a regra é certa). O `planejar` lia a posse aberta do
ativo existente e **não lia o status dele** — então a simulação dizia *"entrega a
Laura"* e o apply devolvia ERRO naquela linha.

É a divergência entre os dois passos que o **D68 existe para não ter**, e na sua
pior forma: aparece depois do clique irreversível. E o caso é real — ativo "Em
uso" **sem** posse aberta é legítimo (é o posto vago da invariante 4), e é o
estado em que uma planilha de correção encontra metade do parque de quem está
arrumando o cadastro.

**Correção:** a recusa saiu para o `planejar`, com o status atual na mensagem e o
que fazer. O ativo NOVO não muda: ele nasce disponível de propósito e a própria
entrega aplica o status do arquivo.
**Teste:** `tests/importacao/posse-importada.test.ts`.

### 4. 🟠 O importador descartava correção de série com zero à esquerda

Mesmo arquivo. A comparação "o que de fato muda" tinha um caso especial para
**dinheiro** — o custo chega do CSV como string e sai do Prisma como `Decimal`,
então `'1234.5'` e `'1234.50'` precisam ser o mesmo valor. O caso especial estava
largo: ele comparava como **número** qualquer célula de texto que parecesse
número.

Resultado: a série `0012345` e a série `12345` davam 12345 as duas, a linha virava
`IGNORADA` com *"já está como o arquivo pede"*, e a correção era descartada em
silêncio. Número de série é dado **físico**, gravado na carcaça — o zero à
esquerda faz parte dele, e é por ele que a reconciliação da F7 acha o
equipamento. Valia igual para etiqueta e número de pedido.

**Correção:** comparar como número só quando o lado do **banco** é número ou
`Decimal`. Texto contra texto é texto.
**Teste:** no mesmo arquivo, com o controle do `Decimal` ao lado.

### 5. 🟠 `lineNumber` mentia depois de qualquer linha em branco

`csv-parse.helper.ts`. Com `skipEmptyLines: 'greedy'`, o papaparse tira a linha
vazia de dentro de `data` e o índice do array **deixa de ser a linha do arquivo**:
toda linha depois de um espaço em branco era reportada uma acima do lugar certo.

`ImportRow.lineNumber` existe para exatamente uma coisa — alguém abrir a planilha
de cinco mil linhas e ir direto na linha que o relatório acusou. Errado, ele manda
a pessoa corrigir a linha de cima.

**Correção:** parsear **sem** `skipEmptyLines`, atribuir o número e **só então**
descartar a linha vazia. De brinde, o cabeçalho passou a ser a primeira linha com
conteúdo (planilha concatenada à mão começa em branco mais vezes do que se
imagina) e o delimitador passou a ser contado nela, em vez de numa linha vazia
onde nenhum candidato aparece.
**Teste:** `tests/importacao/mapeamento.puro.test.ts` — o arquivo que a seção de
*Verificação* previa e que não tinha nascido.

## O que foi verificado e está certo

- **A view ≡ o resolver** nos quatro cenários, com teste de equivalência. As três
  correções do D129 (lixeira, responsável nulo, `via` na língua da tela) estão no
  SQL da migration.
- **O `celula()` do CSV**: a ordem dos casos (número e data antes da escapada de
  fórmula) está certa, e é ela que impede `'−1234.50` numa coluna de dinheiro.
- **A chave de produto não sai no export de licença**, e não por allowlist: o
  `paraResposta()` a remove do objeto, então nenhuma coluna consegue nomeá-la.
- **O `pg_dump` por `execFile` com a senha em `PGPASSWORD`**, o `BACKUP_DIR` fora
  de toda raiz estática conferido no boot, e o `:nome` do download conferido duas
  vezes (forma e prefixo).
- **O export por cursor** com `skip: 1`, e o `where` composto pelas MESMAS
  funções da listagem.
- **`semAviso` e `checkoutAt` não têm porta pela API** — o `strictObject` do
  `checkoutSchema` as recusa, e há teste para isso.
- **O `efeitoDeSegundaOrdem` conta por POSTO, não por linha**, que é a conta certa
  para a Camada 3.
- **`idDaUrlDoPainel`** aceita o caminho novo e o antigo, com e sem domínio.

## Inconsistências de texto, anotadas e não corrigidas

Nenhuma das três muda comportamento; as três são frase de documentação
prometendo mais do que o código faz.

1. **`appliedUpTo` e a palavra "retomável".** O comentário do schema diz que ele
   torna o lote retomável, mas `applyImport` responde **409 para
   `status === 'APLICANDO'` sem exceção** — um processo que morre no meio deixa a
   importação travada nesse estado para sempre. O que `appliedUpTo` de fato
   responde é *"o que entrou?"*, que é o que o comentário do **enum** diz, e é
   suficiente: o status de cada `ImportRow` é a trilha. Retomar de verdade pede
   uma janela de obsolescência no `APLICANDO` e o filtro `entityId: null` nas
   pendentes — decisão de produto, não correção de defeito.
2. **`ImportStatus.RECUSADO` nunca é escrito.** As três recusas que ele descreve
   (encoding, cabeçalho, mapeamento) acontecem **antes** de o `Import` existir, o
   que é o desenho certo. O valor do enum e a guarda em `applyImport` são
   inalcançáveis hoje.
3. **A tradução do `P2002` da ocupação em "ignorada"** que o cabeçalho de
   `import-occupants.usecase.ts` descreve não existe como `catch`: a
   reimportação do mesmo arquivo dá `IGNORADA` pelo `findFirst` da ocupação
   aberta, que é o caminho que de fato roda. Linha repetida **dentro do mesmo
   arquivo** aparece duas vezes como `OK` no dry-run e a segunda vira `IGNORADA`
   no apply — direção segura, e só o preview fica otimista.

## O que ficou de fora, e por quê

- **Campos customizados no import e no export** (item **P** do TODO) ficaram para a
  revisão da fase: o par só é coerente junto, e o mapeamento de `cf[slug]` pede uma
  decisão sobre campo CIFRADO que a F9 deixou explícita (ele não sai em listagem
  nenhuma). **Entrou depois, na F11** — ver *O que a fase consertou fora do próprio
  escopo* no [`fase-11-acesso-avancado.md`](fase-11-acesso-avancado.md).
- **O backup com `pg_dump` de verdade não tem teste de ponta a ponta**: exige o
  cliente do Postgres na máquina da suíte, na mesma versão major do servidor. O que
  é testado é a tradução da falha (binário ausente → 503 com instrução), o ciclo de
  retenção e as duas recusas de caminho. Está escrito no cabeçalho do arquivo de
  teste.
- **Materializar a view** continua *não, por ora* (D66), e o gatilho segue sendo o
  `EXPLAIN` com volume real.
