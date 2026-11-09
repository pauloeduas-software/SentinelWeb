# CLAUDE.md

Mapa para agentes de código, curto de propósito: a fonte é a [`docs/`](./docs/README.md), e aqui fica
onde olhar e o que não se negocia. Mudou uma regra daqui? Atualize este arquivo no mesmo commit.

## O que é

Painel de inventário de TI com convergência RMM: o cadastro de computadores, postos, estoque, licenças
e colaboradores, e a máquina que o SentinelAgente descobre pelo `/agent-hub`. Fastify + Prisma (Postgres)
em `server/`, React 19 + Vite + TanStack Query em `src/`. As telas e o menu estão no
[`README.md`](./README.md#-telas). Skills em `.claude/skills/`: `migration` e `dominio-novo`.

## Comandos

```bash
bun run dev            # Vite (3000) + API (3001), com reload
bun run check          # lint + typecheck + test + test:e2e (a CI roda o mesmo, a cada push na main)
bun run test           # Vitest contra o sentineldb_test; precisa do Postgres de pé
bun run test:e2e       # Playwright: build de produção na 4173, banco sentineldb_e2e_test
bun run db:generate    # depois de mudar o schema.prisma
bun run agente:falso   # agente de mentira, para ver a aba Máquina sem o real
```

**Antes de dizer que terminou: `bun run check` passando.** Teste que fala com o banco é a regra: não
há mock de Prisma ([`testes.md`](./docs/referencia/testes.md)). Página nova entra na lista de
`tests/e2e/menu.spec.ts`.

## Antes de mexer, leia

- **Tela, lista, ficha ou formulário:** [`telas.md`](./docs/referencia/telas.md). O molde é um só.
- **Rota, cargo, senha ou sessão:** [`acesso.md`](./docs/referencia/acesso.md).
- **Quem responde por um equipamento:** [`modelo-de-posse.md`](./docs/referencia/modelo-de-posse.md).
- **O que o banco recusa:** [`invariantes.md`](./docs/referencia/invariantes.md).
- **Licença, estoque, posto, colaborador, baixa ou Configurações:** a página do assunto em
  [`referencia/`](./docs/referencia/).

## Arquitetura

- `modules → infra` no servidor e `pages → queries → api` no front, verificado pelo lint. A mensagem do
  erro diz para onde mover; não contorne com `eslint-disable`
  ([`arquitetura.md`](./docs/referencia/arquitetura.md)).
- **Rota nova tem duas linhas:** o cargo em `route-permissions.ts` (sem ela o boot cai, D137) e o
  contrato em `contrato-das-rotas.ts` (sem ela `contrato-da-api.test.ts` reprova). A receita está em
  [`adicionar-um-dominio.md`](./docs/guias/adicionar-um-dominio.md).
- Toda escrita grava quem fez só no banco, nunca em tela (AB). Rota nova de escrita entra em
  `tests/invariantes/auditoria.test.ts`.
- **Três cargos, `TECNICO < SUPERVISOR < ADMIN` (AV).** O Técnico opera (ver, cadastrar, editar,
  entregar, devolver); o Supervisor exclui, desativa, dá baixa, vê o custo, mexe em licença, posto,
  Configurações e comando; só o Administrador mexe em Usuários.

## Banco

**Nunca `prisma migrate dev`.** O schema inteiro vive na `0_init`, editada no lugar. Siga
[`criar-uma-migration.md`](./docs/guias/criar-uma-migration.md) do começo ao fim: o `CHECK` que um
`DROP COLUMN` apaga em silêncio, o banco de desenvolvimento que nunca é `--shadow-database-url` e os
bancos de teste a apagar depois estão lá.

## Regras do sistema inteiro

- **Em uso bloqueia.** Encerrar, desativar, excluir, baixa ou lixeira de algo em uso é 409, dizendo o
  que devolver antes. **Nenhuma data é futura**, exceto prazo e vencimento, e nada acontece antes da
  compra (AN).
- **Devolver só na origem:** o computador em Computadores, o item em Estoque, a licença em Licenças, sempre na linha
  do responsável, e o botão do card só entrega (BQ). Posto e
  colaborador não devolvem: a linha abre o registro (BN). Na aba Responsáveis, a linha abre a ficha do responsável (CJ).
- **Lixeira só onde o histórico é do próprio registro:** colaborador e computador. O resto exclui de
  verdade, e o histórico guarda o nome por escrito (V, AG).
- **Só pt-BR, e a moeda é o real (BRL).** Nenhuma frase em inglês chega a quem usa: a recusa da API
  passa pelo locale pt-BR da zod (`server/infra/errors/zod-error.ts`) e o balão do navegador, por
  `src/helpers/validacao.helper.ts`. Campo novo de schema leva a frase com o rótulo.
- **A resposta a um clique vai para o cartão do canto inferior direito** (`useNotificacao`), com sucesso
  e com recusa. Recusa de formulário fica no formulário; falha ao carregar e situação que continua
  valendo ficam na tela; copiar confirma no próprio botão (BF).
- **O seed demo é como recém-cadastrado pela tela:** nada entregue, sem chave, só produto que todo
  mundo conhece.

## Vocabulário

- **Entrega**, nunca "saída", no estoque e na licença. "Saída" só na baixa do computador, ao sair de
  um posto e no logout.
- **Responsável** é o nome de quem responde por computador, item, licença ou posto em toda tela, e o
  título vai no plural: Responsáveis. "Ocupante" e "posse" são nomes do código e do banco e não aparecem
  para quem usa (BM). Entregue a um posto, o responsável que aparece é o posto; a pessoa fica pendurada
  nele, na aba Responsáveis (BL). Em Responsáveis vai só o nome: turno não entra, e Posto vago é só o
  Status do posto (BO). A exceção é o item do tipo componente: a aba dele é Computadores, porque a
  peça está instalada na máquina (BM).
- **Status** é o nome em toda tela, nunca "situação", e o valor vai no masculino: Ativo, Vencido,
  Encerrado, Conhecido. Frase inteira concorda com o que diz: "Licença encerrada." (BU).
- **Colaborador** recebe equipamento e não entra no sistema; **usuário** opera (U, P). O termo da
  tela é **cargo**, não papel (S).
- A página leva o nome do que lista, no plural (`computadores`, `postos`, `licencas`), nunca a
  sigla do assunto. Rota renomeada deixa a antiga redirecionando. O menu é por seções (AH).
- **Computador** é o nome do item em toda tela e recusa, nunca "ativo" (CH): ativo e computador são a mesma coisa.
  "Ativo" fica só como status (Ativo, Desativado) e no código (`Asset`).
- **Um nome para cada coisa (CH):** Notas, nunca "observações"; a série vai sem rótulo, nunca "SN", e embaixo da etiqueta em toda linha (CI); posto, nunca "mesa", fora do
  exemplo de nome; valor da compra, nunca "custo". Quem sai do posto tem **Registrar saída**; Encerrar é só da licença.

## Não volta

Decidido; não proponha de novo:

- e-mail, exportar e ação em lote (O);
- alerta de mínimo, piso ou estoque mínimo, em qualquer módulo (AA);
- busca no cabeçalho, com bipe ou `Ctrl+K` (AY);
- seletor de colunas nas listas (BA);
- fundo claro na marca, e contorno ou filtro de brilho por CSS: cada tema tem a sua arte (AY);
- conformidade de software (instalado × licença), "instalado" marcado à mão, OEM e licença por
  núcleo (G, AA, AD);
- baixa, motivo de redução ou lixeira no estoque (AE, AJ);
- Desativar no catálogo (AO);
- posto com vários computadores (B);
- matrícula, cargo ou telefone no colaborador: o lugar disso é Notas;
- o que a AT deixou de fora do ModuloDefault: Problem Details, caminhos em camelCase e `/v1`, Prettier,
  release-please e o shadcn/ui inteiro.

**Fechados:** licença, estoque, Configurações, Colaboradores, Usuários, os cargos (AV, também contra
o Lansweeper) e Postos (AW e AX, também contra Shelf.nu, ServiceNow e iTop) foram validados contra
GLPI e Snipe-IT. Só se corrige bug e texto falso; regra nova, só a pedido.

## Docs e commits

- Antes de escrever em `docs/`, leia o [`docs/README.md`](./docs/README.md): a pasta se decide pelo
  ciclo de vida, não pelo assunto. Decisão nova continua a letra, e a próxima está lá.
- Commit direto na `main`. Só `feat:` ou `chore:`, sem escopo, corpo em bullets curtos. Um assunto,
  um commit. Sem `Co-Authored-By` nem "Generated with".
