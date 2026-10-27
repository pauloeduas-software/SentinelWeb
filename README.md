# Sentinel Web Dashboard 📊
> **Cyber-Industrial Control Panel for Fleet Management**

![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-4.x-38B2AC?logo=tailwind-css)

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

Toda resposta leva `X-Request-Id`, que aparece na linha de log da requisição e na auditoria (`audit_logs.requestId`). O número é sempre gerado pelo servidor: o que o cliente mandar é ignorado.

## 🚀 Telas

Na ordem do menu, que se agrupa por assunto ([AH](./docs/decisoes/acesso.md#ah--o-menu-por-assunto-o-colaborador-ganha-página-própria-e-ativos-vira-computadores)). Os endereços antigos — `/ativos`, `/itam`, `/users/:id` e `/configuracoes/colaboradores/:id` — redirecionam para os novos.

| Seção do menu | Rota | O que é | Cargo mínimo |
| --- | --- | --- | --- |
| **Ativos** | `/computadores` | Listagem de ativos (computadores) — filtros, busca por etiqueta/série, ações de ciclo de vida | ADMIN |
|  | `/computadores/:id` | Ficha do ativo — abas **Detalhes**, **Posse**, **Histórico**, **Licenças**, **Máquina** (telemetria e comando, quando há agente) | ADMIN |
|  | `/postos` | Postos de trabalho (mesas), cada um numa localização — quem está, quantos ativos, se está vago; criar, editar, desativar e excluir posto | ADMIN |
|  | `/postos/:id` | Ficha do posto — ocupantes (adicionar, corrigir o turno, encerrar), o computador da mesa (com telemetria), ativos entregues e estoque da mesa | ADMIN |
| **Recursos** | `/estoque` | O que tem quantidade em vez de patrimônio — o total, quantos em uso e com quem; entrega e devolução a colaborador ou posto, com o dia | ADMIN |
|  | `/licencas` | Contratos de software: quantidade comprada, chaves, entregas a colaborador ou computador; a encerrada fica na lista, com Reabrir | ADMIN |
| **Convergência** | `/descobertas` | O que o agente vê e o cadastro não sabe — máquinas sem vínculo, vínculo manual, fila de sugestões e "Reconciliar agora" | ADMIN |
| **Pessoas** | `/colaboradores` | Quem recebe equipamento — criar, editar, desativar, excluir para a lixeira e restaurar. Não entra no sistema: quem opera é usuário | ADMIN |
|  | `/colaboradores/:id` | Ficha do colaborador — postos ocupados, estoque e licenças no nome dele e histórico | ADMIN |
| **Sistema** | `/configuracoes` | As cinco abas de referência — categorias, status, fabricantes, modelos e localizações. A configuração da descoberta fica em `/descobertas` | ADMIN |
| **Gestão** | `/usuarios` | Quem opera o sistema — hoje só Administrador, o único cargo (Z). O cadastro pede nome, e-mail e a senha com que a pessoa entra (o login é o e-mail) | ADMIN |

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
(`src/core/api/apiClient.ts`) e o Vite faz o proxy para o backend em dev. Só quando painel e
API ficam em hosts diferentes o build lê `VITE_API_URL`.

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
bun run db:seed      # configuração, categorias e status — sem conta nenhuma

# 4. Rodar modo dev (Vite + API, com reload nos dois)
bun run dev
```

| Script | O que faz |
| --- | --- |
| `dev` | Vite + API juntos, com reload |
| `dev:server` | Só a API |
| `build` | Typecheck dos 2 projetos TS (front e Node) + build do front |
| `start` | Produção: a API serve o `dist` |
| `lint` | ESLint em `src/`, `server/` e `tests/` |
| `test` / `test:watch` | Vitest contra o banco `sentineldb_test` (descartável). Ver [`docs/referencia/testes.md`](./docs/referencia/testes.md) |
| `db:migrate` / `db:generate` / `db:studio` | Prisma |
| `db:seed` | O seed principal: categorias, status e configuração. Não cria conta: o primeiro administrador é criado à mão por quem instala ([T](./docs/decisoes/acesso.md#t--não-há-conta-semeada)). Roda em todo banco |
| `db:seed:demo` | O principal mais dados de exemplo — fabricantes, modelos e localizações. Só para desenvolvimento e demonstração. Ver [`docs/referencia/configuracoes.md`](./docs/referencia/configuracoes.md#o-que-vem-semeado) |
| `acesso:administrador` | A linha de escape do sistema trancado: `-- <e-mail>` dá o cargo `ADMIN` a essa pessoa. Roda no servidor, fora da API — ver [`docs/referencia/invariantes.md`](./docs/referencia/invariantes.md) (invariante 17) |
| `agente:falso` | Um agente de mentira no `/agent-hub` (`scripts/agente-falso.ts`): handshake e telemetria a cada 3 s, para ver a aba Máquina e a ficha do posto sem o agente real. Lê `PORT` e `AGENT_TOKEN` do `.env`; `-- <hwid> <hostname>` para uma segunda máquina |

### Migrations

`prisma migrate dev` é interativo e falha em terminal não interativo — **nunca** o use aqui.
Enquanto não existe banco em produção, o schema inteiro vive numa migration só, a `0_init`,
editada no lugar a cada mudança de `schema.prisma`. A receita — regerar a `0_init`, alinhar o
banco de desenvolvimento e conferir que nada divergiu — está em
[`docs/guias/criar-uma-migration.md`](./docs/guias/criar-uma-migration.md).
