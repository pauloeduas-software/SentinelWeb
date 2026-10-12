# Sentinel Web Dashboard 📊
> **Cyber-Industrial Control Panel for Fleet Management**

![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-3.x-38B2AC?logo=tailwind-css)

O **Sentinel Web** fornece a interface visual para o gerenciamento de ativos. É focado em densidade de informação e baixa latência de resposta.

## 📁 Arquitetura

Fatia vertical por domínio sobre uma base de infraestrutura compartilhada, com
dependência em mão única: `pages → domain → core`.

```
server/
├── server.ts              # bootstrap: valida env, checa banco, registra, sobe
├── core/                  # infra: config, database, errors, logger, lifecycle
└── domain/<nome>/         # maestro (rotas) → controllers → use-cases → prisma
    └── agent · endpoint · asset · catalog · settings · activity · user
    └── assignment · occupancy · stock · license · reconciliation
    └── access · auth · workstation · shared

src/
├── App.tsx                # moldura e rotas
├── core/api/              # apiClient (axios) + queryClient (TanStack Query)
├── domain/<nome>/         # queries (TanStack Query) + shared/*.types.ts
└── pages/<contexto>/      # index.tsx · hooks/ · components/ · helpers/
```

A regra `pages → domain → core` é **verificada pelo lint** (`no-restricted-imports`
por camada): import que sobe a seta reprova o `npm run lint`, com a mensagem do que
fazer no lugar.

**A convenção completa — onde cada coisa vai, como adicionar um domínio novo e
quando quebrar em use-cases — está em [`docs/referencia/arquitetura.md`](./docs/referencia/arquitetura.md).**
Leia antes de criar arquivo novo.

O tema **Cyber-Industrial** (modo escuro, cores de status, fonte monoespaçada)
fica em `src/index.css`, com variáveis CSS do Tailwind.

## ❤️ Saúde do serviço

| Rota | Para que serve |
| --- | --- |
| `GET /health` | Liveness: o processo está de pé. É o health check do container |
| `GET /health/ready` | Readiness: banco respondendo + agentes conectados. 503 se o banco cair |

Toda resposta leva `X-Request-Id`, que aparece na linha de log da requisição.

## 🚀 Telas

| Rota | O que é | Papel mínimo |
| --- | --- | --- |
| `/ativos` | Listagem de ativos (computadores) — filtros, busca por etiqueta/série, ações de ciclo de vida | TECNICO |
| `/ativos/:id` | Ficha do ativo — abas **Detalhes**, **Posse**, **Histórico**, **Licenças**, **Máquina** (telemetria e comando, quando há agente) | TECNICO |
| `/postos` | Listagem de postos de trabalho (mesas) | TECNICO |
| `/postos/:id` | Ficha do posto — ocupantes, o computador da mesa (com telemetria), ativos entregues e estoque da mesa | TECNICO |
| `/estoque` | O que tem quantidade em vez de patrimônio — saldo, entrada/baixa, saída e devolução por unidade | TECNICO (apagar/restaurar: ADMIN) |
| `/licencas` | Contratos de software e os assentos materializados | TECNICO (apagar/restaurar: ADMIN) |
| `/descobertas` | O que o agente vê e o cadastro não sabe — máquinas sem vínculo, vínculo manual, fila de sugestões e "Reconciliar agora" | TECNICO (Reconciliar agora e a configuração da descoberta: ADMIN) |
| `/users` | Listagem de colaboradores | TECNICO (criar/editar/excluir: ADMIN) |
| `/users/:id` | Ficha da pessoa — postos ocupados, itens de estoque no nome dela, histórico | TECNICO |
| `/configuracoes` | Catálogo (categorias, status, fabricantes, modelos, localizações) e configuração do sistema | ADMIN |

A convergência RMM × ITAM — vínculo entre a máquina que o agente descobre e o ativo cadastrado,
telemetria em tempo real e comando remoto — vive dentro das fichas do ativo e do posto, não numa
tela própria. O critério de cada tela e o que já existiu e saiu estão em
[`docs/decisoes/escopo.md`](./docs/decisoes/escopo.md).

## 📋 Requisitos
*   Node.js v22.x ou superior
*   Bun (Gerenciador de pacotes)
*   Docker (Postgres)

## 🔌 Portas

Todas configuráveis pelo `.env` (único arquivo de ambiente do projeto):

| Serviço  | Porta | Variável        |
| -------- | ----- | --------------- |
| Front    | 3000  | `FRONT_PORT`    |
| Back     | 3001  | `PORT`          |
| Postgres | 3002  | `POSTGRES_PORT` |

Ao trocar `POSTGRES_PORT`, ajuste também a porta dentro de `DATABASE_URL` — o Prisma
não expande `${VAR}` no `.env`.

O frontend nunca aponta para uma porta fixa: as chamadas saem em `/api` relativo
(`src/core/api/apiClient.ts`) e o Vite faz o proxy para o backend em dev.

As variáveis ficam num `.env` só, na raiz — modelo em [`.env.example`](./.env.example).
O servidor valida o que é obrigatório no boot e não sobe sem isso.

## 🛠️ Desenvolvimento

```bash
# 1. Instalação
bun install

# 2. Ambiente
cp .env.example .env

# 3. Banco
docker compose up -d
bun run db:migrate
bun run db:generate

# 4. Rodar modo dev (Vite + API, com reload nos dois)
bun run dev
```

| Script | O que faz |
| --- | --- |
| `dev` | Vite + API juntos, com reload |
| `dev:server` | Só a API |
| `build` | Typecheck dos 3 projetos TS + build do front |
| `start` | Produção: a API serve o `dist` |
| `lint` | ESLint em `src/`, `server/` e `tests/` |
| `test` / `test:watch` | Vitest contra o banco `sentineldb_test` (descartável). Ver [`docs/referencia/testes.md`](./docs/referencia/testes.md) |
| `db:migrate` / `db:generate` / `db:studio` | Prisma |
| `agente:falso` | Um agente de mentira no `/agent-hub` (`scripts/agente-falso.ts`): handshake e telemetria a cada 3 s, para ver a aba Máquina e a ficha do posto sem o agente real. Lê `PORT` e `AGENT_TOKEN` do `.env`; `-- <hwid> <hostname>` para uma segunda máquina |

### Migrations

`prisma migrate dev` é interativo e falha em terminal não interativo. Para criar uma
migração nova:

```bash
set -a && . ./.env && set +a
DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_nome_da_mudanca"
mkdir -p "$DIR"
bunx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script > "$DIR/migration.sql"
bunx prisma migrate deploy
```
