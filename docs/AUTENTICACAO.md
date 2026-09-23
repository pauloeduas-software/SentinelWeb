# Autenticação — como a sessão nasce, vive e morre

> **Este documento é o contrato da sessão.** O `docs/FASE-3-PLANO-ITAM.md` descreve
> como a autenticação foi construída; este descreve **o que ela é hoje**, por
> que cada peça está onde está, e o que deliberadamente ainda não existe.
>
> Ele nasceu de uma comparação concreta: a lógica de login do **IntraChat**,
> outro projeto da casa, foi lida inteira e confrontada com esta. O resultado
> **não** foi "copiar de lá" — foi descobrir que cada lado é mais forte em
> metades diferentes. A seção [Comparação com o IntraChat](#comparação-com-o-intrachat)
> guarda esse veredito, porque a pergunta vai voltar.

---

## O caminho completo, em uma tela

```
  POST /api/auth/login
        │
        │  bodyLimit 8 KiB  ·  Cache-Control: no-store  ·  Origin conferida
        │  rate limit 20/min por IP
        ▼
  loginSchema (zod strictObject)      ← campo desconhecido = 422, não "ignorado"
        │
        ▼
  login.usecase
        ├─ usuário não existe / sem senha ──► argon2 descartável ──► 401 + LOGIN_FAIL
        ├─ lockedUntil no futuro ───────────────────────────────► 423 + LOGIN_BLOCKED
        ├─ senha errada ──► failedLoginCount++ (5 = trava 15min) ─► 401 + LOGIN_FAIL
        ├─ isActive: false ─────────────────────────────────────► 403 + LOGIN_DISABLED
        └─ acerto
             ├─ rehash transparente se o hash for de parâmetros antigos
             ├─ zera contador/trava, grava lastLoginAt
             ├─ relê pelo USER_PUBLIC_SELECT
             └─ LOGIN_OK
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
  RELÊ o usuário no banco (isActive: true, fora da lixeira)
        │   └─ não achou? 401
        ▼
  `tv` do token == tokenVersion da coluna? ──► não? 401
        │
        ▼
  request.user = usuário recém-lido   ← daqui sai o actorId de todo ActivityLog
```

---

## As seis decisões que sustentam tudo

### 1. A porta é fechada por padrão

O `preHandler` global exige sessão em **toda** rota, e a exceção é escrita à mão
em `ROTAS_PUBLICAS` (`server/app.ts`). Hoje são quatro linhas: os dois health
checks, o login e o `/agent-hub` (que tem autenticação própria).

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
`Origin` nas rotas de credencial, e o CORS com allowlist.

> **Por que `Lax` e não `Strict`:** em desenvolvimento o painel roda na 3000 e a
> API na 3001 (o Vite faz proxy com `changeOrigin`). Com `Strict` o navegador
> simplesmente não envia o cookie, e o sintoma é 401 em tudo **depois de um
> login que respondeu 200**, sem erro nenhum no console.

### 3. O usuário é relido a cada requisição

Parece caro e é a defesa principal contra o token que sobrevive ao usuário:
mandar alguém para a lixeira não apaga o JWT que já está no navegador dele.

A extension de soft delete joga a favor sem código extra — `findFirst` já não
enxerga o apagado. `isActive: false` (desligamento, F11) cai junto.

### 4. `tokenVersion` — o que a releitura sozinha não cobre

A releitura barra quem foi **apagado** ou **desligado**. Não barra quem continua
sendo um usuário válido e ativo — e é exatamente esse o caso de **sessão
roubada**.

O buraco concreto que isso deixava:

| | antes | agora |
|---|---|---|
| Vítima desconfia e troca a senha | invasor **continua dentro** por até 8h | invasor cai na requisição seguinte |
| Admin redefine a senha de alguém | sessões antigas seguem valendo | todas caem |

O mecanismo é um inteiro na linha do usuário, assinado dentro do token como
`tv` e conferido contra a coluna a cada requisição. `setUserPassword` faz
`increment: 1` — e todo token emitido antes morre de uma vez, sem tabela de
sessão e sem lista de revogação.

> `increment`, não `set`: duas redefinições simultâneas leriam o mesmo valor e
> gravariam o mesmo número, e uma das duas não invalidaria nada.

> **Tolerância deliberada:** `tv` **ausente** no token é aceito. Os tokens que
> já estavam em navegadores no momento do deploy foram assinados sem o campo, e
> recusá-los deslogaria todo mundo sem ganho nenhum (quem nunca trocou a senha
> tem `tokenVersion` 0). Tolerar um campo *ausente* não é tolerar um campo
> *divergente*: `tv` presente e diferente é 401.

### 5. As três recusas e as duas frases

| Situação | HTTP | Mensagem | Evento |
|---|---|---|---|
| Usuário não existe | 401 | `Usuário ou senha inválidos.` | `LOGIN_FAIL` |
| Cadastrado sem senha | 401 | *a mesma* | `LOGIN_FAIL` |
| Senha errada | 401 | *a mesma* | `LOGIN_FAIL` |
| Conta travada | 423 | `Conta bloqueada… até 15 minutos.` | `LOGIN_BLOCKED` |
| Acesso desativado | 403 | `Acesso desativado. Procure o administrador.` | `LOGIN_DISABLED` |

Os três primeiros compartilham a frase porque **duas mensagens diferentes são um
oráculo de quem trabalha aqui**: bastaria varrer nomes até uma delas mudar.

E a mensagem sozinha não basta — **o tempo também vaza**. O caminho do usuário
inexistente calcula um argon2 descartável (`conferirSenhaInexistente`) para
gastar os mesmos ~50 ms do caminho real. Sem isso, um volta em 1 ms e o outro em
50, e o relógio entrega a lista que a mensagem esconde.

O 403 do desativado tem frase **própria** de propósito: quem chegou ali já provou
que sabe a senha, não há nada a enumerar, e "usuário ou senha inválidos" mandaria
essa pessoa procurar um erro de digitação que não existe.

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

## A trilha de autenticação (`auth_events`)

O sistema tinha `ActivityLog` para tudo que muda num ativo e **nada** para o
acesso em si. Não havia como responder *"alguém tentou entrar na conta do fulano
no fim de semana?"* — que em inventário de TI é a primeira pergunta de qualquer
incidente.

| Tipo | Quando |
|---|---|
| `LOGIN_OK` | entrou |
| `LOGIN_FAIL` | conta inexistente, sem senha, ou senha errada |
| `LOGIN_BLOCKED` | tentou com a conta já travada |
| `LOGIN_DISABLED` | senha **certa**, acesso desligado |
| `LOGOUT` | saiu |
| `PASSWORD_CHANGED` | senha redefinida (e sessões derrubadas) |

**Por que tabela própria e não mais um `ActivityLog`:** aquele é
entidade-cêntrico (`entityType` + `entityId` + o que mudou) e pressupõe um ator
identificado. Aqui a linha mais importante é justamente a que **não tem
usuário** — a tentativa contra um login que não existe. Espremer isso no
`ActivityLog` daria `entityId` nulo, `action: 'LOGIN_FAIL'` e um `changes`
carregando IP: três campos mentindo sobre o que são.

Três regras que o código garante e a suíte prova:

1. **A senha tentada nunca é gravada.** Log com senha é vazamento permanente,
   com data e IP anexados. Há um teste que varre a tabela inteira atrás dela.
2. **O log não distingue o que a resposta não distingue.** Conta inexistente e
   senha errada saem as duas como `LOGIN_FAIL` — separar os tipos seria
   construir dentro de casa o oráculo que a mensagem única esconde.
3. **Gravar o evento nunca derruba o login.** `registrarEventoAuth` engole o
   próprio erro: trocar perda de auditoria por indisponibilidade total seria o
   negócio errado. O erro vai para o log da aplicação.

---

## As duas defesas contra força bruta

Elas resolvem problemas **diferentes** e só funcionam juntas:

| | Trava por conta | Teto por IP |
|---|---|---|
| Onde | `login.usecase.ts` | `LOGIN_RATE_LIMIT` |
| Regra | 5 erros ⇒ 15 min | 20/min |
| Defende | **uma** conta conhecida | a **lista** inteira |
| Fura se | atacante troca de conta | atacante troca de IP |

A trava é, reconhecidamente, uma negação de serviço contra um usuário conhecido:
quem sabe o login de alguém trava a conta em cinco tentativas. Por isso a janela
é de **minutos** e o desbloqueio é **automático** — bloqueio permanente com
desbloqueio manual troca um ataque barato por um chamado garantido. Redefinir a
senha também destrava, que é o caminho de suporte para quem se trancou fora.

---

## Comparação com o IntraChat

A lógica de login do IntraChat foi lida inteira antes de qualquer mudança aqui,
na hipótese de que fosse "mais completa e mais segura". **Ela é mais madura em
uma metade e mais fraca na outra.** Este é o veredito, para não ser refeito.

### Onde o IntraChat é melhor — e foi portado

| O que | Por que importa |
|---|---|
| **`tokenVersion`** | Fechava o buraco real descrito acima: trocar a senha não derrubava ninguém. |
| **Trilha `AuthEvent`** | Aqui não havia registro nenhum de tentativa de acesso. |
| **`Cache-Control: no-store`** | A resposta do login carrega `Set-Cookie`; um proxy corporativo guardando isso entrega a sessão a quem passar depois. |
| **Conferência de `Origin`** | Segunda camada anti-CSRF, para não depender de uma única linha num atributo de cookie. |
| **`needsRehash`** | Upgrade transparente do custo do hash. |
| **`lastLoginAt`** | "Quem ainda usa o sistema" antecede toda limpeza de acesso. |
| **`bodyLimit` na rota de auth** | O login é a única rota que um anônimo alcança; o teto global de 1 MiB é generoso demais para ela. |

### Onde o IntraChat é **pior** — e nada foi portado

| O que | Veredito |
|---|---|
| **bcrypt (custo 12)** vs. **argon2id** | Portar seria **downgrade**. bcrypt é leve em memória (~4 KB) e por isso atacável em GPU; argon2id com 64 MiB por tentativa, não. Ainda: bcrypt trunca em 72 bytes silenciosamente. |
| **`authMiddleware` opt-in por rota** | Lá, rota nova esquecida nasce **pública**. Aqui nasce protegida. |
| **`accessToken` no corpo da resposta** | Lá o token de acesso é guardado em JS e um XSS o rouba. Aqui ele nunca sai do cookie `httpOnly`. O IntraChat protege bem o *refresh* e expõe o *access*. |
| **`findUnique` sem `select` no login** | Carrega a linha inteira, hash de senha incluso, e escolhe os campos na mão depois. Aqui o `USER_PUBLIC_SELECT` é a única porta de saída de um usuário. |
| **Validação com `typeof` no controller** | Aqui é `zod.strictObject`: campo desconhecido é 422, e não ignorado em silêncio. |

### Onde é discutível — e a escolha foi ficar como está

**Atraso progressivo (Redis) em vez de trava por conta.** O IntraChat nunca
bloqueia: conta as tentativas no Redis e faz cada nova demorar mais, com teto de
8 s. É genuinamente melhor em **disponibilidade** — resolve a DoS-contra-um-usuário
que a nossa trava tem. Mas: (a) exige Redis, que este projeto não usa e não
justificaria só para isto; (b) o `sleep` segura a requisição aberta, então uma
rajada de tentativas prende conexões do servidor — troca um problema por outro.
A trava de 15 min com desbloqueio automático, somada ao teto por IP, cobre o
caso real a um custo operacional muito menor.

**Refresh token rotativo com detecção de reuso por família.** É a peça mais
sofisticada do IntraChat: access de 15 min, refresh de 7 dias persistido em hash,
rotação a cada uso, e reuso de um token já rotacionado derruba a família inteira.

Não foi portado, e o motivo não é preguiça: **o valor prático dele aqui já está
coberto**. O que a rotação entrega é (1) janela curta para token vazado e (2)
capacidade de revogar. Aqui, (1) é o TTL de 8 h somado à releitura por
requisição, e (2) é o `tokenVersion`. O que continua faltando é **revogar uma
sessão específica** ("desconectar este aparelho") — e isso exige tabela de
sessão, que é o `ApiToken` da Etapa G. Quando ela existir, é lá que entra.

---

## O que ainda não existe (e é decisão, não esquecimento)

| Falta | Por quê |
|---|---|
| **RBAC** | Hoje todo mundo que tem login é administrador. Qualquer sessão válida redefine a senha de qualquer um. O filtro entra no `setUserPassword`, que é o ponto único por onde a senha muda. → **F11** |
| **Revogar uma sessão específica** | Exige tabela de sessão. → **Etapa G** |
| **Logout derrubar as outras sessões** | Hoje `logout` só apaga o cookie local. Quem precisa derrubar tudo usa o `set-password`. |
| **Política de senha no `.env`** | O mínimo de 12 caracteres é constante no `auth.schema.ts`. Não há demanda para torná-lo configurável. |
| **2FA** | Nunca foi pedido. |

> **Nota sobre o mínimo de 12 caracteres:** ele vale para **definir** senha
> (`setPasswordSchema`), não para o login. No login só existe o teto de 128
> caracteres — quem já tem uma senha curta precisa continuar entrando, e recusar
> por tamanho ali entregaria a regra de comprimento a quem está adivinhando.

---

## Onde cada coisa mora

```
server/domain/auth/
├── auth.maestro.ts                      rotas + ROTA_DE_CREDENCIAL (bodyLimit, no-store, Origin)
├── auth.types.ts                        SessionUser, SessaoEmitida, o payload do JWT
├── controllers/auth.controller.ts        só HTTP: assina o JWT, grava o cookie
├── helpers/
│   ├── actor.helper.ts                  quem está agindo (o actorId do D23)
│   ├── auth-hardening.helper.ts         semCache + verificarOrigem
│   ├── authenticate-request.helper.ts   o que o preHandler global chama
│   ├── password.helper.ts               argon2id, hash descartável, precisaRehash
│   ├── request-context.helper.ts        ip + user-agent para a trilha
│   └── session-cookie.helper.ts         atributos do cookie, iguais na gravação e na limpeza
├── schemas/auth.schema.ts               loginSchema, setPasswordSchema (strictObject)
└── use-cases/
    ├── current-user.usecase.ts          releitura por requisição (2 variantes)
    ├── login.usecase.ts                 as três recusas
    ├── record-auth-event.usecase.ts     a trilha, best-effort
    └── set-user-password.usecase.ts     senha + username + increment do tokenVersion

server/core/http/require-auth.ts         a porta fechada por padrão
server/app.ts                            ROTAS_PUBLICAS — a allowlist inteira
tests/invariantes/sessao.test.ts         16 testes, todos por HTTP
```

---

## Ver também

- `docs/FASE-3-PLANO-ITAM.md` — como a autenticação foi construída (D22, D23, Etapas A–G)
- `docs/INVARIANTES.md` — as regras que o banco garante
- `docs/TESTES.md` — por que a suíte só fala HTTP
