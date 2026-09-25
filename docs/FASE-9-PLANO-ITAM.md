# Plano de implementação — Fase 9: campos customizados

> Plano **prospectivo** da Fase 9 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o código
> real depois da F1. Convenções de camada: [`ARQUITETURA.md`](./ARQUITETURA.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D58–D64**, na
> numeração contínua do projeto (D1–D13 no TODO, D14–D17 em `DECISOES-POSSE.md`).

---

## Objetivo

Deixar o cliente acrescentar campo ao ativo sem tocar no schema: *IP fixo*, *hostname*, *número do
patrimônio da contabilidade*, *IMEI*. É a fase que decide **onde o dado que não cabe no modelo vai
morar** — e a resposta é `JsonB` na própria linha do ativo, não DDL gerado em runtime (D7). O preço
dessa escolha precisa estar escrito aqui, porque quem paga é a **F10**: consulta por igualdade
dentro de JsonB usa índice; ordenação e faixa, não.

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F1 concluída** | `Category` e `AssetModel` existem; são eles que ancoram o conjunto de campos |
| **F2 concluída** | a edição em massa é o instrumento de backfill quando um campo vira obrigatório (D61) |
| **`APP_ENCRYPTION_KEY` no `.env`** | não existe. A F6 vai precisar da mesma chave para a product key; quem chegar primeiro cria `server/core/crypto/` |
| **`zod@4`** | já instalado. Em zod 4 os validadores são de topo: `z.email()`, `z.url()`, `z.ipv4()` — `.string().email()` saiu |

**Não é pré-requisito:** F3 — campo cifrado protege contra quem lê o banco ou o dump, não contra
quem usa a tela.

---

## Etapa A — As três tabelas e as duas âncoras · **M**

- **Schema:** enums `CustomFieldElement` (`TEXT`, `TEXTAREA`, `LISTBOX`, `CHECKBOX`, `RADIO`,
  `DATE`) e `CustomFieldFormat` (`ANY`, `NUMERIC`, `ALPHA`, `ALPHANUMERIC`, `EMAIL`, `URL`, `IP`,
  `IPV4`, `IPV6`, `MAC`, `DATE`, `BOOLEAN`, `REGEX`); models `CustomField`
  (`name`, `slug @unique`, `element`, `format`, `regexPattern?`, `listValues String[]`,
  `helpText?`, `encrypted`, `showInListView`, `displayInUserView`, `showInEmail`),
  `CustomFieldset` (`name @unique`) e o vínculo `CustomFieldsetField`
  (`@@id([fieldsetId, fieldId])`, `ordem Int`, `required Boolean`, `defaultValue String?`).
  `Category.fieldsetId?` e `AssetModel.fieldsetId?`, ambos `Restrict` (D58).
  `Asset.customFields Json? @db.JsonB`.
- **Nasce:** `server/domain/catalog/specs/custom-field.spec.ts` e `custom-fieldset.spec.ts` (a
  parte plana é CRUD de catálogo — D64), `server/domain/custom-field/` para a composição e a
  validação, e as colunas novas em `category.spec.ts`/`asset-model.spec.ts`.
- **Regra:** `ordem` **não** é único. Reordenar N vínculos numa transação colidiria com
  `@@unique([fieldsetId, ordem])` no meio do caminho, porque constraint do Postgres é imediata e o
  Prisma não expressa `DEFERRABLE`. O desempate é `orderBy: [{ ordem }, { fieldId }]`.

> Correção de fato: o item do TODO diz que o `AssetModel` *"já tem a coluna reservada"* para o
> fieldset. Não tem — a F1 **adiou o atributo**, não criou a coluna (`FASE-1-PLANO-ITAM.md`: *"FK para
> tabela inexistente é impossível, não adiável"*). As duas colunas nascem aqui.

---

## Etapa B — O motor de validação por formato · **M**

- **Schema:** nada muda.
- **Nasce:** `server/domain/custom-field/helpers/field-validator.helper.ts` (puro: formato →
  `ZodType`), `use-cases/validate-custom-fields.usecase.ts`.
- **Regra:** o `createAssetSchema` valida `customFields` como **um** campo
  (`z.record(z.string(), z.unknown()).optional()`); o conteúdo é validado no use-case, contra o
  conjunto resolvido.

Isso não é preguiça: o `strictObject` da F0 recusa chave desconhecida e **não pode** conhecer
campos criados em runtime. Empurrar a validação de conteúdo para o use-case mantém as duas
garantias — mass assignment barrado na borda, formato barrado onde o conjunto é conhecido. O erro
sai no 422 do `ZodError` com o `slug` no caminho, para a tela saber em qual campo pintar a
mensagem. `MAC` é regex própria (`zod` não tem); `REGEX` vem com as três guardas do D63.

---

## Etapa C — O conjunto resolvido · **M**

- **Schema:** nada muda.
- **Nasce:** `server/domain/custom-field/use-cases/resolve-fieldset.usecase.ts`,
  `GET /api/assets/fieldset?modelId=` para o formulário.
- **Regra, em uma linha:** `fieldset = model.fieldsetId ?? model.category.fieldsetId` — o modelo
  **sobrepõe** a categoria, e a resolução mora numa função só (D58).

Dois detalhes que só aparecem lendo o schema: `Asset` **não tem `categoryId`** (a categoria vem de
`model.category`), então a resolução é sempre um `select` de dois saltos. E **trocar o modelo de um
ativo pode trocar o conjunto dele**, deixando chaves de um conjunto anterior no JSON — que **não
são apagadas** (D60): a tela não as exibe, a validação as ignora, um aviso conta quantas são.
Apagar dado do cliente porque um `<select>` mudou é a "limpeza" que ninguém pede e todos lamentam.

---

## Etapa D — Gravação, leitura e o índice GIN · **M**

- **Schema:** `@@index([customFields(ops: JsonbOps)], type: Gin)` em `Asset`. **Conferir se o
  `migrate diff` emite o GIN**; se não emitir, ele entra à mão na migration, como os índices
  parciais já entram.
- **Nasce:** filtro `?cf[slug]=valor` em `asset-filters.helper.ts`, traduzido para
  `customFields: { path: [slug], equals: valor }`.
- **Regra:** filtrar por igualdade, sim; **ordenar, não** — `ASSET_SORTABLE` não ganha campo
  customizado nesta fase (D63).

`jsonb_ops` e não `jsonb_path_ops`: o segundo é menor e mais rápido para `@>`, mas **não suporta o
operador `?`** (existência de chave) — e *"ativos que têm o campo X preenchido"* é a primeira
pergunta da tela de administração. Paga-se o tamanho do índice pela pergunta.

**`Prisma.DbNull` × `Prisma.JsonNull`.** Gravar `null` numa coluna `Json` tem dois significados e o
Prisma obriga a escolher: `DbNull` é *coluna nula*, `JsonNull` é *o literal JSON `null` dentro da
coluna*. Ativo sem campos customizados usa **`DbNull`** — com `JsonNull`, `customFields IS NULL`
para de achá-lo e a contagem de "sem campos preenchidos" passa a mentir.

---

## Etapa E — Campo cifrado em repouso · **M**

- **Schema:** nada muda — o valor cifrado é **string** dentro do mesmo JsonB.
- **Nasce:** `server/core/crypto/cipher.ts` (AES-256-GCM, infraestrutura pura),
  `use-cases/reveal-custom-field.usecase.ts`, e o mascaramento em `asset-select.helper.ts`.
> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D81.** O formato ganhou o identificador da chave (`kid`) e AAD — é o mesmo da F6, num arquivo só.

- **Regra:** o valor é gravado como `enc:v1:<kid>:<iv>:<tag>:<ct>` (D81), volta mascarado por padrão, e
  revelar é **rota própria** que grava `ActivityLog` — *quem viu* é informação de auditoria.

Escalar em vez de sub-objeto: um `{iv, tag, ct}` aninhado quebraria o formato dos outros valores.
O prefixo `v1` transforma rotação de chave em script em vez de adivinhação, e **perder
`APP_ENCRYPTION_KEY` é perder o dado** — propriedade desejada, não defeito. Campo cifrado **sai de
tudo**: não é buscável nem ordenável, não entra no export CSV da F10 por padrão, e **não entra no
`changes` do `ActivityLog`** — senão a trilha vira o vazamento que a cifra existe para evitar.

---

## Etapa F — Formulário dinâmico e a tela de administração · **G**

- **Schema:** nada muda.
- **Nasce:** `src/pages/ativos/components/CustomFieldsSection.tsx` (render por `element`),
  `src/pages/configuracoes/` ganha as abas Campos e Conjuntos, `src/domain/custom-field/…queries.ts`.
- **Regra:** a coluna na tabela aparece só com `showInListView`, e o seletor de colunas da **F10**
  herda essas colunas com o mesmo mecanismo das nativas.

A tela de conjuntos é a única de arrastar-e-soltar do projeto até aqui. Ao marcar um campo como
obrigatório, ela mostra **quantos ativos já gravados ficariam inválidos** — o número que decide se
a promoção acontece hoje ou depois do backfill (D61).

---

## Decisões da fase — D58 a D64

### D58 — O conjunto ancora na **categoria** e no **modelo**, com precedência do modelo.

**Decidido:** `Category.fieldsetId` é o padrão; `AssetModel.fieldsetId` sobrepõe quando preenchido.
**Descartado:** só por modelo; só por categoria; e herança em três níveis.

O `ITAM-TODO.md` (versão de 23/09) diz *por modelo*; o briefing desta fase dizia *por categoria*.
Os dois têm razão em metades diferentes. **Por categoria** carrega a empresa inteira em seis
atribuições, e os campos que o cliente realmente quer — IP, hostname, patrimônio — são da categoria
*Notebook*, não do *Latitude 5420*. **Por modelo** é o que o Snipe-IT faz e o único jeito de
expressar o campo que só existe num modelo (IMEI do tablet 4G). Duas colunas nullable e uma linha
de resolução compram os dois; escolher um lado deixaria metade dos casos sem resposta. Três níveis
(categoria → modelo → ativo) fica de fora pelo motivo que limita o salto de `ASSET` no D16: cadeia
mais longa é sintoma de modelagem errada e custa um salto de consulta a cada leitura.

### D59 — Valores em `JsonB` na linha do ativo. Não DDL dinâmico, não EAV.

**Decidido:** `Asset.customFields Json? @db.JsonB`. **Descartado:** uma coluna por campo (o que o
Snipe-IT faz); e uma tabela `CustomFieldValue` no estilo EAV.

É o **D7**, e o motivo é mais duro do que "é inviável": o `migrate diff` compara o banco contra o
**arquivo de schema**. Uma coluna criada em runtime é *drift*, e a próxima migration emitiria um
`DROP COLUMN` para ela — **todo campo customizado que o cliente criou morreria no deploy
seguinte**. Além disso, `prisma generate` monta os tipos em tempo de build: a coluna nova seria
invisível ao client, e tudo teria que passar por `$queryRaw`, perdendo de quebra a extension de
soft delete, que age sobre operações do client.

EAV foi descartado por preço de leitura: uma linha por campo por ativo transforma a listagem num
pivô e a coluna da tabela em N joins. **O preço do JsonB:** não há integridade referencial entre as
chaves do JSON e `custom_fields` — é o que o D60 fecha.

### D60 — O `slug` é imutável. O valor órfão não é apagado.

**Decidido:** `beforeWrite` recusa mudar `slug` de campo já criado; `name` muda à vontade.
**Descartado:** renomear slug com `UPDATE` em massa no JSON de todos os ativos.

O slug é a chave do JSON em N mil linhas. Renomeá-lo é um `UPDATE` sobre a tabela inteira que teria
que ser transacional com a linha do campo — e um meio-caminho deixa valores órfãos sem ninguém
saber. Uma regra de três palavras evita um script de migração e um modo de falha. Pelo mesmo
motivo, trocar o conjunto de um ativo **não apaga** as chaves que sobraram: são dado do cliente, o
conjunto antigo pode voltar, e mantê-las custa zero.

### D61 — Obrigatoriedade é do **vínculo**, não do campo.

**Decidido:** `required` e `defaultValue` moram em `CustomFieldsetField`. **Descartado:**
`CustomField.required` global.

O mesmo campo *Centro de custo* é obrigatório no conjunto de Notebooks e opcional no de Periféricos
— é assim no Snipe-IT e é o que a operação real pede. A obrigatoriedade vale **em todo save**,
criação e edição: valer só na criação faria "obrigatório" não significar nada. O caminho para não
travar a edição de ativos antigos é o da tela: nasce opcional, a edição em massa da F2 faz o
backfill, e só então promove-se para obrigatório — com o contador de quantos quebrariam à vista.

### D62 — Cifra é `enc:v1:` dentro do JsonB, com rota própria para revelar.

**Decidido:** AES-256-GCM em `server/core/crypto/`, valor escalar prefixado, mascarado no `select`.
**Descartado:** cifrar a coluna inteira; e devolver o valor em claro na listagem.

Cifrar a coluna inteira tiraria **todos** os campos do índice GIN por causa de um. Mascarar no
`select` — não depois, na resposta — é o princípio da F0: o dado que não deve sair não é lido. E a
rota de revelar existe para que *quem viu* vire `ActivityLog`, que é a pergunta que a auditoria faz
sobre dado sensível (mesmo desenho que a F6 usará na product key).

### D63 — Filtrar por campo customizado: sim. Ordenar: não, nesta fase.

**Decidido:** `?cf[slug]=valor` por igualdade, apoiado no GIN. **Descartado:** `?sort=cf.slug`.

O GIN acelera contenção (`@>`) e existência de chave (`?`). Ele **não faz nada** por
`ORDER BY customFields->>'ramGb'`, nem por faixa (`>`, `<`), nem por `ILIKE`. Para ordenar seria
preciso um índice B-tree de expressão **por campo** — `CREATE INDEX ON assets ((customFields->>'x'))` —,
que é DDL por campo: exatamente o que o D7 recusou, entrando pela porta dos fundos.

Há ainda uma armadilha de tipo: `->>` devolve **texto**, então campo numérico ordena `"10"` antes
de `"9"`. E o Prisma não tem `orderBy` sobre caminho JSON, o que empurra a ordenação para
`$queryRaw` ou para memória. **A F10 é quem paga isso** — o report builder vai querer ordenar e
agrupar por campo customizado, e esta fase entrega a ela o número medido, não uma promessa.

**Regex custom fica**, com três guardas: teto no tamanho do padrão, teto no tamanho da entrada, e
recusa sintática de quantificador aninhado (`(a+)+`). O risco residual é declarado no bloco de
armadilhas, e a saída nomeada é `node:worker_threads` com timeout.

### D64 — A parte plana é spec de catálogo; a composição é domínio próprio.

**Decidido:** `custom-field.spec.ts` e `custom-fieldset.spec.ts` entram em `specs/index.ts`; a
composição, a resolução e a validação ficam em `server/domain/custom-field/`.

Listar, buscar, ordenar, `ActivityLog` e 409-por-uso é o que o CRUD genérico da F1 já faz — e o
`ARQUITETURA.md` diz que acrescentar tabela de catálogo *é escrever a spec*. O que **não** cabe na
spec é ordem, obrigatoriedade por vínculo e validação de valor: isso tem regra, e regra mora em
use-case. O `countUsages` do campo conta vínculos **mais** ativos com a chave presente
(`path: [slug], not: Prisma.DbNull`), senão apagar um campo deixaria órfãos sem aviso.

---

## Riscos e armadilhas

**`strictObject` × campo criado em runtime.** `customFields` é **um** campo do schema de entrada; o
conteúdo é validado no use-case. Tentar listar os campos dinâmicos no `zod` da borda significaria
montar schema por requisição — e o mass assignment que o `strictObject` barra voltaria pela brecha.

**`DbNull` × `JsonNull`.** Ver Etapa D: gravar o literal JSON `null` quebra `IS NULL` em silêncio.
É a armadilha mais barata de cair e a mais cara de achar depois.

**ReDoS no regex do usuário.** O Node é single-threaded: `(a+)+$` contra 40 caracteres **trava o
processo inteiro** — não é um 500, é o servidor fora do ar. Validar no cliente não protege nada
(protege a mensagem). As guardas do D63 reduzem, não eliminam; o risco residual está aceito e a
saída é worker com timeout.

**`buildChanges` comparando objeto Json.** Comparação rasa marca mudança a cada edição — o mesmo
problema que o `Decimal` já deu na F1. Comparar chave a chave, e **nunca** deixar valor cifrado
entrar no diff.

**A extension de soft delete não escopa leitura aninhada.** A contagem de uso de um campo tem que
decidir explicitamente se enxerga a lixeira. Usar `INCLUINDO_LIXEIRA` quando a resposta for *"sim,
ativo apagado ainda usa este campo"* — que é o caso, porque restaurar traz o valor de volta.

**`listValues` alterado depois.** Valores já gravados podem sair da lista. Não apagar: a tela
mostra o valor fora da lista marcado, e o relatório da F10 o inclui. Apagar seria o D60 de novo.

---

## Verificação

```bash
API=http://localhost:3001
ID=$(curl -s "$API/api/assets?perPage=1" | jq -r '.rows[0].id')

# B — formato IP recusa lixo, com o slug no caminho do erro
curl -s -w '\n%{http_code}\n' -X PUT "$API/api/assets/$ID" -H 'Content-Type: application/json' \
  -d '{"customFields":{"ip_fixo":"999.1.1.1"}}'                       # 422, path = ip_fixo

# C — trocar o modelo do ativo: as chaves do conjunto anterior CONTINUAM lá
curl -s -X PUT "$API/api/assets/$ID" -H 'Content-Type: application/json' \
  -d "{\"modelId\":\"$OUTRO_MODELO\"}" && curl -s "$API/api/assets/$ID" | jq '.customFields'

# D — filtro por igualdade dentro do JsonB
curl -s "$API/api/assets?cf%5Bip_fixo%5D=10.0.0.7" | jq '.total'

# E — mascarado na leitura normal, em claro só na rota de revelar (que vira ActivityLog)
curl -s "$API/api/assets/$ID" | jq '.customFields.chave_wifi'          # "••••••"
curl -s "$API/api/assets/$ID/custom-fields/chave_wifi/reveal" | jq
```

```sql
-- O índice existe e é GIN com jsonb_ops
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename = 'assets' AND indexdef ILIKE '%gin%';

-- D63, o número que a F10 herda: igualdade usa o índice…
EXPLAIN ANALYZE SELECT id FROM assets WHERE "customFields" @> '{"ip_fixo":"10.0.0.7"}';
--   esperado: Bitmap Index Scan on assets_customFields_idx

-- …e ordenação não usa
EXPLAIN ANALYZE SELECT id FROM assets ORDER BY "customFields"->>'ram_gb' LIMIT 25;
--   esperado: Seq Scan + Sort. Anotar o tempo com o volume real: é o custo do report builder

-- Nenhum valor cifrado vazou para a trilha de auditoria
SELECT count(*) FROM activity_logs WHERE changes::text LIKE '%enc:v1:%';   -- 0
```

**Duas provas que não são comando:** criar campo obrigatório com ativos já cadastrados e confirmar
que a tela avisa **quantos** quebrariam antes de salvar; e apagar um campo em uso, esperando 409
com a contagem que soma vínculos e ativos com a chave presente.

---

## Perguntas em aberto

- **Categoria × modelo como âncora do conjunto.** Este plano implementa os dois níveis (D58),
  divergindo tanto do TODO (*por modelo*) quanto do briefing original (*por categoria*). Se a
  decisão for um só nível, é a linha de `resolve-fieldset.usecase.ts` que muda — e uma das duas
  colunas fica sem uso, não sobrando dado para migrar.
- **Ordenar por campo customizado.** Entregue medido, não resolvido (D63). A **F10** decide se
  paga `$queryRaw` com allowlist, ordenação em memória com teto, ou se declara fora de escopo.
- **Campos customizados fora do `Asset`** (licença, acessório, componente) não entram aqui. Quando
  entrarem, a pergunta é se o conjunto é o mesmo catálogo de campos ou um por tipo de entidade.


---

## Ordem de commits

```
A: feat(db): CustomField, CustomFieldset e as duas âncoras de conjunto
B: feat(custom-field): motor de validação por formato
C: feat(custom-field): resolução do conjunto (modelo sobrepõe categoria)
D: feat(itam): gravação, filtro por igualdade e índice GIN
E: feat(security): campo customizado cifrado em repouso
F: feat(web): formulário dinâmico e administração de campos e conjuntos
```

O lint tem que passar em cada um. Não há suíte: a verificação é a seção acima.
