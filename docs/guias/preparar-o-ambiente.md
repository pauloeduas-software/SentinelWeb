# Preparar o ambiente

> Guia. Receita para quem já sabe o que quer fazer: subir o SentinelWeb numa máquina nova, para
> desenvolver ou para rodar. As camadas estão em [`../referencia/arquitetura.md`](../referencia/arquitetura.md),
> e os testes, em [`../referencia/testes.md`](../referencia/testes.md).

---

## O que precisa estar instalado

- **Node.js 22** ou mais novo: o servidor roda no `tsx`.
- **Bun**, na versão do `packageManager` do `package.json`: instala as dependências e roda os scripts.
- **Docker**, para o Postgres.

## Subir para desenvolver

```bash
bun install
cp .env.example .env
docker compose up -d        # o Postgres na 3002
bun run db:migrate
bun run db:seed:demo        # o seed principal e os dados de exemplo, com a conta admin@sentinel.com (senha admin)
bun run dev                 # o painel na 3000 e a API na 3001, com reload nos dois
```

O `db:seed:demo` é só para desenvolvimento e demonstração. Num banco de verdade, rode o `db:seed`, que
não cria conta, e crie o primeiro administrador pelo `acesso:administrador`.

## As portas e o `.env`

As variáveis ficam num `.env` só, na raiz, e o modelo é o [`.env.example`](../../.env.example). O servidor
confere no boot o que é obrigatório e não sobe sem isso. Os testes têm o seu, o `.env.test`, versionado e
sem segredo, lido pelos dois harnesses (Vitest e Playwright).

| Serviço  | Porta | Variável        |
| -------- | ----- | --------------- |
| Painel   | 3000  | `FRONT_PORT`    |
| API      | 3001  | `PORT`          |
| Postgres | 3002  | `POSTGRES_PORT` |

- **Trocou o `POSTGRES_PORT`?** Troque também a porta dentro do `DATABASE_URL`: o servidor lê o `.env` com
  `process.loadEnvFile()`, que não expande `${VAR}`.
- **O painel não aponta para porta fixa.** As chamadas saem em `/api` relativo (`src/api/apiClient.ts`), e o
  Vite faz o proxy para a API em desenvolvimento. Só quando painel e API ficam em hosts diferentes o build
  lê o `VITE_API_URL`.

## Rodar em produção

```bash
bun run build               # typecheck e build do painel em dist/
bun run start               # a API serve o dist, com NODE_ENV=production
```

Em produção o servidor não sobe sem `AGENT_ENROLL_SECRET` nem com `JWT_SECRET` fraco, e a mensagem do
boot diz o que falta. Os dois se geram com `openssl rand -hex 32`.

## Os scripts

| Script | O que faz |
| --- | --- |
| `dev` | Painel e API juntos, com reload |
| `dev:server` | Só a API |
| `build` | Typecheck dos dois projetos TS (painel e Node) e build do painel |
| `start` | Produção: a API serve o `dist` |
| `lint` | ESLint em todo `.ts` e `.tsx` do repositório (menos `dist/`), com as regras de camada e a de cor fixa |
| `typecheck` | `tsc -b` dos dois projetos TS, sem build |
| `test` / `test:watch` | Vitest contra o banco `sentineldb_test`, descartável |
| `test:e2e` | Playwright: o build de produção na porta 4173, o banco `sentineldb_e2e_test` (descartável) e o Chromium clicando na tela. `bunx playwright install chromium` uma vez por máquina |
| `e2e:servidor` | O servidor que o `test:e2e` sobe e derruba, com o ambiente que o `playwright.config.ts` monta do `.env.test`: prepara o banco, faz o build e serve o `dist` na porta 4173 |
| `check` | `lint`, `typecheck`, `test` e `test:e2e`, nessa ordem. É o que passa antes de dar uma mudança por pronta, e o que a CI (`.github/workflows/ci.yml`) roda a cada push na `main` |
| `db:migrate` / `db:generate` / `db:studio` | Prisma. Mudança de schema é sempre uma migration nova: [`criar-uma-migration.md`](./criar-uma-migration.md) |
| `db:seed` | O seed principal: categorias, status, motivos de baixa e configuração. Não cria conta ([T](../decisoes/acesso.md#t--não-há-conta-semeada)). Roda em todo banco |
| `db:seed:demo` | O principal mais os dados de exemplo: a conta `admin@sentinel.com` (senha `admin`), fabricantes, modelos, localizações, postos, computadores, cinco colaboradores, licenças e itens de estoque ([`configuracoes.md`](../referencia/configuracoes.md#o-que-vem-semeado)) |
| `acesso:administrador` | Cria um administrador: `--nome "Nome Completo" --email "e-mail" --senha "senha"`. É a primeira conta da instalação nova e a saída de quem perdeu a senha: o novo entra e gera a senha temporária da conta antiga em Usuários. Roda no servidor, fora da API ([AP](../decisoes/acesso.md#ap--o-administrador-nasce-por-comando-como-no-snipe-it) e a invariante 17 em [`invariantes.md`](../referencia/invariantes.md)) |
