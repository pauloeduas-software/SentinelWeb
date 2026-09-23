# Plano de implementação — Fase 10: etiquetas, relatórios e importação

> Plano **prospectivo** da Fase 10 do [`ITAM-TODO.md`](./ITAM-TODO.md). Convenções de camada:
> [`ARQUITETURA.md`](./ARQUITETURA.md). Contrato de posse: [`MODELO-POSSE.md`](./MODELO-POSSE.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D65–D71**, na
> numeração contínua do projeto (D1–D13 no TODO, D14–D17 em `DECISOES-POSSE.md`).

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
| **F9 (desejável)** | campo customizado no import e no export. Sem a F9, o mapeamento cobre só colunas nativas — nada trava |
| **`bwip-js`, `qrcode`, `pdfkit`** | nenhum instalado (`pdfkit` pode ter vindo com o termo de entrega da F4). `@fastify/multipart` veio com os anexos da F2 |

---

## Etapa A — `AppSetting` cresce; a tela de sistema e o backup · **M**

- **Schema:** `AppSetting` ganha `companyName`, `logoPath?`, `faviconPath?`, `primaryColor`,
  `locale @default("pt-BR")`, `dateFormat`, `currency @default("BRL")`,
  `csvDelimiter @default(";")` e `backupRetentionDays`. **Nenhuma tabela `Setting` nova** (D65).
- **Nasce:** aba *Sistema* em `src/pages/configuracoes/`, `server/domain/backup/`
  (`create-backup.usecase.ts`, `list-backups`, `prune-backups`), e
  `GET /api/settings` (hoje só existe `/api/settings/next-asset-tag`).
- **Regra:** `pg_dump` roda por `execFile('pg_dump', [...])`, **nunca** `exec` com string montada —
  e o diretório de dump fica **fora** de qualquer raiz do `@fastify/static`.

O `src/lib/format.ts` que o TODO pede **não nasce**: `src/pages/helpers/format.helper.ts` já
existe e é o arquivo certo pelo `ARQUITETURA.md` — ele passa a ler `locale`, `dateFormat` e
`currency` do `AppSetting` por hook. E baixar um backup **é baixar o banco inteiro**: a rota nasce
atrás de `BACKUP_ENABLED` (default desligado) e, na **F11**, atrás da permissão de dado sensível.
Escrito aqui para não ser descoberto depois que alguém expôs a rota. `pg_dump` roda pelo container
do Postgres — versão de cliente menor que a do servidor recusa o dump.

---

## Etapa B — Catálogo de colunas, seletor e combobox com busca · **M**

- **Schema:** nada muda.
- **Nasce:** `src/pages/gestao-itam/helpers/asset-columns.ts` (catálogo de INTERFACE),
  `src/domain/asset/asset.store.ts` (zustand + `persist`), busca server-side no
  `ReferenceSelect.tsx` usando o `useDebouncedValue` que já existe.
- **Regra:** o cliente manda **token** de coluna; o servidor casa contra allowlist e responde 422
  listando os válidos quando não casar (D71).

O `/options` tem teto de 200 e o `ReferenceSelect` não tem campo de busca — acima de 200
localizações, escolher a 201ª é impossível pela tela. A busca é do servidor (`?q=`), não filtro
local sobre 200 linhas, senão o problema só muda de número. A preferência de colunas é **client
state** — ninguém a busca, só existe naquele navegador: é o caso que o `ARQUITETURA.md` já nomeia
para o zustand.

---

## Etapa C — Export CSV com BOM UTF-8 · **P**

- **Schema:** nada muda.
- **Nasce:** `server/domain/report/helpers/csv.helper.ts`,
  `GET /api/<listagem>/export` por domínio.
- **Regra:** o corpo começa com `﻿`, o cabeçalho é
  `Content-Type: text/csv; charset=utf-8` + `Content-Disposition` com `filename*=UTF-8''…`.

Sem o BOM, o Excel em português lê o arquivo como Windows-1252 e todo acento sai quebrado — é a
razão declarada no TODO. E **o mesmo BOM é armadilha do outro lado** (Etapa D). Três regras de
conteúdo, porque CSV é integração e não só leitura: **número cru** (ponto decimal), **data ISO**, e
**todo valor que começa com `=`, `+`, `-` ou `@` é prefixado** — senão a célula vira fórmula ao
abrir (D69). A exportação é por stream com cursor: o teto de `perPage` não vale aqui, e a rota
tem rate limit próprio.

---

## Etapa D — Importador: `Import` + `ImportRow`, dry-run obrigatório · **G**

- **Schema:** enums `ImportTarget` (`ASSETS`, `USERS`, `OCCUPANTS`) e `ImportRowStatus` (`OK`,
  `ERRO`, `IGNORADA`); `Import` (`filename`, `target`, `mapping Json`, `status`, totais,
  `actorId?`) e `ImportRow` (`importId`, `lineNumber`, `raw Json`, `status`, `message?`,
  `entityId?`), `Cascade` do `Import` para as linhas.
- **Nasce:** `server/domain/import/` (maestro, controller, `parse-csv.usecase.ts`,
  `dry-run-import.usecase.ts`, `apply-import.usecase.ts`, `helpers/csv-parse.helper.ts`,
  `helpers/row-mapper.helper.ts`), `src/pages/importacao/`.
- **Regra:** **dois passos** — `POST /api/imports` (arquivo + mapeamento, roda o dry-run) e
  `POST /api/imports/:id/apply` (aplica). Nada é gravado no primeiro (D68).

O relatório por linha **precisa** de tabela: uma resposta HTTP de 5.000 erros não sobrevive ao
fechamento da aba, e depois do apply ela é a única trilha do que entrou — é também o caminho do
desfazer à mão, junto com o `ActivityLog` de cada gravação.

**Posse importada passa pelo checkout** (D17): a coluna *Responsável* vira uma `Assignment` com
`checkoutAt` retroativo, nunca um `UPDATE` em `assets.assignedToId` — a coluna é cache, tem um
único escritor, e o importador não vai ser o segundo. Chave de atualização é **declarada no
mapeamento** (`assetTag` ou `serial`), nunca o nome. E **ausência de linha no CSV não encerra, não
apaga e não desvincula nada**: um arquivo com 300 das 500 pessoas não pode demitir 200.

---

## Etapa E — Importar ocupação de posto · **M**

- **Schema:** nada muda — escreve em `LocationOccupant`, que já existe.
- **Nasce:** `server/domain/import/use-cases/import-occupants.usecase.ts` e o modelo de CSV
  baixável pela tela.
- **Regra:** colunas `Local;Colaborador;Turno;Inicio;Fim`. O local casa por `locations.name`
  (que é `@unique` no schema, então o nome **é** chave); a pessoa casa por **e-mail**, nunca por
  nome. `Fim` preenchido encerra a ocupação; `Fim` vazio não encerra nada.

A idempotência não é escrita aqui: **já está no banco**. O índice
`location_occupants_um_aberto_por_pessoa_local` recusa a segunda ocupação aberta do mesmo par, e o
importador traduz o `P2002` em *"linha já existente, ignorada"* em vez de erro — reimportar o mesmo
arquivo é seguro por construção, não por checagem. Reimportar com turno diferente **atualiza o
`shift` da linha aberta**: encerrar e reabrir fabricaria histórico falso a partir de um typo.

**O efeito de segunda ordem é o ponto desta etapa, e o mais perigoso do plano.** Importar
ocupação **muda quem responde por todo ativo entregue àquele posto**, sem tocar em uma `Assignment`
sequer — é exatamente o que o modelo promete (*"chega um headset na mesa: zero linhas, herda os
dois responsáveis"*) e é o que torna um nome de mesa errado em 300 linhas uma transferência de
responsabilidade do andar inteiro. Por isso o dry-run desta etapa informa, além de linhas novas e
alteradas, **quantos ativos passam a ter responsável resolvido** e **quantos deixam de ter**.

---

## Etapa F — Relatórios: a view de responsáveis e o builder · **G**

- **Schema:** a view `vw_asset_responsibles`, criada **à mão na migration** (o Prisma não a
  conhece), sobre as tabelas e os índices que já existem.
- **Nasce:** `server/domain/report/use-cases/` (um por relatório pronto),
  `custom-report.usecase.ts`, `helpers/report-columns.ts` (o mapa token → fragmento).
- **Regra:** o cliente manda **token**; o servidor troca por um fragmento SQL **declarado em
  código**. Token fora do mapa é 422 (D67).

```sql
CREATE VIEW vw_asset_responsibles AS
  SELECT g."assetId", g."targetUserId" AS "userId", 'USER' AS via, NULL::uuid AS "locationId", NULL AS shift
    FROM assignments g WHERE g."checkinAt" IS NULL AND g."targetType" = 'USER'
  UNION ALL
  SELECT g."assetId", o."userId", 'LOCATION', o."locationId", o.shift
    FROM assignments g
    JOIN location_occupants o ON o."locationId" = g."targetLocationId" AND o."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL AND g."targetType" = 'LOCATION'
  UNION ALL   -- o salto de ASSET, exatamente UM nível: dock → notebook → (pessoa | posto)
  SELECT g."assetId", COALESCE(h."targetUserId", o2."userId"), 'ASSET', o2."locationId", o2.shift
    FROM assignments g
    JOIN assignments h ON h."assetId" = g."targetAssetId" AND h."checkinAt" IS NULL
    LEFT JOIN location_occupants o2 ON o2."locationId" = h."targetLocationId" AND o2."endedAt" IS NULL
   WHERE g."checkinAt" IS NULL AND g."targetType" = 'ASSET';
```

Os três relatórios que só existem aqui — *posto vago*, *ativos por posto*, *o que cada pessoa
responde (direto × por posto)* — saem dessa view. Os do Snipe-IT continuam em Prisma normal:
**raw SQL fica confinado a um arquivo**.

---

## Etapa G — Etiquetas, QR e a busca do leitor · **G**

- **Schema:** `AppSetting` ganha o layout de etiqueta (`labelPageSize`, `labelCols`, `labelRows`,
  margens, `labelFields String[]`).
- **Nasce:** `server/domain/label/` (`render-label-sheet.usecase.ts` com `pdfkit` + `bwip-js` +
  `qrcode`), `src/pages/etiquetas/`, e `GET /api/search?q=` global.
- **Regra:** o **preview é o PDF de verdade**, renderizado pela mesma função da impressão.

Um preview em HTML que discorda do PDF é pior que nenhum: o objetivo declarado é *não gastar a
folha*. Ele renderiza **uma** página, com debounce. A busca do leitor tenta, nesta ordem:
`assetTag` exato → `serial` exato → `ILIKE` — os dois primeiros usam os índices únicos parciais, o
`ILIKE '%x%'` não usa índice nenhum, e é por isso que é o último. O leitor digita rápido e manda
`Enter`: o campo não pode ter debounce que engula a submissão nem `trim` que coma zero à esquerda.

---

## Decisões da fase — D65 a D71

### D65 — Não nasce tabela `Setting`. O `AppSetting` cresce.

O TODO pede um *"`Setting` singleton"*; ele já existe desde a F1, com id fixo `singleton` e o
`assetTagNext` dentro. Uma segunda tabela de configuração global seria duas linhas para a mesma
pergunta, e a primeira dúvida de quem chegar depois seria *em qual delas eu escrevo?*

### D66 — Responsável resolvido é uma **view**, não coluna nem cache.

**Decidido:** `vw_asset_responsibles`, não materializada, lida por `$queryRaw` com `Prisma.sql`.
**Descartado:** coluna (é o D16); resolução em memória com teto; e materializar agora. Resolver
em memória serve para uma página de 25 ativos e **não serve para agrupar**: não dá para agrupar
por responsável aquilo que não foi buscado. A view é exata, não tem política de refresh
para ninguém esquecer, e os índices de que precisa **já existem** desde a migration do modelo de
posse (`assignments(assetId, checkinAt)`, `location_occupants(locationId, endedAt)`).

**O trade-off, assumido:** cada relatório paga os joins. A saída está pré-escrita — se o `EXPLAIN`
com 10 mil ativos doer, `CREATE MATERIALIZED VIEW` sobre **o mesmo SQL** + `REFRESH CONCURRENTLY`
no job diário da F8: uma linha de DDL, porque a derivação está num lugar só. Materializar não é a
quarta fonte de verdade que o D16 recusou — é cache reconstruível por comando, cujo modo de falha
é *desatualização visível*, não *divergência silenciosa*. E nada de `WITH RECURSIVE`: o salto de
`ASSET` é de **um nível** por decisão (D16), e uma CTE recursiva seguiria um ciclo alegremente.

### D67 — O builder recebe token. Nunca campo, nunca SQL.

**Decidido:** `Record<token, Prisma.Sql>` declarado em `report-columns.ts`; token desconhecido é
422. **Descartado:** montar `select` do Prisma com string do cliente, ou SQL por concatenação.
O perigo não é raw SQL; é SQL **controlado pelo cliente**. Um mapa de token para fragmento
declarado é tão seguro quanto um mapa de token para campo do Prisma, e é o único que expressa o
join da view — mesma forma do `sortable` de `core/http/list-query.ts`, que já resolveu isto para a
ordenação. Quando a **F11** chegar, este mapa passa a ser **filtrado por permissão**, senão o
export vira a porta dos fundos do custo de compra.

### D68 — Importação é de dois passos, e o dry-run é obrigatório.

**Decidido:** upload+mapeamento roda o dry-run e grava `ImportRow`; um segundo POST aplica.
**Descartado:** importar direto com "relatório no final". Import é a operação com maior razão
dano/esforço do sistema: um clique, milhares de linhas — e na Etapa E ela muda responsabilidade em
massa **sem tocar em posse nenhuma**. Ver antes o que vai acontecer é a única chance de perceber
que a coluna *Local* veio trocada.

### D69 — O export manda número cru e data ISO — e trata fórmula.

**Decidido:** ponto decimal, `YYYY-MM-DD`, e prefixo em valor que começa com `=`, `+`, `-` ou `@`.
**Descartado:** exportar já formatado em pt-BR. O export é a entrada do importador: um `1.234,50`
volta como lixo no round-trip. O custo — o Excel em pt-BR mostra número como texto até a pessoa
converter a coluna — está aceito, porque perder dado na volta é pior que um clique de formatação.
O BOM continua ali: ele resolve **acento**, que é o problema que o TODO nomeia.

### D70 — QR leva URL. Código de barras leva a etiqueta.

**Decidido:** o QR contém `${APP_URL}/itam/assets/:id`; o Code128 contém o `assetTag`.
**Descartado:** os dois com o mesmo conteúdo. São dois leitores diferentes: a câmera do celular
abre link, o leitor de mão **digita texto** num campo. QR com a etiqueta obriga a copiar e colar;
código de barras com URL faz o leitor digitar 60 caracteres no campo de busca. A busca global
descarta o prefixo conhecido, para quem bipar o QR dentro do campo.

### D71 — O catálogo de colunas é declarado duas vezes, de propósito.

**Decidido:** allowlist no servidor (`asset-filters.helper.ts`, onde `ASSET_SORTABLE` já mora) e
catálogo de interface em `src/pages/gestao-itam/helpers/`. **Descartado:** arquivo compartilhado.
O lint impede `src/` importar de `server/`, e a regra existe para não colocar o Prisma no bundle
do navegador — não vale furá-la por uma lista de strings. A divergência entre as duas é
**barulhenta**: token que o servidor não conhece vira 422 com a lista dos válidos.

---

## Riscos e armadilhas

**O BOM é armadilha nos dois sentidos.** Escreve-se no export; **tira-se no import**. Sem o strip,
o primeiro cabeçalho vira `"﻿Asset Tag"`, o mapeamento perde a primeira coluna e o importador
diz que o arquivo não tem etiqueta — com a etiqueta ali, visível, na tela.

**Excel em pt-BR salva com `;` e pode salvar em Windows-1252.** O delimitador é detectado na linha
de cabeçalho; o encoding, não: arquivo que não for UTF-8 válido é **recusado** com a instrução
*"salvar como CSV UTF-8"*, em vez de importado com acento quebrado que ninguém revisa.


**`$transaction` do Prisma tem timeout de 5 s.** Um CSV de 5.000 linhas não cabe numa transação
só. O apply roda em **lotes** com transação por lote, e `Import.status` registra até onde foi —
tudo-ou-nada por lote, retomável, nunca um `P2028` no meio sem saber o que entrou.

**`$queryRaw` não passa pela extension de soft delete.** A view precisa do `deletedAt IS NULL`
**dentro dela**, ou o relatório de responsáveis vai contar ativos que estão na lixeira. É o mesmo
buraco que o D8 já documentou para relação aninhada, agora por outro caminho.

**A impressora escala para caber, por padrão.** Alguns milímetros de deslocamento desalinham a
folha inteira de etiquetas. O PDF é gerado no tamanho exato da página e a tela precisa dizer, em
letras visíveis: *imprimir em 100%, sem ajustar à página*.

**Export grande é negação de serviço acidental.** Sem stream e sem rate limit próprio, dois
cliques em *exportar tudo* montam a resposta inteira em memória: cursor paginado, `reply.send` com
stream, limite separado do global de 300/min.

---

## Verificação

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

- **Materializar `vw_asset_responsibles`.** A decisão é *não, por ora* (D66), e o gatilho é o
  `EXPLAIN` da Verificação com volume real. Quem materializar precisa escolher a política de
  refresh — a proposta é pendurar no job diário da F8, não em trigger.
- **Import de posse retroativa e o status do ativo.** Uma `Assignment` com `checkoutAt` antigo
  deveria mover o `statusId` para `IN_USE`? A invariante 4 proíbe `DEPLOYABLE`/`ARCHIVED` com posse
  aberta, então o importador **precisa** de uma resposta: este plano propõe exigir a coluna
  *Status* no CSV e recusar a linha incoerente, em vez de escolher um status pelo usuário.
- **Export por permissão.** Enquanto a F11 não chegar, `/export` devolve tudo que a listagem
  devolve — inclusive `purchaseCost`. Está aceito porque ainda não há login; deixa de estar no dia
  em que houver.


---

## Ordem de commits

```
A: feat(settings): AppSetting de sistema, tela de configurações e backup
B: feat(web): catálogo de colunas, seletor salvo e combobox com busca
C: feat(api): export CSV com BOM UTF-8 e escape de fórmula
D: feat(import): Import/ImportRow com mapeamento e dry-run em dois passos
E: feat(import): importação de ocupação de posto
F: feat(report): view de responsáveis resolvidos e custom report builder
G: feat(label): código de barras, QR, folha em PDF com preview e busca do leitor
```

O lint tem que passar em cada um. Não há suíte: a verificação é a seção acima.
