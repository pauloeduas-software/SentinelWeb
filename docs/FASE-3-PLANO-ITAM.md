# Plano de implementação — Fase 3: autenticação e ator

> Plano **prospectivo** da Fase 3 do [`ITAM-TODO.md`](./ITAM-TODO.md), escrito
> contra o código real depois da F1 e do modelo de posse entrar no schema.
> Camadas: [`ARQUITETURA.md`](./ARQUITETURA.md) · posse:
> [`MODELO-POSSE.md`](./MODELO-POSSE.md) e [`DECISOES-POSSE.md`](./DECISOES-POSSE.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias

## Objetivo

Colocar login, senha e sessão onde hoje não há nada, e fechar a API por padrão:
rota nova nasce protegida, `/health` e o `/agent-hub` seguem abertos pelos seus
próprios motivos.

E resolver a pendência que atravessa o sistema inteiro: **`actorId` deixa de ser
nulo**. `ActivityLog.actorId`, `Assignment.checkoutById`, `Assignment.checkinById`
e `Attachment.uploadedById` nasceram nuláveis esperando esta fase — daqui em
diante são preenchidos, e **o que ficou para trás continua sem ator, de
propósito**. RBAC granular fica na F11.

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F0** | rate limit por IP, CORS com allowlist, `error-handler` único, `sanitize.ts` |
| **F1** | `User` existe, com `email` em índice **parcial** — o `username` segue o mesmo padrão |
| **Colunas de ator já no banco** | `activity_logs.actorId`, `assignments.checkoutById`/`checkinById` existem e são nuláveis. A F3 **não** cria coluna de ator nenhuma: ela passa a escrever nelas |
| **`JWT_SECRET` e `COOKIE_SECRET`** | entram em `REQUIRED_VARS` de `core/config/env.ts`. Segredo faltando derruba o boot, não vira 500 na primeira requisição |
| **`argon2`, `@fastify/jwt`, `@fastify/cookie`** | nenhum instalado |

**O que NÃO é pré-requisito:** a F2 e a F4. As três são independentes e a ordem
entre elas é de conveniência. A F3 depois da F4 só significa que o histórico sem
ator é um pouco maior — e esse histórico é aceito (D24).

## Etapa A — Identidade no `User` · **M**

- **Schema:** `username String`, `passwordHash String?`, `failedLoginCount Int @default(0)`,
  `lockedUntil DateTime?`, `lastLoginAt DateTime?`.
- **Nasce:** migration com o índice único **parcial** escrito à mão
  (`CREATE UNIQUE INDEX "users_username_unico" ON "users"("username") WHERE "deletedAt" IS NULL`).
- **Regra:** `passwordHash` nulável — colaborador que **recebe** equipamento não é
  necessariamente colaborador que **usa** o sistema.

O ITAM cadastra gente para entregar notebook, não para dar acesso. Exigir senha de
todo mundo transformaria cada admissão em criação de conta. Sem `passwordHash`, o
login recusa com a mesma mensagem genérica de senha errada.

`USER_PUBLIC_SELECT` **não** ganha `passwordHash` — e o risco não é esse arquivo,
que é allowlist: é o primeiro `include: { … }` que alguém escrever em outro lugar.

## Etapa B — O domínio `auth` · **M**

- **Schema:** nada muda.
- **Nasce:** `server/domain/auth/auth.maestro.ts`,
  `controllers/auth.controller.ts`, `use-cases/login.usecase.ts`,
  `use-cases/logout.usecase.ts`, `use-cases/current-user.usecase.ts`,
  `helpers/password.helper.ts`, `helpers/session-cookie.helper.ts`.
- **Regra:** `POST /api/auth/login` devolve **só o cookie** — nenhum token no
  corpo da resposta, para não existir caminho em que o front o guarde (D22).

`POST /api/auth/logout` limpa o cookie. `GET /api/auth/me` devolve o usuário da
sessão pelo `USER_PUBLIC_SELECT`, que é o que o front usa para saber se já está
logado sem guardar nada.

## Etapa C — `preHandler` global, negando por padrão · **M**

- **Schema:** nada muda.
- **Nasce:** `server/core/http/require-auth.ts`; a allowlist de rotas públicas é
  montada em `server.ts` e **passada** ao hook.
- **Regra:** toda rota exige sessão; a exceção é explícita e curta.

A allowlist vai por parâmetro pelo mesmo motivo de `parseListQuery` receber
`sortable`: saber que `/aceite/:token` é público é conhecimento de negócio, e
`core` não importa `domain`.

| Rota pública | Por quê |
|---|---|
| `/health`, `/health/ready` | o container e o monitoramento não têm sessão |
| `POST /api/auth/login` | é como a sessão nasce |
| `/agent-hub` | tem autenticação própria (`AGENT_TOKEN`, e o `ApiToken` da Etapa G) |
| `/aceite/:token` | a página pública de aceite da F4 — quem assina não tem login |
| raiz estática do front | o HTML precisa carregar para a tela de login existir |

**`/uploads/` da F2 não está nesta lista, e isso é decisão a tomar aqui.**
`@fastify/static` serve por outro caminho e não passa por hook de rota: o nome do
arquivo é uuid, mas *não adivinhável* não é *autorizado*. Ou entra na allowlist
por escrito, ou ganha um hook próprio — o que não pode é ficar implícito.

## Etapa D — O ator chega ao `ActivityLog` · **M**

- **Schema:** nada muda.
- **Nasce:** nada. **Muda:** a assinatura de
  `server/domain/activity/use-cases/record-activity.usecase.ts` e a de todos os
  use-cases de escrita.
- **Regra:** `actorId` vira **parâmetro obrigatório** — pode valer `null`, mas
  tem que ser passado (D23).

O controller lê `request.user.id` e repassa; o use-case continua sem conhecer
HTTP, como manda o `ARQUITETURA.md`. Tornar o parâmetro obrigatório é o que
transforma cada ponto esquecido num erro de compilação em vez de num `null`
silencioso no banco — é a mesma rede que o D13 montou para o rename do `Asset`.

## Etapa E — `checkoutById`, `checkinById` e o que fica sem ator · **P**

- **Schema:** nada muda. As duas colunas já existem em `assignments`.
- **Nasce:** nada. **Muda:** os use-cases de checkout e checkin da F4 passam a
  gravar o ator.
- **Regra:** a partir daqui, toda entrega e toda devolução têm nome. **Nenhum
  backfill** (D24).

**A ocupação de posto não ganha coluna de ator**, e é decisão (D25): quem
registrou a Laura na Mesa 1 é pergunta de auditoria, e auditoria é o
`ActivityLog`. O `Assignment` tem `checkoutById` por outro motivo — esse nome sai
impresso no termo de entrega, e isso é dado de negócio, não trilha.

## Etapa F — `createdById` / `updatedById` onde a tela mostra · **P**

- **Schema:** `createdById String?` e `updatedById String?` **no `Asset`**, e só.
- **Nasce:** o preenchimento dentro da transação que já existe em
  `create-asset.usecase.ts` e `update-asset.usecase.ts`.
- **Regra:** quem precisa aparecer em tela ganha coluna; o resto pergunta ao
  `ActivityLog` (D26).

## Etapa G — `ApiToken` por agente e a tela de login · **M**

> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D80.** A tabela é **uma só**, com dono polimórfico (`ownerType`): a F11 cria o token PESSOAL na mesma.
> Duas tabelas duplicariam o caminho de autenticação, que é idêntico nos dois casos.

- **Schema:** model `ApiToken` (`name`, `ownerType`, `userId?`, `endpointId?`, `prefix`,
  `tokenHash`, `lastUsedAt?`, `revokedAt?`, `createdById?`), `prefix @unique`, mais o CHECK de
  coerência do dono. `endpointId` nasce **nulo** — o token do agente é gerado antes de a máquina
  existir, e o vínculo é preenchido no primeiro handshake (D80).
- **Nasce:** `server/domain/auth/use-cases/authenticate-api-token.usecase.ts`,
  uso em `agent/helpers/authenticate-agent.helper.ts`; no front
  `src/pages/login/` (`index.tsx`, `hooks/useLogin.ts`) e
  `src/domain/auth/auth.store.ts`.
- **Regra:** o token viaja como `prefixo.segredo`; o lookup é pelo **prefixo** e a
  comparação do segredo é em tempo constante contra um **sha256**, não argon2.

Argon2 é caro **de propósito** — é o que protege senha humana contra força bruta
offline. Um token de 32 bytes aleatórios não tem o que proteger: não há dicionário
para atacar, e pagar 100 ms de KDF a cada handshake de agente é transformar a
defesa da senha em lentidão da frota.

O `auth.store.ts` é o primeiro conteúdo real do balde `zustand` que o
`ARQUITETURA.md` já reservou: sessão é client state, não server state — ninguém
faz polling dela.

## Decisões da fase — D22 a D26

### D22 — Sessão em cookie `httpOnly`, não em `localStorage`.

**Decidido:** JWT curto em cookie `httpOnly` + `Secure` em produção, assinado com
`JWT_SECRET`. Nenhum token no corpo da resposta.
**Descartado:** Bearer token guardado no `localStorage` pelo front.
**Por quê:** um XSS em qualquer página do app lê o `localStorage` inteiro e leva a
sessão embora; o cookie `httpOnly` não é legível por JavaScript, então o mesmo XSS
consegue *usar* a sessão enquanto a aba está aberta, mas não *exportá-la*. O preço
é CSRF, e ele se paga com `SameSite` mais o CORS já fechado da F0 — que recusa
`*` e trabalha com allowlist de origem desde o primeiro dia.

### D23 — `actorId` é parâmetro obrigatório, não `AsyncLocalStorage`.

**Decidido:** o controller lê `request.user.id` e passa adiante; a assinatura do
use-case **exige** o argumento.
**Descartado:** `AsyncLocalStorage` em `core` guardando o ator da requisição.
**Por quê:** o ALS é menos digitação e falha em silêncio — um caminho que não
propague o contexto (um job, um `setImmediate`, o hub do agente) grava `null` e
ninguém descobre até auditar. O parâmetro obrigatório transforma cada esquecimento
em erro de compilação, que é a única verificação automática que este repositório
tem hoje. E manteria "ator" dentro de `core`, que não pode conhecer negócio.
O preço é tocar ~20 assinaturas **uma vez**.

### D24 — O histórico anterior fica sem ator. Não há backfill.

**Decidido:** tudo que foi gravado antes do login continua com `actorId: null`, e
a tela mostra "—".
**Descartado:** atribuir os registros antigos ao primeiro administrador, ou criar
um usuário `system` e carimbar tudo nele.
**Por quê:** auditoria falsificada é pior que auditoria ausente, porque parece
confiável. "Fulano arquivou 40 ativos em janeiro" seria mentira com aparência de
prova, e alguém a usaria numa conversa real. É a mesma razão pela qual
`ActivityLog.actorId` nasceu nulável em vez de segurar o `ActivityLog` até a F3:
registro sem ator é registro; registro com ator errado é dano.

### D25 — Ocupação de posto não ganha coluna de ator.

**Decidido:** `LocationOccupant` continua sem `openedById`/`closedById`.
**Descartado:** espelhar `checkoutById`/`checkinById` por simetria.
**Por quê:** `Assignment` tem essas colunas porque **o nome sai impresso no termo
de entrega** — é dado de negócio, que precisa sobreviver a qualquer expurgo de
log. A ocupação não gera documento: "quem cadastrou a Laura na Mesa 1?" é pergunta
de auditoria, e a resposta é o `ActivityLog`. Duas colunas por simetria seriam
dado duplicado com uma fonte a mais para divergir.

### D26 — `createdById`/`updatedById` só onde a tela mostra.

**Decidido:** as duas colunas no `Asset`, não nas 14 tabelas.
**Descartado:** o item do TODO como está escrito ("em todas as tabelas").
**Por quê:** o `ActivityLog` já responde *quem criou isto* — a linha `CREATE` está
lá, com o ator. A coluna existe para não fazer essa consulta **por linha** na tela
de detalhe do ativo, que é a única que mostra o dado. Nas outras treze, seria
desnormalização paga sem ninguém para cobrar. Quando uma tela nova precisar, é
migração aditiva de duas colunas.

## Riscos e armadilhas

**Front e back em portas diferentes matam o cookie, em silêncio.** `FRONT_PORT=3000`
e `PORT=3001` são origens distintas: sem `credentials: true` no `@fastify/cors` e
`withCredentials: true` no `apiClient`, o navegador simplesmente **não envia** o
cookie. O sintoma é 401 em tudo depois de um login que respondeu 200, sem erro no
console. `SameSite=Strict` também o bloqueia nesse arranjo — `Lax`, com a origem
explícita na allowlist do CORS, é o que funciona em desenvolvimento.

**`argon2` é módulo nativo.** Compila com `node-gyp`; num container slim sem
build tools o `npm install` quebra — e quebra no deploy, não aqui.
`@node-rs/argon2` (binário pré-compilado) é a saída, e `scrypt` do `node:crypto` é
o plano C. O que não pode acontecer é cair em sha256 puro ou em bcrypt com custo
baixo porque "o build estava chato".

**`username @unique` comum trava o recadastro para sempre.** Mesmo caso de
`users.email` na F0 e de `assets.assetTag` na F1: o índice é **parcial**
(`WHERE "deletedAt" IS NULL`) e é escrito **à mão** na migration. O `migrate diff`
não emite `WHERE` — se o schema declarar `@unique`, o SQL sai errado e ninguém
percebe até o primeiro usuário apagado tentar voltar.

**O JWT sobrevive ao usuário.** Mandar alguém para a lixeira não invalida o token
que ele já tem no navegador: ele continua autenticado até expirar. TTL curto
(horas, não dias) **e** o `preHandler` conferindo que o usuário existe a cada
requisição. Aqui a extension de soft delete joga a favor — `findUnique` de topo já
não acha o apagado, sem código extra.

**`lockedUntil` é negação de serviço contra um usuário conhecido.** Quem sabe o
username de alguém trava a conta em cinco tentativas. O bloqueio por conta convive
com o rate limit por IP da F0 e a janela é de **minutos**; bloqueio permanente com
desbloqueio manual troca um ataque barato por um chamado garantido.

**Enumeração de usuário vaza pelo tempo, não pela mensagem.** "Usuário não existe"
e "senha errada" já seriam a mesma frase — mas se o caminho do usuário inexistente
volta sem calcular hash nenhum, ele responde em 1 ms e o outro em 100 ms, e a
diferença entrega a lista de quem trabalha aqui. Verificar contra um hash
descartável mesmo quando o usuário não existe.

**Credencial no log.** `core/logger/sanitize.ts` já remove campos sensíveis do
corpo; `Cookie`, `Set-Cookie` e `Authorization` precisam entrar na lista. E o token
de aceite da F4 viaja **na URL** — a query string também tem que ser mascarada,
senão o `X-Request-Id` vem acompanhado do que ele deveria proteger.

**`migrate diff`, de novo.** Acrescentar colunas a `users` é aditivo e barato, mas
o gerador já emitiu `DROP TABLE` onde era rename neste repositório. Revisar o SQL
antes de aplicar, e rodar a cadeia inteira num banco descartável — foi assim que
se descobriu que o `0_init` não aplicava do zero.

## Verificação

```bash
API=http://localhost:3001; J=/tmp/sessao.txt

# negado por padrão
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/assets"                    # 401
curl -s -o /dev/null -w '%{http_code}\n' "$API/health"                        # 200 (público)

# login: 200, cookie httpOnly, nenhum token no corpo
curl -s -c $J -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"<senha>"}' | jq 'has("token")'       # false
grep -i 'HttpOnly' $J

curl -s -b $J "$API/api/auth/me" | jq '{id, name}'
curl -s -b $J -o /dev/null -w '%{http_code}\n' "$API/api/assets"              # 200

# senha errada N vezes: mesma mensagem sempre, e a 6ª barra
for i in $(seq 1 6); do
  curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
       -d '{"username":"admin","password":"errada"}' -w ' %{http_code}\n' | tail -1
done

# usuário inexistente responde no MESMO tempo do usuário existente
for u in admin nao-existe; do
  curl -s -o /dev/null -w "$u %{time_total}\n" -X POST "$API/api/auth/login" \
       -H 'Content-Type: application/json' -d "{\"username\":\"$u\",\"password\":\"x\"}"
done

# a senha nunca sai na resposta, por nenhuma rota
curl -s -b $J "$API/api/users?perPage=100" | grep -ci 'passwordHash'          # 0

# logout invalida
curl -s -b $J -X POST "$API/api/auth/logout" -o /dev/null
curl -s -b $J -o /dev/null -w '%{http_code}\n' "$API/api/assets"              # 401
```

```sql
-- o índice de username é PARCIAL (e não uma constraint comum)
\d users          -- procurar: UNIQUE, ... WHERE (("deletedAt" IS NULL))

-- o ator passou a aparecer — e só a partir do login
SELECT ("actorId" IS NULL) AS sem_ator, count(*), max("createdAt")
  FROM activity_logs GROUP BY 1;

-- D24: o que é antigo continua sem ator, e isso é o resultado esperado
SELECT count(*) FROM activity_logs
 WHERE "actorId" IS NULL AND "createdAt" > :momento_do_primeiro_login;   -- 0

-- D25/E: entrega e devolução feitas depois da F3 têm nome
SELECT id, "checkoutById" IS NOT NULL AS tem_ator
  FROM assignments WHERE "checkoutAt" > :momento_do_primeiro_login;      -- todas true
```

**Duas provas que não são comando:** apagar um usuário e recadastrar o **mesmo**
username (tem que deixar — é o índice parcial); e, com o servidor no ar, apagar o
usuário de uma sessão aberta e recarregar a tela — a requisição seguinte tem que
voltar 401, não continuar servindo com o token antigo.

**E o caminho crítico do RMM:** subir com um agente conectado e confirmar que ele
continua trocando mensagens depois que o `preHandler` global entrou. O
`/agent-hub` está na allowlist; se ficar de fora, a frota inteira cai e o sintoma
aparece só no job de zumbis, minutos depois.

## Ordem de commits

Um commit por etapa, na ordem A→G, com o lint passando em cada um: `feat(db)` para
as colunas de identidade, `feat(auth)` para o domínio e o `preHandler`,
`refactor(domain)` para a propagação do `actorId` (é o commit grande e mecânico),
`feat(web)` para a tela de login. A Etapa C entra **depois** da B e **antes** da
D: fechar a porta antes de ter como abri-la derruba o próprio desenvolvimento.

---

## O que entrou

Escrito **depois** da implementação, contra o código que está no repositório.
O que o plano previa e não entrou está na seção seguinte, com o motivo.

### Backend

| Arquivo | O que faz |
|---|---|
| `server/core/http/require-auth.ts` | o `preHandler` global. Recebe a allowlist e a função de autenticar **por parâmetro** — `core` não conhece negócio |
| `server/core/config/env.ts` | `JWT_SECRET` em `REQUIRED_VARS`; segredo curto ou de exemplo derruba o boot em produção e avisa em desenvolvimento; `getJwtSecret()` |
| `server/core/http/write-rate-limit.ts` | `LOGIN_RATE_LIMIT` (20/min por IP) |
| `server/domain/auth/auth.maestro.ts` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/users/:id/set-password` |
| `server/domain/auth/controllers/auth.controller.ts` | só HTTP: assina o JWT e grava/apaga o cookie |
| `server/domain/auth/use-cases/login.usecase.ts` | argon2id, contador de tentativas, `lockedUntil`, recusa de inativo |
| `server/domain/auth/use-cases/current-user.usecase.ts` | relê o usuário da sessão a cada requisição, pelo `USER_PUBLIC_SELECT` |
| `server/domain/auth/use-cases/set-user-password.usecase.ts` | define `username` + `passwordHash`, destrava a conta e grava o log **sem o segredo** |
| `server/domain/auth/helpers/password.helper.ts` | `hashSenha`, `conferirSenha` e o hash descartável contra enumeração por tempo |
| `server/domain/auth/helpers/session-cookie.helper.ts` | nome, TTL e atributos do cookie, numa função usada pela gravação e pela limpeza |
| `server/domain/auth/helpers/authenticate-request.helper.ts` | o que o `preHandler` chama: `jwtVerify` + releitura do usuário |
| `server/domain/auth/helpers/actor.helper.ts` | `atorDaRequisicao(request)` — o ÚNICO lugar de onde o `actorId` sai |
| `server/domain/auth/auth.types.ts` | `SessionUser` (derivado do `USER_PUBLIC_SELECT`) e a tipagem de `request.user` |
| `server/app.ts` | registra `@fastify/cookie`, `@fastify/jwt` e o guard **antes** dos maestros; a `ROTAS_PUBLICAS` mora aqui |
| `prisma/seed.ts` | administrador inicial idempotente, senha por `ADMIN_PASSWORD` |

### Frontend

`src/pages/login/` (`index.tsx` + `hooks/useLogin.ts`), `src/domain/auth/auth.queries.ts`
(o transporte), `src/domain/auth/auth.store.ts` (**zustand** — o primeiro conteúdo
real daquele balde), `src/domain/shared/auth.types.ts`, e as mudanças em
`src/core/api/apiClient.ts` (`withCredentials` + o 401 num lugar só), `src/App.tsx`
(a decisão de "entrou ou não entrou") e `AppHeader` (quem está logado + sair).

### O ator, ponto a ponto

`recordActivity(client, input, actorId)` — o ator saiu do `input` e virou o
**terceiro parâmetro**. Passam o ator hoje: `user` (create, update, delete,
restore, offboard), `asset` (create, update, delete, restore, retire, unretire,
bulk), `assignment` (checkout, checkin, `fecharPosse`, bulk) e o `set-password`.
`Assignment.checkoutById` e `checkinById` passaram a ser gravados.

### Três decisões que a implementação teve de tomar

**1. O `= null` de `recordActivity` é temporário, e está aqui para ser apagado.**
O D23 pede parâmetro **obrigatório** — é isso que transforma o esquecimento em
erro de compilação. O parâmetro nasceu com `= null` porque `catalog` (3 chamadas)
e `occupancy` (2 chamadas) estavam sendo trabalhados em paralelo e não podiam ser
tocados: obrigatório de imediato quebraria a compilação de código de terceiros.
**As cinco chamadas sem ator são exatamente essas cinco.** Quando os dois
domínios propagarem o ator, apagar o `= null` fecha a rede do D23 de vez — e o
compilador aponta o que sobrou.

**2. Credencial não entrou no formulário de colaborador; entrou no
`set-password`.** O corpo da rota aceita `{ password, username? }`. Senha sem
`username` não loga e `username` sem senha também não: são duas metades da mesma
decisão — *dar acesso* —, que é diferente de *cadastrar alguém para receber
equipamento*. Uma rota, uma transação, um lugar para o RBAC da F11 filtrar.

**3. `COOKIE_SECRET` não existe.** O plano o listava como pré-requisito. O cookie
guarda um JWT que **já é assinado** com o `JWT_SECRET`: assinar a assinatura é
uma segunda chave para administrar sem nada a mais para proteger. Só `JWT_SECRET`
é obrigatório.

### O que NÃO entrou

- **`ApiToken` por agente (Etapa G).** O `/agent-hub` continua com o
  `AGENT_TOKEN` compartilhado da F0. É trabalho independente do login humano.
- **`createdById` / `updatedById` no `Asset` (Etapa F).** Exige migration, e esta
  fase não toca no schema.
- **`/aceite/:token` e `/uploads/` na allowlist.** As rotas são da F4 e da F2 e
  ainda não existem — entram na lista quando nascerem, com o motivo escrito.
- **RBAC.** Qualquer sessão válida pode tudo, inclusive redefinir a senha de
  qualquer um. É a F11, e o ponto de filtro já está isolado num use-case só.
- **Backfill de ator (D24).** De propósito: o que é anterior ao login segue sem
  ator, e a tela mostra "—".

### O que foi provado em execução

Servidor na porta 3097 contra `sentinel_audit`:

- `/api/assets`, `/api/users`, `/api/endpoints`, `/api/categories` e uma **rota
  inexistente** respondem 401 sem sessão; `/health` e `/health/ready`, 200.
- Login: 200, `Set-Cookie: sentinel_sessao=…; Max-Age=28800; Path=/; HttpOnly;
  SameSite=Lax`, e **nenhum token no corpo** — só o usuário.
- Usuário inexistente e senha errada: a mesma frase, e **o mesmo tempo**
  (~45 ms contra ~47 ms; sem o hash descartável seriam 1 ms contra 47 ms).
- Cinco erros seguidos e o sexto vira 423 com `lockedUntil` gravado; a senha
  **certa** também é recusada enquanto a janela está aberta. Um login correto
  zera contador e trava; `set-password` também destrava.
- `activity_logs.actorId` preenchido em CREATE/UPDATE/DELETE/CHECKOUT/CHECKIN;
  `assignments.checkoutById` e `checkinById` com o id de quem operou.
- Sessão aberta + usuário mandado para a lixeira ⇒ a requisição seguinte é 401
  (o `preHandler` relê o usuário; o token não sobrevive ao dono).
- `passwordHash` não aparece em `/api/users?perPage=100`, em `/api/auth/me` nem
  na resposta do `set-password`.
- Logout limpa o cookie (`Max-Age=0`) e a requisição seguinte é 401.
- **WebSocket do `/agent-hub` conecta e troca mensagem** com o `preHandler`
  global no ar — a frota não caiu.
- `JWT_SECRET` ausente derruba o boot com a lista do que falta; `JWT_SECRET`
  curto derruba o boot em produção.
