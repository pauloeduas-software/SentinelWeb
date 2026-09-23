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
    └── agent · asset · inventory · user

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
quando quebrar em use-cases — está em [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md).**
Leia antes de criar arquivo novo.

O tema **Cyber-Industrial** (modo escuro, cores de status, fonte monoespaçada)
fica em `src/index.css`, com variáveis CSS do Tailwind.

## ❤️ Saúde do serviço

| Rota | Para que serve |
| --- | --- |
| `GET /health` | Liveness: o processo está de pé. É o health check do container |
| `GET /health/ready` | Readiness: banco respondendo + agentes conectados. 503 se o banco cair |

Toda resposta leva `X-Request-Id`, que aparece na linha de log da requisição.

## 🚀 Funcionalidades da UI
*   **Grid de Rede 2x2**: Visualização minimalista de tráfego (Velocidade Kbps + Totais GB).
*   **Lista de Ativos Dinâmica**: Filtros automáticos por status ONLINE/OFFLINE.
*   **Execução Direta**: Disparo de comandos de nível de Kernel com confirmação de segurança.

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
| `test` / `test:watch` | Vitest contra o banco `sentineldb_test` (descartável). Ver [`docs/TESTES.md`](./docs/TESTES.md) |
| `db:migrate` / `db:generate` / `db:studio` | Prisma |

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
