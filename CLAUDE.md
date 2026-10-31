# CLAUDE.md

Guia para agentes de código neste repositório. É o mapa, curto de propósito: a fonte é a
[`docs/`](./docs/README.md), e este arquivo diz onde olhar e o que não se negocia. Mudou uma regra
daqui? Atualize este arquivo no mesmo commit.

## O que é

Painel de inventário de TI com convergência RMM: o cadastro de computadores, postos, estoque,
licenças e colaboradores, e a máquina que o SentinelAgente descobre pelo `/agent-hub`. Fastify +
Prisma (Postgres) em `server/`, React 19 + Vite + TanStack Query em `src/`. As telas e o menu estão
no [`README.md`](./README.md#-telas).

Skills em `.claude/skills/`: `migration` (mudança de schema) e `dominio-novo` (rota, use-case,
página). Elas apontam para o guia; o guia é a fonte.

## Comandos

```bash
bun run dev            # Vite (3000) + API (3001), com reload
bun run check          # lint + typecheck + test + test:e2e (a CI roda o mesmo, a cada push na main)
bun run test           # Vitest contra o sentineldb_test; precisa do Postgres de pé
bun run test:e2e       # Playwright: build de produção na 4173, banco sentineldb_e2e_test
bun run db:generate    # depois de mudar o schema.prisma
bun run agente:falso   # agente de mentira, para ver a aba Máquina sem o real
```

**Antes de dizer que terminou: `bun run check` passando.** Teste que fala com o banco é a regra:
não há mock de Prisma ([`testes.md`](./docs/referencia/testes.md)). Página nova entra na lista de
`tests/e2e/menu.spec.ts`.

## Arquitetura

- `modules → infra` no servidor e `pages → queries → api` no front, verificado pelo lint. A mensagem do erro diz para onde
  mover; não contorne com `eslint-disable`. O porquê está em
  [`arquitetura.md`](./docs/referencia/arquitetura.md); a receita, em
  [`adicionar-um-dominio.md`](./docs/guias/adicionar-um-dominio.md).
- Servidor: `server/modules/<nome>/` com `<nome>.maestro.ts` (rotas), `controllers/` e `use-cases/`.
  Rota sem linha em `server/modules/access/helpers/route-permissions.ts` **derruba o boot** (D137).
- Front: página não fala HTTP. Ela usa `src/queries/<nome>.queries.ts`.
- Cadastro novo copia `src/components/catalogo/` (`CatalogTable` + `useCatalog`), não a licença.
- Editar manda o formulário inteiro com o `updatedAt` lido ao abrir; se a linha mudou, o servidor
  responde 409 (`server/modules/shared/versao.helper.ts`, AF). Menos Usuários: o login grava na
  linha da conta.
- Toda escrita grava quem fez só no banco, nunca em tela (AB). Rota nova de escrita entra em
  `tests/invariantes/auditoria.test.ts`.
- **Rota nova tem duas linhas:** o cargo em `route-permissions.ts` (sem ela o boot cai) e o contrato em
  `server/modules/api-docs/helpers/contrato-das-rotas.ts` (sem ela `contrato-da-api.test.ts` reprova).
  O Swagger abre em `/api/docs`, só fora de produção (AS).
- **Senha:** ninguém escolhe a de outra pessoa. O cadastro nasce com uma temporária e o administrador
  gera outra para quem esqueceu; a pessoa a troca ao entrar (`mustChangePassword`), sem digitá-la de
  novo. A sessão com ela só alcança `/auth/me`, sair e `PUT /auth/password`. Quem troca a própria senha
  não é derrubado (`reemitirSessao`). A sessão vale 12 h, fixa (AR, AU).

## Banco

- **Nunca `prisma migrate dev`.** O schema inteiro vive na `0_init`, editada no lugar. Siga
  [`criar-uma-migration.md`](./docs/guias/criar-uma-migration.md) do começo ao fim.
- `DROP COLUMN` apaga em silêncio o `CHECK` que cita a coluna. Procure cada coluna removida no bloco
  escrito à mão da `0_init` antes de alinhar o dev.
- Nunca passe o banco de desenvolvimento como `--shadow-database-url`: ele é zerado.
- O que o banco recusa, e onde cada regra é defendida:
  [`invariantes.md`](./docs/referencia/invariantes.md).
- Mudou a `0_init`: apague o `sentineldb_test` e o `sentineldb_e2e_test`; o próximo `test` e
  `test:e2e` recriam cada um.

## Regras do sistema inteiro

- **Em uso bloqueia.** Encerrar, desativar, excluir, baixa ou lixeira de algo em uso é 409, dizendo o
  que devolver antes. **Nenhuma data é futura**, exceto prazo e vencimento, e nada acontece antes da
  compra (AN).
- **O CRUD é um só.** Editar, Desativar/Ativar e Excluir, nessa ordem, ao passar o mouse. Excluir
  sempre clica, e quem recusa é o 409. Desativar existe só em colaborador, conta e item de estoque; a
  licença tem Encerrar; catálogo e posto só excluem (AF, AN, AO).
- **Lixeira só onde o histórico é do próprio registro:** colaborador e computador. O resto exclui de
  verdade, e o histórico guarda o nome por escrito (V, AG).
- **Estoque conta quantos.** A categoria decide o tipo: Estoque vai a colaborador ou posto,
  Componente só a computador, Consumível sai do total e não tem Devolver (AI, AJ). Quebrou ou
  perdeu: Devolver e Editar o total. Cadastro com quantidade nasce com 1 ou mais.
- **Um computador por posto** (invariante 19, B). Laboratório é um posto por computador.
- **Alerta só de prazo, e só na tela do assunto:** o da licença fica em `/licencas`.
- **Sem cor por dado** (status, nome, categoria, tipo de evento). Só os tokens do tema
  (`status-success`, `status-warning`, `status-danger`, `status-info`) em botão, aviso e na marca
  "desativado". O lint recusa cor fixa em `src/`.
- **O seed demo é como recém-cadastrado pela tela:** nada entregue, sem chave, só produto que todo
  mundo conhece.

## Vocabulário

- **Entrega**, nunca "saída", no estoque e na licença. "Saída" só na baixa do computador, ao sair de
  um posto e no logout.
- **Colaborador** recebe equipamento e não entra no sistema; **usuário** opera (U, P). O termo da
  tela é **cargo**, não papel (S).
- A página leva o nome do que lista, no plural (`computadores`, `postos`, `licencas`), nunca a
  sigla do assunto. Rota renomeada deixa a antiga redirecionando. O menu é por seções (AH).
- **Ativo** é o item (etiqueta, ficha do ativo); a página é Computadores.

## Não volta

Decidido; não proponha de novo:

- e-mail, exportar e ação em lote (O);
- alerta de mínimo, piso ou estoque mínimo, em qualquer módulo (AA);
- conformidade de software (instalado × licença), "instalado" marcado à mão, OEM e licença por
  núcleo (G, AA, AD);
- baixa, motivo de redução ou lixeira no estoque (AE, AJ);
- Desativar no catálogo (AO);
- posto com vários computadores (B);
- matrícula, cargo ou telefone no colaborador: o lugar disso é Notas;
- o que a AT deixou de fora do ModuloDefault: Problem Details, caminhos em camelCase e `/v1`, Prettier,
  release-please e o shadcn/ui inteiro.

**Fechados:** licença, estoque, Configurações, Colaboradores e Usuários foram validados contra GLPI e
Snipe-IT. Só se corrige bug e texto falso; regra nova, só a pedido. A separação de cargos está
pendente (Z) e nasce do zero: não reintroduza o técnico.

## Docs e commits

- Antes de escrever em `docs/`, leia o [`docs/README.md`](./docs/README.md): a pasta se decide pelo
  ciclo de vida, não pelo assunto. Decisão nova continua a letra; a próxima está no fim de
  [`decisoes/README.md`](./docs/decisoes/README.md).
- Commit direto na `main`. Só `feat:` ou `chore:`, sem escopo, corpo em bullets curtos. Um assunto,
  um commit. Sem `Co-Authored-By` nem "Generated with".
