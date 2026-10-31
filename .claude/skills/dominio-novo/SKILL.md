---
name: dominio-novo
description: Rota, endpoint, use-case ou domínio novo no servidor do SentinelWeb (server/modules), e a query, página ou cadastro novo no front que o consome. Use ao criar ou mexer em maestro, controller, use-case, permissão de rota, query ou página.
---

# Domínio novo

A receita está em `docs/guias/adicionar-um-dominio.md` e o porquê em
`docs/referencia/arquitetura.md`. Aqui, o que derruba o boot ou reprova o lint.

## Servidor

- `server/modules/<nome>/`: `<nome>.maestro.ts` (só rotas), `controllers/` (requisição ↔ use-case) e
  `use-cases/` (a regra; é o que tem teste). CRUD de quatro linhas não ganha três arquivos.
- Registre em `server/app.ts`, não em `server/server.ts`.
- **Toda rota precisa de linha em `server/modules/access/helpers/route-permissions.ts`.** Sem ela o
  boot derruba (D137). Rota nova nasce negada.
- **E de linha em `server/modules/api-docs/helpers/contrato-das-rotas.ts`** (tag, resumo e o schema
  Zod do corpo): é o que o Swagger mostra, e sem ela `tests/invariantes/contrato-da-api.test.ts`
  reprova (AS).
- Erro é `AppError` (`server/infra/errors/app-error.ts`), nunca montado à mão. O 409 de "em uso"
  diz com quem está e o que devolver antes.
- Escrita grava quem fez (`recordAudit`, só no banco, AB) e entra em
  `tests/invariantes/auditoria.test.ts`.
- Editar recebe o formulário inteiro com a versão lida (`server/modules/shared/versao.helper.ts`,
  AF): 409 se a linha mudou.

## Front

- Query em `src/queries/<nome>.queries.ts` (TanStack Query). Página não importa `axios` nem
  `@tanstack/react-query`: o lint recusa.
- Página em `src/pages/<substantivo-plural>/`, rota em `src/App.tsx`, item do menu em
  `src/components/navegacao.ts`.
- Cadastro copia `src/components/catalogo/` (`CatalogTable` + `useCatalog`), não a licença.
- Sem cor fixa (o lint recusa): só os tokens de `src/index.css`.

## Antes de concluir

`bun run check`. Teste do use-case em `tests/` (`docs/guias/escrever-um-teste.md`) e, para página
nova, o nome dela na lista de `tests/e2e/menu.spec.ts`.
