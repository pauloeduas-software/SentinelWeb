# Plano de implementação — Fase 0 ✅ CONCLUÍDA

> Plano de execução da Fase 0 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito contra o
> código real depois da reestruturação em `server/domain/` e `src/domain/`.
> Convenções de camada: [`ARQUITETURA.md`](./ARQUITETURA.md) — o `npm run lint` é
> quem verifica, não o code review.
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias

---

## O que mudou durante a execução

As cinco etapas foram aplicadas. Quatro coisas divergiram do plano, todas por
motivo descoberto ao rodar o código:

1. **O `select` explícito cresceu de 2 para 6 rotas.** O plano falava em
   listagem; ao testar, `POST /api/users` também devolvia a linha inteira. Mesma
   falha pela outra porta. A allowlist virou helper única por domínio
   (`USER_PUBLIC_SELECT`, `INVENTORY_ITEM_SELECT`) em vez de `select` repetido —
   com quatro cópias, a F3 atualizaria três e deixaria a quarta vazando.

2. **`User.email` precisou virar índice único PARCIAL.** Consequência do soft
   delete que o plano não previu: com `@unique` comum, um usuário na lixeira
   bloquearia para sempre o recadastro do mesmo e-mail. O Prisma não tem sintaxe
   para índice parcial — o `@unique` saiu do schema e o índice foi escrito à mão
   na migration. `createUser` passou de `findUnique` para `findFirst`.

3. **O `migrate diff` gerou SQL que não executa.** Ele emitiu
   `DROP INDEX "users_email_key"`, que o Postgres recusa (2BP01) porque o índice
   sustenta uma CONSTRAINT. Corrigido à mão para `DROP CONSTRAINT`. É exatamente
   o motivo de revisar o SQL antes de aplicar.

4. **A aba Lixeira entrou na interface.** A API de lixeira e restauração ficaria
   inalcançável sem ela — o item do TODO pede "views de lixeira + restaurar".

Duas armadilhas de biblioteca também apareceram e estão documentadas no código:
`z.email()` da zod 4 valida **antes** do `.trim()` (precisa de `pipe`), e o 429
do `@fastify/rate-limit` é lançado como erro — sem tratamento explícito no
`error-handler`, virava 500.

---

## Placar na abertura

Dos 15 itens da Fase 0: **4 fechados, 3 pela metade, 8 intocados.**

| Fechado | Onde |
|---|---|
| Migration baseline | `prisma/migrations/0_init` |
| Base URL da API | `src/core/api/apiClient.ts` |
| Portas por env | `.env.example` + `server/core/config/env.ts` |
| Envelope de erro único | `server/core/errors/` |

| Pela metade | Falta |
|---|---|
| Scripts de banco | `db:seed` + bloco `"prisma"` no `package.json` |
| Response schema + BigInt | O hack global morreu; falta o `select` explícito |
| Tokens + rate limit + CORS | CORS fechado; tokens e rate limit não existem |

O resto — seed, zod, paginação, ordenação, busca, contadores, soft delete e
`ActivityLog` — está intocado.

---

## Duas dependências invertidas no TODO, e o que foi decidido

Levantadas na auditoria do código. Ficam registradas aqui para não voltarem à mesa.

**1. O seed da F0 não tem o que semear.**
O TODO manda semear `AppSetting`, `StatusLabel`, `Category` e `AssetModel`.
Nenhuma dessas tabelas existe — todas nascem na Fase 1.

> **Decisão:** a F0 entrega o *encanamento* (script, bloco `prisma`, arquivo
> idempotente com `upsert`). O *conteúdo* entra na F1, junto com as tabelas.
> O item continua valendo: sem o encanamento pronto, a F1 trava no primeiro dia.

**2. `ActivityLog` precisa de ator, e autenticação é F3.**
O próprio TODO reconhece o problema ao justificar a posição da F3.

> **Decisão:** `ActivityLog` nasce com `actorId` **nulável**. O diff do que mudou
> tem valor sozinho, e a F3 só passa a preencher o campo. Esperar a F3 significa
> perder o histórico de tudo que for cadastrado até lá — e adicionar a FK depois
> é uma migração trivial.

---

## Convenções de execução

**Migrations — nunca `migrate dev`.** Ele é interativo, detecta drift e oferece
resetar o banco; neste ambiente ele falha. Para cada migração nova:

```bash
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome_da_migracao"
mkdir -p "$PASTA"
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$PASTA/migration.sql"
# revisar o SQL gerado ANTES de aplicar
npm run db:migrate   # = prisma migrate deploy
npm run db:generate
```

**O lint é o gate.** `npm run lint` tem que passar em cada etapa. As regras de
camada em `eslint.config.js:43-108` recusam o import errado com a mensagem do que
fazer no lugar — em especial `server/core/**` **não pode** importar `**/domain/**`,
e `src/pages/**` **não pode** importar `axios` nem `@tanstack/react-query`.

**Um commit por etapa.** A Etapa C muda o contrato da API e o frontend no mesmo
commit, de propósito: separados, o painel fica quebrado entre um e outro.

**Não há testes no projeto.** A verificação de cada etapa é manual, por `curl` e
pela tela. Se em algum momento fizer sentido introduzir um harness, o formato já
está definido (`*.test.ts` ao lado do código) — mas isso está fora da Fase 0.

---

# Etapa A — Encanamento · **P**

Três coisas pequenas e independentes. É a etapa que desbloqueia a Fase 1.

### A1. Scripts de seed no `package.json`

O `tsx` já está nas devDependencies. O projeto está no **Prisma 5.22**, onde o
seed é declarado no bloco `"prisma"` do `package.json` (o `prisma.config.ts` só
existe da 6.x em diante).

```jsonc
"scripts": {
  "db:seed": "prisma db seed",
  // ... os que já existem
},
"prisma": { "seed": "tsx prisma/seed.ts" }
```

### A2. `prisma/seed.ts`

Arquivo novo, idempotente por construção: **só `upsert`, nunca `create`** — o
seed roda mais de uma vez na vida do banco e não pode duplicar linha nem estourar
em `P2002`. Na F0 ele nasce com a estrutura e o log, e o corpo entra na F1.

### A3. `select` explícito no lugar do `include`

`server/domain/inventory/use-cases/list-inventory-items.usecase.ts:5` faz
`include: { assignedTo: true }`, que devolve a linha inteira do `User`.

> **Por que isto é F0 e não F3:** hoje é inofensivo, porque `User` só tem nome,
> e-mail e departamento. No dia em que a F3 adicionar `passwordHash` ao `User`,
> esse `include` passa a **vazar o hash de senha na listagem de inventário** —
> sem ninguém mexer no arquivo. Trocar por `select` agora fecha a porta antes de
> ela existir.

Trocar por:

```ts
select: {
  id: true, name: true, description: true, quantity: true,
  category: true, status: true, notes: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
}
```

Fazer o mesmo em `list-users.usecase.ts` — hoje é `findMany` cru, que também
devolve tudo.

**Pronto quando:** `npm run db:seed` executa sem erro; `GET /api/inventory`
devolve o usuário atribuído só com `id`, `name` e `email`; `npm run lint` passa.

---

# Etapa B — Validação com zod · **M**

O núcleo da fase. Fecha o mass assignment e completa o envelope de erro.

**Versão:** `zod@4.6.5` (atual).

### B1. Onde os schemas moram

Uma pasta `schemas/` por domínio, acompanhando o esqueleto que já existe
(`controllers/`, `use-cases/`, `helpers/`):

```
server/domain/inventory/schemas/inventory.schema.ts
server/domain/user/schemas/user.schema.ts
server/domain/asset/schemas/asset.schema.ts
```

Schema é regra de negócio (quais campos, quais limites), então ele **não pode**
ir para `server/core/` — o lint recusa.

### B2. O que cada schema cobre

| Rota | Valida |
|---|---|
| `POST/PUT /api/inventory` | `name`, `category` obrigatórios; `quantity` inteiro ≥ 0 com `coerce`; `status` como enum dos três valores reais |
| `POST/PUT /api/users` | `name` obrigatório, `email` com `.email()`, `department` nulável |
| `POST /api/assets/:hwid/command` | `action` não-vazio |
| Todos os `:id` | `z.string().uuid()` |

Todos com **`.strict()`**.

> **Por que `.strict()` importa:** hoje a proteção contra mass assignment é a lista
> explícita de campos nos use-cases (`UpdateUserData`, `UpdateInventoryItemData`).
> Funciona, mas é **silenciosa** — quem manda um campo a mais recebe `200 OK` e
> acha que gravou. Com `.strict()`, campo desconhecido vira 422 explícito.

O `status` merece atenção: hoje é `String` livre no schema do Prisma e a única
definição do que a interface conhece está em
`src/pages/gestao-itam/helpers/status-label.helper.ts:8-12`. O enum do zod passa
a ser a definição do **servidor**. Na F1 os dois somem, substituídos pela tabela
`StatusLabel`.

### B3. `ZodError` → 422

Em `server/core/errors/error-handler.ts`, dentro de `toHttpError`, antes do
fallback de 500. É a única linha que falta para o envelope de erro ficar completo.

O corpo do 422 leva o campo que falhou, no mesmo formato `{ error: ... }` que o
`apiClient` já sabe ler.

> `server/core/errors/` importando `zod` está correto: `zod` é biblioteca, não
> `domain`. O lint não reclama.

### B4. O que sai do código

- `toQuantity`, `asTrimmed`, `asNullable` — `inventory.controller.ts:11-27`
- Validação manual de nome/e-mail — `user.controller.ts:16-18`
- Validação manual de `action` — `asset.controller.ts:18-20`

Os controllers passam a ser três linhas: `parse`, chamar o use-case, responder.

> **Mudança de contrato:** payload inválido hoje responde **400**, passa a
> responder **422**. Não quebra o painel — o interceptor em `apiClient.ts:24` lê
> `data.error`, não o status.

**Pronto quando:** `POST /api/inventory` com `{"name":"x"}` responde 422 dizendo
que falta `category`; com um campo inventado a mais, responde 422 em vez de 200;
o formulário da tela mostra a mensagem do servidor; `npm run lint` passa.

---

# Etapa C — Listagem: paginação, busca, ordenação e contadores · **M**

Os quatro itens do TODO são **um trabalho só**. Compartilham o mesmo parser de
query e o mesmo envelope de resposta; separados, você mexe três vezes nos mesmos
seis arquivos e quebra o frontend três vezes.

### C1. O parser, e o detalhe de camada que importa

`server/core/http/list-query.ts` — lê `page`, `perPage`, `sort`, `order` e `q`,
com limites (`perPage` no teto de 100, senão `?perPage=999999` derruba o banco).

> **A allowlist de ordenação NÃO pode morar aqui.** Saber que `InventoryItem`
> ordena por `name`, `category` e `createdAt` é conhecimento de negócio, e
> `eslint.config.js:45` proíbe `server/core/**` de importar `**/domain/**`.
> O parser **recebe a allowlist como parâmetro**; cada domínio declara a sua em
> `server/domain/<x>/schemas/`. É o lint impedindo que `core` vire lixeira.

Nunca montar `orderBy` com string crua do cliente — a allowlist é o que
transforma `?sort=` num campo conhecido ou num 422.

### C2. Envelope `{ total, rows }`

Mesmo formato do Snipe-IT, nas três listagens: `/api/inventory`, `/api/users` e
`/api/assets`.

> **Por que `/api/assets` também**, sendo que a tela de telemetria mostra cards de
> toda a frota e não tem paginação: para não existirem duas formas de resposta na
> mesma API. Ele recebe o envelope com um `perPage` padrão generoso; controle de
> página na UI, só as duas telas de tabela. Deixar de fora significa fazer isso de
> novo na F7, com duas formas convivendo no meio do caminho.

### C3. Busca e filtros

`server/domain/inventory/helpers/build-inventory-where.helper.ts` — função pura,
sem I/O, exatamente o que a pasta `helpers/` é. `contains` + `mode: 'insensitive'`
sobre `name`, `description` e `category`.

### C4. Contadores

`GET /api/inventory/stats` — total e a contagem por status, em uma query de
agregação, **fora** do `take` da paginação.

> `src/pages/gestao-itam/index.tsx:16` conta com `items.length`. No segundo em que
> o `take` entrar, esse número passa a contar só a página atual. É o "os
> contadores passam a mentir" do TODO, e é literal.

### C5. O frontend, no mesmo commit

Isto quebra as três queries de uma vez — `inventory.queries.ts:21`,
`user.queries.ts:18` e `asset.queries.ts:22` fazem `.data` esperando array cru.

**Chave de cache vira fábrica.** Hoje é `inventoryKeys.all = ['inventory']`. Com
paginação, a chave precisa incluir os parâmetros, senão a página 2 é servida do
cache da página 1:

```ts
export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (params: ListParams) => ['inventory', 'list', params] as const,
};
```

O `invalidateQueries({ queryKey: inventoryKeys.all })` das mutações continua
funcionando sem mudança: o TanStack Query casa chave por **prefixo**, então
invalidar `['inventory']` invalida todas as páginas.

**Onde o estado de página mora.** Página, busca e ordenação são estado de uma
tela só — `useState` dentro de `src/pages/gestao-itam/hooks/useInventory.ts`,
como o `ARQUITETURA.md` já define para modal e seleção. Não é client state
global, não entra em store. O hook repassa os parâmetros para a query do domínio;
a página nunca toca em `@tanstack/react-query` (o lint recusa).

**Duas coisas que a tela exige e o backend não resolve:**

- **Debounce na busca** (~300 ms) no hook. Sem isso, cada tecla digitada é uma
  requisição.
- **`placeholderData: keepPreviousData`** na query. Sem isso, a tabela pisca em
  branco a cada troca de página.

**Pronto quando:** `?page=2&perPage=5` devolve a segunda página com o `total`
certo; `?sort=campoInventado` responde 422 em vez de ordenar por qualquer coisa;
a busca acha "monitor" digitando "MONI"; o contador do cabeçalho mostra o total
real e não o tamanho da página; trocar de página não pisca.

---

# Etapa D — Soft delete e `ActivityLog` · **M**

Rastro e recuperação. Hoje `DELETE` apaga de verdade
(`delete-inventory-item.usecase.ts`, `delete-user.usecase.ts`) e nada registra
quem mudou o quê.

### D1. Migração

`deletedAt DateTime?` em `InventoryItem` e `User`, mais o model `ActivityLog`
(`entityType`, `entityId`, `action`, `changes Json`, `actorId` **nulável**,
`createdAt`).

### D2. O escopo automático

Prisma Client Extension em `server/core/database/`, aplicando
`where: { deletedAt: null }` nas leituras.

> É infraestrutura pura — não sabe o que é um `InventoryItem`, só aplica o filtro
> onde o model tem a coluna. Fica em `core/` sem violar camada.

Deixar o filtro por conta de cada `findMany` é garantia de esquecer um. O TODO já
decide isso; vale repetir o motivo: o dia em que alguém esquecer, a lixeira
aparece na listagem sem erro nenhum.

### D3. Rotas

`DELETE` vira `update` com `deletedAt`. Entram a listagem da lixeira
(`?view=trashed`) e o restaurar.

### D4. Gravação do log

Nos use-cases de escrita, dentro da mesma `$transaction` da operação — log que
grava fora da transação mente quando a operação falha depois.

**Pronto quando:** deletar some da listagem mas a linha continua no banco com
`deletedAt` preenchido; a lixeira mostra o item; restaurar devolve; cada
operação de escrita deixa uma linha em `ActivityLog` com o diff; `npm run lint`
passa.

---

# Etapa E — Perímetro · **M**

### E1. Rate limit

`@fastify/rate-limit@11.2.0` (compatível com Fastify 5), registrado em
`server/server.ts` junto do `cors` — global, e mais apertado nas rotas de escrita.

### E2. Autenticação do agente

`server/domain/agent/agent.maestro.ts:19` aceita qualquer WebSocket que alcance a
porta. `server/core/config/env.ts:26-30` já reconhece isso e emite um `warn` em
produção — o warn é um lembrete, não uma proteção.

> **Escopo da F0:** um `AGENT_TOKEN` estático por variável de ambiente, conferido
> no handshake. O model `ApiToken` completo (prefixo, hash, revogação,
> `lastUsedAt`) é Fase 3 e depende do resto da autenticação. O token estático não
> é a solução final; é o que tira a porta aberta do ar enquanto a F3 não chega.

Quando o token entrar, o `warn` do `validateEnv` sai junto — e o `AGENT_TOKEN`
vira variável obrigatória em produção.

**Pronto quando:** WebSocket sem token é recusado no handshake; excesso de
requisições responde 429; o agente C# continua conectando (precisa do token no
lado dele).

---

## Ordem, dependências e esforço

```
A (P)  ──▶  B (M)  ──▶  C (M)  ──▶  D (M)  ──▶  E (M)
│           │           │
│           │           └── consome os schemas de query da Etapa B
│           └── o 422 do zod completa o envelope de erro
└── A3 tem que sair antes da F3 (vazamento de passwordHash)
```

**A → B → C é o caminho crítico**, e a ordem não é arbitrária:

- **A antes de tudo** porque o A3 fecha uma porta que a F3 abriria, e o A1/A2
  desbloqueiam a F1.
- **B antes de C** porque o zod produz os schemas de query que o parser da Etapa C
  consome. Invertido, a validação de `page`/`sort` nasce na mão e é reescrita.
- **C enquanto o frontend tem três telas.** Cada tela nova multiplica o custo de
  mudar o envelope.

**D e E são independentes entre si** — podem ir em paralelo, ou trocar de ordem
conforme a urgência (se o `/agent-hub` for exposto fora da rede interna antes da
F3, E sobe para primeiro).

**Total estimado: 1 a 2 semanas.**

---

## Riscos

| Risco | Mitigação |
|---|---|
| A Etapa C quebra o painel inteiro se backend e frontend forem separados | Um commit só, e a verificação é pela tela, não por `curl` |
| `migrate dev` resetar o banco | Só `migrate diff` + `migrate deploy`, com revisão do SQL antes de aplicar |
| Escopo de soft delete esquecido numa query | Prisma Client Extension, não filtro manual |
| `ActivityLog` nascer sem ator e ninguém voltar para preencher | `actorId` nulável já no schema; a F3 só passa a preencher |
| Sem testes, regressão silenciosa entre etapas | Critério "pronto quando" de cada etapa, verificado à mão antes do commit |

---

## Mapa de volta para o `ITAM-TODO.md`

| Item da F0 | Etapa |
|---|---|
| Scripts de banco no `package.json` | A1 |
| `prisma/seed.ts` | A2 (encanamento) + F1 (conteúdo) |
| Response schema — `select` explícito | A3 |
| Validação de payload com `zod` | B1, B2, B4 |
| Envelope de erro — `ZodError`→422 | B3 |
| Paginação server-side | C1, C2, C5 |
| Ordenação com allowlist | C1 |
| Busca e filtros no servidor | C3 |
| Endpoint de contadores | C4 |
| Soft delete + lixeira | D1, D2, D3 |
| `ActivityLog` | D1, D4 |
| Rate limiting | E1 |
| Tokens de API | E2 (parcial; completa na F3) |

Ao fechar a Etapa E, a Fase 0 está completa e o caminho crítico segue para a
**Fase 1 — tabelas de catálogo**, com o banco ainda vazio e a janela da
refatoração estrutural aberta.
