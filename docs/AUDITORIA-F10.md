# Auditoria do plano da Fase 10 — e o plano de implementação

> Revisão do [`FASE-10-PLANO-ITAM.md`](./FASE-10-PLANO-ITAM.md) contra a árvore de
> hoje (01/10/2026, `28b9125`, com a **F8 e a F9 fechadas**). O plano foi escrito em
> **24/09**, antes das duas — e descreve, em cinco pontos, um projeto que não existe
> mais.
>
> **Nenhuma linha da F10 está no código.** Não há implementação parcial para
> revisar: o que esta auditoria confere é o PLANO contra o que as fases seguintes
> construíram. O que ela encontra é de dois tipos, e eles custam coisas diferentes:
> **afirmação que caducou** (barato — é texto) e **defeito de desenho** (caro —
> entraria no código exatamente como está escrito, e três deles produzem
> comportamento errado em produção).
>
> **5 afirmações caducaram · 11 defeitos (3 🔴, 5 🟠, 3 🟡) · 6 decisões novas
> (D129–D134).** A Etapa B encolheu pela metade; a Etapa D cresceu uma etapa
> inteira antes dela.

---

## Como foi verificado

Nada aqui é opinião sobre o plano. Cada linha das seções 1 e 2 aponta para o
arquivo que a contradiz.

| Verificação | Resultado |
|---|---|
| `tsc -b` (app + server + node, `strict`) | ✅ exit 0 |
| `eslint .` (inclui as regras de camada) | ✅ exit 0 |
| `npm test` (suíte contra Postgres real) | ✅ 51 arquivos, **522 testes**, 173 s — baseline verde antes da fase |
| Dependências do plano × `package.json` | ❌ o plano diz "nenhum instalado"; os três estão |
| Rotas de `/api/settings` × `settings.maestro.ts` | ❌ são 5, não 1 |
| `?q=` dos três `/options` | ❌ já existe no servidor; falta só na tela |
| SQL da view × `resolve-responsibles.usecase.ts` | ❌ divergem em dois pontos (lixeira e nulo) |
| `CheckoutData` × "posse importada passa pelo checkout" | ❌ falta `checkoutAt`; e o checkout manda e-mail |
| Índices que o D66 promete | ✅ os três existem desde a migration de posse |
| `locations.name @unique` (chave do import de ocupação) | ✅ `schema.prisma:551` |
| `location_occupants_um_aberto_por_pessoa_local` | ✅ criado em `20260923011728_posse_e_ocupacao` |
| Harness de teste × uma VIEW no schema | ✅ `tests/setup/database.ts` lê `pg_tables`, que não lista view |

A suíte **não foi usada para encontrar defeito** nesta auditoria — não há código
desta fase para ela exercitar. Ela serve de linha de base: o que a F10 quebrar,
quebra contra uma árvore que estava verde.

---

## 1. O que caducou — o plano fala de 24/09

| O plano diz | A árvore de hoje | O que muda |
|---|---|---|
| *"`bwip-js`, `qrcode`, `pdfkit`: **nenhum instalado**"* | os três estão no `package.json`, com os `@types`. `pdfkit` já roda no termo de entrega (`acceptance/helpers/termo-pdf.helper.ts`); `bwip-js` e `qrcode` estão instalados e **sem um único import**. `papaparse` + `@types/papaparse` também — e o plano nem o cita | O pré-requisito some. A Etapa G e a D não começam por `npm i`, e o parser de CSV **já foi escolhido** por quem instalou: `papaparse`, não um `split(';')` escrito à mão |
| *"Não há suíte: a verificação é a seção acima"* | **51 arquivos de teste**, dois projetos (`puro` sem banco, `banco` com Postgres real), `app.inject()` pelo mesmo Fastify de produção (`docs/TESTES.md`) | A verificação por `curl` vira **complemento**. Toda etapa desta fase tem pasta de teste, e a seção 6 abaixo diz qual |
| *"hoje só existe `/api/settings/next-asset-tag`"* | são **cinco** rotas: `next-asset-tag`, `GET`/`PUT /discovery` (F7) e `GET`/`PUT /alerts` (F8) | `GET /api/settings` não nasce num espaço vazio: nasce ao lado de dois pares que já leem e escrevem o mesmo singleton. Ou a Etapa A unifica a leitura, ou passam a ser três rotas devolvendo recortes do mesmo registro |
| *"F9 (desejável) … sem a F9 nada trava"* | F9 fechada: `Asset.customFields` em JsonB, índice GIN, filtro `cf[slug]`, cifra por campo | Campo customizado no import e no export deixa de ser "se der" e **é item da fase** — o `ITAM-TODO.md` já o move para cá com essas palavras |
| Ordem de commits em `feat(settings):`, `feat(api):`, `feat(web):` … | as cinco últimas fases são **um commit cada**, `feat: <frase em português>`, **sem escopo** (`28b9125`, `567d175`, `8cac187`…) | A seção de commits do plano descreve uma convenção que o histórico abandonou. A seção 8 refaz |

Nenhum dos cinco é erro de raciocínio: é um plano prospectivo que o projeto
ultrapassou. O que vem abaixo é outra coisa.

---

## 2. Defeitos

### 🔴 1 — A view do D66 não filtra a lixeira. O próprio plano exige isso

A seção *Riscos* escreve, com todas as letras: *"A view precisa do `deletedAt IS
NULL` **dentro dela**, ou o relatório de responsáveis vai contar ativos que estão
na lixeira"*. O SQL impresso três parágrafos acima **não tem o filtro** — nenhuma
das três pernas toca em `assets`.

Não é redundância do risco: `$queryRaw` não passa pela `softDeleteExtension`
(`core/database/soft-delete.extension.ts`), então o relatório contaria ativo
apagado, e a planilha fecharia com um número que a tela de ativos não produz. É o
D8 por outro caminho — exatamente como o risco diz, e o SQL não faz.

**Correção:** `JOIN assets a ON a.id = g."assetId" AND a."deletedAt" IS NULL` nas
três pernas. O SQL inteiro, corrigido, está na Etapa F.

### 🔴 2 — A view emite responsável NULO. A tela nunca emitiu

A terceira perna (o salto de `ASSET`) projeta
`COALESCE(h."targetUserId", o2."userId")`. Os dois lados são nulos em dois casos
reais:

- a dock está entregue a um **posto sem ocupante aberto** (o `LEFT JOIN` não casa);
- a dock está entregue a **outro ativo** (`h."targetType" = 'ASSET'`), que é onde
  o salto para por decisão (D16).

Nos dois, `resolverResponsaveisEmLote` devolve `responsaveis: []` —
`responsaveisPeloAtivoAlvo()` retorna lista vazia e a tela não mostra ninguém. A
view devolveria **uma linha com `userId` nulo**, e o `GROUP BY r."userId"` da
própria seção de Verificação do plano criaria um balde `NULL` que a tela nunca
teve.

Duas respostas para "quem responde por este ativo" é o D16 renascendo como view —
a mesma coisa que o D66 existe para evitar.

**Correção:** `AND COALESCE(h."targetUserId", o2."userId") IS NOT NULL` na terceira
perna, mais o teste de equivalência da seção 6, que é o que impede as duas
definições de divergirem de novo na fase seguinte.

### 🔴 3 — Posse importada passa pelo checkout — e o checkout manda e-mail e emite termo

O plano está certo no princípio (D17: posse importada é `Assignment`, nunca
`UPDATE` em `assignedToId`) e não olhou o que `checkoutAsset` faz hoje. Ele faz
três coisas que o importador não pode fazer 500 vezes:

1. **emite o termo de entrega** (`issueAcceptance`, dentro da transação) e
2. **dispara o convite de assinatura por e-mail** para o signatário, mais o aviso
   de entrega (`checkout-asset.usecase.ts:212-233`);
3. **recusa o ativo que não está `DEPLOYABLE`**: *"Só ativo disponível pode ser
   entregue, e este está como X"* (409).

Importar a realidade de uma empresa com 500 equipamentos já entregues mandaria,
como está escrito, **500 convites para assinar termo de equipamento que a pessoa
recebeu há dois anos** — e a primeira reação de quem recebe é abrir chamado. É o
tipo de efeito de segunda ordem que a própria Etapa E se orgulha de ter previsto
para a ocupação; aqui ele passou.

E faltam duas peças para a ideia funcionar:

- **`CheckoutData` não tem `checkoutAt`.** A coluna existe (`@default(now())`),
  mas nada no caminho da entrega aceita uma data: `checkoutAt` retroativo é
  parâmetro novo, e `expectedCheckinAt` é validado por `dataNaoPassada()` — o
  validador de uma data retroativa é outro.
- **O ativo precisa estar `DEPLOYABLE` no instante do checkout.** Isso responde a
  *Pergunta em aberto* nº 2 do plano, e responde melhor do que ela propõe: o
  importador **cria o ativo no status disponível e passa o status do CSV como
  `statusId` da entrega** — que é um parâmetro que `checkoutAsset` já aceita e
  aplica. A invariante 4 fica satisfeita pelo caminho normal, sem o importador
  escrever status nenhum à mão, e sem exigir do CSV uma coluna *Status*
  coerente que ninguém revisa.

**Correção:** uma leva própria **antes** da Etapa D (ver D0, na seção 4), com
`checkoutAt?` e um modo silencioso explícito em `CheckoutData` (D131). O
`bulk-checkout.usecase.ts` já é o precedente do "N entregas independentes com
relatório" (D31) — o importador é o terceiro chamador do mesmo caminho, não um
quarto jeito de abrir posse.

### 🟠 4 — "Posto vago" já tem duas implementações. A view seria a terceira

O plano diz que os três relatórios próprios *"saem dessa view"*. **Posto vago não
sai**: a segunda perna é `JOIN` com `location_occupants`, e posto vago é
precisamente o posto **sem** ocupante aberto — ele não produz linha nenhuma na
view, por construção.

E ele já existe duas vezes, escrito e revisado:

- `POSTO_VAGO` em `asset/helpers/asset-filters.helper.ts` — filtro do Prisma,
  exposto como `?relatorio=posto-vago` na listagem de ativos;
- `ehPostoVago()` em `workstation/helpers/workstation-row.helper.ts`, que é o que
  a tela `/postos` pinta.

Uma terceira versão em SQL cru é o D16 pela terceira vez na mesma fase.
**Correção:** a aba *Posto vago* do `/relatorios` consome `POSTO_VAGO` (D130). A
view responde as outras duas perguntas — *ativos por posto* e *o que cada pessoa
responde* —, que são as que precisam **agrupar** e que de fato não existem hoje.

### 🟠 5 — `via` em dois vocabulários

A view projeta `'USER' | 'LOCATION' | 'ASSET'`. A aplicação inteira — tipo
`ViaPosse`, resposta da API, tela de ativo, de posto e de ociosos — fala
`'DIRETO' | 'POSTO' | 'ATIVO'`. O relatório sairia com uma terceira língua para
um fato que o resto do sistema já nomeia, e a primeira pessoa a comparar as duas
telas vai perguntar se são a mesma coisa.

**Correção:** a view projeta `DIRETO`/`POSTO`/`ATIVO`.

### 🟠 6 — O casamento por e-mail não tem `@unique` para casar

A Etapa E diz, certíssima, que a pessoa casa **por e-mail, nunca por nome**. Só
que `User.email` **não é `@unique` no Prisma**: a unicidade é índice **parcial**
(`users_email_unique_undeleted`, `WHERE deleted_at IS NULL`), justamente para que
um usuário na lixeira não trave o recadastro do mesmo endereço
(`schema.prisma:148-157`).

Consequência prática para quem escrever a linha: `prisma.user.findUnique({ where:
{ email } })` **não compila** — tem de ser `findFirst`, que a extension de soft
delete já escopa. E o caso que o índice parcial permite (duas linhas com o mesmo
e-mail, uma na lixeira) tem de virar linha `IGNORADA` com motivo, não um
`findFirst` que pega a primeira que aparecer (D132).

### 🟠 7 — A Etapa B é metade do que está escrito: a busca do servidor já existe

O plano pede *"busca server-side no `ReferenceSelect.tsx`"* como se o servidor não
a tivesse. Tem, nos três: `listCatalogOptions(spec, q, filtro)`,
`listAssetOptions(q)` e `listUserOptions(q)` aceitam `q` e o aplicam no `where`,
com `take: 200`.

O que falta é **só a tela**, e um detalhe que é onde a implementação vai tropeçar:
`useCatalogOptionsQuery(rota, tipo)` (`src/domain/catalog/catalog.queries.ts:36`)
**não repassa `q`** e tem `staleTime: 60_000` com a chave de cache sem o termo —
digitar no campo novo sem mexer nisso devolveria a mesma lista de sempre, em
silêncio. A etapa encolhe de **M** para **P**, e o `useDebouncedValue` que o plano
cita de fato já existe (`src/pages/hooks/useDebouncedValue.ts`, usado por cinco
telas).

### 🟠 8 — O teto do multipart é o do anexo, e é global

`@fastify/multipart` está registrado **uma vez, na aplicação inteira**, com
`fileSize: 10 MB`, `files: 1` e `fields: 10` (`server/app.ts`). Para o import isso
significa:

- o **mapeamento tem de viajar como UM campo** (JSON em string), não como um campo
  por coluna — um CSV de 15 colunas mapeadas estouraria `fields: 10` no transporte,
  antes de qualquer handler, e o erro não falaria de mapeamento;
- 10 MB é teto de **anexo**, escolhido para PDF e imagem. Um CSV de 5.000 linhas
  cabe com folga; um de 200 mil, não — e a recusa viria com a mensagem de anexo.

A rota de import declara os próprios `limits` na leitura do arquivo
(`request.file({ limits: { fileSize, files: 1 } })`, que o `@fastify/multipart` aceita
por chamada), e isso é escrito agora para não ser descoberto pelo usuário (D134).

### 🟡 9 — `format.helper.ts` tem `pt-BR` e `BRL` escritos à mão em quatro lugares

A Etapa A está certa ao dizer que `src/lib/format.ts` não nasce e que o arquivo
certo é `src/pages/helpers/format.helper.ts`. Vale escrever o tamanho do trabalho:
são **quatro funções** com `'pt-BR'`/`'BRL'` literais (`formatarResidual`,
`formatarMoeda`, `formatarMeses`, `formatarData`) — e `formatarData` **fatia a
string ISO de propósito**, para não deslocar o dia num fuso a oeste. Trocá-la por
`Intl.DateTimeFormat` sem o cuidado equivalente reintroduz o bug que o comentário
dela documenta.

### 🟡 10 — O QR precisa de `urlDoPainel()`, que mora no correio

O D70 manda o QR levar `${APP_URL}/ativos/:id`. A função que resolve isso já
existe — `urlDoPainel()` — mas dentro de `core/mail/mailer.ts`, porque até hoje só
o e-mail precisava de link absoluto. Um domínio de **etiqueta** importando do
**correio** passa no lint e mente sobre a dependência.

**Correção:** mover para `core/config/app-url.ts` e o `mailer` passa a importar de
lá. Uma linha, feita antes de existir o segundo chamador.

### 🟡 11 — O export de licença: a allowlist existe e o plano não a cita

O `ITAM-TODO.md` marca em ⚠️ que `productKey` não pode entrar no CSV; o plano da
F10 não repete isso em lugar nenhum. E a peça certa já existe:
`license/helpers/license-select.helper.ts` devolve **`productKeyMask`** e nunca a
coluna cifrada.

A regra do export fica sendo: **export não monta `select` próprio** — ele reusa o
`*-select.helper.ts` do domínio, que é onde a allowlist da resposta foi revisada
(D133). Vale para licença hoje e para custo de compra quando a F11 chegar.

---

## 3. O que o plano acertou, e merece ficar escrito

Testei as partes que costumam estar erradas num plano escrito antes do código.
Estas passaram:

- **Os índices que o D66 promete existem todos**, desde a migration do modelo de
  posse: `assignments(assetId, checkinAt)`, `location_occupants(locationId,
  endedAt)` e — que o plano nem cita, e a terceira perna precisa —
  `assignments(targetAssetId, checkinAt)`.
- **`locations.name` é `@unique` de verdade** (`schema.prisma:551`), então a frase
  *"o nome **é** chave"* do import de ocupação se sustenta. É o oposto do caso do
  e-mail (defeito 6) — e os dois estão no mesmo parágrafo do plano.
- **O índice que torna a reimportação idempotente existe com o nome citado**,
  `location_occupants_um_aberto_por_pessoa_local`, e `addLocationOccupant` já
  traduz o `P2002` em frase de gente — o importador reusa esse caminho em vez de
  checar antes.
- **Uma VIEW não quebra o harness.** `tests/setup/database.ts` monta o `TRUNCATE`
  a partir de `pg_tables`, que lista tabela e não view. Era a pergunta prática que
  o D66 não respondia.
- **A moldura de `/relatorios` existe e já está escrita esperando esta fase** —
  `report.maestro.ts` e `src/pages/relatorios/index.tsx` dizem, em comentário, que
  o export, o seletor de colunas e o builder entram como abas dali.
- **O BOM nos dois sentidos, o escape de fórmula, o dry-run em dois passos e o
  token→fragmento** não têm correção nenhuma a receber. São o miolo do plano, e
  continuam certos.

---

## 4. O plano de implementação

Sete levas. A ordem mudou em um ponto: **a mudança no checkout virou leva própria
(D0), antes do importador** — ela mexe na F4, que é fundação, e misturá-la com o
parser de CSV faria uma revisão não conseguir separar as duas.

### D0 — O checkout aprende data retroativa e silêncio · **P**

> *Nasce antes de tudo que grava posse. É a leva que o plano não tinha.*

- `CheckoutData` ganha `checkoutAt?: Date` (validado como data **passada**, não
  futura) e `semAviso?: boolean`.
- `executarCheckout` grava `checkoutAt` quando vier; `checkoutAsset` pula o
  `issueAcceptance` e os dois `dispararAviso` quando `semAviso`.
- **Regra:** o silêncio é **explícito e só para importação**. A tela nunca o
  passa — entrega feita pela tela continua emitindo termo e e-mail (D131).
- **Teste:** `tests/importacao/checkout-retroativo.test.ts` — posse com
  `checkoutAt` de 2024 entra; com data futura, 422; com `semAviso`, **zero**
  `Acceptance` criado.

### A — `AppSetting` cresce, a aba *Sistema* e o backup · **M**

- **Schema:** `companyName`, `logoPath?`, `faviconPath?`, `primaryColor`,
  `locale @default("pt-BR")`, `dateFormat`, `currency @default("BRL")`,
  `csvDelimiter @default(";")`, `backupRetentionDays`. Sem tabela nova (D65).
- **Nasce:** `GET /api/settings` (o recorte de sistema), `PUT /api/settings`,
  aba *Sistema* em `src/pages/configuracoes/`, `server/domain/backup/`.
- **Mudou:** as cinco rotas que já existem ficam onde estão — `/discovery` e
  `/alerts` têm donos (F7 e F8) e telas próprias. O que nasce é o **terceiro
  recorte**, não uma rota que devolve o singleton inteiro: `cryptoCanary` e
  `assetTagNext` não vão para a tela.
- **Regra:** `pg_dump` por `execFile`, nunca `exec` com string montada; diretório
  de dump fora de `dist/` e de `UPLOAD_DIR`; rota atrás de `BACKUP_ENABLED`
  (default desligado) — hoje **não há nenhum `child_process` no projeto**, e este
  é o primeiro.
- **Teste:** `tests/configuracoes/sistema.test.ts` — `PUT` recusa `locale` fora da
  lista; `GET` não devolve `cryptoCanary`; com `BACKUP_ENABLED` ausente, a rota de
  backup responde 404.

### B — Catálogo de colunas, seletor salvo e combobox com busca · **P** *(era M)*

- **Nasce:** `src/pages/ativos/helpers/asset-columns.ts` (catálogo de interface),
  `src/domain/asset/asset.store.ts` (zustand + `persist`), campo de busca no
  `ReferenceSelect.tsx`.
- **Mudou:** o servidor **não muda** — os três `/options` já aceitam `?q=`. O
  trabalho é `useCatalogOptionsQuery` passar `q`, entrar com ele na `queryKey` e
  o `staleTime` deixar de esconder a digitação.
- **Regra:** o cliente manda **token**; o servidor casa contra allowlist e
  responde 422 com a lista dos válidos (D71). A allowlist de ordenação já existe
  (`ASSET_SORTABLE`, cinco colunas) e **não é** o catálogo de export — o catálogo
  é maior, e o nome de cada um tem de dizer isso.
- **Teste:** `tests/listagens/opcoes-com-busca.test.ts` — `?q=` filtra no servidor
  e o vínculo atual continua aparecendo acima de 200 opções.

### C — Export CSV com BOM UTF-8 · **P**

- **Nasce:** `server/domain/report/helpers/csv.helper.ts`,
  `GET /api/<listagem>/export` por domínio.
- **Regra:** BOM no começo, `Content-Type: text/csv; charset=utf-8`,
  `filename*=UTF-8''…`; número cru, data ISO, prefixo em valor que começa com
  `=`, `+`, `-` ou `@` (D69); stream com cursor e rate limit próprio.
- **Mudou:** o export **reusa o `*-select.helper.ts` do domínio** (D133). Em
  licença isso é a diferença entre exportar `productKeyMask` e vazar a chave num
  arquivo que circula por e-mail — a quarta porta que o TODO nomeia.
- **Teste:** `tests/relatorios/export.puro.test.ts` (BOM, escape de fórmula,
  delimitador, data ISO — função pura, sem banco) + `tests/relatorios/export.test.ts`
  (a rota de licença **não** traz `productKey`; os filtros da listagem valem no
  export).

### D — `Import` + `ImportRow`, dry-run obrigatório · **G**

- **Schema:** enums `ImportTarget` (`ASSETS`, `USERS`, `OCCUPANTS`) e
  `ImportRowStatus` (`OK`, `ERRO`, `IGNORADA`); `Import` e `ImportRow` com
  `Cascade`.
- **Nasce:** `server/domain/import/` (maestro, controller, `parse-csv`,
  `dry-run-import`, `apply-import`, `helpers/csv-parse.helper.ts` sobre
  `papaparse`, `helpers/row-mapper.helper.ts`), `src/pages/importacao/`.
- **Regra:** dois passos (D68). Nada é gravado no primeiro. Chave de atualização
  **declarada no mapeamento** (`assetTag` ou `serial`), nunca o nome. Ausência de
  linha não encerra, não apaga, não desvincula.
- **Mudou:** posse importada chama o checkout **com `checkoutAt` e `semAviso`**
  (D0) e **com o status do CSV como `statusId` da entrega** — o ativo nasce
  disponível e a própria entrega o move, que é como a invariante 4 fica satisfeita
  sem o importador escrever status à mão. O apply roda **em lotes**, transação por
  lote, `Import.status` registrando até onde foi (`$transaction` tem timeout de
  5 s). A rota declara os **próprios `limits` de multipart**, e o mapeamento vai
  como **um** campo JSON (D134).
- **Teste:** `tests/importacao/dry-run.test.ts` (nada gravado),
  `apply.test.ts` (lote parcial retomável; 5.000 linhas não estouram a transação),
  `mapeamento.puro.test.ts` (strip do BOM no primeiro cabeçalho, detecção de
  delimitador, recusa de arquivo que não é UTF-8).

### E — Importar ocupação de posto · **M**

- **Nasce:** `import/use-cases/import-occupants.usecase.ts` e o CSV-modelo
  baixável.
- **Regra:** `Local;Colaborador;Turno;Inicio;Fim`. Local casa por `locations.name`
  (`@unique` ✅). Pessoa casa por **e-mail** com `findFirst` — a unicidade é
  parcial —, e e-mail repetido em linha da lixeira é `IGNORADA` com motivo (D132).
  `Fim` vazio não encerra nada. `P2002` vira *"linha já existente, ignorada"*.
- **Mantido inteiro:** o dry-run desta etapa informa **quantos ativos passam a ter
  responsável resolvido e quantos deixam de ter**. É o melhor parágrafo do plano e
  não tem correção — é o único lugar onde o efeito de segunda ordem aparece antes
  de acontecer.
- **Teste:** `tests/importacao/ocupacao.test.ts` — reimportar o mesmo arquivo dá
  tudo `IGNORADA`; turno diferente **atualiza** a linha aberta; o contador de
  ativos que trocam de responsável bate com `resolverResponsaveisEmLote` antes e
  depois.

### F — A view de responsáveis e o builder · **G**

- **Schema:** `vw_asset_responsibles`, escrita **à mão** na migration (o `migrate
  diff` não a conhece e não a derruba — confirmar com um diff vazio depois de
  criada).
- **Nasce:** `report/use-cases/` (um por relatório pronto),
  `custom-report.usecase.ts`, `helpers/report-columns.ts`.
- **Mudou:** o SQL, nos quatro pontos dos defeitos 1, 2 e 5; *posto vago* sai de
  `POSTO_VAGO`, não da view (D130); e o recorte do parque ganha **versão SQL no
  mesmo arquivo da versão Prisma** (`asset/helpers/asset-scope.helper.ts`), senão
  o relatório em `$queryRaw` escreve a quarta cópia de `ATIVO_NO_PARQUE` — que é
  o defeito que a revisão da F8 já pagou uma vez.

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

- **Regra:** o cliente manda token; o servidor troca por fragmento `Prisma.sql`
  declarado em código; token fora do mapa é 422 com a lista (D67).
- **Teste:** `tests/relatorios/view-responsaveis.test.ts` — **a view ≡ o
  resolver**, nos quatro cenários do `MODELO-POSSE.md` (direto, posto com dois
  ocupantes, posto vago, salto de ativo), mais ativo na lixeira fora da view. É o
  teste que impede a Camada 3 de ter duas definições.

### G — Etiquetas, QR e a busca do leitor · **G**

- **Schema:** `labelPageSize`, `labelCols`, `labelRows`, margens, `labelFields`.
- **Nasce:** `server/domain/label/`, `src/pages/etiquetas/`, `GET /api/search?q=`.
- **Regra:** o preview **é o PDF de verdade**, uma página, com debounce. A busca
  tenta `assetTag` exato → `serial` exato → `ILIKE`, nessa ordem e por esse
  motivo. Campo sem debounce que engula o `Enter`, sem `trim` que coma zero à
  esquerda.
- **Mudou:** `urlDoPainel()` muda de casa antes (defeito 10). E
  `GET /api/assets/by-serial/:serial` **já existe** e já faz match exato por
  série — a busca global passa a ser a porta única e `by-serial` fica como o que é:
  a rota da reconciliação. Nenhuma tela a consome hoje.
- **Teste:** `tests/etiquetas/busca.test.ts` — etiqueta exata resolve em uma
  consulta; `ILIKE` só quando os dois exatos falham; QR de ativo leva `/ativos/:id`
  (o caminho novo, D70).

---

## 5. Decisões que esta auditoria acrescenta — D129 a D134

A numeração do projeto está em **D128**. Estas continuam dela; D65–D71 ficam como
estão, corrigidas no texto.

### D129 — A view devolve responsável REAL, e fala a língua da tela
`deletedAt IS NULL` dentro da view; `userId` nulo não vira linha; `via` é
`DIRETO`/`POSTO`/`ATIVO`. **Descartado:** corrigir no consumidor — seriam três
relatórios lembrando do mesmo filtro, e o quarto esqueceria. A equivalência com
`resolverResponsaveisEmLote` é **testada**, não prometida.

### D130 — Posto vago continua saindo do `POSTO_VAGO`
A view não responde essa pergunta (o `JOIN` a elimina) e já há duas
implementações revisadas. **Descartado:** uma quarta perna com `LEFT JOIN` só para
caber tudo numa view — ela mudaria a cardinalidade das outras três e faria
`count(*)` por responsável passar a contar posto vazio.

### D131 — Posse importada é checkout retroativo e **silencioso**
`checkoutAt` passado + `semAviso` que pula termo e e-mail, usados **só** pelo
importador. **Descartado:** `UPDATE` direto em `assignedToId` (é o D17); e
importar com aviso ligado — 500 convites de assinatura para equipamento entregue
há anos é estrago que nenhum "desfazer" alcança, porque o e-mail já saiu.

### D132 — Pessoa casa por e-mail com `findFirst`, e e-mail ambíguo é linha ignorada
A unicidade de `User.email` é **parcial**. **Descartado:** casar por nome (o plano
já recusa) e `findUnique` (não compila).

### D133 — O export não monta `select`: ele reusa o do domínio
`license-select.helper.ts` devolve `productKeyMask` porque alguém pensou nisso na
F6. **Descartado:** uma allowlist de export paralela — ela nasceria certa e
envelheceria sozinha, e o dia em que divergir é o dia em que a chave viaja.

### D134 — A rota de import declara os próprios limites de multipart
O teto global (10 MB, `files: 1`, `fields: 10`) é o do anexo. O mapeamento viaja
como **um** campo JSON. **Descartado:** subir o teto global — ele protege as
rotas de anexo, que recebem arquivo de gente.

---

## 6. Os testes da fase

Pastas novas, pela regra do `TESTES.md` (sufixo `.puro` só para o que não abre
conexão):

```
tests/importacao/   checkout-retroativo · dry-run · apply · ocupacao · mapeamento.puro
tests/relatorios/   view-responsaveis · export · export.puro
tests/etiquetas/    busca
tests/configuracoes/sistema
```

Os três que valem mais que os outros, porque são os que falhariam **em silêncio**:

1. **`view-responsaveis`** — a view contra `resolverResponsaveisEmLote`, mesmo
   cenário, mesmo resultado. Sem ele, as duas definições divergem na primeira
   fase que mexer em posse, e ninguém percebe pela tela.
2. **`checkout-retroativo`** com a asserção de **zero `Acceptance`** — o defeito 3
   não dá erro: ele manda e-mail.
3. **`export.puro`** do escape de fórmula — uma célula `=cmd|...` só mostra o que
   é quando alguém abre o arquivo no Excel.

E as três provas que não são comando continuam valendo, do plano original: abrir o
CSV no Excel em português, imprimir uma folha a 100% e medir com régua, e importar
ocupação com **uma** mesa de nome errado para ver o dry-run denunciar.

---

## 7. As perguntas em aberto, depois da auditoria

| Pergunta do plano | Situação |
|---|---|
| Materializar `vw_asset_responsibles` | **Continua aberta**, e o gatilho continua sendo o `EXPLAIN` com volume real. Nada muda: a saída está pré-escrita no D66 |
| Import de posse retroativa e o status do ativo | **Respondida** (defeito 3): o ativo nasce `DEPLOYABLE` e o status do CSV vai como `statusId` **da entrega**. Não é preciso exigir coluna *Status* coerente nem escolher status pelo usuário |
| Export por permissão | **Continua aberta até a F11** — mas deixou de ser "está aceito porque não há login": **há login desde a F3**. O que não há é permissão por módulo. O `report-columns.ts` nasce com o mapa que a F11 vai filtrar (D67), e isso é o que torna o filtro uma linha e não uma refatoração |

Uma pergunta nova, que a auditoria abre: **o importador aparece no `ActivityLog`
como quem?** `actorId` é parâmetro obrigatório desde o D23, e a importação tem
ator (quem clicou em aplicar). O que falta decidir é se cada linha gravada leva
`actorId` da pessoa — e a resposta provável é sim, com o `importId` nos `details`,
porque é isso que torna o `ImportRow` o caminho do desfazer à mão que o D68 promete.

---

## 8. Ordem de execução

```
D0 → A → B → C → D → E → F → G
```

`D0` antes de `D` porque mexe na F4. `B` antes de `C` porque o export consome o
catálogo de colunas. `E` depois de `D` porque reusa o maestro e a tabela. `F` e
`G` não dependem uma da outra e podem trocar de lugar.

Esforço revisto: **D0** P · **A** M · **B** P *(era M)* · **C** P · **D** G ·
**E** M · **F** G · **G** G.

**Commit**, pela convenção que o histórico usa hoje — um por fase, `feat:` sem
escopo, corpo em bullets curtos:

```
feat: etiquetas, relatórios e importação de CSV
```

O lint e o `tsc` têm de passar; a suíte, também — ela existe agora, e é essa a
diferença mais importante entre este plano e o que foi escrito em 24/09.

---

# Estado da execução — 01/10/2026

> As **oito levas** foram implementadas na ordem desta auditoria. Árvore verde:
> `tsc -b` ✅ · `eslint .` ✅ · `npm run build` ✅ · `npm test` ✅ **62 arquivos,
> 673 testes** (eram 51/522 antes da fase).

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

## O que a execução mudou em relação a esta auditoria

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
   definição que `ehPostoVago()` guarda. O D130 foi além do que a auditoria
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

## O que ficou de fora, e por quê

- **Campos customizados no import e no export** (item **P** do TODO). O par só é
  coerente junto, e o mapeamento de `cf[slug]` pede uma decisão sobre campo
  CIFRADO que a F9 deixou explícita: ele não sai em listagem nenhuma. Fica anotado
  para a revisão da fase.
- **O backup com `pg_dump` de verdade não tem teste de ponta a ponta**: exige o
  cliente do Postgres na máquina da suíte, na mesma versão major do servidor. O que
  é testado é a tradução da falha (binário ausente → 503 com instrução), o ciclo de
  retenção e as duas recusas de caminho. Está escrito no cabeçalho do arquivo de
  teste.
- **Materializar a view** continua *não, por ora* (D66), e o gatilho segue sendo o
  `EXPLAIN` com volume real.

---

# Revisão da fase — 01/10/2026

> Leitura da F10 **já escrita**, contra o código, procurando defeito de lógica e
> inconsistência. Árvore verde antes de começar (`tsc -b` ✅ · `eslint .` ✅ ·
> `npm test` ✅ 62 arquivos / 673 testes), o que significa que **nenhum dos cinco
> defeitos abaixo era pego por um teste** — os cinco falham em silêncio, que é por
> que sobreviveram.

## Os cinco defeitos corrigidos

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
**Teste:** `tests/importacao/mapeamento.puro.test.ts` — o arquivo que a seção 6
previa e que não tinha nascido.

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
