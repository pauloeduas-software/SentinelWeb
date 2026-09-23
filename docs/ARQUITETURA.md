# Arquitetura do SentinelWeb

> Convenção de código do projeto. Vale para todo arquivo novo.
> Modelo de referência: o IntraChat (fatia vertical por domínio sobre uma base
> de infraestrutura compartilhada).

---

## A regra que sustenta tudo

Três camadas, dependência em **mão única**:

```
pages  ──▶  domain  ──▶  core
```

- `core` **não** conhece negócio. Não importa nada de `domain` nem de `pages`.
- `domain` **não** conhece tela. Não importa nada de `pages`.
- `pages` **não** conhece HTTP. Não chama `apiClient` nem `fetch` direto.

Um `import` que sobe essa seta é o sinal de que algo está na pasta errada.

**Isto é verificado pelo lint, não por code review.** O `eslint.config.js` tem um
bloco de `no-restricted-imports` por camada: o import errado reprova o `npm run
lint` com a mensagem do que fazer no lugar.

| Camada | Não pode importar |
|---|---|
| `server/core` | `server/domain`, qualquer coisa de `src/` |
| `server/domain` | `src/` (tipo compartilhado vai em `server/domain/shared`) |
| `src/core` | `src/domain`, `src/pages`, `server/`, `@prisma/client`, `fastify`, `pino` |
| `src/domain` | `src/pages`, `server/`, `@prisma/client`, `fastify`, `pino` |
| `src/pages` | `src/core/api`, `axios`, `@tanstack/react-query`, `server/`, `@prisma/client`, `fastify`, `pino` |

As três últimas linhas são o que protege a decisão de manter `server/` separado de
`src/`: sem elas, um `import` relativo de `server/core/database/prismaClient`
dentro de um componente colocaria o Prisma — e as credenciais do banco — no
bundle que vai para o navegador.

---

## Backend — `server/`

```
server/
├── server.ts                    # O PROCESSO: valida env, checa banco, liga jobs, abre porta, morre limpo
├── app.ts                       # A APLICAÇÃO: buildApp() monta tudo e NÃO abre porta (é o que o teste usa)
├── core/                        # INFRAESTRUTURA. zero regra de negócio.
│   ├── config/                  # load-env, env (validateEnv), cors
│   ├── database/                # prismaClient (+ closeDatabase)
│   ├── errors/                  # app-error (AppError), error-handler, error-shape
│   ├── logger/                  # logger (createLogger), sanitize, request-logger
│   └── lifecycle/               # health (readiness), shutdown (onShutdown)
└── domain/<nome>/               # FATIA VERTICAL — sempre o mesmo esqueleto
    ├── <nome>.maestro.ts        # registra as rotas do domínio. Só rota.
    ├── controllers/             # só HTTP: lê a requisição, chama use-case, responde
    ├── use-cases/               # 1 arquivo = 1 operação de negócio
    ├── helpers/                 # funções puras, sem I/O
    ├── jobs/                    # tarefas periódicas, com start/stop explícitos
    └── shared/                  # tipos compartilhados entre domínios
```

### Domínios hoje

| Domínio | O que é | Model do Prisma |
|---|---|---|
| `agent` | Conversa WebSocket com o Agente Sentinel (C#). Só transporte. | — |
| `endpoint` | Máquina descoberta pelo agente (lado RMM) + telemetria + comandos | `Endpoint`, `Telemetry` |
| `asset` | Ativo do ITAM — o `Asset` do vocabulário do Snipe-IT | `Asset` |
| `catalog` | As sete tabelas de catálogo, com UM CRUD genérico dirigido por spec | `Category`, `StatusLabel`, `Manufacturer`, `AssetModel`, `Supplier`, `Location`, `Depreciation` |
| `settings` | Configuração global (hoje só a etiqueta automática) | `AppSetting` |
| `activity` | Trilha de auditoria, gravada na transação de quem a origina | `ActivityLog` |
| `user` | Colaborador da empresa | `User` |
| `assignment` | **Posse**: entrega e devolução de ativo, com alvo polimórfico (pessoa, posto ou outro ativo) e o histórico de quem teve o quê | `Assignment` |
| `occupancy` | **Ocupação do posto**: quem trabalha em qual localização, e em que turno | `LocationOccupant` |
| `stock` | **Estoque**: os três tipos que têm QUANTIDADE, com saldo derivado e trava na linha-pai | `Accessory`, `AccessoryCheckout`, `Consumable`, `ConsumableCheckout`, `Component`, `ComponentAsset`, `StockLog` |

> **A decisão D1 foi executada na Fase 1.** `asset/` (RMM) virou `endpoint/`, e o
> nome `asset/` passou ao ativo do ITAM. O `inventory/` deixou de existir junto
> com a tabela `inventory_items`.
>
> ⚠️ **`Asset` nunca pode ter coluna `status`, `lastSeen` ou `hwid`** — são as do
> `Endpoint`. É essa ausência que faz o compilador barrar uma query do RMM
> apontando para a tabela errada (`ITAM-TODO.md`, D13).

### `catalog` e `stock` são as duas exceções à fatia vertical

As sete tabelas de catálogo são o MESMO CRUD: nome, listagem paginada, busca,
ordenação, `ActivityLog`, 409 quando a linha está em uso. Sete fatias verticais
completas seriam ~77 arquivos quase idênticos — o que esta mesma página chama de
cerimônia, não arquitetura.

Então elas compartilham um CRUD genérico, e o que varia mora em `specs/`: um
arquivo por tabela declarando o slug da rota, o schema de entrada, a allowlist de
resposta, as colunas ordenáveis e a regra de "em uso". **Acrescentar uma tabela
de catálogo é escrever a spec e incluí-la em `specs/index.ts`** — nenhuma rota é
escrita à mão.

O preço, declarado: tipar a união dos sete delegates do Prisma não existe em TS,
então cada spec faz UM cast, ao lado do nome do model. O cast não atravessa a
regra: a entrada continua validada pelo `strictObject`, a saída continua limitada
pelo `select`, e o `countUsages` de cada spec continua totalmente tipado.

**`stock` é a mesma ideia, em menor escala e por outro motivo (D35).** Acessório,
consumível e componente compartilham UMA invariante — *o saldo é calculado, nunca
coluna, e toda saída tranca a linha-pai* — e UMA tela. Três fatias verticais
copiariam a invariante três vezes, e invariante copiada é invariante que um dia
diverge. O que varia entre eles mora em `helpers/stock-kind.helper.ts`: três
constantes com slug, rótulo, tipo de categoria e o `select`.

**E ele NÃO usa o motor do catálogo**, apesar de parecer o mesmo problema: a
coluna principal da listagem de estoque é **derivada** (`disponivel = qty −
saídas abertas`) e o `select` da `CatalogSpec` é allowlist estática. Ensinar o
genérico a calcular saldo seria dobrá-lo para atender três clientes — abstração
que passa a custar mais do que economiza. As *operações* também diferem
(entregar × consumir × instalar), e operação já é um arquivo por vez em
`use-cases/`.

### O caminho de uma requisição

```
maestro  →  controller  →  use-case  →  prisma
(rota)      (HTTP)         (negócio)    (dados)
```

Nenhum controller tem `try/catch`: no Fastify, handler async que rejeita cai
sozinho no `errorHandler`. Os use-cases lançam `AppError(mensagem, status)` e o
`core/errors/error-handler.ts` traduz — é o **único** lugar do sistema que monta
resposta de erro.

| Situação | Vira | Quem faz |
|---|---|---|
| `AppError('Agente offline.', 404)` | 404 + a mensagem | use-case |
| Prisma `P2025` (não achou) | 404 "Registro não encontrado" | error-handler |
| Prisma `P2002` (unique) | 409 "Registro já existe" | error-handler |
| JSON malformado / corpo grande | 400 / 413 | error-handler |
| Qualquer outro erro | 500 genérico + log completo | error-handler |

`error.message` de banco ou de biblioteca **nunca** vai para o cliente.

---

## Frontend — `src/`

```
src/
├── App.tsx                      # moldura e rotas. Mais nada.
├── core/api/
│   ├── apiClient.ts             # axios + tradução do erro do servidor
│   └── queryClient.ts           # cache do TanStack Query
├── domain/
│   ├── shared/*.types.ts        # tipos do contrato com a API
│   └── <nome>/<nome>.queries.ts # TanStack Query: busca e mutação do domínio
└── pages/
    ├── components/              # UI compartilhada entre páginas (AppHeader)
    └── <contexto>/
        ├── index.tsx            # markup. Nenhum fetch, nenhum cálculo.
        ├── hooks/use<Nome>.ts   # estado de tela: modal, seleção, confirmações
        ├── components/          # apresentacionais, recebem callback por prop
        └── helpers/*.helper.ts  # funções puras (parse, formatação, cor)
```

### O caminho de um clique

```
index.tsx  →  hooks/useX  →  domain/x.queries  →  core/api/apiClient
(markup)      (estado de     (dado do            (HTTP)
               tela)          servidor)
```

### Server state × client state — os dois convivem, nunca no mesmo dado

| | Guarda | Onde |
|---|---|---|
| **TanStack Query** | *server state*: o que vem da API, envelhece, é compartilhado entre telas | `domain/<nome>/<nome>.queries.ts` |
| **zustand** | *client state*: o que só existe no navegador e ninguém busca | `domain/<nome>/<nome>.store.ts` |

São ferramentas para problemas diferentes e o projeto usa as duas. A regra única é
**nunca as duas para o mesmo dado** — isso cria duas fontes de verdade para a
mesma lista.

Hoje só o primeiro balde tem conteúdo: ativos, inventário e usuários são todos
dado de servidor. O zustand entra quando aparecer client state de verdade — a
sessão em memória da F3 (é o `auth.store.ts` do IntraChat) e a preferência de
colunas da F10. Estado de uma tela só (modal aberto, item em edição, seleção)
continua em `useState` dentro do hook da página: não é global, não precisa de store.

O que a query assumiu e não se escreve mais à mão: intervalo de polling e limpeza
do timer, deduplicação de requisição simultânea, "já houve primeira resposta"
(`isPending`), e recarregar a lista depois de gravar (`invalidateQueries` no lugar
de um `fetch` manual no fim de cada mutação).

Regras práticas:

- **Componente não faz `fetch`.** Recebe `onSubmit`, `onCommand`, `onDelete`.
- **Página não importa `@tanstack/react-query` nem `axios`.** O lint recusa. Ela
  usa o hook da própria pasta, que usa a query do domínio.
- **Busca engole erro, mutação propaga.** A lista recarrega a cada 5s e uma
  falha passageira não pode limpar a tela; já um clique do usuário precisa
  mostrar o que deu errado. O formulário exibe `error.message`, que o
  `apiClient` já traduziu da resposta do servidor.
- **Cálculo sai do JSX.** Parse de coluna Json, conversão de bytes e cor de
  status moram em `helpers/`.

---

## A regra de corte: quando criar `use-cases/`

Os quatro domínios de hoje já têm o esqueleto completo. Para um domínio **novo**,
comece simples e quebre quando um dos dois acontecer:

1. o arquivo do domínio passar de ~250 linhas; **ou**
2. a mesma operação for chamada de **dois lugares** (rota + job, rota + WebSocket).

O critério 2 é o que importa de verdade. Exemplo real: `touchAsset` é chamada
pelo hub do agente a cada mensagem e o `markStaleAssetsOffline` pelo job — por
isso são use-cases, não linhas soltas dentro da rota.

Não crie `controllers/` + `use-cases/` para um CRUD de quatro linhas só por
simetria: três arquivos para `prisma.x.findMany()` é cerimônia, não arquitetura.

---

## Como adicionar um domínio novo

```
server/domain/licenca/
├── licenca.maestro.ts                      # as rotas
├── controllers/licenca.controller.ts       # entrada/saída HTTP
└── use-cases/list-licencas.usecase.ts      # o que o negócio faz
```

1. Escreva o use-case primeiro (é o que tem teste e regra).
2. O controller só converte requisição ↔ use-case.
3. O maestro só lista rotas.
4. Registre em **`app.ts`** (não em `server.ts`): `await LicencaMaestro.setupRoutes(server);`
5. No front: `src/domain/licenca/licenca.store.ts` + `src/pages/<contexto>/`.

---

## Invariantes do bootstrap

Estão em `server/server.ts` e existem para o sistema falhar cedo e limpo.

> **A montagem mora em `server/app.ts`, o processo em `server/server.ts`.** A
> divisão existe para o teste: `buildApp()` devolve a aplicação inteira sem
> abrir porta, sem ligar job e sem instalar handler de sinal, e é isso que
> permite exercitar a API por `app.inject()` — pelo mesmo grafo de plugins de
> produção. Rota nova se registra em `app.ts` (ver [`TESTES.md`](./TESTES.md)).


- **`validateEnv()` antes de tudo.** Variável obrigatória faltando derruba o
  boot com a lista do que falta — não vira erro 500 na primeira requisição.
- **Checagem de dependência antes de atender.** Banco fora do ar = o servidor
  não sobe, em vez de subir "meio vivo".
- **`/health`** (liveness, para o container) e **`/health/ready`** (readiness,
  para monitoramento: banco + agentes conectados).
- **`onShutdown` em ordem:** job → conexões de agente → HTTP → banco. Quem gera
  ou recebe trabalho fecha primeiro; a infraestrutura de que todos dependem,
  por último.
- **Log estruturado com contexto.** `createLogger('asset.maestro')`. Nada de
  `console.log`. Toda resposta leva `X-Request-Id`, que aparece no log da
  requisição. Credenciais são removidas em `core/logger/sanitize.ts`.

---

## O que ainda não existe

Em ordem de prioridade, do [`ITAM-TODO.md`](./ITAM-TODO.md):

- **Autenticação** — F3. Não existe login. O `/agent-hub` exige `AGENT_TOKEN`
  desde a F0, mas é segredo compartilhado, não token por agente. Quando o login
  entrar, o middleware vai por rota, dentro de cada maestro, e o `actorId` do
  `ActivityLog` — hoje sempre nulo — passa a ser preenchido.
- **Termo de entrega** — F4. O checkout, o checkin, o histórico de posse e a
  ocupação de posto **existem** (ver abaixo). Falta o fluxo de aceite: EULA da
  categoria, assinatura, PDF, e-mail e lembrete de atraso.
- **Licenças de software** — F6. Nenhuma tabela de licença existe; o que há é o
  `CategoryType.LICENSE`. O desenho de saldo derivado da F5 se aplica em parte:
  lá o assento é **materializado** (D40), porque uma licença tem número de
  assentos conhecido e contrato por trás.

> **Autenticação, termo de entrega e a suíte de testes JÁ EXISTEM** — esta seção
> os listava como pendentes e estava desatualizada. O login é a F3, o aceite
> fechou na Leva 4 do `FECHAMENTO-F2-F4-PLANO-ITAM.md`, e `npm test` roda contra
> Postgres real pelo mesmo Fastify de produção (ver `TESTES.md`).

> Validação com `zod`, paginação, busca, ordenação, soft delete e `ActivityLog`
> **existem** desde a Fase 0 — esta seção os listava como pendentes e estava
> desatualizada.

---

## Posse: a regra que atravessa três domínios

Leia [`MODELO-POSSE.md`](./MODELO-POSSE.md) antes de mexer em `assignment`,
`occupancy` ou no status do ativo. Em três linhas:

1. **`Assignment`** é a fonte de verdade da posse. Alvo polimórfico — pessoa,
   **posto** ou outro ativo. Uma aberta por ativo, garantida por índice único
   parcial no banco.
2. **`LocationOccupant`** é quem ocupa o posto, com turno. É a camada que permite
   a Mesa 1 ser da Laura de manhã e da Ana à tarde **sem o ativo apontar para
   duas pessoas**.
3. **Responsabilidade é derivada** (`resolverResponsaveis`), nunca coluna.

**A F5 estendeu as três camadas ao estoque, sem criar paralelo nenhum:** o
acessório entregue a um posto é **do posto** (D33), e quem responde por ele são
os mesmos ocupantes — `holdings`, o 409 do `DELETE` e o desligamento passaram a
ler as tabelas de estoque em vez de ganharem versões próprias. A linha que
sustenta isso é o `targetType: 'USER'` do
`stock/use-cases/checkin-user-accessories.usecase.ts`: sem ele, o desligamento
devolveria ao estoque as unidades que continuam fisicamente na mesa.

O que isso proíbe, e o lint não pega: **escrever em `Asset.assignedToId` fora do
checkout/checkin**, e **mudar `qty` de um item de estoque fora do
`adjust-quantity`** — a defesa do segundo é a chave não existir no schema de
edição, não uma checagem. Aquela coluna é cache do caso `USER`; um segundo lugar que a
escreva recria a divergência que o modelo existe para impedir. As invariantes
estão em [`INVARIANTES.md`](./INVARIANTES.md) e são provadas por
`tests/invariantes/` (`npm test`) e por `prisma/verificacoes/posse-invariantes.sql`.

---

## Sessão: a porta fechada por padrão

Leia [`AUTENTICACAO.md`](./AUTENTICACAO.md) antes de mexer em rota, cookie ou
qualquer coisa com "auth" no nome. Em três linhas:

1. **Toda rota exige sessão.** A exceção é a allowlist `ROTAS_PUBLICAS` em
   `server/app.ts` — quatro linhas, cada uma com o motivo escrito ao lado.
   Rota nova nasce protegida.
2. **O JWT nunca é visto pelo JavaScript.** Sai só no cookie `httpOnly`; o corpo
   da resposta leva o usuário, não o token.
3. **O usuário é relido do banco a cada requisição**, e o `tokenVersion`
   assinado no token é conferido contra a coluna — é isso que faz trocar a senha
   derrubar quem já estava dentro.

O que isso proíbe, e o lint não pega: **devolver o token no corpo de qualquer
resposta** e **ler usuário fora do `USER_PUBLIC_SELECT`**. Provado por
`tests/invariantes/sessao.test.ts`.

---

## Migrations: a regra que não pode ser esquecida

**Nunca `prisma migrate dev`.** Ele é interativo, detecta drift e oferece resetar
o banco. Para cada migração nova:

```bash
PASTA="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome"
mkdir -p "$PASTA"
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > "$PASTA/migration.sql"
# REVISAR o SQL antes de aplicar
npm run db:migrate && npm run db:generate
```

**Revisar o SQL não é formalidade.** Já aconteceu duas vezes de o gerador emitir
algo que destrói dado ou não executa:

- um `DROP INDEX` que o Postgres recusa quando o índice sustenta uma CONSTRAINT;
- um `DROP TABLE` + `CREATE TABLE` para o que era um **rename** de model, o que
  teria apagado a frota inteira descoberta pelo agente.

**E o teste que pega o resto:** reconstruir o banco do zero num banco descartável.

```bash
docker exec sentinel-postgres psql -U sentinel -d postgres \
  -c "DROP DATABASE IF EXISTS sentinel_audit;" -c "CREATE DATABASE sentinel_audit;"
AUDIT="postgresql://sentinel:sentinelpassword@localhost:3002/sentinel_audit?schema=public"
DATABASE_URL="$AUDIT" npx prisma migrate deploy
DATABASE_URL="$AUDIT" npm run db:seed
```

Foi assim que se descobriu que a cadeia de migrations **não aplicava do zero**: o
`0_init` foi adotado com `migrate resolve --applied` e nunca rodou, então ninguém
notou que ele cria `CREATE UNIQUE INDEX` onde o banco de desenvolvimento — nascido
de `db push` — tinha uma CONSTRAINT. Rodar a cadeia em banco limpo é o único jeito
de garantir que um ambiente novo sobe.
