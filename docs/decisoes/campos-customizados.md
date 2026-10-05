# Decisões dos campos customizados

> O que o cliente acrescenta ao cadastro sem migração — em `JsonB`, com o preço declarado.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 142 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D7, D58–D64.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D7 — Campos customizados em `JsonB`, não em DDL dinâmico

O Snipe-IT cria uma coluna por campo customizado. Isso é inviável com `prisma migrate`.

---

## D58 — O conjunto ancora na **categoria** e no **modelo**, com precedência do modelo.

**Decidido:** `Category.fieldsetId` é o padrão; `AssetModel.fieldsetId` sobrepõe quando preenchido.
**Descartado:** só por modelo; só por categoria; e herança em três níveis.

O `../ROADMAP.md` (versão de 23/09) diz *por modelo*; o briefing desta fase dizia *por categoria*.
Os dois têm razão em metades diferentes. **Por categoria** carrega a empresa inteira em seis
atribuições, e os campos que o cliente realmente quer — IP, hostname, patrimônio — são da categoria
*Notebook*, não do *Latitude 5420*. **Por modelo** é o que o Snipe-IT faz e o único jeito de
expressar o campo que só existe num modelo (IMEI do tablet 4G). Duas colunas nullable e uma linha
de resolução compram os dois; escolher um lado deixaria metade dos casos sem resposta. Três níveis
(categoria → modelo → ativo) fica de fora pelo motivo que limita o salto de `ASSET` no D16: cadeia
mais longa é sintoma de modelagem errada e custa um salto de consulta a cada leitura.

---

## D59 — Valores em `JsonB` na linha do ativo. Não DDL dinâmico, não EAV.

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

---

## D60 — O `slug` é imutável. O valor órfão não é apagado.

**Decidido:** `beforeWrite` recusa mudar `slug` de campo já criado; `name` muda à vontade.
**Descartado:** renomear slug com `UPDATE` em massa no JSON de todos os ativos.

O slug é a chave do JSON em N mil linhas. Renomeá-lo é um `UPDATE` sobre a tabela inteira que teria
que ser transacional com a linha do campo — e um meio-caminho deixa valores órfãos sem ninguém
saber. Uma regra de três palavras evita um script de migração e um modo de falha. Pelo mesmo
motivo, trocar o conjunto de um ativo **não apaga** as chaves que sobraram: são dado do cliente, o
conjunto antigo pode voltar, e mantê-las custa zero.

---

## D61 — Obrigatoriedade é do **vínculo**, não do campo.

**Decidido:** `required` e `defaultValue` moram em `CustomFieldsetField`. **Descartado:**
`CustomField.required` global.

O mesmo campo *Centro de custo* é obrigatório no conjunto de Notebooks e opcional no de Periféricos
— é assim no Snipe-IT e é o que a operação real pede. A obrigatoriedade vale **em todo save**,
criação e edição: valer só na criação faria "obrigatório" não significar nada. O caminho para não
travar a edição de ativos antigos é o da tela: nasce opcional, a edição em massa da F2 faz o
backfill, e só então promove-se para obrigatório — com o contador de quantos quebrariam à vista.

---

## D62 — Cifra é `enc:v1:` dentro do JsonB, com rota própria para revelar.

**Decidido:** AES-256-GCM em `server/core/crypto/`, valor escalar prefixado, mascarado no `select`.
**Descartado:** cifrar a coluna inteira; e devolver o valor em claro na listagem.

Cifrar a coluna inteira tiraria **todos** os campos do índice GIN por causa de um. Mascarar no
`select` — não depois, na resposta — é o princípio da F0: o dado que não deve sair não é lido. E a
rota de revelar existe para que *quem viu* vire `ActivityLog`, que é a pergunta que a auditoria faz
sobre dado sensível (mesmo desenho que a F6 usará na product key).

---

## D63 — Filtrar por campo customizado: sim. Ordenar: não, nesta fase.

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

---

## D64 — A parte plana é spec de catálogo; a composição é domínio próprio.

**Decidido:** `custom-field.spec.ts` e `custom-fieldset.spec.ts` entram em `specs/index.ts`; a
composição, a resolução e a validação ficam em `server/domain/custom-field/`.

Listar, buscar, ordenar, `ActivityLog` e 409-por-uso é o que o CRUD genérico da F1 já faz — e o
`../referencia/arquitetura.md` diz que acrescentar tabela de catálogo *é escrever a spec*. O que **não** cabe na
spec é ordem, obrigatoriedade por vínculo e validação de valor: isso tem regra, e regra mora em
use-case. O `countUsages` do campo conta vínculos **mais** ativos com a chave presente
(`path: [slug], not: Prisma.DbNull`), senão apagar um campo deixaria órfãos sem aviso.
