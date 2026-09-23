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
├── server.ts                    # bootstrap: valida env, checa banco, registra tudo, sobe
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
| `asset` | Máquina descoberta pelo agente (lado RMM) + telemetria + comandos | `Asset`, `Telemetry` |
| `inventory` | Ativo cadastrado à mão (lado ITAM) | `InventoryItem` |
| `user` | Colaborador da empresa | `User` |

> Quando a decisão **D1** do [`ITAM-TODO.md`](./ITAM-TODO.md) for executada,
> `asset/` vira `endpoint/` e `inventory/` vira `asset/`. A estrutura já está
> preparada: é renomear pasta, não reescrever camada.

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
4. Registre em `server.ts`: `await LicencaMaestro.setupRoutes(server);`
5. No front: `src/domain/licenca/licenca.store.ts` + `src/pages/<contexto>/`.

---

## Invariantes do bootstrap

Estão em `server/server.ts` e existem para o sistema falhar cedo e limpo:

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

Isto é esqueleto, não sistema pronto. Em ordem de prioridade, do
[`ITAM-TODO.md`](./ITAM-TODO.md):

- **Validação de payload (`zod`)** — F0. Os controllers hoje conferem só o
  obrigatório na mão. O `error-handler` já tem onde encaixar `ZodError` → 422.
- **Autenticação** — F3. Não existe login, e o `/agent-hub` aceita qualquer
  WebSocket. Quando entrar, o middleware vai por rota, dentro de cada maestro.
- **Testes** — não há nenhum. O formato é `*.test.ts` ao lado do código.
- **Paginação e filtro no servidor** — F0. Todo `findMany` ainda vem inteiro.
