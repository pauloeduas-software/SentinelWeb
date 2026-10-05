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
│   ├── config/                  # load-env, env (validateEnv), cors, app-url (urlDoPainel)
│   ├── crypto/                  # cipher (enc:v1:kid:…, D81), keyring (D91), canary (derruba o boot)
│   ├── database/                # prismaClient, soft-delete.extension (acha a lixeira pelo DMMF)
│   ├── errors/                  # app-error (AppError), error-handler, error-shape, zod-error
│   ├── http/                    # require-auth (sessão), permission-guard (autorização + boot, D137),
│   │                            #   list-query (paginação + allowlist de ordenação), write-rate-limit
│   ├── jobs/                    # claim-window — o CAS por linha de JobRun (D79)
│   ├── lifecycle/               # health (readiness), shutdown (onShutdown)
│   ├── logger/                  # logger (createLogger), sanitize, request-logger
│   ├── mail/                    # mailer — sem SMTP, no-op que loga o que teria mandado (D86)
│   ├── storage/                 # storage (os bytes, D83), mime (allowlist MIME → extensão)
│   ├── time/                    # local-day — em que fuso é "hoje" (D123)
│   └── webhook/                 # webhook, destino-seguro (allowlist de destino, D126)
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
| `catalog` | As NOVE tabelas de catálogo, com UM CRUD genérico dirigido por spec | `Category`, `StatusLabel`, `Manufacturer`, `AssetModel`, `Supplier`, `Location`, `Depreciation`, `CustomField`, `CustomFieldset` |
| `custom-field` | **Campos customizados**: o que a spec de catálogo não expressa — a composição de um conjunto (ordem e obrigatoriedade por vínculo), a resolução categoria × modelo, a validação de valor e a regra do preenchimento em massa | `CustomFieldsetField` |
| `settings` | Configuração global: etiqueta automática, os botões da descoberta e os dez valores do ciclo de vida (limiares, hora e fuso) | `AppSetting` |
| `activity` | Trilha de auditoria, gravada na transação de quem a origina | `ActivityLog` |
| `user` | Colaborador da empresa | `User` |
| `assignment` | **Posse**: entrega e devolução de ativo, com alvo polimórfico (pessoa, posto ou outro ativo) e o histórico de quem teve o quê | `Assignment` |
| `occupancy` | **Ocupação do posto**: quem trabalha em qual localização, e em que turno | `LocationOccupant` |
| `stock` | **Estoque**: os três tipos que têm QUANTIDADE, com saldo derivado e trava na linha-pai | `Accessory`, `AccessoryCheckout`, `Consumable`, `ConsumableCheckout`, `Component`, `ComponentAsset`, `StockLog` |
| `license` | **Licenças**: o contrato e seus ASSENTOS materializados, com chave de produto cifrada em repouso | `License`, `LicenseSeat`, `LicenseSeatCheckout` |
| `reconciliation` | **Convergência RMM × ITAM**: o vínculo entre a máquina descoberta e o ativo cadastrado, a fila de sugestões, o software normalizado e o uso agregado | `ReconciliationSuggestion`, `EndpointUserDaily`, `AssetChange`, `SoftwarePackage`, `SoftwareInstallation`, `LicenseSoftware`, `AssetUsageDaily` |
| `maintenance` | **Histórico de serviço**: o que foi feito no ativo, por quem, quanto custou e se saiu na garantia | `Maintenance` |
| `audit` | **Conferência física**: as três perguntas do modelo de posse, conferidas por POSTO e registradas por ATIVO | `Audit` |
| `alert` | **Central de alertas**: os quatro sinais do ativo, persistidos antes de virarem mensagem, com o job diário | `Alert` |
| `report` | **Leitura agregada** — quatro relatórios, e nenhum deles escreve | — |
| `label` | **Etiquetas**: código de barras, QR e a folha em PDF (F10) | — |
| `import` | **Importação CSV**: o mapeamento, o dry-run obrigatório e o relatório linha a linha (F10) | `Import`, `ImportRow` |
| `backup` | **Backup do banco** pela interface, atrás de `BACKUP_ENABLED` (F10) | — |
| `acceptance` | **Termo de entrega**: o EULA copiado, a assinatura e o PDF (F4) | `Acceptance` |
| `attachment` | **Anexo e imagem**: o arquivo, onde ele mora e quem pode baixá-lo (F2) | `Attachment` |
| `access` | **Autorização e identidade** (F11): grupos e permissão efetiva, o catálogo de chaves, o departamento como entidade, a sincronização com o diretório e o login por SSO | `Group`, `Department` |
| `auth` | **Sessão e credencial**: login, cookie, segundo fator, token de API e a trilha de autenticação | `ApiToken`, `AuthEvent` |
| `workstation` | **O posto como tela**: a leitura de `Location` + ocupantes que a `/postos` mostra, e onde `ehPostoVago()` mora | — |
| `shared` | Tipos e helpers usados por mais de um domínio (`diff.helper`, `fields.schema`, `history.schema`, `csv.helper`, `multipart.helper`) | — |

> **`catalog` e `custom-field` são o MESMO assunto em duas pastas, e a divisão é o
> D64.** A parte PLANA dos dois cadastros novos é CRUD de catálogo — listar,
> buscar, ordenar, `ActivityLog`, 409 por uso —, então são duas specs e nenhuma
> rota escrita à mão. O que **não** cabe numa spec é ordem, obrigatoriedade por
> vínculo e validação de valor: isso tem regra, e regra mora em use-case.
>
> A fronteira se lê nas rotas: as dez planas saem do laço do `CatalogMaestro`; as
> três que sobram (`/custom-fields/list-view` e o par
> `/custom-fieldsets/:id/fields`) moram no `CustomFieldMaestro`, e nenhuma delas
> grava nem lê UM CAMPO de uma linha.

> **A decisão D1 foi executada na Fase 1.** `asset/` (RMM) virou `endpoint/`, e o
> nome `asset/` passou ao ativo do ITAM. O `inventory/` deixou de existir junto
> com a tabela `inventory_items`.
>
> ⚠️ **`Asset` nunca pode ter coluna `status`, `lastSeen` ou `hwid`** — são as do
> `Endpoint`. É essa ausência que faz o compilador barrar uma query do RMM
> apontando para a tabela errada (`../ROADMAP.md`, D13).

### `catalog` e `stock` são as duas exceções à fatia vertical

As NOVE tabelas de catálogo são o MESMO CRUD: nome, listagem paginada, busca,
ordenação, `ActivityLog`, 409 quando a linha está em uso. Nove fatias verticais
completas seriam ~99 arquivos quase idênticos — o que esta mesma página chama de
cerimônia, não arquitetura.

> **O número está escrito aqui de propósito, e precisa ser corrigido junto.** A
> F9 acrescentou duas tabelas e este parágrafo dizia "sete" — o mesmo tipo de
> referência envelhecida que o `invariantes.md` pede para corrigir ao acrescentar
> uma invariante. Quem lê "sete" e conta nove no `specs/index.ts` passa a
> desconfiar do resto da página.

Então elas compartilham um CRUD genérico, e o que varia mora em `specs/`: um
arquivo por tabela declarando o slug da rota, o schema de entrada, a allowlist de
resposta, as colunas ordenáveis e a regra de "em uso". **Acrescentar uma tabela
de catálogo é escrever a spec e incluí-la em `specs/index.ts`** — nenhuma rota é
escrita à mão.

> **E o `ClienteCatalogo` do CRUD genérico NÃO exclui `$queryRaw`:** a contagem de chaves dentro
> do `JsonB` só usa o índice GIN pelo operador `?`, e precisa rodar **dentro** da transação do
> delete — senão apagar um campo customizado deixaria valor órfão em silêncio.

O preço, declarado: tipar a união dos nove delegates do Prisma não existe em TS,
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
- **O `apiClient` preserva o `fields` do 422**, numa classe de erro própria. Num conjunto de
  vinte campos customizados criados pelo cliente, o resumo da mensagem corta em três e o motivo
  do vigésimo não apareceria em lugar nenhum.

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
  requisição. Credenciais são removidas em `core/logger/sanitize.ts`.

---

## O que ainda não existe

**Uma coisa, e ela está declarada: anexo com dono polimórfico.** `Attachment.assetId` é
`NOT NULL` com FK para `assets`, então anexo de licença e de manutenção (**D94**) exigem
discriminante, CHECK e uma decisão sobre o arquivo quando o dono some. É o único item em aberto
do [`../ROADMAP.md`](../ROADMAP.md).

O que **não** vai existir por decisão — multi-empresa (**D4**), fila de requisição, SAML
(**D78**), revogar uma sessão específica — está em [`../decisoes/`](../decisoes/) e em
[`acesso.md`](./acesso.md), cada um com o motivo escrito.

> **Esta seção já listou onze coisas como pendentes, e as onze existem.** Ela carregava **oito**
> blocos de autocorreção — *"JÁ EXISTE, esta seção estava desatualizada"* — que é exatamente o que
> acontece quando um documento de referência tenta também ser o registro do que mudou. O que cada
> fase construiu está em [`../historico/`](../historico/); aqui fica só o que é verdade agora.

---

## "Estar no parque" é UMA definição, e ela mora no domínio dono das colunas

`asset/helpers/asset-scope.helper.ts` — `retiredAt: null` **e** `status.type != ARCHIVED` —
importado por `report`, `audit` e `alert`.

A revisão da F8 encontrou **três** versões dela, e a mais frouxa tinha consequência: um ativo
`ARCHIVED` era auditado todo dia pelo job e nunca aparecia no relatório que lê o escopo completo.
Domínio que **pergunta** importa; domínio que **responde** é o dono do dado — é o D16 aplicado a
uma constante.

O mesmo vale para o recorte em SQL cru: a versão `Prisma.sql` mora **no mesmo arquivo** da versão
Prisma, senão o relatório em `$queryRaw` escreve a quarta cópia.

---
## Posse: a regra que atravessa três domínios

Leia [`modelo-de-posse.md`](modelo-de-posse.md) antes de mexer em `assignment`,
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

**A F6 estendeu as mesmas camadas à licença, sem criar paralelo nenhum (D93):**
assento é posse pelos mesmos três critérios — alguém responde por ele, ele
impede o cadastro de sumir, e ele fecha quando a pessoa sai. Então
`count-user-posse`, o 409 do `DELETE` (de pessoa **e** de ativo) e o `offboard`
passaram a contar assento, em vez de o domínio de licença ganhar versões
próprias. A linha que sustenta isso é o `assignedUserId` do
`license/use-cases/checkin-user-seats.usecase.ts`: sem ele, o desligamento
devolveria o assento do desktop da Mesa 1 — que continua ligado, agora com outra
pessoa — e a máquina ficaria rodando software sem licença atribuída.

O que isso proíbe, e o lint não pega: **escrever em `Asset.assignedToId` fora do
checkout/checkin**, **mudar `qty` de um item de estoque fora do
`adjust-quantity`**, **ler `License.productKey` fora do
`reveal-product-key.usecase.ts`**, e **ler `Asset.customFields` sem passar por
`comCamposMascarados()`** — a coluna guarda pacote cifrado ao lado de valor
comum, e é o prefixo `enc:` dentro do valor que diz qual é qual (por isso ela
NÃO está no `ASSET_SELECT` compartilhado: só os quatro leitores que a mostram a
carregam) — a defesa do segundo é a chave não existir no schema de
edição, não uma checagem. Aquela coluna é cache do caso `USER`; um segundo lugar que a
escreva recria a divergência que o modelo existe para impedir. As invariantes
estão em [`invariantes.md`](invariantes.md) e são provadas por
`tests/invariantes/` (`npm test`) e por `prisma/verificacoes/posse-invariantes.sql`.

---

## Sessão: a porta fechada por padrão

Leia [`acesso.md`](acesso.md) antes de mexer em rota, cookie ou
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

---

## As receitas saíram daqui

Três seções deste arquivo eram **instrução**, não descrição, e instrução ninguém procura na
linha 460 de um documento chamado "Arquitetura". Elas viraram guias:

- [`../guias/criar-uma-migration.md`](../guias/criar-uma-migration.md) — a receita do
  `migrate diff`, por que **nunca** `migrate dev`, e o teste de reconstruir o banco do zero;
- [`../guias/adicionar-um-dominio.md`](../guias/adicionar-um-dominio.md) — os cinco passos, mais
  a regra de corte de quando quebrar em `use-cases/`.
