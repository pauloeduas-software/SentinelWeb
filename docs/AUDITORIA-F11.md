# Auditoria do plano da Fase 11 — e o plano de implementação

> O [`FASE-11-PLANO-ITAM.md`](./FASE-11-PLANO-ITAM.md) foi escrito contra um código que ainda não
> existia: ele fala de "quando a autenticação chegar", chama `otplib` de não instalado e diz que o
> projeto não tem suíte. A F3 até a F10 fecharam no meio disso. Esta auditoria confere o plano
> **linha por linha contra o código de hoje** (`e8094f1`), separa o que caducou do que está errado,
> e devolve o plano de implementação na ordem em que ele agora cabe.
>
> Convenções de camada: [`ARQUITETURA.md`](./ARQUITETURA.md). Contrato de posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md), [`DECISOES-POSSE.md`](./DECISOES-POSSE.md),
> [`INVARIANTES.md`](./INVARIANTES.md). Conflitos entre planos:
> [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões novas
> **D135–D142**, na numeração contínua (o maior em uso era o D134, da auditoria da F10).

---

## Como foi verificado

Não por leitura do plano. Por leitura do **código que o plano diz que vai nascer**:

| O que | Onde |
|---|---|
| `User` inteiro, e o que já existe dele | `prisma/schema.prisma:145`, `user/helpers/user-select.helper.ts` |
| O desligamento que a Etapa D "cria" | `user/use-cases/offboard-user.usecase.ts` (299 linhas, F4) |
| O 409 do `DELETE` que a Etapa D "acrescenta" | `user/use-cases/count-user-posse.usecase.ts`, `delete-user.usecase.ts` |
| O `ApiToken` que a Etapa F "não cria" | `prisma/migrations/20260923180000_api_token/`, `auth/use-cases/manage-api-tokens.usecase.ts` |
| Onde o `preHandler` da Etapa E iria | `core/http/require-auth.ts`, `server/app.ts:175`, 177 rotas em 23 maestros |
| O `Location.managerId` "sem nenhum uso" | `acceptance/use-cases/issue-acceptance.usecase.ts`, `catalog/specs/location.spec.ts` |
| O dado sensível da Etapa F | `asset/helpers/asset-select.helper.ts` (50 chamadas), `license/helpers/license-select.helper.ts` |
| A obrigação cruzada do D77 | `report/helpers/report-columns.ts`, `depreciation-report`, `responsibility-report`, `export-assets` |
| A suíte que o plano diz não existir | 66 arquivos em `tests/`, `tests/invariantes/`, `tests/corridas/` |

Contagens que vão importar adiante: **177 rotas** em 23 maestros; **50 chamadas** a `ASSET_SELECT`
em 20 arquivos; **19 arquivos** leem ou escrevem `User.department`, contando front, importador e
testes.

---

## 1. O que caducou — o plano fala de antes da F3

Nenhum destes é defeito do raciocínio: é o código tendo andado.

1. **`otplib` e `qrcode` já estão instalados** (`package.json`). Faltam `ldapts` e `openid-client`
   — só eles. E `APP_ENCRYPTION_KEY` existe, com `cipher.ts`, `keyring.ts` e canário no boot (D81).

2. **"Não há suíte: a verificação é a seção acima"** — há. `npm test` roda 66 arquivos contra
   Postgres real, pelo mesmo Fastify de produção, em dois projetos (`puro` para função pura).
   `tests/invariantes/` e `tests/corridas/` são o lugar certo das provas desta fase, e os `curl` da
   seção de Verificação do plano são rascunho de teste, não a verificação.

3. **`src/pages/gestao-usuario/detalhe/` já existe** — `index.tsx`, `hooks/useUserDetail.ts`,
   `components/HistoryPanel.tsx`, `components/OffboardModal.tsx`, `helpers/historico.helper.ts`. A
   Etapa B **cresce** a tela; não a cria.

4. **O 409 do `DELETE` com ocupação aberta já existe**, e com mais do que o plano pede: são
   **quatro** pontas contadas (ativo, acessório, assento de licença, posto), a frase do 409 nomeia
   cada uma, e a contagem roda **depois de `SELECT … FOR UPDATE`** na linha do usuário — a
   Invariante 6, que nasceu de um teste de corrida vermelho. O parágrafo final da Etapa D não tem
   trabalho dentro.

5. **O passo 4 da Etapa D (`terminatedAt`, `isActive`) já está escrito**, como a nota de estado do
   D82 avisa. O `offboard` de hoje faz **cinco** passos, não quatro: devolve ativos, acessórios
   (F5) e assentos de licença (F6), encerra ocupações e marca a saída — tudo em uma transação, com
   `ActivityLog` por passo.

6. **`LOGIN_DISABLED` e as colunas de desligamento já nasceram preparadas para esta fase.** O
   `login.usecase.ts` recusa `isActive = false` com frase própria e evento próprio; o
   `current-user.usecase.ts` relê com `isActive: true` a cada requisição. A Etapa B não precisa
   tocar em nada disso.

7. **A Etapa E cita o `ARQUITETURA.md` — e cita a parte que ficou velha.** O texto "o middleware vai
   por rota, dentro de cada maestro" está na seção *"O que ainda não existe"*, debaixo do item
   **Autenticação — F3**, que já fechou. A F3 escolheu o **oposto**, de propósito e com o motivo
   escrito (`require-auth.ts`). Ver o defeito 🔴 3.

8. **A ordem de commits usa escopo** (`feat(db):`, `feat(user):`). A convenção do projeto é
   `feat` ou `chore` **sem escopo**, com corpo em bullets curtos. Reescrita na seção 7.

---

## 2. Defeitos

### 🔴 1 — `department` está no `USER_PUBLIC_SELECT`, e ele viaja embutido em toda resposta

A Etapa A trata a troca como problema de banco — "duas migrações" — e resolve bem esse lado. O
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
| `USER_SORTABLE = ['name','email','department','createdAt']` | `?sort=department` passa a ordenar por coluna inexistente — **500 vindo de query string**, depois do commit H |
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
`USER_LIST_SELECT`. **É decisão da Etapa A, não da H** (D135).

### 🔴 2 — Permissão não tem onde morar na requisição, e o caminho mais quente do sistema paga a conta

A Etapa E dá a `require-permission.ts` o papel de `preHandler` e nunca diz **de onde ele lê as
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
requisição autenticada** — hoje a mais quente do sistema. Um `effective-permissions.usecase.ts`
chamado à parte dobra as idas ao banco por requisição, que é o mesmo erro que aquele arquivo já
documenta ter evitado com o `tokenVersion`.

A forma que o código já ensina: **ler junto, usar, descartar** — `include` dos grupos na mesma
consulta, reduzido a um `Set<string>` e pendurado fora do `request.user`. Ver D136.

### 🔴 3 — `requirePermission` por rota reintroduz exatamente o furo que a F3 fechou

O `require-auth.ts` é explícito sobre por que a sessão **não** é por rota:

> POR QUE UM HOOK GLOBAL, E NÃO UM `preHandler` POR ROTA: com a proteção por rota, a rota nova
> nasce ABERTA — e esquecer de protegê-la não gera erro nenhum, só uma API pública que ninguém
> notou.

A Etapa E manda fazer por rota. São **177 rotas em 23 maestros**, e a 178ª nasce sem permissão
nenhuma, respondendo a qualquer sessão. Nada falha, nada loga. É o mesmo silêncio que o D76 já teme
pelo outro lado — *"chave digitada errada em `permissions` não dá erro nenhum, só nega em
silêncio"*. O catálogo em código resolve o typo; só uma conferência **no boot** resolve a rota
esquecida.

Agrava: `catalog.maestro.ts` tem 5 rotas que servem **nove** cadastros por spec (D75 põe
`Department` como a décima). Permissão por rota ali concede ou nega os dez de uma vez. E
`stock.maestro.ts` tem 32 rotas numa fatia só.

A saída, no idioma do projeto — `ROTAS_PUBLICAS` já é uma allowlist central com `motivo` escrito ao
lado de cada linha: **um mapa `método + caminho → chave`, conferido contra a tabela de rotas do
Fastify no boot**, e o boot cai com a lista do que não foi declarado. Ver D137.

### 🟠 4 — O D77 não se aplica literalmente: o código já tem três respostas certas, e elas são diferentes

O D77 diz *"dado sensível é omitido do `select`, nunca mascarado depois"*. Os três dados sensíveis
que existem hoje já são tratados — de três formas, cada uma certa pelo próprio motivo:

| Dado | Como é hoje | O que a F11 acrescenta |
|---|---|---|
| `licenses.productKey` | **está** no `select` e **nunca** na resposta: a projeção faz `const { productKey, ...resto }`, devolve `hasProductKey` e máscara opcional, e revelar é **rota própria** com log (`reveal-product-key.usecase.ts`) | só a chave `licenses.viewKey` na rota de revelar e na opção de máscara. `licenseSelect(perms)` **não precisa existir** |
| `Asset.customFields` (JsonB, F9) | `mascararCampos()` troca todo valor com prefixo `enc:` pela máscara **depois** de ler | nada. **Não dá** para filtrar no `select`: é uma coluna só, com valor cifrado e comum lado a lado — foi por isso que o prefixo `enc:` viaja dentro do valor (D81, item 1) |
| `Asset.purchaseCost` | coluna no `ASSET_SELECT`, sem filtro nenhum | aqui o D77 vale — e custa |

Ou seja: o D77 é regra **de coluna**. Em JsonB ele é impossível, e o `mascararCampos` não é desleixo
a corrigir — é a única resposta disponível. Escrever isso agora evita que alguém "conserte" a F9 em
nome do D77.

E o custo em `purchaseCost` é maior do que `assetSelect(perms)` sugere: **50 chamadas em 20
arquivos**, e a maioria é escrita interna — `checkout-asset`, `close-assignment`, `retire-asset`,
`update-asset`, `restore-asset` — que não devolve custo a ninguém. Enfiar `perms` em todas é
espalhar sessão por use-case de escrita.

**A obrigação cruzada também é maior do que "a allowlist da F10".** Custo sai por:
`report-columns.ts` (token `purchaseCost` do builder), `responsibility-report.usecase.ts`
(`SUM(a."purchaseCost")`), `export-assets.usecase.ts` + `asset-export-columns.helper.ts`, e
`depreciation-report.usecase.ts` — este **inteiro**: `custoTotal`, `custoDepreciavel`, valor
contábil por linha. Filtrar uma coluna num relatório que só existe para falar de dinheiro não quer
dizer nada: **a rota toda exige `assets.viewCost`**. Ver D138.

### 🟠 5 — `issue-acceptance` já responde "quem responde pelo espaço" — e responde pior

O plano abre dizendo que `Location.managerId` está "no schema desde a F1 **sem nenhum uso**". Não
está. Ele é lido em quatro lugares, e um deles é regra de negócio viva:

```ts
// acceptance/use-cases/issue-acceptance.usecase.ts — D27
select: { name: true, manager: { select: { id: true, name: true, email: true } } },
...
if (!local.manager) throw ...   // 409
```

O termo de entrega de um ativo com alvo `LOCATION` vai para o **gestor da localidade** (D27) — que é
exatamente a pergunta *"quem responde pelo espaço?"* da tabela da Etapa C, já implementada. Só que
ele **não sobe a árvore**: lê o `managerId` da folha e, se for nulo, 409. Entregar à "Mesa 1" sem
gestor próprio, dentro de um "Andar 2" que tem gestor, é 409 hoje — e seria resolvido pelo
`resolverEscalonamento()` de amanhã.

Então a Etapa C não inventa um uso para a coluna: ela **generaliza o uso que existe**. Se nascer sem
tocar no aceite, a fase entrega duas respostas para a mesma pergunta — e a do aceite é a que recusa
casos que a outra aceita. Ver D139.

Nota de precisão, porque o argumento do plano enfraquece sem ela: o risco que a Etapa C descreve —
*"a primeira pessoa a implementar «o gestor também responde» vai fazê-lo por efeito colateral de
duas colunas existirem"* — continua real, mas o efeito colateral **já aconteceu uma vez**, no
aceite, e deu certo porque o D27 decidiu explicitamente. É o precedente a favor da etapa, não contra.

### 🟠 6 — O token pessoal já tem casa, e ela é `auth/`, não `access/`

A Etapa F cria `access/use-cases/issue-api-token` e `revoke-api-token`. Já existem, em
`auth/use-cases/manage-api-tokens.usecase.ts`: `listAgentTokens`, `issueAgentToken`,
`revokeAgentToken` — com `API_TOKEN_SELECT` que nunca deixa o `tokenHash` sair, `ActivityLog` com
prefixo e nunca segredo, e `revokedAt` em vez de `DELETE`. Estão amarrados a `ownerType: 'AGENT'`
por literal, não por desenho.

E a autenticação já está pronta para os dois: `authenticateApiToken(token, ownerType)` **recebe o
dono por parâmetro** e diz, no comentário, que "servirá o token pessoal da F11 sem mudar".

Criar o par em `access/` é dar duas casas à operação mais sensível do sistema — a forma que o D80
recusou para a tabela, reaparecendo na camada de cima. Generalizar as três funções por `ownerType`
é meia tarde. E `src/pages/tokens/` já existe (tokens de agente): a tela pessoal é aba ali, não
página nova.

Um detalhe que o plano apresenta como novo e é mudança de código existente: `lastUsedAt` já é
carimbado **a cada autenticação**, fora do caminho de resposta (`void …update().catch()`). A
estrangulada de um minuto que o plano pede não compra latência — ela já não está no caminho —, ela
compra **volume de escrita**. Vale, mas pelo motivo certo.

### 🟠 7 — `api_tokens.userId` não tem chave estrangeira

A migration do D80 cria a coluna, o CHECK de coerência e o índice parcial. **Não** cria
`REFERENCES users(id)`, e o schema não declara relação — `userId String? @db.Uuid`, solto;
`User` não tem `apiTokens`. Consequências para a Etapa D e a F:

- um token pessoal pode apontar para um usuário que não existe. O CHECK só exige `NOT NULL`;
- o passo 5 do desligamento funciona (`updateMany({ where: { ownerType: 'USER', userId } })`), mas
  por convenção, não por integridade;
- `Restrict`/`Cascade` não ajudam a proteger nada aqui, e `createdById` está na mesma situação.

É acréscimo aditivo e barato (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … ON DELETE SET NULL`,
mais a relação no schema), e tem que entrar **antes** da tela pessoal — depois, com linhas dentro, é
uma validação a mais.

### 🟠 8 — A seção de Verificação chama três rotas que não existem

```
POST /api/users/$LAURA/terminate          # o D82 matou o `terminate`. É /offboard
GET  /api/assets/$MOUSE/responsaveis      # não existe
GET  /api/assets/$PARADO/escalonamento    # não existe (nasce na Etapa C)
```

A Camada 3 não tem rota própria: ela viaja **dentro** do ativo (`find-asset-by-id.usecase.ts`) e da
listagem (`list-assets.usecase.ts`). E já tem **três** leitores — o resolvedor em memória, a view
`vw_asset_responsibles` (F10) e o `ehPostoVago()` dos postos. O D130 é o precedente que proíbe a
quarta versão da mesma resposta: o escalonamento é pergunta **diferente** (o D73 está certo), mas
precisa nascer com **uma** implementação e com o aceite chamando ela (defeito 5), senão a fase fecha
com duas.

Onde ele sai, então: no mesmo payload do ativo onde `postoVago` já sai, e não numa rota irmã —
quem pergunta "para quem eu ligo?" está olhando a ficha que acabou de dizer "posto vago".

### 🟡 9 — Revogar sessão não é mecanismo novo: é uma coluna

O passo 5 diz "revoga `ApiToken`s e sessões". Sessão já tem revogação desde a F3: `tokenVersion++`
invalida todo JWT emitido antes, sem tabela de sessão e sem lista de revogação — está documentado no
schema e provado em `tests/invariantes/sessao.test.ts`. No desligamento é **uma linha dentro da
transação que já existe**. Escrito aqui porque quem ler "revogar sessões" do zero constrói tabela de
sessão.

### 🟡 10 — `AuthEventType` precisa crescer, e enum é migração

A trilha de autenticação tem seis valores e nenhum distingue **como** a pessoa entrou. Com OIDC,
"quem entrou pelo login corporativo" é a primeira pergunta de qualquer auditoria, e `LOGIN_OK` não
responde. A fase precisa de pelo menos: entrada por OIDC, falha de segundo fator, e o marcar-para-
revisão do sync LDAP (que é fato de cadastro, não de login — pode ser `ActivityLog`). Nenhuma Etapa
menciona isso, e acrescentar valor a enum é migração.

### 🟡 11 — `isVip` e `isRemote` entram sem leitor

A Etapa B os cria e nada os lê. Colunas sem regra são decoração até alguém inventar uma — e aí a
regra nasce sem decisão. Se entrarem, que entrem com o que leem: VIP como filtro de listagem e selo
na ficha, remoto como nota no termo de entrega (equipamento que não volta à mesa). Ou ficam para
quando houver a regra.

---

## 3. O que o plano acertou, e merece ficar escrito

Não é cortesia: estes pontos são o que esta auditoria **não** mexe, e saber disso economiza a
próxima revisão.

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
  compartilhado. Não é layout: é o `MODELO-POSSE.md` aparecendo na tela de quem não leu nenhum doc.
- **O que o plano recusou.** `Department` como detentor de ativo (D72), `firstName`/`lastName`,
  bind de senha contra o AD, SAML, JIT, fila de requisição, permissão por localidade. As seis
  recusas continuam de pé, e a do `firstName`/`lastName` vale repetir: um campo que só existe para
  ser recomposto na exibição é duas fontes de verdade para o mesmo dado.

---

## 4. O plano de implementação

A ordem mudou. O plano original começa em `Department` porque é a etapa mais fácil de descrever; mas
a Etapa A é a **única** migração não aditiva do projeto e toca 19 arquivos de contrato, e a Etapa E
decide onde a permissão mora — o que `Department`, `Group` e o resto vão ter que respeitar. Então a
infraestrutura de permissão vem primeiro, no menor pedaço que já prova o desenho.

### A — Onde a permissão mora, com uma chave só · **M**

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

### B — `Group`, união de permissões e o administrador que não se perde · **M**

- **Schema:** `Group` (`name @unique`, `permissions Json @db.JsonB`), N:M implícita com `User`.
- **Nasce:** aba Grupos (a tela se chama **grupos**, pelo que lista), o seed do grupo
  `Administrador` ao lado do seed do administrador que já existe em `prisma/seed.ts`, e o comando de
  linha de escape.
- **Regra:** união permissiva, sem `deny` (D76). Remover o último portador de `access.manage` é
  409 — e a verificação de que toda chave gravada existe no catálogo roda no teste, não só no boot.

As chaves restantes do catálogo entram aqui, agora com quem as conceda:
`assets.view|create|edit|delete|checkout`, `assets.viewCost`, `licenses.viewKey`,
`endpoints.command`, `reports.export`, `backup.download`, `access.manage`.

### C — Dado sensível, nas três formas que ele tem · **M**

Não é `assetSelect(perms)` em 50 lugares (defeito 4):

- `assets.viewCost` entra **nos leitores**: `list-assets`, `find-asset-by-id`, `export-assets` +
  `asset-export-columns`, o token `purchaseCost` do `report-columns.ts`, e o `SUM` do
  `responsibility-report`. `ASSET_SELECT` continua servindo as escritas internas;
- `/api/reports/depreciacao` exige `assets.viewCost` **na rota** — o relatório é sobre dinheiro do
  começo ao fim (D138);
- `licenses.viewKey` entra na rota de revelar e na opção de máscara. Nada mais;
- `Asset.customFields` **não muda**, e o porquê vai escrito no `custom-field-value.helper.ts`: em
  JsonB, mascarar depois é a única forma, e isso não é exceção ao D77 — é o limite dele (D140).

### D — `Department` como entidade, e o contrato antes do banco · **M**

- **Schema:** `Department` (`name @unique`, `code?`, `managerId? → User` com `SetNull`),
  `User.departmentId String? @db.Uuid` (`Restrict`), `User.department String?` continua.
- **Nasce:** `catalog/specs/department.spec.ts` — a décima spec, nenhuma rota à mão (D75) —, a aba
  em `/configuracoes`, e `USER_LIST_SELECT` (D135).
- **A migração N**, com o backfill **na mesma transação**, exatamente como o plano escreve. O SQL do
  backfill é escrito **à mão dentro do arquivo gerado** pelo `migrate diff` — a receita do
  `ARQUITETURA.md` não gera `INSERT`/`UPDATE`.
- **E o que o plano não lista:** o importador da F10 passa a resolver nome → id (e **não** cria
  departamento novo em silêncio — é a mesma recusa do D132 para e-mail ambíguo); `USER_SORTABLE`,
  `user-filters`, `CAMPOS_AUDITADOS`, os 4 arquivos de front e os 4 de teste mudam **aqui**, não no
  commit H.

### E — Identidade e ciclo de vida do colaborador · **M**

- **Schema:** `employeeNumber?` (único por índice **parcial**, `WHERE deleted_at IS NULL`, como
  `email` e `username`), `jobTitle?`, `phone?`, `address?`, `hiredAt?`, `managerId?` (auto-relação,
  `SetNull`). `isActive` e `terminatedAt` **já existem**. `isVip`/`isRemote` só com leitor
  (defeito 11).
- **Cresce:** `src/pages/gestao-usuario/detalhe/` (perfil, liderados, posses, postos).
- **Nasce:** `GET /api/users/:id/reports` (liderados).
- **Sem `firstName`/`lastName`** — a recusa do plano vale.

### F — `resolverEscalonamento()`, e o aceite passando a chamá-lo · **M**

- **Schema:** nada muda.
- **Nasce:** `assignment/use-cases/resolver-escalonamento.usecase.ts`, subindo a árvore de
  `Location` até achar `managerId`, com o mesmo teto de 32 níveis do `location-cycle.helper.ts` e
  pelo mesmo motivo (o banco aceita ciclo, provado na F1); a seção de fronteira no
  `MODELO-POSSE.md`; o bloco "Responsáveis × escalonamento" na aba Posse.
- **Cresce:** `issue-acceptance.usecase.ts` passa a chamá-lo em vez de ler `location.manager` da
  folha — o 409 do D27 só dispara quando **nenhum** ancestral tem gestor (D139).
- **Regra:** `resolverResponsaveis()` não muda (D73). O escalonamento sai no payload do ativo, ao
  lado do `postoVago` que o motiva — não em rota irmã (defeito 8).

### G — O desligamento ganha os dois passos que faltam · **P**

Menor etapa da fase, e o plano a chama de **M** por descrever cinco passos que já existem (defeito
5 e caducidade 4/5). O que falta, dentro da transação que já está escrita:

1. **a guarda do substituto** — 409 se a pessoa é gestora de gente (`User.managerId`) ou de
   localidade (`Location.managerId`) e o corpo não traz `substitutoId`; com ele, reatribui antes de
   seguir. Localidade sem gestor é o buraco do escalonamento da Etapa F;
2. **revogar `ApiToken`s e sessões** — `updateMany` de `revokedAt` nos tokens `USER` da pessoa, e
   `tokenVersion: { increment: 1 }` na mesma `update` que já grava `terminatedAt` (defeito 9).

Mais a FK de `api_tokens.userId`, que entra aqui porque o passo 2 é o primeiro a depender dela
(defeito 7). E o modal ganha a lista do que vai acontecer e o campo do substituto.

### H — `ApiToken` pessoal e 2FA TOTP · **G**

- **Schema:** `User.totpSecret?` (cifrado, com AAD `users:totpSecret:<id>` — D81, item 3) e
  `totpRecoveryCodes String[]` (hasheados, uso único). Nada de tabela nova (D80).
- **Cresce:** `auth/use-cases/manage-api-tokens.usecase.ts`, generalizado por `ownerType`
  (defeito 6); `src/pages/tokens/` ganha a aba pessoal.
- **Nasce:** `enroll-totp`, `verify-totp`; os valores novos de `AuthEventType` (defeito 10); o
  comando de linha que destrava o administrador sem 2FA.
- **Regra:** janela de ±1 passo, códigos de recuperação de uso único em hash, e o destravamento é
  **comando de linha, nunca rota** — uma rota de bypass é a porta que o 2FA veio fechar.
- `totpSecret` e `totpRecoveryCodes` ficam fora do `USER_PUBLIC_SELECT`, e
  `tests/invariantes/sessao.test.ts` é onde isso se prova.

### I — LDAP, OIDC e o portal · **G**

- **Instalar:** `ldapts`, `openid-client` (só eles).
- **Schema:** `User.externalId?` (o `oid` do Entra) e `authSource` (`LOCAL`, `LDAP`, `OIDC`).
- **Nasce:** `access/jobs/ldap-sync.job.ts` — com `claimWindow('sync-ldap')`, a linha própria em
  `JobRun` que o D79 já deixou pronta —, `use-cases/oidc-callback.usecase.ts`, e a página do portal.
- **Regra:** sumir do diretório **marca para revisão**, nunca desliga (D78). `state` e `nonce`
  obrigatórios e validados. E-mail que já existe com `authSource = LOCAL` exige vínculo explícito,
  nunca fusão automática.
- **A página se chama `src/pages/meus-equipamentos/`**, não `portal/`: a tela leva o nome do que
  lista (D141). Dois baldes, o do posto dizendo com quem é dividido.
- **Solicitar item fica de fora** — está em *Descartado de propósito*, e esta fase não reabre.

### J — `DROP COLUMN users.department` · **P**

Depois de a lista de departamentos ser revisada à mão. Com a Etapa D tendo movido o contrato, aqui
não sobra código para mudar — é o objetivo de ter feito naquela ordem.

---

## 5. Decisões que esta auditoria acrescenta — D135 a D142

### D135 — O contrato do departamento muda na Etapa D, não no `DROP COLUMN`.

**Decidido:** `USER_PUBLIC_SELECT` continua **sem** departamento; nasce `USER_LIST_SELECT` com
`department: { select: { id, name } }` para a listagem de pessoas. **Descartado:** `department:
{ select: … }` no select embutido; e deixar front, importador e `USER_SORTABLE` para o commit final.
O select público é o `assignedTo` de todo ativo e o `user` de toda ocupação — é o mesmo argumento que
já manteve `isActive`/`terminatedAt` no `USER_DETAIL_SELECT`. E deixar os 19 arquivos para a migração
N+1 transforma um `DROP COLUMN` numa refatoração de contrato com o banco já mudado.

### D136 — Permissão efetiva é lida na consulta de sessão que já existe, e não entra no `request.user`.

**Decidido:** `include` dos grupos em `carregarSessaoParaValidacao()`, reduzido a `Set<string>` em
`request.permissions`. **Descartado:** permissão no `USER_PUBLIC_SELECT`; e um
`effective-permissions` em consulta própria por requisição. O select público é o contrato do que
**sai** de um usuário — o que ele **pode** não é dado dele, e embarcado ali viajaria em cada linha de
histórico de todo ativo. E a releitura por requisição já é o caminho mais quente do sistema: uma
segunda consulta ali dobra o custo de toda requisição autenticada, que é exatamente o que o
`tokenVersion` foi desenhado para não fazer.

### D137 — Rota sem permissão declarada derruba o boot.

**Decidido:** mapa central `método + caminho → chave`, com dispensas explícitas e `motivo` escrito,
conferido contra a tabela de rotas do Fastify no boot. **Descartado:** `preHandler` escrito rota por
rota dentro de cada maestro. São 177 rotas em 23 maestros, e por rota a 178ª **nasce liberada** —
sem erro, sem log, igual à rota que nascia sem sessão antes do `require-auth.ts`. O D76 já aponta o
mesmo silêncio pelo outro lado (chave errada nega sem avisar): o catálogo em código cobre o typo, só
a conferência no boot cobre o esquecimento. E rota de catálogo é declarada **por spec**, não por
caminho: as 5 rotas servem 10 cadastros.

### D138 — Relatório que é sobre dinheiro exige a permissão na rota, não na coluna.

**Decidido:** `/api/reports/depreciacao` inteiro atrás de `assets.viewCost`; nos outros caminhos
(builder, export, relatório de responsabilidade) a chave filtra a coluna e o `SUM`. **Descartado:**
filtrar `purchaseCost` dentro do relatório de depreciação. Ele devolve custo total, custo
depreciável e valor contábil por linha — sem custo não sobra relatório, e um 200 com todos os
números nulos é pior do que um 403: parece frota sem valor cadastrado.

### D139 — O escalonamento tem uma implementação, e o aceite passa a usá-la.

**Decidido:** `resolverEscalonamento()` sobe a árvore, e `issue-acceptance.usecase.ts` o chama no
lugar de ler `Location.manager` da folha. **Descartado:** nascer a função deixando o aceite como
está. O aceite já responde "quem responde pelo espaço" (D27) e responde **pior**: sem subir, a Mesa
1 sem gestor dentro de um Andar 2 com gestor é 409 — recusa um caso que a função nova aceita. Duas
respostas para a mesma pergunta no mesmo código é o D16 renascendo, e o D130 é o precedente de que
basta uma. O `resolverResponsaveis()` continua intocado: são perguntas diferentes (D73), e é o termo
que vai ao gestor — não a responsabilidade.

### D140 — O D77 é regra de coluna. Em JsonB, mascarar depois é o limite, não a exceção.

**Decidido:** `mascararCampos()` da F9 fica como está, com o motivo escrito ao lado. **Descartado:**
"consertar" a F9 para filtrar no `select`. `Asset.customFields` é **uma** coluna com valor cifrado e
comum lado a lado — não existe `select` parcial de JsonB, e foi por isso que o prefixo `enc:` passou
a viajar dentro do valor (D81, item 1). Sem esta decisão escrita, a primeira pessoa a aplicar o D77
ao pé da letra vai tentar, não vai conseguir, e provavelmente vai deixar o campo cifrado de fora da
resposta inteira — quebrando o selo "tem segredo" da listagem.

### D141 — O portal se chama pelo que lista.

**Decidido:** `src/pages/meus-equipamentos/`. **Descartado:** `src/pages/portal/`. A convenção do
projeto é a tela levar o nome do que ela lista — `ativos`, `estoque`, `licencas`, `postos`,
`tokens` —, e "portal" não diz o que tem dentro. Os dois baldes continuam sendo dois baldes; o que
muda é a pessoa saber, pela URL, o que vai encontrar.

### D142 — `api_tokens.userId` ganha FK antes de existir token pessoal.

**Decidido:** `FOREIGN KEY … ON DELETE SET NULL` mais a relação no schema, na etapa do
desligamento. **Descartado:** confiar no CHECK. O CHECK garante que `userId` **existe quando
`ownerType = 'USER'`**, não que ele aponte para alguém — um token pessoal pode referenciar um
cadastro que nunca existiu, e o passo que revoga tokens no desligamento passaria por cima disso sem
notar. É aditivo e barato agora; com linhas dentro, é validação a mais.

---

## 6. Os testes da fase

A fase tem suíte (caducidade 2). Os `curl` do plano viram isto:

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

Duas provas que não são comando, e continuam valendo: entrar no portal como quem ocupa posto
compartilhado e conferir que a tela diz **com quem**; e desativar alguém no LDAP, rodar o sync, e
confirmar que ele foi **marcado para revisão**.

E a prova que a Etapa D exige por não ser aditiva: **reconstruir o banco do zero num descartável**,
com o backfill no meio da cadeia. É a receita do `ARQUITETURA.md`, e aqui ela deixou de ser zelo.

---

## 7. Ordem de execução

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

Sem escopo no `feat`, corpo em bullets curtos — a convenção do projeto, não a do plano
(caducidade 8). O commit **J** só entra depois da revisão manual da lista de departamentos. `npm run
lint` e `npm test` passam em cada um.

**A dependência que define a ordem:** A antes de tudo porque os 177 pontos precisam ser declarados
antes de existir grupo que conceda — declarar depois é declarar com o sistema negando em silêncio.
D antes de E porque `departmentId` e `managerId` cabem numa migração de `users` só. F antes de G
porque a guarda do substituto existe para não deixar localidade sem gestor, e é o escalonamento que
dá sentido a isso. J por último, sozinho, por ser irreversível.

---

## 8. Perguntas em aberto, depois desta auditoria

- **`isVip` e `isRemote` entram nesta fase?** Só com leitor (defeito 11). A resposta é do produto,
  não da arquitetura.
- **A estrangulada de `lastUsedAt` vale o `updateMany` condicional?** A escrita já está fora do
  caminho de resposta; o ganho é volume. Medir antes com a frota real.
- **O `vw_asset_responsibles` passa a filtrar por permissão?** Hoje ela alimenta relatório que soma
  `purchaseCost`. O D138 resolve a rota; a view continua exata, e quem a lê é que filtra. Se um dia
  houver permissão por localidade, a resposta muda — e é o escopo de linha que o **D4** recusou.
- **Termo de aceite em posse de posto:** fechado na F4 (D27), **não reabrir**. O plano da F11 chegou
  a propor bloquear checkout para `LOCATION` em categoria com aceite; a F4 resolveu melhor — um
  termo para o gestor, não N para os ocupantes. O D139 só faz esse gestor ser encontrável.
