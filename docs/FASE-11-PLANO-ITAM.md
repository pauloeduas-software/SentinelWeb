# Plano de implementação — Fase 11: acesso avançado

> Plano **prospectivo** da Fase 11 do [`ITAM-TODO.md`](./ITAM-TODO.md). Convenções de camada:
> [`ARQUITETURA.md`](./ARQUITETURA.md). Contrato de posse: [`MODELO-POSSE.md`](./MODELO-POSSE.md),
> [`DECISOES-POSSE.md`](./DECISOES-POSSE.md) e [`INVARIANTES.md`](./INVARIANTES.md).
>
> Esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais de 3 dias · Decisões **D72–D78**, na
> numeração contínua do projeto (D1–D13 no TODO, D14–D17 em `DECISOES-POSSE.md`).
>
> **Auditado em 01/10/2026**, contra a árvore com a F10 fechada:
> [`AUDITORIA-F11.md`](./AUDITORIA-F11.md) — oito afirmações deste arquivo caducaram (as
> dependências, a suíte, a tela de detalhe, o 409 do `DELETE`, o passo 4 do desligamento e a
> ordem de commits) e onze defeitos foram encontrados, três deles mudando o que seria entregue:
> `department` viaja no `USER_PUBLIC_SELECT`, a permissão não tem onde morar na requisição, e
> `requirePermission` por rota reabre o furo que a F3 fechou. Este arquivo fica como foi escrito,
> porque é o registro do que se decidiu; o que vale para executar é o plano de lá.
>
> **A FASE FECHOU.** As dez etapas (A–J) estão aplicadas — ver o
> [Fechamento da F11](#fechamento-da-f11), no fim deste arquivo, com o que a execução
> decidiu por conta própria e o que ficou de fora com o motivo.

---

## Objetivo

Transformar `User` — hoje quatro colunas e um `department` de texto livre — em **colaborador**:
departamento de verdade, gestor, admissão, desligamento, grupo, permissão, segundo fator e login
corporativo, mais o portal onde ele vê o que responde. A fase também fecha uma fronteira que o
modelo de posse deixou em aberto: **posto, departamento e gestor parecem todos responder *"de quem
é isto?"* e respondem a perguntas diferentes.** Sem isso escrito, a primeira pessoa a implementar
"o gestor também responde" vai fazê-lo por efeito colateral de duas colunas existirem — uma delas,
`Location.managerId`, no schema desde a F1 **sem nenhum uso**.

---

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **F3 concluída** | pré-requisito **duro**, o único do plano. Permissão sem sessão não tem sujeito; 2FA sem login não tem onde entrar |
| **F4 concluída** | o desligamento chama `checkin-all` e encerra ocupações. Sem os use-cases de posse, o fluxo é metade |
| **F10 concluída (desejável)** | a allowlist de colunas do report builder passa a ser filtrada por permissão; se a F10 vier depois, ela já nasce filtrada |
| **`otplib`, `ldapts`, `openid-client`** | nenhum instalado. E `APP_ENCRYPTION_KEY`: o segredo TOTP é credencial em repouso e usa a cifra da **F9** |

**A janela do D6 já fechou aqui.** A Etapa A é a primeira migração do projeto que **não** é
aditiva: ela troca uma coluna de texto por uma FK, com dado dentro.

---

## Etapa A — `Department` como entidade · **M**

- **Schema:** model `Department` (`name @unique`, `code?`, `managerId? → User` com `SetNull`),
  `User.departmentId String? @db.Uuid` (`Restrict`). `User.department String?` **continua por ora**.
- **Nasce:** `server/domain/catalog/specs/department.spec.ts` — a oitava spec, nenhuma rota escrita
  à mão (D75) —, mais a aba em `/configuracoes`.
- **Regra:** a troca é em **duas migrações**, não uma.

```sql
-- migração N: cria, acrescenta a FK nullable e faz o backfill NA MESMA transação
INSERT INTO departments (id, name, "createdAt", "updatedAt")
SELECT gen_random_uuid(), btrim(department), now(), now()
  FROM users WHERE department IS NOT NULL AND btrim(department) <> ''
 GROUP BY btrim(department);
UPDATE users u SET "departmentId" = d.id FROM departments d WHERE d.name = btrim(u.department);
-- migração N+1, depois do deploy validado:
ALTER TABLE users DROP COLUMN department;
```

Duas migrações porque um rollback entre elas ainda encontra o texto original. E `GROUP BY` sobre
texto livre traz `Comercial`, `comercial ` e `COMERCIAL` como três departamentos: `btrim` reduz,
**não elimina** — a lista precisa ser revisada à mão antes da N+1.

---

## Etapa B — Identidade e ciclo de vida do colaborador · **M**

- **Schema:** `User` ganha `employeeNumber?` (único por índice **parcial**, `WHERE deleted_at IS
  NULL`, como o `email`), `jobTitle?`, `phone?`, `address?`, `isVip`, `isRemote`, `hiredAt?`,
  `terminatedAt?`, `isActive @default(true)` e `managerId?` (auto-relação, `SetNull`).
- **Nasce:** `src/pages/gestao-usuario/detalhe/` (perfil, liderados, posses, postos),
  `GET /api/users/:id/reports` (liderados).
- **Regra:** `terminatedAt` e `deletedAt` são **coisas diferentes** e nunca se substituem (D74).

**`firstName`/`lastName` não nascem**, apesar de o TODO pedir "nome dividido": `name` já é o campo
canônico, dividi-lo exige um backfill que adivinha onde termina o nome em *"Maria da Silva Souza"*,
e um campo que só existe para ser recomposto na exibição é duas fontes de verdade para o mesmo
dado. De LDAP/OIDC o que importa guardar é `employeeNumber` e `jobTitle`.

---

## Etapa C — A fronteira: posto, departamento, gestor · **M**

- **Schema:** nada muda. Esta etapa é **código que recusa**, não coluna.
- **Nasce:** `server/domain/assignment/use-cases/resolver-escalonamento.usecase.ts`, a seção de
  fronteira no `MODELO-POSSE.md`, e o bloco "Responsáveis × escalonamento" na aba Posse da F2.
- **Regra:** `resolverResponsaveis()` **não muda nesta fase** — ganha uma função irmã, não um
  `else` (D73).

| Pergunta | Quem responde | Onde vive |
|---|---|---|
| Quem **responde** por este ativo? | a posse aberta → pessoa, ou os ocupantes do posto | `resolverResponsaveis()` (D16) |
| Quem **cobra** a pessoa? | `User.managerId` | hierarquia de gente |
| Quem responde pelo **espaço**, e pelo posto **sem ocupante**? | `Location.managerId`, subindo a árvore até achar um | `resolverEscalonamento()` |
| A quem **pertence o custo**? | `Department` | relatório e rateio |

**A regra em caso de conflito, em uma linha:** *o posto responde pelo ativo; a pessoa responde pelo
posto; o gestor da localidade responde pelo posto vazio — e nunca pelo posto ocupado.* Gestor de
pessoa e departamento **nunca** entram na resposta sobre um ativo. Isto é contribuição desta fase
ao modelo: o `MODELO-POSSE.md` deixava o *posto vago* como sinal operacional **sem ninguém para
ligar**, e `resolverEscalonamento()` dá um nome ao telefone sem contaminar a resolução de
responsabilidade, que continua exata.

---

## Etapa D — Desligamento como operação única · **M**

> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D82.** Esta etapa **não cria** rota nem use-case: ela ESTENDE o `offboard` da F4, que já faz os passos
> 2, 3, 4 e 6. Duas rotas para a mesma operação divergem, e a que divergir esquece o passo 3 —
> o único que não dá erro quando falta.

- **Schema:** nada muda.
- **Cresce:** `server/domain/user/use-cases/offboard-user.usecase.ts` e
  `POST /api/users/:id/offboard`, que já existem desde a F4. O modal ganha a lista do
  que vai acontecer e o campo do substituto.
- **Regra:** **uma transação, seis passos, nesta ordem** — os passos 2, 3, 4 e 6 **já estão
  implementados** (F4); esta etapa acrescenta o 1 e o 5:

1. **recusa (409)** se a pessoa é gestora de gente ou de localidade e o corpo não traz
   `substitutoId` — localidade sem gestor é o buraco do escalonamento da Etapa C;
2. `checkin-all` das assignments abertas com alvo `USER` (F4);
3. **`endedAt` em toda `LocationOccupant` aberta da pessoa**;
4. `terminatedAt`, `isActive = false` — **e nunca `deletedAt`** (D74);
5. revoga `ApiToken`s e sessões;
6. `ActivityLog` de cada passo, na mesma transação.

**Por que o passo 3 é o que tem dentes.** A responsabilidade é derivada (D16): ela lê
`location_occupants` e junta o usuário — e a extension de soft delete **não alcança leitura de
relação aninhada** (verificado na F1, escrito no D8). Marcar a pessoa como inativa, ou até
mandá-la para a lixeira, **não a tira da lista de responsáveis da Mesa 1**; só encerrar a ocupação
tira. Um desligamento que esquece o passo 3 produz um sistema que afirma, com o banco de
testemunha, que alguém que saiu há seis meses responde por doze equipamentos. Por isso
`DELETE /api/users/:id` passa a responder **409** também com ocupação aberta: o `Restrict` de
`LocationOccupant.userId` barra o delete **físico**, mas soft delete é `UPDATE` e passa direto.

---

## Etapa E — `Group` e permissão por módulo · **G**

- **Schema:** model `Group` (`name @unique`, `permissions Json @db.JsonB`), relação N:M implícita
  com `User`.
- **Nasce:** `server/domain/access/` (`helpers/permission-catalog.ts` — a allowlist de chaves,
  declarada em código —, `helpers/require-permission.ts` para o `preHandler`,
  `use-cases/effective-permissions.usecase.ts`), aba Grupos e o seed do grupo `Administrador`.
- **Regra:** permissão efetiva é a **união** das permissões dos grupos da pessoa. Não existe
  `deny` (D76). O `preHandler` vai **por rota, dentro de cada maestro**, como o
  `ARQUITETURA.md` já determina para quando a autenticação chegar.

Chaves `<módulo>.<ação>`: `assets.view|create|edit|delete|checkout`, `assets.viewCost`,
`licenses.viewKey`, `endpoints.command`, `reports.export`, `backup.download`, `access.manage`.
**Nunca sem administrador:** remover o último portador de `access.manage` é 409, e o escape é um
comando de linha, não uma exceção na regra.

---

## Etapa F — Dado sensível, `ApiToken` e 2FA · **G**

> ⚠️ **Reconciliado — ver [`DECISOES-RECONCILIACAO.md`](./DECISOES-RECONCILIACAO.md), D80.** O `ApiToken` **já existe** desde a F3, com dono polimórfico. Esta etapa não cria tabela: só
> acrescenta a tela e o caminho `ownerType = USER`.

- **Schema:** `ApiToken` **já criado na F3** (D80) — nada de tabela nova aqui; `User` ganha `totpSecret?` (cifrado, F9) e `totpRecoveryCodes String[]` (hasheados).
- **Nasce:** `server/domain/access/use-cases/` (`issue-api-token`, `revoke-api-token`,
  `enroll-totp`, `verify-totp`); `asset-select.helper.ts` passa a receber as permissões.
- **Regra:** dado sensível é **omitido do `select`**, nunca mascarado depois (D77).

`purchaseCost` sem `assets.viewCost` não é lido do banco: mascarar na resposta deixa o valor
passar por log, por erro e por qualquer serialização no caminho. `lastUsedAt` a cada requisição
seria uma escrita por requisição — atualiza no máximo uma vez por minuto, com o mesmo `updateMany`
condicional do job da F8. Códigos de recuperação do TOTP são de uso único e guardados como hash; a
janela de verificação é de ±1 passo (relógio de celular não é exato); e um administrador trancado
fora se resolve por comando de linha, não por uma rota de bypass — que seria a porta que o 2FA veio
fechar.

---

## Etapa G — LDAP, OIDC e o portal do colaborador · **G**

- **Schema:** `User` ganha `externalId?` (o `oid` do Entra) e `authSource` (`LOCAL`, `LDAP`, `OIDC`).
- **Nasce:** `server/domain/access/jobs/ldap-sync.job.ts` (com a mesma proteção de janela do job da
  F8), `use-cases/oidc-callback.usecase.ts`, e `src/pages/portal/`.
- **Regra:** **LDAP sincroniza cadastro; quem autentica é o login local ou o OIDC** (D78). E
  sumir do diretório **nunca** desliga ninguém automaticamente — marca para revisão.

É a mesma regra do importador da F10 (*ausência de linha não encerra nada*), pelo mesmo motivo: um
filtro de busca com um typo "desliga" a empresa inteira, e aqui desligar encerra ocupações e faz
check-in de equipamento. O portal mostra **dois baldes**, e não é layout: *"meu"* (assignments alvo
`USER`) e *"do posto que eu ocupo"* — este último dizendo com todas as letras que é compartilhado e
com quem (*"Mesa 1 · também com Ana · turno Tarde"*). Sem a distinção, a pessoa devolve o monitor
da sala achando que era dela. **Solicitar item fica de fora:** a fila de requisição está em
*Descartado de propósito* no TODO, e esta fase não a reabre; `requestable` continua no schema.

---

## Decisões da fase — D72 a D78

### D72 — Posto responde pelo ativo; departamento agrupa pessoas; gestor escalona.

**Decidido:** a tabela da Etapa C. **Descartado:** `Department` como detentor de ativo; e gestor
entrando na resolução de responsabilidade. Entregar "para o Comercial" é entregar para uma sala ou
para uma pessoa — departamento não tem mesa, não tem chave e não assina nada. Aceitá-lo como alvo
de `Assignment` acrescentaria um quarto valor ao `AssignmentTarget` cujo "responsável" seria a
lista inteira de quem trabalha lá: a pluralidade voltaria a crescer multiplicativamente, que é o
que o D14 evitou. E gestor não responde porque responsabilidade, aqui, é *quem está com o
equipamento*. Se um dia "o gestor responde junto" for regra do cliente, é **decisão nova e
explícita** — não efeito colateral de as duas colunas existirem.

### D73 — `resolverEscalonamento()` é função separada de `resolverResponsaveis()`.

**Decidido:** duas funções. **Descartado:** um `else` dentro de `resolverResponsaveis()` devolvendo
o gestor da localidade quando o posto está vago. O `else` é tentador e destrói o sinal mais útil do
modelo: com ele **todo ativo passa a ter responsável**, e *"ativo em posto vago"* — o relatório da
F2, o alerta da auditoria da F8 — deixa de ser expressável. São perguntas diferentes: *quem está
com isto* e *para quem eu ligo*; uma admite vazio, a outra existe para preencher o vazio da
primeira.

`resolverEscalonamento()` sobe a árvore de `Location` até achar um `managerId`, com teto de
profundidade — a mesma guarda que o `location-cycle.helper.ts` já usa, pelo mesmo motivo: o banco
aceita ciclo (provado na F1).

### D74 — Desligar não é apagar. E encerrar ocupações é passo do fluxo.

**Decidido:** `terminatedAt` + `isActive`, com o passo 3 da Etapa D. **Descartado:** soft delete no
desligamento; e "a pessoa inativa some da resolução sozinha". `deletedAt` significa *este cadastro
não devia existir*; `terminatedAt` significa *esta pessoa trabalhou aqui*, e quem saiu continua
aparecendo no histórico de posse — é a pergunta "quem estava com o notebook antes?" que o
`MODELO-POSSE.md` protege ao nunca apagar histórico. A segunda parte é técnica e está verificada:
a extension **não escopa leitura aninhada** (D8), então nenhuma flag em `users` remove a pessoa da
lista de ocupantes de um posto.

### D75 — `Department` é a oitava spec do catálogo, e a troca de coluna é em duas migrações.

**Decidido:** `department.spec.ts` em `specs/index.ts`; `add + backfill` numa migração, `drop` na
seguinte. **Descartado:** um domínio `department/` completo; e migração única. É CRUD plano — nome,
busca, 409 por uso —, e o `ARQUITETURA.md` diz que acrescentar tabela de catálogo *é escrever a
spec*. Os dois tempos são o preço de a janela do D6 ter fechado: com dado dentro,
`add`+`backfill`+`drop` num commit só transforma um rollback em perda de dado.

### D76 — Permissão é união permissiva. Não existe `deny`.

**Decidido:** efetiva = união das chaves dos grupos. **Descartado:** flag de negação por grupo.
Negação em união cria dependência de ordem e transforma *"por que ela não consegue ver?"* numa
investigação por N grupos; sem `deny`, a resposta é sempre a mesma — **nenhum grupo dela concede a
chave** —, e quem não deve ter algo perde o grupo. O risco do modelo é o contrário do óbvio: chave
digitada errada em `permissions` não dá erro nenhum, só **nega em silêncio**. Por isso o catálogo
de chaves é declarado em código, e a verificação confere que toda chave usada em
`requirePermission` existe nele.

### D77 — Dado sensível é filtrado no `select`, não mascarado na resposta.

**Decidido:** `assetSelect(perms)`, `licenseSelect(perms)`. **Descartado:** ler tudo e apagar
campo antes de responder. O `select` explícito por domínio é, desde a F0, o único lugar onde se
decide o que sai, e o princípio é *o dado que não deve sair não é lido*.

**Obrigação cruzada:** a allowlist de colunas da F10 — export CSV, report builder, seletor de
colunas — passa a ser **filtrada pelas mesmas permissões**. Sem isso, exportar é a porta dos fundos
do custo de compra, e o report builder é a da chave de licença.

### D78 — LDAP sincroniza; OIDC autentica; ninguém entra sem cadastro.

**Decidido:** `ldapts` só importa e atualiza cadastro; o login corporativo é OIDC (Entra ID), com
vínculo pelo `oid`. **Descartado:** bind de senha contra o AD; SAML; e provisionamento JIT.
Autenticar contra o AD faz a aplicação virar funil de credencial corporativa, com TLS a pinar e
senha a trafegar, e o OIDC resolve login sem que a senha passe por aqui. O vínculo é pelo `oid`,
**não pelo e-mail**: no Entra, `preferred_username` diverge de `mail` com frequência e e-mail muda
quando a pessoa casa ou a empresa troca de domínio; `oid` é imutável. Sem JIT porque o TODO pede
recusar quem não está cadastrado, e porque criar colaborador no login faz o cadastro de pessoas
depender de quem clicou primeiro.

---

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

**O backfill de departamento mente com elegância.** `GROUP BY btrim(department)` ainda separa
`Comercial` de `COMERCIAL`. Revisar a lista antes da N+1: depois do `DROP COLUMN` o texto original
não existe mais para conferência.

**Último administrador e administrador trancado fora.** Remover o último `access.manage` é 409; um
2FA perdido se resolve por comando de linha. As duas saídas precisam existir **antes** de a fase ir
para produção, senão a recuperação vira restauração de backup. E, como esta migração **não é
aditiva**, reconstruir o banco do zero num descartável (receita do `ARQUITETURA.md`) deixou de ser
zelo: é a única prova de que a cadeia inteira ainda sobe com o backfill no meio dela.

**OIDC sem `state` e `nonce` é CSRF de login.** Os dois são obrigatórios e validados no callback;
o `oid` do token é o que casa a pessoa, e um `email` que já existe com `authSource = LOCAL` exige
vínculo explícito, nunca fusão automática.

---

## Verificação

```bash
API=http://localhost:3001

# D — a amarra da fase: desligar a Laura, que ocupa a Mesa 1 com a Ana; e o mouse da Mesa 1
#     continua com a Ana, sem nenhuma Assignment ter sido tocada
curl -s -X POST "$API/api/users/$LAURA/terminate" -H 'Content-Type: application/json' \
  -d '{"substitutoId":"'$OUTRO'"}' | jq '{posses, ocupacoes, tokens}'
curl -s "$API/api/assets/$MOUSE/responsaveis" | jq '[.[].name]'          # ["Ana"]

# D — desligar quem gere localidade sem informar substituto
curl -s -w '\n%{http_code}\n' -X POST "$API/api/users/$GESTOR/terminate" -d '{}'    # 409

# C — posto sem ocupante: sem responsável, COM escalonamento
curl -s "$API/api/assets/$PARADO/responsaveis"   | jq 'length'           # 0
curl -s "$API/api/assets/$PARADO/escalonamento"  | jq '{name, via}'      # gestor da localidade

# F — custo não é lido para quem não tem assets.viewCost
curl -s "$API/api/assets/$ID" -H "Authorization: Bearer $SEM_CUSTO" | jq 'has("purchaseCost")'
```

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

-- D76: toda chave gravada em grupo existe no catálogo do código
SELECT DISTINCT jsonb_object_keys(permissions) FROM groups;
-- conferir a saída contra `permission-catalog.ts`; chave a mais nega em silêncio
```

**Duas provas que não são comando:** entrar no portal como uma pessoa que ocupa posto
compartilhado e conferir que a tela diz *com quem* o equipamento é dividido; e desativar um usuário
no diretório LDAP, rodando o sync, para confirmar que ele foi **marcado para revisão** e não
desligado.

---

## Perguntas em aberto para outras fases

- **Termo de aceite em posse de posto — JÁ DECIDIDO na F4, não reabrir aqui.** Este plano chegou a
  propor que `Category.requireAcceptance = true` **bloqueasse** o checkout para `LOCATION`, pelo
  argumento de que pedir assinatura a N ocupantes gera N termos e nenhum responsável. A
  [`FASE-4-PLANO-ITAM.md`](./FASE-4-PLANO-ITAM.md) (**D27**) resolveu antes e melhor: o termo vai para o
  **gestor da localidade** (`Location.managerId`), **um** termo e não N, com ciência por e-mail aos
  ocupantes; sem gestor cadastrado, 409 que ensina. Bloquear seria pior — tornaria inentregável a
  um posto justamente a categoria que mais exige controle.
  A amarra que mantém o modelo íntegro nas duas pontas: **assinar não torna o gestor responsável
  resolvido**. `resolverResponsaveis()` continua devolvendo só os ocupantes, e o
  `resolverEscalonamento()` desta fase continua separado dele (ver a decisão da fronteira acima).
- **Permissão por localidade ou por departamento** (ver só os ativos da sua filial) não entra aqui:
  é escopo de linha, o custo que o **D4** recusou ao descartar multi-empresa. Se voltar, é decisão
  nova.

---

## Ordem de commits

```
A: feat(db): Department como entidade, com backfill (migração 1 de 2)
B: feat(user): identidade e ciclo de vida do colaborador
C: feat(assignment): resolverEscalonamento e a fronteira posto × gestor × departamento
D: feat(user): desligamento em uma transação, encerrando posses e ocupações
E: feat(access): Group e permissão por módulo no preHandler de cada rota
F: feat(access): dado sensível no select, ApiToken pessoal e 2FA TOTP
G: feat(access): sync LDAP, login OIDC e portal do colaborador
H: chore(db): DROP COLUMN users.department (migração 2 de 2)
```

O commit **H** só entra depois de a lista de departamentos ser revisada à mão. O lint tem que
passar em cada um. Não há suíte: a verificação é a seção acima.

---

# Fechamento da F11

> Escrito depois de executar, e contra a árvore: as dez etapas do plano de
> implementação da [`AUDITORIA-F11.md`](./AUDITORIA-F11.md) (A–J) estão aplicadas.
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
| **F** | `resolverEscalonamento()`, o aceite passando a usá-lo (D139), a seção *A fronteira* no `MODELO-POSSE.md` e o bloco na aba Posse |
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
| `isVip` / `isRemote` | coluna sem leitor é coluna que ninguém mantém (defeito 11 da auditoria). Quando houver a tela, é migração aditiva de duas linhas |
| nome dividido (`firstName`/`lastName`) | `name` é o campo canônico; dividi-lo exige adivinhar onde termina o nome em "Maria da Silva Souza" |
| SAML | OIDC cobre o Entra ID. A segunda biblioteca seria um segundo caminho de login para manter |
| 2FA obrigatório por grupo | decisão nova: precisa de um lugar para morar e de uma resposta para quem entra hoje sem ter cadastrado |
| revogar UMA sessão | exige tabela de sessão. O `tokenVersion` derruba todas, e é o que o desligamento usa |
| anexo de licença (D94) | dono polimórfico em `Attachment`. É o único item em aberto do `ITAM-TODO.md` |

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
