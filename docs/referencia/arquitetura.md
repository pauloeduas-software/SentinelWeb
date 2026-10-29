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
│   ├── database/                # prismaClient, soft-delete.extension (acha a lixeira pelo DMMF)
│   ├── errors/                  # app-error (AppError), error-handler, error-shape, zod-error
│   ├── http/                    # require-auth (sessão), permission-guard (autorização + boot, D137),
│   │                            #   list-query (paginação, busca e a vista da lixeira), write-rate-limit
│   ├── jobs/                    # claim-window — o CAS por linha de JobRun (D79) e `inicioDoDia`
│   ├── lifecycle/               # health (readiness), shutdown (onShutdown)
│   └── logger/                  # logger (createLogger), sanitize, request-logger
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
| `endpoint` | Máquina descoberta pelo agente (lado RMM) + telemetria (a crua fica 3 dias, com expurgo uma vez por dia depois da agregação; o uso diário agregado, para sempre) + comandos | `Endpoint`, `Telemetry` |
| `asset` | Ativo do ITAM — o `Asset` do vocabulário do Snipe-IT | `Asset` |
| `catalog` | As SEIS tabelas de catálogo, com UM CRUD genérico dirigido por spec — o colaborador inclusive | `Category`, `StatusLabel`, `Manufacturer`, `AssetModel`, `Location`, `Person` |
| `settings` | Configuração global: a etiqueta automática (prefixo, zeros, próximo número) e os botões da descoberta (`discoveryMode`, `ghostDays`, `shadowHours`). Idioma, moeda e formato de data são fixos no código (`src/pages/helpers/format.helper.ts`) | `AppSetting` |
| `audit` | A auditoria — quem fez o quê, em qual registro e quando ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)) —, gravada na transação de quem a origina. Só no banco: tela nenhuma a lê | `AuditLog` |
| `user` | **Quem opera o sistema** — hoje só Administrador ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)), com senha ([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)) | `User` |
| `person` | **O colaborador** — quem recebe equipamento. O cadastro é do `catalog` (a única aba com lixeira); aqui ficam a ficha, o histórico, a contagem da posse aberta e a trava da linha | `Person` |
| `assignment` | **Posse**: entrega e devolução de ativo, com alvo polimórfico (pessoa ou posto) e o histórico de quem teve o quê | `Assignment` |
| `occupancy` | **Ocupação do posto**: quem trabalha em qual posto, e em que turno | `WorkstationOccupant` |
| `license` | **Licenças**: o contrato, a quantidade comprada e as entregas a colaborador ou computador — sem vaga numerada nem lixeira ([AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)); ver [`licencas.md`](licencas.md) | `License`, `LicenseCheckout` |
| `stock` | **Estoque**: o que tem quantidade em vez de patrimônio individual — um tipo, saldo sempre calculado ([J](../decisoes/estoque.md#j--o-estoque-volta-como-stockitem--stockmovement)), na lógica da licença ([AE](../decisoes/estoque.md#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira)) | `StockItem`, `StockMovement` |
| `reconciliation` | **Convergência RMM × ITAM**: o vínculo entre a máquina descoberta e o ativo cadastrado e a fila de sugestões — sem inferência por conta do sistema operacional ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)) nem fusão de máquinas ([H](../decisoes/reconciliacao.md#h--a-fusão-de-máquinas-sai)) | `ReconciliationSuggestion`, `AssetChange`, `AssetUsageDaily` |
| `access` | **Autorização**: o cargo da sessão, o mapa de rotas × cargo mínimo e a invariante "nunca sem administrador" | — |
| `auth` | **Sessão e credencial**: login, cookie e a geração da sessão (`tokenVersion`) | — |
| `workstation` | **O posto de trabalho**: o cadastro (o CRUD do catálogo, com a `workstationSpec` — fora das seis tabelas) e a leitura de posto + ocupantes que a `/postos` mostra, onde `ehPostoVago()` mora ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)) | `Workstation` |
| `shared` | Tipos e helpers usados por mais de um domínio (`diff.helper`, `fields.schema`, `history.schema`) | — |

> **A decisão D1 foi executada na Fase 1.** `asset/` (RMM) virou `endpoint/`, e o
> nome `asset/` passou ao ativo do ITAM. O `inventory/` deixou de existir junto
> com a tabela `inventory_items`.
>
> ⚠️ **`Asset` nunca pode ter coluna `status`, `lastSeen` ou `hwid`** — são as do
> `Endpoint`. É essa ausência que faz o compilador barrar uma query do RMM
> apontando para a tabela errada ([D13](../decisoes/catalogo-e-ativo.md#d13--a-segurança-do-rename-depende-de-o-asset-novo-não-ter-status-lastseen-nem-hwid)).

### `catalog` é a exceção à fatia vertical

As SEIS tabelas de catálogo — e o posto, pela `workstationSpec` — são o MESMO CRUD: nome, listagem paginada, busca,
auditoria, 409 quando a linha está em uso. Cinco fatias verticais completas
seriam ~55 arquivos quase idênticos (onze por fatia, a conta do D9) — o que esta
mesma página chama de cerimônia, não arquitetura.

> **O número está escrito aqui de propósito, e precisa ser corrigido junto.** É
> o mesmo tipo de referência envelhecida que o `invariantes.md` pede para
> corrigir ao acrescentar uma invariante: quem lê um número aqui e conta outro no
> `specs/index.ts` passa a desconfiar do resto da página.

Então elas compartilham um CRUD genérico, e o que varia mora em `specs/`: um
arquivo por tabela declarando o slug da rota, o schema de entrada, a allowlist de
resposta, as colunas de busca e a regra de "em uso". **Acrescentar uma tabela
de catálogo é escrever a spec e incluí-la em `specs/index.ts`** — nenhuma rota é
escrita à mão.

O preço, declarado: tipar a união dos cinco delegates do Prisma não existe em TS,
então cada spec faz UM cast, ao lado do nome do model. O cast não atravessa a
regra: a entrada continua validada pelo `strictObject`, a saída continua limitada
pelo `select`, e o `countUsages` de cada spec continua totalmente tipado.

**E o `countUsages` é a parte que não se pode esquecer:** ele precisa conhecer
TODA tabela que aponta para a linha. Uma contagem incompleta responde "zero em
uso" e deixa a guarda do 409 aberta — foi o que o corte do ITAM obrigou a
revisar, porque cada tabela removida saiu de dentro de uma dessas contagens.

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
| `AppError('Máquina não encontrada.', 404)` | 404 + a mensagem | use-case |
| `AppError('O agente de … não está conectado agora.', 409)` | 409 + a mensagem | use-case |
| Prisma `P2025` (não achou) | 404 "Registro não encontrado" | error-handler |
| Prisma `P2002` (unique) | 409 "Registro já existe" | error-handler |
| `ZodError` (corpo, query ou parâmetro inválido) | 422 + a frase dos primeiros campos | error-handler (`zod-error.ts`) |
| JSON malformado / corpo grande | 400 / 413 | error-handler |
| Qualquer outro erro | 500 genérico + log completo | error-handler |

`error.message` de banco ou de biblioteca **nunca** vai para o cliente. E o corpo de
toda resposta de erro é `{ error }` — a frase —, com uma exceção só: quando a frase cita
registros que a tela pode abrir, `refs` vai ao lado (`AppError(mensagem, status, refs)`) — a
recusa do colaborador manda os computadores, as licenças, os itens e os postos que ela cita, a
do ativo, as licenças e os componentes, e a tela põe um link em cada um
([AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)).
O 422 de validação não manda o mapa por campo
([Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)). A frase
é o contrato e continua completa sem `refs`: no front, `ErroDaApi` guarda o corpo (`corpo`), e
quem lê as referências é `pages/helpers/erro.helper.ts` — o `core` não conhece domínio.

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
    ├── components/              # UI compartilhada entre páginas (AppHeader; catalogo/, o cadastro de Configurações e Colaboradores)
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

Quase tudo está no primeiro balde: ativos, licenças, postos e usuários são todos
dado de servidor. O zustand guarda o client state de verdade — a sessão em
memória (`auth.store.ts`) e a preferência de colunas da listagem de ativos
(`asset.store.ts`). Estado de uma tela só (modal aberto, item em edição, seleção)
continua em `useState` dentro do hook da página: não é global, não precisa de store.

O que a query assumiu e não se escreve mais à mão: intervalo de polling e limpeza
do timer, deduplicação de requisição simultânea, "já houve primeira resposta"
(`isPending`), e recarregar a lista depois de gravar (`invalidateQueries` no lugar
de um `fetch` manual no fim de cada mutação).

Regras práticas:

- **Componente não faz `fetch`.** Recebe `onSubmit`, `onCommand`, `onDelete`. Duas
  exceções, e as duas são widgets AUTOCONTIDOS usados por telas sem relação entre
  si, onde passar tudo por prop duplicaria a mesma ligação em cada chamador:
  `pages/components/ReferenceSelect` (busca a lista de opções da rota que recebe) e
  `pages/components/TelemetriaDaMaquina` (consulta e revalida uma máquina, e manda
  comando nela). Exceção se declara no cabeçalho do componente; a terceira que
  aparecer sem motivo escrito é a regra virando sugestão.
- **Página não importa `@tanstack/react-query` nem `axios`.** O lint recusa. Ela
  usa o hook da própria pasta, que usa a query do domínio.
- **Busca engole erro, mutação propaga.** A lista recarrega a cada 5s e uma
  falha passageira não pode limpar a tela; já um clique do usuário precisa
  mostrar o que deu errado. O formulário exibe `error.message`, que o
  `apiClient` já traduziu da resposta do servidor.
- **Cálculo sai do JSX.** Parse de coluna Json, conversão de bytes e cor de
  status moram em `helpers/`.
- **O `apiClient` traduz o erro num lugar só.** Toda tela mostra
  `error.message`, que vem do `error` do corpo — o único campo que uma resposta
  de erro tem.

---

## Invariantes do bootstrap

Estão em `server/server.ts` e existem para o sistema falhar cedo e limpo.

> **A montagem mora em `server/app.ts`, o processo em `server/server.ts`.** A
> divisão existe para o teste: `buildApp()` devolve a aplicação inteira sem
> abrir porta, sem ligar job e sem instalar handler de sinal, e é isso que
> permite exercitar a API por `app.inject()` — pelo mesmo grafo de plugins de
> produção. Rota nova se registra em `app.ts` (ver [`testes.md`](testes.md)).


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
  requisição e na auditoria (`audit_logs.requestId`). O servidor sempre gera o
  número (`generateRequestId`) e ignora o do cliente: aceito, uma conta poderia
  repetir o número de outra requisição. Credenciais são removidas em
  `core/logger/sanitize.ts`.

---

## O que ainda não existe

**Nada em aberto.** O que o ITAM tinha e deixou de ter saiu por decisão de
escopo, não por falta de tempo: o corte está registrado em
[`../decisoes/escopo.md`](../decisoes/escopo.md), com o critério — *fica o que a
ponte ITAM × RMM usa* — e a lista do que foi embora.

O que **não** vai existir por decisão — multi-empresa (**D4**), fila de
requisição, revogar uma sessão específica — está em
[`../decisoes/`](../decisoes/), cada um com o motivo escrito.

> **Esta seção já listou onze coisas como pendentes, e as onze existem.** Ela carregava **oito**
> blocos de autocorreção — *"JÁ EXISTE, esta seção estava desatualizada"* — que é exatamente o que
> acontece quando um documento de referência tenta também ser o registro do que mudou. O que cada
> fase construiu está em [`../historico/`](../historico/); aqui fica só o que é verdade agora.

---

## "Estar no parque" é UMA definição, e ela mora no domínio dono das colunas

`retiredAt: null` — o recorte que diz se um ativo ainda é do parque. (Até a
remoção do tipo de status `ARCHIVED`, era também `status.type != ARCHIVED`.)

A revisão da F8 encontrou **três** versões dela, e a mais frouxa tinha
consequência: um ativo fora do parque era conferido todo dia pelo job e não
aparecia onde o escopo completo era lido. Domínio que **pergunta** importa; domínio que
**responde** é o dono do dado — é o D16 aplicado a uma constante.

> O corte do ITAM levou os três leitores que importavam o helper, e com eles o
> helper. A definição continua valendo e hoje está onde se consulta o parque: no
> recorte de `list-assets` e no da reconciliação. **Se um terceiro leitor voltar,
> a constante volta com ele** — três cópias foi o defeito, e ele nasce de cada
> consulta reescrever o recorte à mão.

---
## Posse: a regra que atravessa três domínios

Leia [`modelo-de-posse.md`](modelo-de-posse.md) antes de mexer em `assignment`,
`occupancy` ou no status do ativo. Em três linhas:

1. **`Assignment`** é a fonte de verdade da posse. Alvo polimórfico — pessoa ou
   **posto**. Uma aberta por ativo, garantida por índice único parcial no banco.
2. **`WorkstationOccupant`** é quem ocupa o posto, com turno. É a camada que permite
   a Mesa 1 ser da Laura de manhã e da Ana à tarde **sem o ativo apontar para
   duas pessoas**.
3. **Responsabilidade é derivada** (`resolverResponsaveis`), nunca coluna.

**A licença entregue também é posse, sem paralelo nenhum (D93):** alguém
responde por ela, e ela impede o cadastro de sumir. Então `count-person-posse`
(o 409 da exclusão e da desativação da pessoa) e o 409 da baixa e da exclusão do
ativo contam as licenças abertas, em vez de o domínio de licença ganhar versões
próprias. Nada fecha sozinho: o 409 manda devolver, com um link para cada
licença, e a ficha do colaborador e a aba Licenças do ativo levam ao detalhe da
licença, o único lugar com o Devolver. A licença do computador não é da pessoa
que responde por ele.

**E a desativação de uma pessoa é recusada nas QUATRO pontas, não em uma:**
`checkoutAsset`, `checkoutLicense`, `checkoutStock` e `addWorkstationOccupant`
respondem 409 para quem está inativo, com a trava de linha em
`lock-person.usecase.ts` como primeira instrução de cada transação. A ocupação de
posto foi a que faltou mais tempo, e o motivo é instrutivo: ocupação de posto
não *parece* posse, mas responsabilidade por ativo em posto é DERIVADA dela.
E a própria desativação também é recusada (409) enquanto a pessoa responde por
alguma das quatro — como a exclusão, que manda para a lixeira: nenhuma das duas
fecha nada sozinha.

O que isso proíbe, e o lint não pega: **guardar quem responde numa coluna**. O
`Asset.assignedToId`, que era cache do caso pessoa, saiu do schema
([Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)):
quem responde é a `Assignment` aberta, e um segundo lugar com a mesma resposta
recria a divergência que o modelo existe para impedir. As invariantes estão em
[`invariantes.md`](invariantes.md) e são provadas por `tests/invariantes/`
(`npm test`) e por `prisma/verificacoes/posse-invariantes.sql`.

---

## Sessão: a porta fechada por padrão

Leia [`acesso.md`](acesso.md) antes de mexer em rota, cookie ou
qualquer coisa com "auth" no nome. Em três linhas:

1. **Toda rota exige sessão.** A exceção é a allowlist `ROTAS_PUBLICAS` em
   `server/app.ts` — quatro linhas, cada uma com o motivo escrito ao lado.
   Rota nova nasce protegida, e uma rota registrada sem exigência declarada
   **derruba o boot** (D137).
2. **O JWT nunca é visto pelo JavaScript.** Sai só no cookie `httpOnly`; o corpo
   da resposta leva o usuário, não o token.
3. **O usuário é relido do banco a cada requisição**, e o `tokenVersion`
   assinado no token é conferido contra a coluna — é isso que faz trocar a senha
   derrubar quem já estava dentro.

O que isso proíbe, e o lint não pega: **devolver o token no corpo de qualquer
resposta** e **ler usuário fora do `USER_PUBLIC_SELECT`**. Provado por
`tests/invariantes/sessao.test.ts`.

---

---

## As receitas saíram daqui

Três seções deste arquivo eram **instrução**, não descrição, e instrução ninguém procura na
linha 460 de um documento chamado "Arquitetura". Elas viraram guias:

- [`../guias/criar-uma-migration.md`](../guias/criar-uma-migration.md) — a receita do
  `migrate diff`, por que **nunca** `migrate dev`, e o teste de reconstruir o banco do zero;
- [`../guias/adicionar-um-dominio.md`](../guias/adicionar-um-dominio.md) — os seis passos, mais
  a regra de corte de quando quebrar em `use-cases/`.
