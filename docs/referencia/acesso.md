# Autenticação — como a sessão nasce, vive e morre

> **Este documento é o contrato da sessão.** O `docs/historico/fase-03-autenticacao-e-ator.md` descreve
> como a autenticação foi construída; este descreve **o que ela é hoje**, por
> que cada peça está onde está, e o que deliberadamente ainda não existe.
>
> A sessão teve três portas (senha, SSO, token pessoal de API) e um segundo fator por TOTP — a F11
> construiu os três. O [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
> e o [D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token) cortaram
> duas das três portas e o segundo fator inteiro: hoje só existe senha + cookie. O que este
> documento descreve é o que sobrou, não o que a F11 tinha construído — para isso, leia
> `docs/historico/fase-11-acesso-avancado.md` sabendo que metade do que ele descreve não existe
> mais.

---

## O caminho completo, em uma tela

```
  POST /api/auth/login
        │
        │  bodyLimit 8 KiB  ·  Cache-Control: no-store  ·  Origin conferida
        │  rate limit 20/min por IP (desligado em NODE_ENV=test — L)
        ▼
  loginSchema (zod strictObject)      ← { email, password }; o e-mail em minúsculas
        │                                campo desconhecido = 422, não "ignorado"
        ▼
  login.usecase                       ← o login é o e-mail do cadastro (R)
        ├─ e-mail sem conta ──────────► argon2 descartável ──► 401
        ├─ lockedUntil no futuro ───────────────────────────────► 423
        ├─ senha errada ──► failedLoginCount++ (5 = trava 15min) ─► 401
        ├─ isActive: false ─────────────────────────────────────► 403
        └─ acerto
             ├─ rehash transparente se o hash for de parâmetros antigos
             ├─ zera contador/trava
             ├─ relê pelo USER_PUBLIC_SELECT, com o cargo e o tokenVersion
             └─ 200
        │
        ▼
  controller assina JWT { sub, tv }   ← `tv` = tokenVersion, a geração da sessão
        │
        ▼
  Set-Cookie: sentinel_sessao  (httpOnly, SameSite=Lax, Secure em produção, 8h)
```

E em **toda** requisição seguinte:

```
  preHandler global (porta fechada por padrão)
        │
        ├─ rota na allowlist pública? ──► passa
        │
        ▼
  jwtVerify lê o cookie ──► falhou? 401 genérico
        │
        ▼
  RELÊ o usuário no banco (isActive: true; o excluído não tem mais linha)
        │   └─ não achou? 401
        ▼
  `tv` do token == tokenVersion da coluna? ──► não? 401
        │
        ▼
  request.user = usuário recém-lido;  request.cargo = o cargo dele
        │   └─ daqui sai a decisão do permission-guard
```

**Não há segundo fator, SSO nem token de API.** As três coisas existiram na F11
e saíram no [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)/[D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token) —
ver a seção *O que saiu, e por quê* abaixo. O agente conversa por `AGENT_TOKEN` fixo no `.env`,
fora deste fluxo inteiramente (`/agent-hub`, autenticação própria).

---

## As seis decisões que sustentam tudo

### 1. A porta é fechada por padrão

O `preHandler` global exige sessão em **toda** rota, e a exceção é escrita à mão
em `ROTAS_PUBLICAS` (`server/app.ts`): os dois health checks, o login e o
`/agent-hub` (que tem autenticação própria) — quatro linhas, cada uma com o motivo ao lado.

**E há uma segunda porta fechada por padrão, do lado da AUTORIZAÇÃO:**
`core/http/permission-guard.ts` exige que toda rota declare o **cargo mínimo** que pede — e
rota registrada sem declaração **derruba o boot**, com o nome dela no erro (D137).
Os dois guards são o mesmo desenho pelo mesmo motivo, e o segundo tem um degrau a
mais: o esquecimento não vira API aberta em silêncio, vira servidor que não sobe.

A alternativa — proteger rota a rota — tem um defeito que não aparece em
revisão: **a rota nova nasce aberta**, e esquecer de protegê-la não gera erro
nenhum, só uma API pública que ninguém notou. Invertendo o padrão, o mesmo
esquecimento vira "a rota nova pede login", que aparece no primeiro teste.

### 2. O token nunca é visto pelo JavaScript

O JWT sai **só** no cookie `httpOnly`, nunca no corpo da resposta. O corpo leva
o usuário, que é o que a tela precisa para se desenhar.

O ganho é específico: um XSS em qualquer tela do painel consegue **usar** a
sessão enquanto a aba está aberta, mas não **exportá-la**. Devolver o token no
corpo criaria o caminho para o front guardá-lo no `localStorage`, e aí o mesmo
XSS levaria a sessão embora para sempre.

O preço é CSRF, pago em três camadas: `SameSite=Lax` no cookie, a conferência de
`Origin` nas rotas de credencial — login, logout, e o cadastro e a edição de usuário, que
carregam senha —, e o CORS com allowlist.

> **Por que `Lax` e não `Strict`:** em desenvolvimento o painel roda na 3000 e a
> API na 3001 (o Vite faz proxy com `changeOrigin`). Com `Strict` o navegador
> simplesmente não envia o cookie, e o sintoma é 401 em tudo **depois de um
> login que respondeu 200**, sem erro nenhum no console.

### 3. O usuário é relido a cada requisição

Parece caro e é a defesa principal contra o token que sobrevive ao usuário:
excluir alguém não apaga o JWT que já está no navegador dele.

A extension de soft delete joga a favor sem código extra — `findFirst` já não
enxerga o apagado. `isActive: false` cai junto.

### 4. `tokenVersion` — o que a releitura sozinha não cobre

A releitura barra quem foi **apagado** ou **desativado**. Não barra quem continua
sendo um usuário válido e ativo — e é exatamente esse o caso de **sessão
roubada**.

O buraco concreto que isso deixava:

| | antes | agora |
|---|---|---|
| Vítima desconfia e troca a senha | invasor **continua dentro** por até 8h | invasor cai na requisição seguinte |
| Admin redefine a senha de alguém | sessões antigas seguem valendo | todas caem |

O mecanismo é um inteiro na linha do usuário, assinado dentro do token como
`tv` e conferido contra a coluna a cada requisição. Trocar a senha — a **Nova senha**
da edição do usuário (`updateUser`) — faz `increment: 1`, e todo token emitido antes
morre de uma vez, sem tabela de sessão e sem lista de revogação.

> `increment`, não `set`: duas redefinições simultâneas leriam o mesmo valor e
> gravariam o mesmo número, e uma das duas não invalidaria nada.

> **Tolerância deliberada:** `tv` **ausente** no token é aceito, pelo mesmo motivo de sempre —
> tokens assinados antes do campo existir não precisam ser recusados em massa sem ganho. `tv`
> presente e diferente é 401.

### 5. As recusas do login, e as frases que elas usam

| Situação | HTTP | Mensagem |
|---|---|---|
| E-mail sem conta | 401 | `E-mail ou senha inválidos.` |
| Senha errada | 401 | *a mesma* |
| Conta travada | 423 | `Conta bloqueada por excesso de tentativas…` |
| Acesso desativado | 403 | `Acesso desativado. Procure o administrador do sistema.` |

Os dois primeiros compartilham a frase porque **duas mensagens diferentes são um
oráculo de quem trabalha aqui**: bastaria varrer e-mails até uma delas mudar.

E a mensagem sozinha não basta — **o tempo também vaza**. O caminho do usuário
inexistente calcula um argon2 descartável (`conferirSenhaInexistente`) para
gastar os mesmos ~50 ms do caminho real. Sem isso, um volta em 1 ms e o outro em
50, e o relógio entrega a lista que a mensagem esconde.

O 403 do desativado tem frase própria de propósito: quem chegou ali já provou que sabe a
senha, não há nada a enumerar, e "e-mail ou senha inválidos" mandaria essa pessoa procurar
um erro de digitação que não existe.

### 6. Argon2id, e o rehash transparente

`argon2id` com os padrões da biblioteca (m=64 MiB, t=3, p=4) — o híbrido
recomendado pela RFC 9106, resistente tanto a canal lateral quanto a GPU.

**A lentidão é o recurso.** Um vazamento do banco dá ao atacante o hash e todo o
tempo do mundo: contra sha256 ele testa bilhões de senhas por segundo; contra
argon2id com 64 MiB por tentativa, dezenas.

O custo certo sobe com o hardware, e aumentá-lo no `hashSenha` só protegeria
quem cadastrasse senha **depois** da mudança — justamente a conta antiga é a que
interessa ao atacante. Por isso `precisaRehash` roda no login, que é o único
momento em que a senha em texto existe legitimamente na memória, e regrava o
hash sem o usuário perceber.

---

## As duas defesas contra força bruta

Elas resolvem problemas **diferentes** e só funcionam juntas:

| | Trava por conta | Teto por IP |
|---|---|---|
| Onde | `login.usecase.ts` | `write-rate-limit` |
| Regra | 5 erros ⇒ 15 min | 20/min |
| Defende | **uma** conta conhecida | a **lista** inteira |
| Fura se | atacante troca de conta | atacante troca de IP |

A trava é, reconhecidamente, uma negação de serviço contra um usuário conhecido:
quem sabe o e-mail de alguém trava a conta em cinco tentativas. Por isso a janela
é de **minutos** e o desbloqueio é **automático** — bloqueio permanente com
desbloqueio manual troca um ataque barato por um chamado garantido. Trocar a
senha pela edição do usuário também destrava, que é o caminho de suporte para quem
se trancou fora.

O teto por IP é desligado em `NODE_ENV=test` ([L](../decisoes/plataforma.md#l--o-teto-de-requisições-é-desligado-em-node_envtest-com-guarda-contra-produção)),
com uma função pura afirmada por teste garantindo que produção nunca sobe sem ele.

---

## A autorização: cargo, não permissão

**Um cargo só, hoje: `ADMIN`** ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)), e todo usuário é Administrador. **A separação de
cargos é decisão a tomar** — ver *O que ainda não existe*, abaixo. A validação de `ADMIN` é a
do D148: os cargos têm ordem, cada rota declara o cargo MÍNIMO que exige em
`route-permissions.ts`, e a pergunta de toda requisição é só "a sessão alcança esse mínimo?" —
aritmética sobre a posição no array, não uma lista de cargos aceitos por rota. Hoje toda rota
autenticada exige `ADMIN`.

**Usuário é quem opera o sistema; colaborador é quem recebe equipamento**
([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)).
São duas tabelas: `users` (quem entra, todos com senha) e `people` (o colaborador, alvo de
posse, sem conta — a aba Colaboradores de Configurações). Quem opera o sistema e também tem um
notebook é cadastrado nos dois lugares. O colaborador da entrega se escolhe por
`GET /api/people/options`.

`request.cargo` é lido na MESMA consulta de sessão que já relê o usuário a cada requisição —
não há coluna de permissão efetiva para cachear nem para divergir do cargo gravado.

**Nunca sem administrador:** `assertSobraAdministrador()` roda no FIM de toda transação que
toca cargo ou `isActive` **ou exclui um usuário**, dentro dela — ver a invariante 17 em
[`invariantes.md`](invariantes.md).

**Ninguém tira a própria conta do jogo** ([W](../decisoes/acesso.md#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo)):
com o id da própria sessão, desativar (`isActive: false`) e excluir são 409 —
`Você não pode desativar a si mesmo. Peça a outro administrador.`, e o mesmo com *excluir*. A
lista desliga os botões Desativar e Excluir da própria linha. Um `role` que não existe é 422
na borda.

**Excluir usuário apaga a linha** ([W](../decisoes/acesso.md#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo)):
sem lixeira e sem Restaurar, e o e-mail fica livre para um cadastro novo. A sessão aberta cai
na requisição seguinte, porque a releitura não encontra mais a conta. Nada aponta para `users`:
a auditoria guarda quem fez POR ESCRITO, nome e e-mail, sem FK ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)) — a
exclusão grava o retrato da conta, e as linhas antigas dela continuam dizendo quem foi.

**O custo de compra do ativo é do `ADMIN`** ([D77](../decisoes/acesso.md#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta)),
e são três portas, todas em `asset/helpers/asset-select.helper.ts` ou ao lado dele. Com um
cargo só, todo mundo vê o custo:

- **a leitura** (listagem, detalhe, ficha do posto) não lê a coluna para quem não é `ADMIN`;
- **a resposta das escritas** (criar, editar, entregar, devolver, dar baixa, restaurar) não leva
  o custo para cargo nenhum (`ASSET_WRITE_SELECT`);
- **a escrita de quem não é `ADMIN`** descarta o custo que chegar (`custoSoDoAdmin`): o
  formulário não tem o campo, e um `purchaseCost: ''` apagaria o valor que não se vê;

A quarta porta era o diff do histórico do ativo, e ela fechou: o histórico é só movimentação, e a
edição do custo fica na auditoria, que tela nenhuma lê ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)).

A busca do leitor (`/api/search`) devolve só o que identifica o ativo, para todo cargo.

**A senha nasce no cadastro, e o login é o e-mail** ([R](../decisoes/acesso.md#r--a-senha-nasce-no-cadastro-e-o-login-é-o-e-mail)).
Não há nome de usuário à parte nem ação separada para dar acesso: o formulário de Usuários
pede nome, e-mail e senha — **Senha\*** obrigatória no cadastro, **Nova senha** opcional na
edição. O campo Cargo, que o [D162](../decisoes/escopo.md#d162--minha-conta-sai-e-o-cargo-vira-campo-do-formulário-de-usuário)
pôs no formulário, saiu com o [Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir): não há o que escolher.

A regra é do servidor, nas duas rotas do formulário — ambas `ADMIN`:

- `POST /api/users` responde **422** sem senha (`createUserSchema`);
- na edição, `password` ausente mantém a atual; presente troca a senha, destrava a conta
  (`failedLoginCount` e `lockedUntil` zerados) e incrementa o `tokenVersion`;
- as duas gravam na auditoria, com quem fez ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)): o retrato da conta no cadastro, o
  `{ de, para }` na edição, e a senha só como `senha: 'alterada'` — nem o hash entra;
- as duas rotas têm o `verificarOrigem` das rotas de credencial (`user.maestro.ts`).

---

## A auditoria — quem fez, só no banco

Toda escrita grava em `audit_logs` quem a fez, na mesma transação ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)). Tela nenhuma a lê: é
do administrador, no banco, para responder se um erro foi de uma conta ou do sistema.

- **`USER`** — a conta da sessão (`atorDaRequisicao`), com nome e e-mail por escrito e o número
  da requisição, que o servidor gera sempre (o `X-Request-Id` do cliente é ignorado);
- **`SYSTEM`** — o vínculo automático da reconciliação em `ON` (`job:reconciliacao`) e o
  `conceder-administrador` (`cli:conceder-administrador:<usuário do sistema operacional>`), quando
  o cargo muda — com um cargo só (Z), hoje nunca;
- **`ANONYMOUS`** — a tela de login sem sessão: a senha errada, a conta bloqueada e a desativada
  gravam na conta, mas sem autor, porque quem digitou não provou ser ela. Na conta bloqueada, uma
  linha por bloqueio, e não uma por tentativa. A entrada certa é `USER` (`LOGIN`), e a saída
  também (`LOGOUT`). E-mail que não existe não grava nada.

A linha não se altera nem se apaga (trigger `audit_logs_imutavel`), e a coerência do autor é
`CHECK`. As consultas prontas estão em
[`prisma/verificacoes/auditoria.sql`](../../prisma/verificacoes/auditoria.sql).

---

## O que saiu, e por quê

Até o [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
e o [D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token) o sistema
tinha: grupos com uma matriz de permissões nomeadas (`access.manage`, `settings.manage`, …),
diretório LDAP (sincronização que marcava quem saiu, sem desligar ninguém), SSO por OIDC/PKCE,
segundo fator por TOTP com códigos de recuperação, uma trilha `AuthEvent` própria para tentativas
de login, e um `ApiToken` com dono polimórfico (agente **ou** pessoa) para integração.

**Por quê:** nenhuma dessas sete peças exercita regra de ITAM — são 2.300 linhas de servidor
para um sistema que terá três contas, protegendo rotas que um enum de cargo protege igual. O
D137 (boot derruba sem exigência declarada) continua de pé; o que mudou é o que a exigência
diz.

**O que ficou sem a troca que as apoiava:**
- a autorização por cargo (D148) substitui a união de permissões de grupo (D76) — a mesma
  régua, com menos granularidade e sem tabela `Group`;
- o agente volta a autenticar por `AGENT_TOKEN` fixo no `.env` (D149) — não há mais token
  pessoal de API, nem rota para emitir um.

Nada disso é regressão silenciosa: cada peça está documentada na decisão que a cortou, com o
motivo. Quem precisar reconstruir alguma — segundo fator obrigatório, uma integração de
terceiro — encontra ali o que já foi tentado e por que saiu.

---

## O que ainda não existe (e é decisão, não esquecimento)

| Falta | Por quê |
|---|---|
| **Revogar uma sessão específica** | Exige tabela de sessão: saber QUAIS sessões existem para derrubar uma. O `tokenVersion` derruba **todas** de uma pessoa de uma vez, e é com ele que trocar a senha corta o acesso. "Desconectar este aparelho" continua sem existir |
| **Logout derrubar as outras sessões** | Hoje `logout` só apaga o cookie local. Quem precisa derrubar tudo troca a senha pela edição do usuário (**Nova senha**), que incrementa o `tokenVersion` |
| **A separação de cargos** — **decisão a tomar** | Hoje há um cargo só, `ADMIN` ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)). Falta decidir quais cargos existem, o que cada um alcança, qual nasce por padrão e como a tela de Usuários escolhe o cargo. A validação de `ADMIN` está de pé (`CARGOS` em `access/helpers/cargo.ts`, o mapa de `route-permissions.ts`, o `usePode` da tela); a separação se constrói do zero |
| **Trocar a própria senha sem passar por Usuários** | A senha se troca na edição do usuário, e a tela que daria isso a cada um — "Minha conta" — saiu ([D162](../decisoes/escopo.md#d162--minha-conta-sai-e-o-cargo-vira-campo-do-formulário-de-usuário)). Com todo mundo `ADMIN`, cada um troca a sua editando a si mesmo em Usuários |
| **Política de senha no `.env`** | O mínimo de 12 caracteres é constante em `auth.schema.ts`. Não há demanda para torná-lo configurável |
| **Segundo fator, SSO, diretório, token pessoal de API** | Existiram e saíram — [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)/[D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token). Voltar é decisão nova, não bug |
| **Trilha de tentativas de login** (`AuthEvent`) | Saiu com o D148, por não ter leitor que sobrevivesse ao corte. `failedLoginCount`/`lockedUntil` continuam protegendo a conta; o que falta é um registro consultável de *quando* |
| **Reset de senha por e-mail** | Não há mais e-mail no sistema (segundo de-escopo, O). O caminho é alguém com cargo `ADMIN` definir uma **Nova senha** na edição do usuário (`PUT /api/users/:id`) |

> **Nota sobre o mínimo de 12 caracteres:** ele vale para **definir** senha
> (`senhaNova`, que o cadastro e a edição de usuário importam), não para o login. No login só existe o teto de 128
> caracteres — quem já tem uma senha curta precisa continuar entrando, e recusar
> por tamanho ali entregaria a regra de comprimento a quem está adivinhando.

---

## Onde cada coisa mora

```
server/domain/auth/
├── auth.maestro.ts                      rotas + ROTA_DE_CREDENCIAL (bodyLimit, no-store, Origin, só cookie)
├── auth.types.ts                        SessionUser, SessaoEmitida, o payload do JWT
├── controllers/auth.controller.ts        só HTTP: assina o JWT, grava o cookie, responde o GET /api/auth/me
├── helpers/
│   ├── auth-hardening.helper.ts         semCache + verificarOrigem
│   ├── authenticate-request.helper.ts   o que o preHandler global chama
│   ├── password.helper.ts               argon2id, hash descartável, precisaRehash
│   └── session-cookie.helper.ts         atributos do cookie, iguais na gravação e na limpeza
├── schemas/auth.schema.ts               loginSchema ({ email, password }) e senhaNova, a regra que o cadastro importa
└── use-cases/
    ├── current-user.usecase.ts          releitura por requisição (inclui o cargo)
    └── login.usecase.ts                 as quatro recusas

server/domain/user/                      quem opera o sistema — onde a senha nasce e se troca (R, U)
├── user.maestro.ts                      POST/PUT com o verificarOrigem das rotas de credencial
├── helpers/credencial.helper.ts         o hash da Nova senha, fora da transação
└── use-cases/
    ├── create-user.usecase.ts           a senha do cadastro
    └── update-user.usecase.ts           a Nova senha: troca, destrava, increment do tokenVersion

server/domain/access/                    a OUTRA metade da sessão: o que ela alcança
├── access.types.ts
├── helpers/cargo.ts                     os cargos, com ordem (D148) — hoje só ADMIN (Z)
├── helpers/route-permissions.ts         método + rota → cargo mínimo (o mapa que o boot confere)
├── helpers/require-permission.ts        temCargo() e exigirPermissao() (403 que nomeia o cargo)
├── helpers/ultimo-administrador.ts      a invariante 17 — nunca sem administrador
└── cli/conceder-administrador.cli.ts    a linha de escape do acesso

server/core/http/require-auth.ts         a porta fechada por padrão (sessão)
server/core/http/permission-guard.ts     a porta fechada por padrão (autorização) + a conferência do boot
server/app.ts                            ROTAS_PUBLICAS — a allowlist inteira
tests/invariantes/sessao.test.ts         a sessão por HTTP
tests/invariantes/permissao.test.ts      a cobertura do mapa, o "nunca sem administrador" e a senha no cadastro
```

---

## Ver também

- `docs/historico/fase-03-autenticacao-e-ator.md` — como a autenticação foi construída (D22, D23, Etapas A–G)
- `docs/historico/fase-11-acesso-avancado.md` — a autorização por grupo, o segundo fator, o token
  pessoal e o SSO como foram construídos (D72–D78, D135–D142) — **metade não existe mais**; ver
  [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)/[D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token)/[P](../decisoes/acesso.md#p--usuario-não-entra-no-painel)
- `docs/referencia/invariantes.md` — as regras que o banco garante
- `docs/referencia/testes.md` — por que a suíte só fala HTTP
