# Plano de implementação — Fase 11: acesso avançado ✅ CONCLUÍDA

> Fase 11 do [`../ROADMAP.md`](../ROADMAP.md). Convenções de camada:
> [`../referencia/arquitetura.md`](../referencia/arquitetura.md). Contrato de posse: [`../referencia/modelo-de-posse.md`](../referencia/modelo-de-posse.md),
> [`../decisoes/posse.md`](../decisoes/posse.md) e [`../referencia/invariantes.md`](../referencia/invariantes.md). Conflitos
> entre planos: [`../decisoes/README.md`](../decisoes/README.md).
>
> Escrito como plano prospectivo **antes da F3** — ele falava de *"quando a autenticação
> chegar"* — e **revisado em 01/10/2026** contra a árvore com a F10 fechada (`e8094f1`),
> linha por linha, pelo código que o plano dizia que ia nascer. A revisão achou
> **8 afirmações caducadas** e **11 defeitos** (3 🔴, 5 🟠, 3 🟡), três deles mudando o que
> seria entregue: `department` viajava no `USER_PUBLIC_SELECT`, a permissão não tinha onde
> morar na requisição, e `requirePermission` por rota reabria o furo que a F3 fechou. A
> revisão está **incorporada aqui**: as etapas, a ordem e o esforço são os revisados, e o que
> caducou ficou registrado em *A revisão do plano*, não apagado.
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões
> **D72–D78** (do plano) e **D135–D142** (da revisão), na numeração contínua do projeto
> (D1–D13 no TODO, D14–D17 em `../decisoes/posse.md`).
>
> **A FASE FECHOU.** As dez etapas (A–J) estão aplicadas — ver o
> [Fechamento da F11](#fechamento-da-f11), no fim deste arquivo, com o que a execução
> decidiu por conta própria e o que ficou de fora com o motivo.

---

## Objetivo

Transformar `User` — até aqui quatro colunas e um `department` de texto livre — em
**colaborador**: departamento de verdade, gestor, admissão, desligamento, grupo, permissão,
segundo fator e login corporativo, mais o portal onde ele vê o que responde. A fase também fecha
uma fronteira que o modelo de posse deixou em aberto: **posto, departamento e gestor parecem todos
responder *"de quem é isto?"* e respondem a perguntas diferentes.** Sem isso escrito, a primeira
pessoa a implementar "o gestor também responde" vai fazê-lo por efeito colateral de duas colunas
existirem — e uma delas, `Location.managerId`, estava no schema desde a F1 com um uso só, e um uso
pela metade (ver o defeito 5).

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F3 concluída** | pré-requisito **duro**, o único do plano. Permissão sem sessão não tem sujeito; 2FA sem login não tem onde entrar |
| **F4 concluída** | o desligamento chama `checkin-all` e encerra ocupações. Sem os use-cases de posse, o fluxo é metade |
| **F10 concluída** | a allowlist de colunas do report builder passa a ser filtrada por permissão. Ela existe, e é por isso que o filtro é uma linha e não uma refatoração |
| **`ldapts`, `openid-client`** | **só esses dois** faltam instalar. `otplib` e `qrcode` já estão no `package.json`, e `APP_ENCRYPTION_KEY` existe com `cipher.ts`, `keyring.ts` e canário no boot (D81) |
| **A suíte `tests/`** | 66 arquivos contra Postgres real, pelo mesmo Fastify de produção. `tests/invariantes/` e `tests/corridas/` são o lugar das provas desta fase |

**A janela do D6 já fechou aqui.** A Etapa D é a primeira migração do projeto que **não** é
aditiva: ela troca uma coluna de texto por uma FK, com dado dentro.

---

## A revisão do plano — 01/10/2026

Não por leitura do plano. Por leitura do **código que o plano dizia que ia nascer**:

| O que | Onde |
|---|---|
| `User` inteiro, e o que já existe dele | `prisma/schema.prisma:145`, `user/helpers/user-select.helper.ts` |
| O desligamento que a etapa "cria" | `user/use-cases/offboard-user.usecase.ts` (299 linhas, F4) |
| O 409 do `DELETE` que a etapa "acrescenta" | `user/use-cases/count-user-posse.usecase.ts`, `delete-user.usecase.ts` |
| O `ApiToken` que a etapa "não cria" | `prisma/migrations/20260923180000_api_token/`, `auth/use-cases/manage-api-tokens.usecase.ts` |
| Onde o `preHandler` da permissão iria | `core/http/require-auth.ts`, `server/app.ts:175`, 177 rotas em 23 maestros |
| O `Location.managerId` "sem nenhum uso" | `acceptance/use-cases/issue-acceptance.usecase.ts`, `catalog/specs/location.spec.ts` |
| O dado sensível | `asset/helpers/asset-select.helper.ts` (50 chamadas), `license/helpers/license-select.helper.ts` |
| A obrigação cruzada do D77 | `report/helpers/report-columns.ts`, `depreciation-report`, `responsibility-report`, `export-assets` |
| A suíte que o plano dizia não existir | 66 arquivos em `tests/`, `tests/invariantes/`, `tests/corridas/` |

Contagens que importam adiante: **177 rotas** em 23 maestros; **50 chamadas** a `ASSET_SELECT` em
20 arquivos; **19 arquivos** leem ou escrevem `User.department`, contando front, importador e
testes.

### O que caducou — o plano falava de antes da F3

Nenhum destes é defeito de raciocínio: é o código tendo andado.

1. **`otplib` e `qrcode` já estavam instalados** (`package.json`). Faltavam `ldapts` e
   `openid-client` — só eles. E `APP_ENCRYPTION_KEY` existia, com `cipher.ts`, `keyring.ts` e
   canário no boot (D81).

2. **"Não há suíte: a verificação é a seção acima"** — havia. `npm test` roda 66 arquivos contra
   Postgres real, pelo mesmo Fastify de produção, em dois projetos (`puro` para função pura).
   `tests/invariantes/` e `tests/corridas/` são o lugar certo das provas desta fase, e os `curl` da
   seção de Verificação eram rascunho de teste, não a verificação.

3. **`src/pages/gestao-usuario/detalhe/` já existia** — `index.tsx`, `hooks/useUserDetail.ts`,
   `components/HistoryPanel.tsx`, `components/OffboardModal.tsx`, `helpers/historico.helper.ts`. A
   etapa de identidade **cresce** a tela; não a cria.

4. **O 409 do `DELETE` com ocupação aberta já existia**, e com mais do que o plano pedia: são
   **quatro** pontas contadas (ativo, acessório, assento de licença, posto), a frase do 409 nomeia
   cada uma, e a contagem roda **depois de `SELECT … FOR UPDATE`** na linha do usuário — a
   Invariante 6, que nasceu de um teste de corrida vermelho.

5. **O passo 4 do desligamento (`terminatedAt`, `isActive`) já estava escrito**, como a nota de
   estado do D82 avisa. O `offboard` já fazia **cinco** passos, não quatro: devolve ativos,
   acessórios (F5) e assentos de licença (F6), encerra ocupações e marca a saída — tudo em uma
   transação, com `ActivityLog` por passo.

6. **`LOGIN_DISABLED` e as colunas de desligamento já nasceram preparadas para esta fase.** O
   `login.usecase.ts` recusa `isActive = false` com frase própria e evento próprio; o
   `current-user.usecase.ts` relê com `isActive: true` a cada requisição. A etapa de identidade não
   precisa tocar em nada disso.

7. **O plano citava o `../referencia/arquitetura.md` — e citava a parte que ficou velha.** O texto "o middleware
   vai por rota, dentro de cada maestro" está na seção *"O que ainda não existe"*, debaixo do item
   **Autenticação — F3**, que já fechou. A F3 escolheu o **oposto**, de propósito e com o motivo
   escrito (`require-auth.ts`). Ver o defeito 🔴 3.

8. **A ordem de commits usava escopo** (`feat(db):`, `feat(user):`). A convenção do projeto é
   `feat` ou `chore` **sem escopo**, com corpo em bullets curtos.

### Os onze defeitos

#### 🔴 1 — `department` está no `USER_PUBLIC_SELECT`, e ele viaja embutido em toda resposta

O plano tratava a troca como problema de banco — "duas migrações" — e resolve bem esse lado. O
problema não está no banco: está no **contrato**.

```ts
// user/helpers/user-select.helper.ts
export const USER_PUBLIC_SELECT = {
  id: true, name: true, email: true, department: true, createdAt: true,
} as const;
```

Esse objeto é o `assignedTo` de todo ativo, o `user` de toda ocupação, o alvo de toda posse, o
corpo de `/api/auth/me` e — por `Prisma.UserGetPayload` — o **tipo** `SessionUser`, relido a cada
requisição autenticada. `department` deixa de ser `string | null` e passa a ser uma relação. Quem
paga:

| Ponto | O que quebra |
|---|---|
| `USER_SORTABLE = ['name','email','department','createdAt']` | `?sort=department` passa a ordenar por coluna inexistente — **500 vindo de query string**, depois do `DROP COLUMN` |
| `user-filters.helper.ts` | a busca `?q=` faz `department: { contains: q }` em coluna que virou uuid |
| `update-user.usecase.ts` | `CAMPOS_AUDITADOS = ['name','email','department']` — o diff do `ActivityLog` passa a comparar objeto com texto |
| `import-users.usecase.ts`, `import-fields.helper.ts`, `import-template.usecase.ts` | o importador da F10 **grava `department` como texto**. Vira FK: ele tem que resolver nome → id, e decidir o que faz com nome novo |
| `src/pages/gestao-usuario/index.tsx:62`, `UserFormModal.tsx`, `detalhe/index.tsx`, `AppHeader.tsx:117` | leem `user.department` como string |
| `src/domain/shared/user.types.ts` | `department?: string \| null` |
| `tests/formularios/`, `tests/importacao/apply.test.ts`, `tests/listagens/` | quatro arquivos |

E a saída fácil não existe: a **listagem** mostra a coluna Departamento, e a listagem usa
`USER_PUBLIC_SELECT`. Então ou o select embutido carrega `department: { select: { id, name } }` — e
aí o objeto viaja em cada linha de histórico de todo ativo, que é exatamente o argumento que aquele
arquivo já usa para justificar o `USER_DETAIL_SELECT` existir separado — ou nasce um
`USER_LIST_SELECT`. **É decisão da etapa do `Department`, não do `DROP COLUMN`** (D135).

#### 🔴 2 — Permissão não tem onde morar na requisição, e o caminho mais quente do sistema paga a conta

O plano dava a `require-permission.ts` o papel de `preHandler` e nunca dizia **de onde ele lê as
permissões**. O desenho de hoje fecha duas portas de uma vez:

```ts
// auth/auth.types.ts
export type SessionUser = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;
declare module '@fastify/jwt' { interface FastifyJWT { user: SessionUser } }
```

`request.user` **é** o `USER_PUBLIC_SELECT`. Pôr permissão lá significa embarcar o JSON de
permissões de todos os grupos da pessoa em cada posse, cada ocupação e cada `assignedTo` do
inventário — e a allowlist deixa de ser "o que pode sair de um usuário" para virar "e também o que
ele pode fazer", que não é dado de usuário nenhum.

E o lugar onde a leitura cabe é `carregarSessaoParaValidacao()`, a consulta que roda **em toda
requisição autenticada** — a mais quente do sistema. Um `effective-permissions.usecase.ts` chamado
à parte dobra as idas ao banco por requisição, que é o mesmo erro que aquele arquivo já documenta
ter evitado com o `tokenVersion`.

A forma que o código já ensina: **ler junto, usar, descartar** — `include` dos grupos na mesma
consulta, reduzido a um `Set<string>` e pendurado fora do `request.user` (D136).

#### 🔴 3 — `requirePermission` por rota reintroduz exatamente o furo que a F3 fechou

O `require-auth.ts` é explícito sobre por que a sessão **não** é por rota:

> POR QUE UM HOOK GLOBAL, E NÃO UM `preHandler` POR ROTA: com a proteção por rota, a rota nova
> nasce ABERTA — e esquecer de protegê-la não gera erro nenhum, só uma API pública que ninguém
> notou.

O plano mandava fazer por rota. São **177 rotas em 23 maestros**, e a 178ª nasceria sem permissão
nenhuma, respondendo a qualquer sessão. Nada falha, nada loga. É o mesmo silêncio que o D76 já teme
pelo outro lado — *"chave digitada errada em `permissions` não dá erro nenhum, só nega em
silêncio"*. O catálogo em código resolve o typo; só uma conferência **no boot** resolve a rota
esquecida.

Agrava: `catalog.maestro.ts` tem 5 rotas que servem **nove** cadastros por spec (o D75 põe
`Department` como a décima). Permissão por rota ali concede ou nega os dez de uma vez. E
`stock.maestro.ts` tem 32 rotas numa fatia só.

A saída, no idioma do projeto — `ROTAS_PUBLICAS` já é uma allowlist central com `motivo` escrito ao
lado de cada linha: **um mapa `método + caminho → chave`, conferido contra a tabela de rotas do
Fastify no boot**, e o boot cai com a lista do que não foi declarado (D137).

#### 🟠 4 — O D77 não se aplica literalmente: o código já tem três respostas certas, e elas são diferentes

O D77 diz *"dado sensível é omitido do `select`, nunca mascarado depois"*. Os três dados sensíveis
que existem já eram tratados — de três formas, cada uma certa pelo próprio motivo:

| Dado | Como é | O que a F11 acrescenta |
|---|---|---|
| `licenses.productKey` | **está** no `select` e **nunca** na resposta: a projeção faz `const { productKey, ...resto }`, devolve `hasProductKey` e máscara opcional, e revelar é **rota própria** com log (`reveal-product-key.usecase.ts`) | só a chave `licenses.viewKey` na rota de revelar e na opção de máscara. `licenseSelect(perms)` **não precisa existir** |
| `Asset.customFields` (JsonB, F9) | `mascararCampos()` troca todo valor com prefixo `enc:` pela máscara **depois** de ler | nada. **Não dá** para filtrar no `select`: é uma coluna só, com valor cifrado e comum lado a lado — foi por isso que o prefixo `enc:` viaja dentro do valor (D81, item 1) |
| `Asset.purchaseCost` | coluna no `ASSET_SELECT`, sem filtro nenhum | aqui o D77 vale — e custa |

Ou seja: o D77 é regra **de coluna**. Em JsonB ele é impossível, e o `mascararCampos` não é
desleixo a corrigir — é a única resposta disponível. Escrever isso evita que alguém "conserte" a F9
em nome do D77 (D140).

E o custo em `purchaseCost` é maior do que `assetSelect(perms)` sugere: **50 chamadas em 20
arquivos**, e a maioria é escrita interna — `checkout-asset`, `close-assignment`, `retire-asset`,
`update-asset`, `restore-asset` — que não devolve custo a ninguém. Enfiar `perms` em todas é
espalhar sessão por use-case de escrita.

**A obrigação cruzada também é maior do que "a allowlist da F10".** Custo sai por:
`report-columns.ts` (token `purchaseCost` do builder), `responsibility-report.usecase.ts`
(`SUM(a."purchaseCost")`), `export-assets.usecase.ts` + `asset-export-columns.helper.ts`, e
`depreciation-report.usecase.ts` — este **inteiro**: `custoTotal`, `custoDepreciavel`, valor
contábil por linha. Filtrar uma coluna num relatório que só existe para falar de dinheiro não quer
dizer nada: **a rota toda exige `assets.viewCost`** (D138).

#### 🟠 5 — `issue-acceptance` já responde "quem responde pelo espaço" — e responde pior

O plano abria dizendo que `Location.managerId` estava "no schema desde a F1 **sem nenhum uso**".
Não estava. Ele é lido em quatro lugares, e um deles é regra de negócio viva:

```ts
// acceptance/use-cases/issue-acceptance.usecase.ts — D27
select: { name: true, manager: { select: { id: true, name: true, email: true } } },
...
if (!local.manager) throw ...   // 409
```

O termo de entrega de um ativo com alvo `LOCATION` vai para o **gestor da localidade** (D27) — que
é exatamente a pergunta *"quem responde pelo espaço?"* da tabela da fronteira, já implementada. Só
que ele **não sobe a árvore**: lê o `managerId` da folha e, se for nulo, 409. Entregar à "Mesa 1"
sem gestor próprio, dentro de um "Andar 2" que tem gestor, era 409 — e seria resolvido pelo
`resolverEscalonamento()`.

Então a etapa da fronteira não inventa um uso para a coluna: ela **generaliza o uso que existe**.
Se nascesse sem tocar no aceite, a fase entregaria duas respostas para a mesma pergunta — e a do
aceite é a que recusa casos que a outra aceita (D139).

Nota de precisão, porque o argumento do plano enfraquece sem ela: o risco que ele descreve — *"a
primeira pessoa a implementar «o gestor também responde» vai fazê-lo por efeito colateral de duas
colunas existirem"* — continua real, mas o efeito colateral **já aconteceu uma vez**, no aceite, e
deu certo porque o D27 decidiu explicitamente. É o precedente a favor da etapa, não contra.

#### 🟠 6 — O token pessoal já tem casa, e ela é `auth/`, não `access/`

O plano criava `access/use-cases/issue-api-token` e `revoke-api-token`. Já existiam, em
`auth/use-cases/manage-api-tokens.usecase.ts`: `listAgentTokens`, `issueAgentToken`,
`revokeAgentToken` — com `API_TOKEN_SELECT` que nunca deixa o `tokenHash` sair, `ActivityLog` com
prefixo e nunca segredo, e `revokedAt` em vez de `DELETE`. Estavam amarrados a `ownerType: 'AGENT'`
por literal, não por desenho.

E a autenticação já estava pronta para os dois: `authenticateApiToken(token, ownerType)` **recebe o
dono por parâmetro** e diz, no comentário, que "servirá o token pessoal da F11 sem mudar".

Criar o par em `access/` é dar duas casas à operação mais sensível do sistema — a forma que o D80
recusou para a tabela, reaparecendo na camada de cima. Generalizar as três funções por `ownerType`
é meia tarde. E `src/pages/tokens/` já existe (tokens de agente): a tela pessoal é aba ali, não
página nova.

Um detalhe que o plano apresentava como novo e é mudança de código existente: `lastUsedAt` já é
carimbado **a cada autenticação**, fora do caminho de resposta (`void …update().catch()`). A
estrangulada de um minuto que o plano pede não compra latência — ela já não está no caminho —, ela
compra **volume de escrita**. Vale, mas pelo motivo certo.

#### 🟠 7 — `api_tokens.userId` não tem chave estrangeira

A migration do D80 cria a coluna, o CHECK de coerência e o índice parcial. **Não** cria
`REFERENCES users(id)`, e o schema não declara relação — `userId String? @db.Uuid`, solto;
`User` não tem `apiTokens`. Consequências:

- um token pessoal pode apontar para um usuário que não existe. O CHECK só exige `NOT NULL`;
- o passo do desligamento que revoga tokens funciona (`updateMany({ where: { ownerType: 'USER',
  userId } })`), mas por convenção, não por integridade;
- `Restrict`/`Cascade` não ajudam a proteger nada aqui, e `createdById` está na mesma situação.

É acréscimo aditivo e barato (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … ON DELETE SET NULL`,
mais a relação no schema), e tem que entrar **antes** da tela pessoal — depois, com linhas dentro, é
uma validação a mais (D142).

#### 🟠 8 — A seção de Verificação chamava três rotas que não existem

```
POST /api/users/$LAURA/terminate          # o D82 matou o `terminate`. É /offboard
GET  /api/assets/$MOUSE/responsaveis      # não existe
GET  /api/assets/$PARADO/escalonamento    # não existe
```

A Camada 3 não tem rota própria: ela viaja **dentro** do ativo (`find-asset-by-id.usecase.ts`) e da
listagem (`list-assets.usecase.ts`). E já tem **três** leitores — o resolvedor em memória, a view
`vw_asset_responsibles` (F10) e o `ehPostoVago()` dos postos. O D130 é o precedente que proíbe a
quarta versão da mesma resposta: o escalonamento é pergunta **diferente** (o D73 está certo), mas
precisa nascer com **uma** implementação e com o aceite chamando ela (defeito 5), senão a fase fecha
com duas.

Onde ele sai, então: no mesmo payload do ativo onde `postoVago` já sai, e não numa rota irmã —
quem pergunta "para quem eu ligo?" está olhando a ficha que acabou de dizer "posto vago".

#### 🟡 9 — Revogar sessão não é mecanismo novo: é uma coluna

O passo "revoga `ApiToken`s e sessões" descreve algo que já existe desde a F3: `tokenVersion++`
invalida todo JWT emitido antes, sem tabela de sessão e sem lista de revogação — está documentado
no schema e provado em `tests/invariantes/sessao.test.ts`. No desligamento é **uma linha dentro da
transação que já existe**. Escrito aqui porque quem ler "revogar sessões" do zero constrói tabela
de sessão.

#### 🟡 10 — `AuthEventType` precisa crescer, e enum é migração

A trilha de autenticação tem seis valores e nenhum distingue **como** a pessoa entrou. Com OIDC,
"quem entrou pelo login corporativo" é a primeira pergunta de qualquer auditoria, e `LOGIN_OK` não
responde. A fase precisa de pelo menos: entrada por OIDC, falha de segundo fator, e o
marcar-para-revisão do sync LDAP (que é fato de cadastro, não de login — pode ser `ActivityLog`).
Nenhuma etapa do plano mencionava isso, e acrescentar valor a enum é migração.

#### 🟡 11 — `isVip` e `isRemote` entram sem leitor

O plano os criava e nada os lia. Colunas sem regra são decoração até alguém inventar uma — e aí a
regra nasce sem decisão. Se entrarem, que entrem com o que leem: VIP como filtro de listagem e selo
na ficha, remoto como nota no termo de entrega (equipamento que não volta à mesa). Ou ficam para
quando houver a regra.

### O que o plano acertou, e merece ficar escrito

Estes pontos são o que a revisão **não** mexeu, e saber disso economiza a próxima.

- **O D74 inteiro.** "Desligar não é apagar" está certo, e a parte técnica está *verificada*: a
  extension de soft delete não escopa leitura aninhada, então nenhuma flag em `users` tira a pessoa
  da lista de ocupantes. O `offboard` da F4 nasceu desse raciocínio e a Invariante 6 o fechou contra
  corrida.
- **O D73.** Duas funções, não um `else`. O argumento — *com o `else`, "ativo em posto vago" deixa
  de ser expressável* — é o mais forte do plano, e o `postoVago` do resolvedor mais o
  `?view=vagos` dos postos mais o alerta da F8 são três leitores que o `else` apagaria de uma vez.
- **O D76.** União sem `deny`, e o risco certo identificado (chave errada nega em silêncio).
- **O D78.** LDAP sincroniza, OIDC autentica, vínculo por `oid` e não por e-mail, sem JIT. O
  paralelo com o importador da F10 (*ausência de linha não encerra nada*) é exato, e aqui o estrago
  seria maior: desligar encerra ocupação e faz check-in de equipamento.
- **O D75 na parte do banco.** `add + backfill` numa migração, `drop` na seguinte, com revisão
  manual da lista no meio. O aviso de que `btrim` reduz e **não elimina** duplicata de caixa está
  certo e é o tipo de coisa que só se descobre depois do `DROP COLUMN`.
- **Os dois baldes do portal.** *"meu"* × *"do posto que eu ocupo"*, o segundo dizendo com quem é
  compartilhado. Não é layout: é o `../referencia/modelo-de-posse.md` aparecendo na tela de quem não leu nenhum doc.
- **O que o plano recusou.** `Department` como detentor de ativo (D72), `firstName`/`lastName`,
  bind de senha contra o AD, SAML, JIT, fila de requisição, permissão por localidade. As seis
  recusas continuam de pé, e a do `firstName`/`lastName` vale repetir: um campo que só existe para
  ser recomposto na exibição é duas fontes de verdade para o mesmo dado.

---

## As etapas

A ordem é a da revisão, e ela mudou. O plano original começava em `Department` porque é a etapa
mais fácil de descrever; mas ela é a **única** migração não aditiva do projeto e toca 19 arquivos
de contrato, e a infraestrutura de permissão decide onde a permissão mora — o que `Department`,
`Group` e o resto vão ter que respeitar. Então a permissão vem primeiro, no menor pedaço que já
prova o desenho.

### Etapa A — Onde a permissão mora, com uma chave só · **M**

Nasce `server/domain/access/`, e nada de tela ainda:

- `helpers/permission-catalog.ts` — a allowlist de chaves, em código, `as const`;
- `helpers/route-permissions.ts` — o mapa `método + caminho → chave`, com `motivo` ao lado de cada
  dispensa, no molde do `ROTAS_PUBLICAS`;
- `helpers/require-permission.ts` — o `preHandler`;
- a conferência **no boot** contra `server.printRoutes()`: rota registrada sem entrada no mapa
  **derruba o boot**, com a lista (D137);
- `access/use-cases/effective-permissions.usecase.ts`, chamado de **dentro** de
  `carregarSessaoParaValidacao()` — uma consulta, não duas (D136);
- `request.permissions` como `Set<string>`, **fora** do `request.user`, com o `declare module` que
  lhe dá tipo.

Nesta etapa só **uma** chave existe de verdade: `access.manage`. Todo o resto do mapa aponta para
ela ou para a dispensa explícita. É o que faz os 177 pontos serem declarados **antes** de haver
grupo para conceder — e é o inverso da ordem do plano, de propósito: declarar depois é declarar com
o sistema no ar negando em silêncio.

### Etapa B — `Group`, união de permissões e o administrador que não se perde · **M**

- **Schema:** `Group` (`name @unique`, `permissions Json @db.JsonB`), N:M implícita com `User`.
- **Nasce:** aba Grupos (a tela se chama **grupos**, pelo que lista), o seed do grupo
  `Administrador` ao lado do seed do administrador que já existe em `prisma/seed.ts`, e o comando de
  linha de escape.
- **Regra:** permissão efetiva é a **união** das permissões dos grupos da pessoa. Não existe `deny`
  (D76). Remover o último portador de `access.manage` é 409 — e a verificação de que toda chave
  gravada existe no catálogo roda no teste, não só no boot. O escape de um administrador trancado
  fora é **comando de linha**, não exceção na regra.

As chaves restantes do catálogo entram aqui, agora com quem as conceda:
`assets.view|create|edit|delete|checkout`, `assets.viewCost`, `licenses.viewKey`,
`endpoints.command`, `reports.export`, `backup.download`, `access.manage`.

### Etapa C — Dado sensível, nas três formas que ele tem · **M**

Não é `assetSelect(perms)` em 50 lugares (defeito 4):

- `assets.viewCost` entra **nos leitores**: `list-assets`, `find-asset-by-id`, `export-assets` +
  `asset-export-columns`, o token `purchaseCost` do `report-columns.ts`, e o `SUM` do
  `responsibility-report`. `ASSET_SELECT` continua servindo as escritas internas;
- `/api/reports/depreciacao` exige `assets.viewCost` **na rota** — o relatório é sobre dinheiro do
  começo ao fim (D138);
- `licenses.viewKey` entra na rota de revelar e na opção de máscara. Nada mais;
- `Asset.customFields` **não muda**, e o porquê vai escrito no `custom-field-value.helper.ts`: em
  JsonB, mascarar depois é a única forma, e isso não é exceção ao D77 — é o limite dele (D140).

`purchaseCost` sem `assets.viewCost` **não é lido do banco**: mascarar na resposta deixa o valor
passar por log, por erro e por qualquer serialização no caminho.

### Etapa D — `Department` como entidade, e o contrato antes do banco · **M**

- **Schema:** `Department` (`name @unique`, `code?`, `managerId? → User` com `SetNull`),
  `User.departmentId String? @db.Uuid` (`Restrict`), `User.department String?` continua por ora.
- **Nasce:** `catalog/specs/department.spec.ts` — a décima spec, nenhuma rota à mão (D75) —, a aba
  em `/configuracoes`, e `USER_LIST_SELECT` (D135).
- **Regra:** a troca é em **duas migrações**, não uma. O backfill vai na **mesma transação** da
  criação, e o SQL é escrito **à mão dentro do arquivo gerado** pelo `migrate diff` — a receita do
  `../referencia/arquitetura.md` não gera `INSERT`/`UPDATE`.

```sql
-- migração N: cria, acrescenta a FK nullable e faz o backfill NA MESMA transação
INSERT INTO departments (id, name, "createdAt", "updatedAt")
SELECT gen_random_uuid(), btrim(department), now(), now()
  FROM users WHERE department IS NOT NULL AND btrim(department) <> ''
 GROUP BY btrim(department);
UPDATE users u SET "departmentId" = d.id FROM departments d WHERE d.name = btrim(u.department);
-- migração N+1, depois do deploy validado:  (é a Etapa J)
ALTER TABLE users DROP COLUMN department;
```

Duas migrações porque um rollback entre elas ainda encontra o texto original. E `GROUP BY` sobre
texto livre traz `Comercial`, `comercial ` e `COMERCIAL` como três departamentos: `btrim` reduz,
**não elimina** — a lista precisa ser revisada à mão antes da N+1.

- **E o que o plano não listava:** o importador da F10 passa a resolver nome → id (e **não** cria
  departamento novo em silêncio — é a mesma recusa do D132 para e-mail ambíguo); `USER_SORTABLE`,
  `user-filters`, `CAMPOS_AUDITADOS`, os 4 arquivos de front e os 4 de teste mudam **aqui**, não no
  `DROP COLUMN` (D135).

### Etapa E — Identidade e ciclo de vida do colaborador · **M**

- **Schema:** `employeeNumber?` (único por índice **parcial**, `WHERE deleted_at IS NULL`, como
  `email` e `username`), `jobTitle?`, `phone?`, `address?`, `hiredAt?`, `managerId?` (auto-relação,
  `SetNull`). `isActive` e `terminatedAt` **já existem**. `isVip`/`isRemote` só com leitor
  (defeito 11).
- **Cresce:** `src/pages/gestao-usuario/detalhe/` (perfil, liderados, posses, postos).
- **Nasce:** `GET /api/users/:id/reports` (liderados).
- **Regra:** `terminatedAt` e `deletedAt` são **coisas diferentes** e nunca se substituem (D74).

**`firstName`/`lastName` não nascem:** `name` já é o campo canônico, dividi-lo exige um backfill que
adivinha onde termina o nome em *"Maria da Silva Souza"*, e um campo que só existe para ser
recomposto na exibição é duas fontes de verdade para o mesmo dado. De LDAP/OIDC o que importa
guardar é `employeeNumber` e `jobTitle`.

### Etapa F — `resolverEscalonamento()`, e o aceite passando a chamá-lo · **M**

- **Schema:** nada muda. Esta etapa é **código que recusa**, não coluna.
- **Nasce:** `assignment/use-cases/resolver-escalonamento.usecase.ts`, subindo a árvore de
  `Location` até achar `managerId`, com o mesmo teto de 32 níveis do `location-cycle.helper.ts` e
  pelo mesmo motivo (o banco aceita ciclo, provado na F1); a seção de fronteira no
  `../referencia/modelo-de-posse.md`; o bloco "Responsáveis × escalonamento" na aba Posse da F2.
- **Cresce:** `issue-acceptance.usecase.ts` passa a chamá-lo em vez de ler `location.manager` da
  folha — o 409 do D27 só dispara quando **nenhum** ancestral tem gestor (D139).
- **Regra:** `resolverResponsaveis()` **não muda** — ganha uma função irmã, não um `else` (D73). O
  escalonamento sai no payload do ativo, ao lado do `postoVago` que o motiva — não em rota irmã
  (defeito 8).

| Pergunta | Quem responde | Onde vive |
|---|---|---|
| Quem **responde** por este ativo? | a posse aberta → pessoa, ou os ocupantes do posto | `resolverResponsaveis()` (D16) |
| Quem **cobra** a pessoa? | `User.managerId` | hierarquia de gente |
| Quem responde pelo **espaço**, e pelo posto **sem ocupante**? | `Location.managerId`, subindo a árvore até achar um | `resolverEscalonamento()` |
| A quem **pertence o custo**? | `Department` | relatório e rateio |

**A regra em caso de conflito, em uma linha:** *o posto responde pelo ativo; a pessoa responde pelo
posto; o gestor da localidade responde pelo posto vazio — e nunca pelo posto ocupado.* Gestor de
pessoa e departamento **nunca** entram na resposta sobre um ativo. Isto é contribuição desta fase
ao modelo: o `../referencia/modelo-de-posse.md` deixava o *posto vago* como sinal operacional **sem ninguém para
ligar**, e `resolverEscalonamento()` dá um nome ao telefone sem contaminar a resolução de
responsabilidade, que continua exata.

### Etapa G — O desligamento ganha os dois passos que faltam · **P**

> ⚠️ **Reconciliado — ver [`../decisoes/README.md`](../decisoes/README.md), D82.** Esta
> etapa **não cria** rota nem use-case: ela ESTENDE o `offboard` da F4. Duas rotas para a mesma
> operação divergem, e a que divergir esquece o passo 3 — o único que não dá erro quando falta.

Menor etapa da fase, e o plano a chamava de **M** por descrever cinco passos que já existem
(defeito 5 e caducidades 4 e 5). A ordem completa é **uma transação, seis passos**; os passos 2, 3,
4 e 6 já estavam implementados na F4, e esta etapa acrescenta o 1 e o 5:

1. **recusa (409)** se a pessoa é gestora de gente (`User.managerId`) ou de localidade
   (`Location.managerId`) e o corpo não traz `substitutoId`; com ele, reatribui antes de seguir.
   Localidade sem gestor é o buraco do escalonamento da Etapa F;
2. `checkin-all` das assignments abertas com alvo `USER` (F4);
3. **`endedAt` em toda `LocationOccupant` aberta da pessoa**;
4. `terminatedAt`, `isActive = false` — **e nunca `deletedAt`** (D74);
5. **revogar `ApiToken`s e sessões** — `updateMany` de `revokedAt` nos tokens `USER` da pessoa, e
   `tokenVersion: { increment: 1 }` na mesma `update` que já grava `terminatedAt` (defeito 9);
6. `ActivityLog` de cada passo, na mesma transação.

Mais a **FK de `api_tokens.userId`**, que entra aqui porque o passo 5 é o primeiro a depender dela
(defeito 7, D142). E o modal ganha a lista do que vai acontecer e o campo do substituto.

**Por que o passo 3 é o que tem dentes.** A responsabilidade é derivada (D16): ela lê
`location_occupants` e junta o usuário — e a extension de soft delete **não alcança leitura de
relação aninhada** (verificado na F1, escrito no D8). Marcar a pessoa como inativa, ou até
mandá-la para a lixeira, **não a tira da lista de responsáveis da Mesa 1**; só encerrar a ocupação
tira. Um desligamento que esquece o passo 3 produz um sistema que afirma, com o banco de
testemunha, que alguém que saiu há seis meses responde por doze equipamentos. Por isso
`DELETE /api/users/:id` responde **409** também com ocupação aberta: o `Restrict` de
`LocationOccupant.userId` barra o delete **físico**, mas soft delete é `UPDATE` e passa direto.

### Etapa H — `ApiToken` pessoal e 2FA TOTP · **G**

> ⚠️ **Reconciliado — ver [`../decisoes/README.md`](../decisoes/README.md), D80.** O
> `ApiToken` **já existe** desde a F3, com dono polimórfico. Esta etapa não cria tabela: ela
> generaliza o caminho `ownerType = USER`.

- **Schema:** `User.totpSecret?` (cifrado, com AAD `users:totpSecret:<id>` — D81, item 3) e
  `totpRecoveryCodes String[]` (hasheados, uso único). Nada de tabela nova (D80).
- **Cresce:** `auth/use-cases/manage-api-tokens.usecase.ts`, generalizado por `ownerType`
  (defeito 6); `src/pages/tokens/` ganha a aba pessoal.
- **Nasce:** `enroll-totp`, `verify-totp`; os valores novos de `AuthEventType` (defeito 10); o
  comando de linha que destrava o administrador sem 2FA.
- **Regra:** janela de ±1 passo (relógio de celular não é exato), códigos de recuperação de uso
  único em hash, e o destravamento é **comando de linha, nunca rota** — uma rota de bypass é a porta
  que o 2FA veio fechar. `lastUsedAt` atualiza no máximo uma vez por minuto: a escrita já está fora
  do caminho de resposta, o que a estrangulada compra é volume.
- `totpSecret` e `totpRecoveryCodes` ficam fora do `USER_PUBLIC_SELECT`, e
  `tests/invariantes/sessao.test.ts` é onde isso se prova.

### Etapa I — LDAP, OIDC e o portal · **G**

- **Instalar:** `ldapts`, `openid-client` (só eles).
- **Schema:** `User.externalId?` (o `oid` do Entra) e `authSource` (`LOCAL`, `LDAP`, `OIDC`).
- **Nasce:** `access/jobs/ldap-sync.job.ts` — com `claimWindow('sync-ldap')`, a linha própria em
  `JobRun` que o D79 já deixou pronta —, `use-cases/oidc-callback.usecase.ts`, e a página do portal.
- **Regra:** **LDAP sincroniza cadastro; quem autentica é o login local ou o OIDC** (D78). Sumir do
  diretório **marca para revisão**, nunca desliga. `state` e `nonce` obrigatórios e validados.
  E-mail que já existe com `authSource = LOCAL` exige vínculo explícito, nunca fusão automática.
- **A página se chama `src/pages/meus-equipamentos/`**, não `portal/`: a tela leva o nome do que
  lista (D141). Dois baldes — *"meu"* (assignments alvo `USER`) e *"do posto que eu ocupo"* —, o
  segundo dizendo com todas as letras que é compartilhado e com quem (*"Mesa 1 · também com Ana ·
  turno Tarde"*). Sem a distinção, a pessoa devolve o monitor da sala achando que era dela.
- **Solicitar item fica de fora** — a fila de requisição está em *Descartado de propósito* no TODO,
  e esta fase não a reabre; `requestable` continua no schema.

É a mesma regra do importador da F10 (*ausência de linha não encerra nada*), pelo mesmo motivo: um
filtro de busca com um typo "desliga" a empresa inteira, e aqui desligar encerra ocupações e faz
check-in de equipamento.

### Etapa J — `DROP COLUMN users.department` · **P**

Depois de a lista de departamentos ser revisada à mão. Com a Etapa D tendo movido o contrato, aqui
não sobra código para mudar — é o objetivo de ter feito naquela ordem.

---

## Decisões da fase

> As decisões desta fase moram em [`../decisoes/acesso.md`](../decisoes/acesso.md) — **D72–D78 e D135–D142**. Elas saíram daqui porque decisão se arquiva pelo ASSUNTO que governa, não pela fase que a tomou: quem precisa saber as regras de um assunto não deveria ter que descobrir em que fase ele nasceu.

O índice das 142 está em [`../decisoes/README.md`](../decisoes/README.md).

## Riscos e armadilhas

**A pessoa desligada continua responsável até a ocupação ser encerrada.** É o risco central da
fase, está no D74, e a verificação abaixo o testa explicitamente. Nenhuma flag em `users`
substitui o `endedAt`.

**`Restrict` protege o delete físico e ignora o soft delete.** `LocationOccupant.userId` e
`Assignment.targetUserId` são `Restrict` — o banco recusa `DELETE`, mas o soft delete é um
`UPDATE`. A checagem de 409 na aplicação é obrigatória, não redundante.

**Permissão no `preHandler` não cobre quem roda sem requisição.** O importador da F10 e os jobs da
F8 não têm `request.user`: o import roda com as permissões de quem o disparou (`Import.actorId`), e
job não tem permissão nenhuma — por isso **não exporta e não revela**.

**Rota nova nasce negada, não liberada.** É o D137, e é a diferença entre esta fase e o que o plano
mandava fazer: a conferência no boot é o que transforma "esquecemos de proteger" em um servidor que
não sobe.

**O backfill de departamento mente com elegância.** `GROUP BY btrim(department)` ainda separa
`Comercial` de `COMERCIAL`. Revisar a lista antes da Etapa J: depois do `DROP COLUMN` o texto
original não existe mais para conferência.

**Último administrador e administrador trancado fora.** Remover o último `access.manage` é 409; um
2FA perdido se resolve por comando de linha. As duas saídas precisam existir **antes** de a fase ir
para produção, senão a recuperação vira restauração de backup. E, como a migração do `Department`
**não é aditiva**, reconstruir o banco do zero num descartável (receita do `../referencia/arquitetura.md`) deixou
de ser zelo: é a única prova de que a cadeia inteira ainda sobe com o backfill no meio dela.

**OIDC sem `state` e `nonce` é CSRF de login.** Os dois são obrigatórios e validados no callback;
o `oid` do token é o que casa a pessoa, e um `email` que já existe com `authSource = LOCAL` exige
vínculo explícito, nunca fusão automática.

---

## Verificação

A fase tem suíte (caducidade 2). Os `curl` do plano original viraram isto:

**`tests/invariantes/permissao.test.ts`**
- toda chave usada em `route-permissions.ts` existe no `permission-catalog.ts`;
- toda rota registrada no Fastify tem entrada no mapa — o mesmo que o boot confere, provado sem
  subir o servidor em produção;
- toda chave gravada em `groups.permissions` existe no catálogo;
- remover o último portador de `access.manage` é 409.

**`tests/invariantes/dado-sensivel.test.ts`**
- sessão sem `assets.viewCost` recebe ativo **sem a propriedade** `purchaseCost` (`has()`, não
  `=== null`);
- a mesma sessão recebe 403 em `/api/reports/depreciacao` e CSV sem a coluna;
- sessão sem `licenses.viewKey` recebe 403 na rota de revelar;
- `totpSecret` e `totpRecoveryCodes` não saem por nenhuma rota que devolva usuário — extensão do
  que `sessao.test.ts` já prova para `passwordHash`.

**`tests/invariantes/posse.test.ts`** e **`tests/corridas/posse.test.ts`** (crescem — é onde o `offboard` já é testado)
- desligar a Laura, que ocupa a Mesa 1 com a Ana: o mouse da Mesa 1 continua com a **Ana**, e
  nenhuma `Assignment` foi tocada;
- desligar quem gere localidade sem `substitutoId` é 409; com ele, a localidade fica com gestor;
- os `ApiToken` `USER` da pessoa ficam `revokedAt`, e o `tokenVersion` subiu;
- **a consulta do D74 fecha em zero**: ninguém com `terminatedAt`/`deletedAt` é ocupante aberto.

**`tests/listagens/escalonamento.test.ts`**
- posto sem ocupante: `responsaveis: []` **e** escalonamento preenchido pelo gestor do ancestral;
- árvore sem gestor em ancestral nenhum: escalonamento nulo, e isso não é erro;
- ciclo na árvore não enforca a subida (teto de 32);
- o aceite de alvo `LOCATION` numa folha sem gestor, com gestor no pai, **emite** o termo (D139).

**`tests/importacao/`** (cresce) — importar pessoa com departamento resolve por nome, e nome
desconhecido é linha ignorada com motivo, não departamento criado em silêncio.

As duas consultas que valem como conferência de borda:

```sql
-- D74: ninguém desligado aparece como ocupante aberto de posto nenhum
SELECT u.name FROM location_occupants o JOIN users u ON u.id = o."userId"
 WHERE o."endedAt" IS NULL AND (u."terminatedAt" IS NOT NULL OR u."deletedAt" IS NOT NULL);  -- 0

-- D73: localidade sem gestor em nenhum ancestral — são os buracos do escalonamento
WITH RECURSIVE sobe AS (
  SELECT id, "parentId", "managerId", id AS origem FROM locations
  UNION ALL SELECT l.id, l."parentId", l."managerId", s.origem
              FROM locations l JOIN sobe s ON l.id = s."parentId"
) SELECT origem FROM sobe GROUP BY origem HAVING bool_and("managerId" IS NULL);

-- D75: o backfill fechou — ninguém ficou com texto e sem FK
SELECT count(*) FROM users WHERE department IS NOT NULL AND "departmentId" IS NULL;           -- 0
```

**Duas provas que não são comando:** entrar no portal como uma pessoa que ocupa posto compartilhado
e conferir que a tela diz *com quem* o equipamento é dividido; e desativar um usuário no diretório
LDAP, rodando o sync, para confirmar que ele foi **marcado para revisão** e não desligado.

E a prova que a Etapa D exige por não ser aditiva: **reconstruir o banco do zero num descartável**,
com o backfill no meio da cadeia. É a receita do `../referencia/arquitetura.md`, e aqui ela deixou de ser zelo.

---

## Perguntas em aberto

- **`isVip` e `isRemote` entram nesta fase?** Só com leitor (defeito 11). A resposta é do produto,
  não da arquitetura.
- **A estrangulada de `lastUsedAt` vale o `updateMany` condicional?** A escrita já está fora do
  caminho de resposta; o ganho é volume. Medir antes com a frota real.
- **O `vw_asset_responsibles` passa a filtrar por permissão?** Hoje ela alimenta relatório que soma
  `purchaseCost`. O D138 resolve a rota; a view continua exata, e quem a lê é que filtra. Se um dia
  houver permissão por localidade, a resposta muda — e é o escopo de linha que o **D4** recusou.
- **Termo de aceite em posse de posto — JÁ DECIDIDO na F4, não reabrir aqui.** Este plano chegou a
  propor que `Category.requireAcceptance = true` **bloqueasse** o checkout para `LOCATION`, pelo
  argumento de que pedir assinatura a N ocupantes gera N termos e nenhum responsável. A
  [`fase-04-posse.md`](fase-04-posse.md) (**D27**) resolveu antes e melhor: o termo vai
  para o **gestor da localidade** (`Location.managerId`), **um** termo e não N, com ciência por
  e-mail aos ocupantes; sem gestor cadastrado, 409 que ensina. Bloquear seria pior — tornaria
  inentregável a um posto justamente a categoria que mais exige controle. A amarra que mantém o
  modelo íntegro nas duas pontas: **assinar não torna o gestor responsável resolvido**.
  `resolverResponsaveis()` continua devolvendo só os ocupantes, e o `resolverEscalonamento()` desta
  fase continua separado dele (D73, D139).
- **Permissão por localidade ou por departamento** (ver só os ativos da sua filial) não entra aqui:
  é escopo de linha, o custo que o **D4** recusou ao descartar multi-empresa. Se voltar, é decisão
  nova.

---

## Ordem de execução

```
A: feat: onde a permissão mora, com conferência no boot
B: feat: Group, união de permissões e o grupo Administrador
C: feat: dado sensível por permissão, nas três formas que ele tem
D: feat: Department como entidade, com backfill (migração 1 de 2)
E: feat: identidade e ciclo de vida do colaborador
F: feat: resolverEscalonamento e a fronteira posto x gestor x departamento
G: feat: desligamento com guarda de substituto e revogação de acesso
H: feat: ApiToken pessoal e 2FA TOTP
I: feat: sync LDAP, login OIDC e a tela de meus equipamentos
J: chore: DROP COLUMN users.department (migração 2 de 2)
```

Sem escopo no `feat`, corpo em bullets curtos — a convenção do projeto, não a do plano original
(caducidade 8). O commit **J** só entra depois da revisão manual da lista de departamentos. `npm run
lint` e `npm test` passam em cada um.

**A dependência que define a ordem:** A antes de tudo porque os 177 pontos precisam ser declarados
antes de existir grupo que conceda — declarar depois é declarar com o sistema negando em silêncio.
D antes de E porque `departmentId` e `managerId` cabem numa migração de `users` só. F antes de G
porque a guarda do substituto existe para não deixar localidade sem gestor, e é o escalonamento que
dá sentido a isso. J por último, sozinho, por ser irreversível.

---

# Fechamento da F11

> Escrito depois de executar, e contra a árvore: as dez etapas (A–J) estão aplicadas.
> `npm run lint` limpo, `npm test` com **874 testes em 76 arquivos**, e a cadeia de
> migrações aplicada **do zero** num banco descartável com o seed por cima — que
> nesta fase não é zelo: é a exigência da única migração não aditiva do projeto.

## O que cada etapa entregou

| Etapa | Entregue |
|---|---|
| **A** | `access/` nasce: catálogo de **35 chaves** em código, o mapa `método + rota → chave`, o `preHandler` e a conferência de cobertura no boot (D137). `request.permissions` como `Set`, FORA de `request.user` (D136) |
| **B** | `Group` com permissões em JsonB, união permissiva sem `deny` (D76), aba Grupos, seed do grupo de sistema e o 409 de "nunca sem administrador" |
| **C** | Dado sensível em **três mecanismos**: custo sai do `select`, chave e campo cifrado têm rota de revelar, e a depreciação exige a chave na rota inteira (D77, D138, D140) |
| **D** | `Department` como entidade + a décima spec de catálogo, com backfill na mesma transação (migração 1 de 2) |
| **E** | Identidade (`employeeNumber`, `jobTitle`, `phone`, `address`, `hiredAt`, `managerId`) e `GET /api/users/:id/reports` |
| **F** | `resolverEscalonamento()`, o aceite passando a usá-lo (D139), a seção *A fronteira* no `../referencia/modelo-de-posse.md` e o bloco na aba Posse |
| **G** | Desligamento com guarda de substituto e revogação de acesso (tokens + `tokenVersion`) |
| **H** | Segundo fator TOTP e token pessoal de API, mais as duas linhas de escape em `*/cli/` |
| **I** | Sincronização LDAP, login OIDC e `/meus-equipamentos` |
| **J** | `DROP COLUMN users.department` (migração 2 de 2), e a relação volta a se chamar `department` |

## As cinco coisas que a execução decidiu, e o plano não tinha decidido

**1. O login do segundo fator é um passo da MESMA tela, e a senha é reenviada.**
A alternativa é um estado intermediário no servidor — uma meia-sessão com validade,
lugar para morar e um token próprio para o cliente trazer de volta, ou seja, uma
segunda forma de sessão existir ao lado do cookie. O projeto tem uma. A senha ainda
está na memória do formulário de qualquer maneira: ela acabou de ser digitada nele.
O preço é `etapa: 'TOTP'` viajando no corpo do 401 — e foi ele que fez o
`ErroDaApi` do painel passar a preservar o corpo do erro, porque a alternativa era a
tela comparar a MENSAGEM por texto.

**2. O cadastro do TOTP tem estado no banco (`totpEnabledAt` nulo).** Sem ele, quem
fechasse a aba entre ler o QR e digitar o código ficaria com o autenticador
configurado contra um segredo que o sistema esqueceu. E o estado intermediário não
tranca ninguém: o login olha a DATA, nunca o segredo.

**3. O token pessoal não alcança rota de credencial.** Ele age como a pessoa — mesmas
chaves, mesmo `actorId` —, e é justamente por isso que não pode trocar senha, emitir
outro token nem mexer no 2FA. Um token que emite tokens é um token que não se revoga.
E o cabeçalho **ganha do cookie** quando os dois vêm juntos, senão um script rodando
de dentro do navegador autenticaria pela sessão do operador e o `lastUsedAt` nunca
andaria.

**4. Numa instalação híbrida, o SSO não sobrescreve o `externalId` do LDAP.** Foi um
ping-pong diário evitado: a sincronização ancora a pessoa pelo `guid:…`, e um login
OIDC que gravasse `oidc:…` por cima faria o job seguinte não encontrá-la pelo
identificador, re-vinculá-la por e-mail e gravar o `guid:` de volta — todo dia, para
sempre. O `externalId` só é gravado quando está vazio; o SSO daquela pessoa passa a
casar pelo e-mail, que a própria sincronização mantém em dia.

**5. O portal diz COM QUEM o posto é dividido.** Não estava no plano, e sem isso a
tela produz a devolução errada: "Mesa 1 · monitor LG" se lê como *o monitor é meu*.
Isso exigiu `coOcupantes` em `listUserHoldings`, que é o mesmo use-case da ficha do
colaborador — a Camada 3 não pode ter uma versão para o administrador e outra para o
colaborador.

## O que a fase consertou fora do próprio escopo

- **o 409 do termo de entrega** (F4): lia `Location.manager` da folha, e entregar
  para uma mesa sem gestor próprio dentro de um andar com gestor era recusado. Agora
  usa a mesma subida da fronteira (D139);
- **`api_tokens.userId` sem chave estrangeira** desde a F0 (D142). A migração apaga
  órfão antes de criar a FK — na prática, zero linhas; está ali para o banco que teve
  `psql`;
- **o nome do grupo de sistema** vivia como literal em `prisma/seed.ts` e outro na
  migração. Virou `GRUPO_ADMINISTRADOR`, no catálogo, com três leitores;
- **o item do CSV que a F9 adiou** (campos customizados no export e no import) — e o
  dry-run passou a validar o formato, senão um IP mal digitado na linha 300 só
  estouraria no `apply`.

## O que ficou de fora, com o motivo

| O que | Por quê |
|---|---|
| `isVip` / `isRemote` | coluna sem leitor é coluna que ninguém mantém (defeito 11 da revisão). Quando houver a tela, é migração aditiva de duas linhas |
| nome dividido (`firstName`/`lastName`) | `name` é o campo canônico; dividi-lo exige adivinhar onde termina o nome em "Maria da Silva Souza" |
| SAML | OIDC cobre o Entra ID. A segunda biblioteca seria um segundo caminho de login para manter |
| 2FA obrigatório por grupo | decisão nova: precisa de um lugar para morar e de uma resposta para quem entra hoje sem ter cadastrado |
| revogar UMA sessão | exige tabela de sessão. O `tokenVersion` derruba todas, e é o que o desligamento usa |
| anexo de licença (D94) | dono polimórfico em `Attachment`. É o único item em aberto do `../ROADMAP.md` |

## As duas provas que não são comando

Elas continuam valendo e **não** estão na suíte, porque exigem um diretório e um
provedor de identidade de verdade:

1. **entrar por SSO** com uma conta marcada como `OIDC` e conferir que a sessão nasce
   com as permissões dos grupos dela — e que uma conta `LOCAL` com o mesmo e-mail é
   recusada com 403 e `OIDC_DENIED` na trilha;
2. **desativar alguém no LDAP**, rodar o sync e confirmar que ela foi **marcada para
   revisão** na ficha, não desligada.

O que a suíte prova sobre esses dois caminhos é o comportamento do **desligado** — que
é o padrão de toda instalação que não os usa: as rotas de SSO não existem sem
configuração (404, não 500), a sincronização recusa com 409, e o vínculo explícito
exige `access.manage`.
