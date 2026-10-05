# Plano de implementação — Fase 9: campos customizados

> Plano **prospectivo** da Fase 9 do [`../ROADMAP.md`](../ROADMAP.md), escrito contra o código
> real depois da F1. Convenções de camada: [`../referencia/arquitetura.md`](../referencia/arquitetura.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D58–D64**, na
> numeração contínua do projeto (D1–D13 no TODO, D14–D17 em `../decisoes/posse.md`).

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
> fieldset. Não tem — a F1 **adiou o atributo**, não criou a coluna (`fase-01-catalogo-e-ativo.md`: *"FK para
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
> ⚠️ **Reconciliado — ver [`../decisoes/README.md`](../decisoes/README.md), D81.** O formato ganhou o identificador da chave (`kid`) e AAD — é o mesmo da F6, num arquivo só.

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

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/campos-customizados.md`](../decisoes/campos-customizados.md) — **D58–D64**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

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

---

# Fechamento da F9 — o que a execução mudou

> Escrito **depois** de a fase rodar, com a suíte verde (`npm test`: 511 asserções,
> 92 delas desta fase). **A seção 5 é de uma segunda passada**, posterior a este
> fechamento: com ela a suíte está em 522, e a pasta da fase em 103. O plano acima fica como estava — o que divergiu está aqui,
> e não corrigido em silêncio lá em cima: quem lê o plano de uma fase precisa poder
> comparar o que se previa com o que se aprendeu.

## 1. O D63 estava errado sobre o Prisma, e o número é este

**O que o plano dizia:** o filtro `?cf[slug]=valor` seria traduzido para
`customFields: { path: [slug], equals: valor }` e **usaria** o índice GIN.

**O que o Prisma emite:**

```sql
WHERE ("customFields" #> ARRAY['ip_fixo']::text[])::jsonb = $1
```

Comparação de **expressão** sobre a coluna. Nenhum índice GIN a serve — o GIN
serve `@>`, `?` e os operadores de contenção, e o Prisma tipado não os expõe.

**Medido em 50 mil linhas** (tabela sintética, chave presente em 40 delas):

| Pergunta | Em SQL cru | Pelo Prisma tipado |
|---|---|---|
| existência de chave rara (`?`) | Bitmap Index Scan · **0,05 ms** | Seq Scan · **5,2 ms** |
| igualdade (`@>`) | Bitmap Index Scan · **0,63 ms** | Seq Scan · **13,5 ms** |
| ordenação (`->>` + `ORDER BY`) | — | Seq Scan + Sort · **14,3 ms** |

**O que foi feito com isso, e é uma divisão, não uma escolha única:**

- **As perguntas de tabela inteira desceram para `$queryRaw`** e usam o índice:
  `countAssetsWithField` (o 409 que impede apagar um campo em uso, D64) e
  `countAssetsQueQuebrariam` (o contador do D61). Elas não precisam compor com
  nada, então o SQL cru não custa nada.
- **O filtro da listagem ficou no Prisma tipado** e paga a varredura. Ele se
  **soma** a vista, status, localização, busca, ordenação e paginação num `where`
  só; um pré-filtro cru devolveria uma lista de ids que viraria um `IN` sem teto,
  ou uma segunda paginação que mentiria no `total` do envelope.
- **O índice GIN entrou e se paga** — pelas contagens, não pelo filtro. Sem elas,
  ele seria peso morto: tamanho e amplificação de escrita a cada `UPDATE` em
  `assets` para não servir consulta nenhuma.

**É este o número que a F10 herda**, e agora ele é medida, não promessa. O report
builder vai querer filtrar, ordenar e agrupar por campo customizado; as três
saídas continuam as do D63 (`$queryRaw` com allowlist, ordenação em memória com
teto, ou fora de escopo), e a primeira agora tem precedente neste repositório.

Para o `ClienteCatalogo` do CRUD de catálogo poder falar SQL cru **dentro da
transação do delete**, o tipo dele mudou de ``Omit<…, `$${string}`>`` — que tirava
`$queryRaw` junto com os métodos de sessão — para a lista explícita dos seis
métodos que o cliente de transação não tem. Sem isso a contagem teria que rodar
FORA da transação, que é justamente onde ela não pode estar.

## 2. O AAD precisou do `slug`, e o D81 fala de três partes

O D81 define o AAD como `"<tabela>:<coluna>:<id da linha>"`. Aqui ele é
`"assets:customFields.<slug>:<id>"`, e a diferença não é cosmética.

Numa coluna dedicada (`licenses.productKey`) há **um** segredo por linha, e
tabela + coluna + id identificam o lugar sem ambiguidade. Nesta coluna convivem
**N** segredos na mesma linha — a senha do BIOS e a chave do Wi-Fi do mesmo
notebook. Sem o `slug`, os dois teriam endereço idêntico: quem tem acesso ao
banco trocaria um pelo outro e o sistema **revelaria um como se fosse o outro**,
com a tag de autenticação conferindo.

É exatamente o ataque que o item 3 do D81 existe para fechar, uma camada abaixo —
então o desenho não é uma exceção à decisão, é ela aplicada à forma desta coluna.
Provado por `tests/campos-customizados/cifra.test.ts`.

## 3. Todo valor é guardado como TEXTO, inclusive o booleano

O plano não decidia isso, e a escolha aparece em três lugares de uma vez:

- o filtro `?cf[slug]=valor` chega da query string como texto. Se `CHECKBOX`
  guardasse `true` (booleano JSON) e `TEXT` guardasse `"10.0.0.7"`, o mesmo
  filtro precisaria adivinhar o tipo do campo antes de montar a comparação — e
  adivinharia errado no dia em que o formato mudasse;
- `customFields->>'x'` devolve texto de qualquer jeito, então guardar número como
  número não compraria ordenação (ela está fora por causa do índice, D63);
- o GIN com `jsonb_ops` indexa pares chave/valor, e tipo instável produz entradas
  de índice instáveis.

O formulário continua mandando booleano de verdade; a conversão mora num lugar
só (`normalizarValor`), e o formato `BOOLEAN` valida `"true"`/`"false"`.

**E limpar um campo REMOVE a chave**, em vez de gravar `null` nela: um
`{"ip_fixo": null}` faria `customFields ? 'ip_fixo'` continuar verdadeiro, e a
contagem de "quantos ativos têm este campo preenchido" — que é a base do 409 do
D64 e do contador do D61 — passaria a contar quem apagou o valor.

## 4. Cinco defeitos que a revisão pegou, e o que cada um ensinou

Nenhum deles aparecia na tela; quatro só aparecem por outro caminho que não o
formulário, e o quinto aparecia como lixo na tela errada.

### 4.1 O obrigatório era driblado pela máscara que o próprio sistema imprime

A leitura devolve `••••••` no lugar de um valor cifrado, e o formulário reenvia
todo campo a cada salvamento — então a máscara chega de volta no corpo. Ela
significa *"não mexi neste campo"*.

A primeira versão a descartava na hora de **cifrar**, e aí ela já havia passado
pela conferência de obrigatoriedade como um valor **presente**: um campo cifrado
**e** obrigatório era criado vazio mandando `••••••`. O obrigatório driblado por
um valor que o próprio sistema tinha impresso.

E havia um segundo efeito na mesma causa: um campo cifrado com `format: REGEX`
recusava a máscara, porque `••••••` não casa com padrão nenhum — a edição de
**qualquer outro campo** do ativo passava a responder 422 num campo que ninguém
tocou.

**A correção é de posição:** a máscara sai de cena no passo 2, antes da validação
de formato e antes do merge. Os dois sintomas eram um.

### 4.2 `POST /api/assets` sem a chave `customFields` criava ativo inválido

`undefined` significa "não mexe" na **edição** — é o que permite trocar o modelo
de um ativo antigo sem exigir os obrigatórios do conjunto novo, e sem isso a
promoção gradual do D61 (opcional → backfill → obrigatório) travaria o parque
inteiro no instante da promoção.

Na **criação** não há nada para preservar, então a chave ausente e `{}` são a
mesma coisa. Tratá-las diferente fazia o "obrigatório" valer só para quem usava o
painel — o formulário sempre manda a chave —, nunca para quem chamava a API.

### 4.3 O padrão de ReDoS era aceito no cadastro e só falhava na tela de quem preenche

`motivoParaRecusarPadrao` existia e era consultada **só pelo motor de validação**,
que transforma padrão recusado num validador que recusa tudo. Seguro, e na tela
errada: `(a+)+$` entrava no catálogo calado, e quem descobria era a pessoa
preenchendo o formulário de um ativo, recebendo *"a expressão regular deste campo
foi recusada"* sobre uma configuração que ela não fez e não pode corrigir.

A guarda passou a rodar no `beforeWrite` do cadastro, onde a mensagem chega a
quem digitou o padrão. A do motor **fica**: ela protege contra padrão que entrou
por outro caminho (um `psql` à mão, um seed).

### 4.4 O `changes` aninhado virava `[object Object]` na aba Histórico

Para evitar que um campo customizado chamado `serial` sobrescrevesse no histórico
o diff da **coluna** `serial`, a primeira versão aninhou tudo sob
`changes.customFields`. Isso quebrou a aba: o leitor genérico
(`src/pages/helpers/historico.helper.ts`) separa diff de detalhe pela **forma** do
valor — `{ de, para }` é mudança, o resto é detalhe —, então um objeto de objetos
caía em "detalhe" e era impresso cru.

As chaves passaram a ser **planas e prefixadas** (`cf.<slug>`): o ponto garante
que nenhuma coluna do Prisma colida, e a forma `{ de, para }` faz a aba lê-las
sem saber que campo customizado existe. O rótulo mostra o `slug`, não o nome —
pela mesma razão que o UUID aparece truncado ali: o log guarda o que valia
**naquele** momento, e o campo pode ter sido renomeado ou apagado depois.

### 4.5 Revelar um segredo não atualizava a trilha na tela

A rota grava `VIEW_FIELD` a cada chamada. A mutação não invalidava as consultas do
ativo, então a aba Histórico continuava mostrando a linha do tempo de **antes** da
revelação — a tela negando, para quem estava olhando, o registro que o servidor
acabara de gravar. É a linha que o `useRevealProductKey` da F6 já tinha.

## 5. A revisão depois do fechamento: o D61 mandava por uma porta que não abria

> Esta seção é de uma **segunda** passada, feita depois de a fase já estar
> fechada e verde. O item 5.1 é uma capacidade que faltava; os de 5.2 são
> pequenos, e todos têm a mesma assinatura: **a tela prometia uma regra que o
> código não cumpria**.

### 5.1 O backfill em massa não existia — e era a única porta que o D61 oferecia

**O que o plano assumia:** o pré-requisito desta fase diz *"F2 concluída — a
edição em massa é o instrumento de backfill quando um campo vira obrigatório
(D61)"*, e o D61 descreve o caminho da promoção como *"nasce opcional, a edição
em massa faz o backfill, e só então promove-se para obrigatório"*. A tela de
composição imprime isso ao lado de cada contador: *"O caminho é preencher em
massa primeiro e promover depois."*

**O que existia:** o lote da F2 conhecia **três** operações — `status`,
`location` e `delete`. Nenhuma delas toca `customFields`. O contador do D61
calculava o número certo, a frase mandava preencher em massa, e preencher mil
ativos eram mil formulários abertos um a um. O item não estava em *"o que ficou
de fora"*, porque ninguém tinha notado que faltava: as duas pontas estavam
prontas e o meio não.

**O que foi feito:** uma quarta operação, `op: 'custom-field'`, com `fieldId` e
`value` (`null` = limpar). A regra mora em
`custom-field/use-cases/bulk-fill-field.usecase.ts` — pelo D64, o que o lote
precisa saber de um campo customizado é conhecimento deste domínio; o use-case do
ativo só orquestra a transação.

As quatro recusas, e cada uma fecha um estrago diferente:

| Recusa | O que ela impede |
|---|---|
| ativo cujo conjunto **não pede** o campo barra o **lote inteiro** (422) | gravar chave desconhecida em N linhas de uma vez — o passo 1 do `validarCamposCustomizados`, que o caminho de um ativo só já fazia, entrando pela porta dos fundos multiplicado por 200 |
| valor **fora do formato** (422) | descobrir no ativo 143 que o valor não servia, com 142 já gravados |
| campo **cifrado** (422) | um segredo igual em duzentas máquinas, que não é segredo — a mesma recusa do `defaultValue` do vínculo |
| **esvaziar um obrigatório** (422) | deixar N ativos num estado que a edição de um só não produz, e que a próxima edição de qualquer outro campo passaria a recusar |

Três decisões de desenho que o código explica e que vale repetir aqui:

- **Linha a linha, e não `updateMany`.** O valor novo é UMA chave dentro do JsonB
  de cada ativo, e as outras chaves de cada linha são diferentes — inclusive as
  órfãs (D60) e as cifradas. Um `updateMany` gravaria o mesmo objeto nas N linhas,
  apagando tudo o que não fosse esta chave. São ~200 `update` numa transação que
  já fazia ~200 `recordActivity`.
- **Duas consultas, não duas por ativo.** A conferência de alcance resolve o
  conjunto dos modelos **distintos** (a linha do D58) e pergunta de uma vez quais
  desses conjuntos têm o campo. Duzentos ativos de três modelos custam duas
  consultas.
- **O diff de cada linha usa o mesmo `diffDeCampos`** da edição de um ativo só,
  então as chaves do `changes` saem planas e prefixadas (`cf.<slug>`) — a forma
  que o item 4.4 ensinou. O `de` de cada linha é o que permite desfazer um lote
  aplicado por engano.

**O que isso ensina:** um contador que mede o custo de uma operação é meia
feature. A outra metade é a operação que paga o custo — e as duas precisam nascer
juntas, senão o número vira uma recomendação que o sistema não sabe seguir.

### 5.2 Seis acertos menores da mesma revisão

- **`colSpan={9}` cravado na linha de "nenhum ativo".** O cabeçalho e cada linha
  da tabela percorrem `colunasCustomizadas`; esta célula era a única que não
  percorria nada. Com um campo marcado como coluna, a mensagem de lista vazia
  deixava de cobrir a tabela. Agora é `9 + colunasCustomizadas.length`.
- **O comentário do índice GIN no `schema.prisma` ficou na versão pré-medição.**
  Ele dizia que o filtro é *"traduzido para `@>`"* e que o índice acelera
  igualdade — exatamente o que o item 1 desta página desmentiu com números. O
  plano pode manter o texto antigo (ele declara que mantém); o comentário de uma
  coluna viva, não: quem o lê conclui que o filtro usa o índice.
- **`TEXTAREA` com `showInListView` virava coluna.** A ajuda do elemento diz *"Não
  entra como coluna da listagem de ativos"* e **nada cumpria a frase**: uma
  observação de dois mil caracteres ia para a célula. Agora o `beforeWrite` recusa,
  e a rota `/custom-fields/list-view` filtra o elemento junto com `encrypted` —
  pelo mesmo motivo que ela já filtrava a cifra: a guarda vale para o que passa
  pela API, e uma linha de seed não passou.
- **`temSegredo` era documentado como "o que a tela usa para o botão de revelar"**,
  e nenhuma tela o usava: o botão é por CAMPO, e a ficha o decide pelo par
  `campo.encrypted` + valor igual à máscara. A flag é de LINHA e continua (ela sai
  de graça, e responde "há segredo neste ativo?" sem abrir o ativo) — o que mudou
  foi a frase que prometia outra coisa.
- **`Asset.customFields` era declarado obrigatório no tipo do front**, enquanto o
  comentário logo acima explicava que a tela do posto e as posses do colaborador
  não a carregam — e não carregam mesmo, porque a coluna não está no
  `ASSET_SELECT` compartilhado. O tipo prometia o que dois endpoints não entregam.
  Agora é opcional, como `temSegredo` já era.
- **O `changes` da composição de um conjunto era `{ campos: { de: [...], para: [...] } }`**
  — `{ de, para }` com arrays de objetos dentro, que é a forma que o item 4.4
  corrigiu nos campos do ativo: passa pelo teste de forma do leitor genérico e
  falha na impressão, virando `[object Object]`. Nenhuma tela mostra histórico de
  conjunto hoje, e é justamente por isso que precisava ser corrigido agora — a
  primeira que mostrar não vai desconfiar da forma do dado. Virou uma linha de
  texto que carrega ordem, obrigatoriedade e padrão.

## 6. O que ficou de fora, e por quê

- **Ordenar por campo customizado.** Fora por medida, não por falta de tempo
  (D63, e a tabela do item 1). `?sort=cf.slug` responde 422 com a lista do que dá
  para ordenar.
- **Campos customizados no import e no export CSV** (o item **P** do TODO).
  Depende do importador e do export, que nascem na **F10** — anotar a coluna aqui
  sem o CSV existir seria escrever metade de uma feature.
- **`displayInUserView` e `showInEmail` gravam e não fazem nada.** Declarado na
  ajuda dos dois campos no formulário, com a palavra "guardado agora" — é o mesmo
  tratamento que `requireAcceptance` teve entre a F1 e a F4. Um checkbox que grava
  o dado e não muda comportamento nenhum é tão enganoso quanto um rótulo errado.
- **`worker_threads` com timeout para o regex.** As três guardas do D63 reduzem o
  risco, não o eliminam, e o residual continua **aceito**: o padrão é digitado por
  um administrador do sistema, não por um anônimo, e um processo por validação não
  se paga contra isso.
- **Campos customizados fora do `Asset`** (licença, acessório, componente).
  Quando entrarem, a pergunta é se o conjunto é o mesmo catálogo de campos ou um
  por tipo de entidade — e a resposta muda a chave de `CustomFieldsetField`.

## 7. Ordem de commits, como saiu

```
A: feat(db): CustomField, CustomFieldset e as duas âncoras de conjunto
B: feat(custom-field): motor de validação por formato
C: feat(custom-field): resolução do conjunto (modelo sobrepõe categoria)
D: feat(itam): gravação, filtro por igualdade e índice GIN
E: feat(security): campo customizado cifrado em repouso
F: feat(web): formulário dinâmico e administração de campos e conjuntos
```

O plano dizia *"não há suíte: a verificação é a seção acima"* — e isso deixou de
ser verdade na F8. A verificação é
`tests/campos-customizados/` (103 asserções, cinco arquivos: 92 do fechamento
da fase e 11 da revisão da seção 5), e os comandos da seção **Verificação**
continuam valendo para conferir à mão.
