# Autenticação — como a sessão nasce, vive e morre

> **Este documento é o contrato da sessão.** O `docs/historico/fase-03-autenticacao-e-ator.md` descreve
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
        ├─ 2FA ativo, sem código ───────────────────────────────► 401 + etapa:TOTP
        │                                                          (NÃO conta tentativa)
        ├─ 2FA ativo, código errado ──► failedLoginCount++ ─────► 401 + etapa:TOTP
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
em `ROTAS_PUBLICAS` (`server/app.ts`): os dois health checks, o login, o
`/agent-hub` (que tem autenticação própria), o termo de entrega (quem assina pode
não ter conta — D27) e, quando o SSO está configurado, as duas rotas do OIDC mais a
pergunta "este servidor tem SSO?" que a tela de login faz.

**E desde a F11 há uma segunda porta fechada por padrão, do lado da AUTORIZAÇÃO:**
`core/http/permission-guard.ts` exige que toda rota declare a chave que pede — e
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

## As TRÊS portas (F11) — e por que a sessão continua sendo uma

Até a F10 havia um caminho de entrada: usuário, senha, cookie. A F11 acrescentou
dois, e nenhum deles é uma segunda sessão.

```
  1. SENHA (+ segundo fator)      POST /api/auth/login        → cookie httpOnly
  2. SSO (OIDC)                   GET  /api/auth/oidc/start   → cookie httpOnly
  3. TOKEN PESSOAL DE API         Authorization: Bearer sw_…   → sessão da requisição
```

**As duas primeiras terminam no MESMO cookie, assinado pelo mesmo lugar.** O
`concluirLoginOidc()` devolve a mesma `SessaoEmitida` do `login.usecase.ts`
justamente por isso: duas formas de "sessão emitida" significariam dois jeitos de
montar o cookie, e um deles ficaria sem o `tv` no primeiro refactor.

**A terceira não emite cookie nenhum.** O token é conferido a cada requisição e a
sessão vale por aquela requisição só. Ele não é um atalho para escapar da
autorização: passa pela MESMA releitura de usuário e carrega as MESMAS permissões
(o `preHandler` não sabe por qual porta a requisição entrou — exceto onde isso
importa, ver abaixo).

---

## O segundo fator (TOTP)

Seis dígitos de um aplicativo autenticador, pedidos **depois** da senha. Três
colunas em `users`, nenhuma tabela nova (D80).

| Coluna | O que é |
|---|---|
| `totpSecret` | o segredo em base32, **cifrado** com AAD `users:totpSecret:<id>` (D81) |
| `totpEnabledAt` | nulo = cadastro **não confirmado**. É esta data que o login consulta |
| `totpRecoveryCodes` | oito códigos `XXXXX-XXXXX`, em **sha256**, de uso único |

### Por que o cadastro é em dois passos, com estado no banco

`enroll` grava o segredo com `totpEnabledAt` nulo; `confirm` confere um código e
preenche a data. Entre os dois, **o login continua pedindo só a senha**.

A alternativa — devolver o segredo e exigi-lo de volta no `confirm`, sem gravar
nada — tem dois defeitos: o segredo passaria a viajar do cliente para o servidor
como dado de entrada confiável, e quem fechasse a aba entre ler o QR e digitar o
código ficaria com o autenticador configurado contra um segredo que o sistema
esqueceu. Uma linha no celular que nunca vai funcionar, sem jeito de descobrir.

**E o estado intermediário não tranca ninguém** — é por isso que o login olha
`totpEnabledAt`, nunca `totpSecret`.

### O login em dois envios, e a senha que é reenviada

O servidor responde **401 com `etapa: 'TOTP'`** quando a senha confere e o código
falta. A tela mostra o campo e reenvia os três valores numa requisição só.

Reenviar a senha é deliberado: um "login pela metade" guardado no servidor seria
uma meia-sessão — com validade, lugar para morar e um token próprio para o cliente
trazer de volta —, ou seja, uma segunda forma de sessão existir ao lado do cookie.
A senha ainda está na memória do formulário de qualquer maneira: ela acabou de ser
digitada nele.

### As duas contagens, que são diferentes

| Situação | Conta tentativa? | Evento |
|---|---|---|
| senha certa, código **ausente** | **não** | `TOTP_REQUIRED` |
| senha certa, código **errado** | **sim** (trava em 5) | `TOTP_FAIL` |

A primeira acontece em todo login legítimo de quem tem 2FA — contá-la travaria a
conta de quem acertou a senha cinco vezes seguidas. A segunda conta porque seis
dígitos com três códigos válidos por janela seriam, sem isso, o único campo do
sistema com tentativa ilimitada.

> **A janela é de ±1 passo**, e na otplib 13 isso se escreve `epochTolerance: [30, 30]`
> — em SEGUNDOS, não em passos. Passar `1` compila e dá uma tolerância de um
> segundo: o código expiraria na virada do passo e a pessoa veria "código inválido"
> digitando o número que o celular mostra.

### Desligar exige um código. E não existe rota para desligar o de outra pessoa

Sem o código, quem roubasse uma sessão aberta desligaria a proteção com um clique
— e ela valeria só contra quem tem a senha.

E uma rota de "administrador desliga o 2FA de alguém" é a porta que o 2FA veio
fechar: bastaria comprometer uma conta com `access.manage` para esvaziar o segundo
fator de todo mundo. Quem perdeu o celular **e** os oito códigos é destravado por
comando de linha, que exige acesso ao servidor:

```bash
npm run totp:desativar -- maria.silva
```

O evento fica na trilha **sem `ip` e sem `userAgent`** — não houve requisição —, e
é essa ausência que distingue o destravamento manual do dia em que a própria
pessoa desativou pela tela.

---

## O token pessoal de API

`sw_<prefixo>.<segredo>` no `Authorization: Bearer`. Mesma tabela e mesmo caminho
de autenticação do token de agente (D80); o que muda é o `ownerType` e o dono.

**O que ele é:** a pessoa, por outro meio. Mesmas permissões, mesmo `actorId` no
`ActivityLog`.

**O que ele não é:** um caminho para mexer na própria credencial. As rotas de
credencial (`ROTA_DE_CREDENCIAL`, no maestro) exigem **cookie**, e o
`exigirSessaoDeCookie` responde 403 a um token que tente trocar senha, emitir
outro token ou alterar o segundo fator. Um token que emite tokens é um token que
não se revoga; um token que desliga o 2FA é o 2FA desligado.

### Duas ausências deliberadas

- **não há conferência de `tokenVersion`.** O `tv` é a geração do COOKIE; um token
  de API não foi assinado com número nenhum. Então **trocar a senha não revoga
  token pessoal** — são credenciais separadas, e quem trocou a senha não pediu para
  derrubar a integração que deixou rodando. O que revoga em massa é o
  **desligamento**, onde a intenção é exatamente cortar tudo.
- **o cabeçalho ganha do cookie** quando os dois vêm juntos. Se o cookie ganhasse,
  um script rodando de dentro do navegador autenticaria pela sessão do operador —
  com as permissões dele — e o `lastUsedAt` do token nunca andaria.

---

## O SSO (OIDC) e o diretório (LDAP)

> **LDAP sincroniza; OIDC autentica; ninguém entra sem cadastro** (D78).

As duas coisas são **desligadas por padrão** e só existem configuradas. As rotas
de SSO nem são registradas sem `OIDC_ISSUER` — uma rota pública que existe sem
provedor configurado é superfície de ataque que responde erro.

### As variáveis de ambiente, e por que elas não estão no banco

```bash
# Diretório (opcional). As quatro primeiras são obrigatórias JUNTAS.
LDAP_URL=ldaps://dc01.empresa.local:636
LDAP_BIND_DN=CN=svc-sentinel,OU=Servicos,DC=empresa,DC=local
LDAP_BIND_PASSWORD=...
LDAP_BASE_DN=DC=empresa,DC=local
LDAP_FILTER=            # opcional; o padrão exclui conta desabilitada no AD
LDAP_TIMEOUT_SEGUNDOS=30

# SSO (opcional). As quatro são obrigatórias JUNTAS.
OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://inventario.empresa.com/api/auth/oidc/callback
```

O resto da configuração do produto mora no `AppSetting` (hora do alerta, prefixo
de etiqueta, limiares), e aqui a escolha é a oposta por três razões: **são segredos
de serviço** (guardá-los no banco pediria uma tela que exibe ou substitui o segredo
do diretório corporativo, alcançável por quem tiver `settings.manage`), **mudá-los
não é operação de rotina**, e **ausente tem de querer dizer DESLIGADO já no boot**.

> **`OIDC_REDIRECT_URI` é obrigatória e não é deduzida da requisição.** Montar a
> URL de callback a partir do `Host` que o cliente mandou é como se constrói um
> open redirect: bastaria um `Host:` forjado para o provedor devolver o código de
> autorização para outro servidor.

### O fluxo, e onde mora o `state`

`state`, `nonce` e o verificador do PKCE viajam num cookie `httpOnly` de **dez
minutos**, assinado com o mesmo `JWT_SECRET`. Não é uma sessão: não tem `sub`, não
autentica nada, e o `preHandler` de sessão nem olha para ele.

Memória de processo não serviria (dois contêineres atrás de um balanceador não a
compartilham, e o callback pode cair no outro — o login falharia de forma
intermitente, só em produção); uma tabela seria uma linha por tentativa de login,
com expurgo próprio, para guardar três strings por 60 segundos.

### Quem entra, e quem é recusado

| Caso | O que acontece |
|---|---|
| `externalId` casa | entra |
| e-mail casa e `authSource` é `LDAP`/`OIDC` | entra, e o vínculo é gravado |
| e-mail casa e `authSource` é `LOCAL` | **403** + `OIDC_DENIED` |
| e-mail não existe | **403** + `OIDC_DENIED` |

Provisionar no primeiro login (*JIT provisioning*) é cômodo e transformaria o
diretório inteiro em operadores do inventário. E fundir uma conta `LOCAL` pelo
e-mail deixaria quem controla aquele endereço no provedor herdar os grupos de uma
conta criada aqui — inclusive o `Administrador`. O vínculo é explícito, por
`PUT /api/users/:id/auth-source`, com `access.manage` e `ActivityLog` do DE→PARA.

> ⚠️ **O SSO não pede o segundo fator local.** Quem tem TOTP aqui e entra por SSO
> não digita código: a verificação de identidade é a do provedor, que tem o MFA
> dele. É uma troca consciente — exigir o código depois do redirecionamento pediria
> a meia-sessão que o login de senha recusou criar —, e o que limita o risco é a
> linha acima: o SSO só alcança contas que alguém marcou explicitamente como
> federadas. Se o provedor não exigir MFA, a resposta certa é exigir MFA no provedor.

### A sincronização MARCA; ela não desliga

Uma rodada por dia (`job_runs`, nome `sync-ldap`), na hora configurada para os
alertas. Quem sai do diretório ganha `directoryMissingAt` e aparece na ficha com um
aviso — **ninguém é desligado**.

Um filtro LDAP mal escrito, uma OU renomeada ou um controlador fora do ar devolvem
"zero pessoas", e um job que desligasse por isso devolveria o inventário da empresa
ao estoque numa madrugada: o desligamento faz checkin em massa e encerra as
ocupações (F11, Etapa G). Por isso a **rodada vazia não marca ninguém**, e o log
diz o que conferir.

---

## O que ainda não existe (e é decisão, não esquecimento)

| Falta | Por quê |
|---|---|
| **Revogar uma sessão específica** | Exige tabela de sessão: saber QUAIS sessões existem para derrubar uma. O `tokenVersion` derruba **todas** de uma pessoa, e é com ele que o desligamento corta o acesso. "Desconectar este aparelho" continua sem existir |
| **Logout derrubar as outras sessões** | Hoje `logout` só apaga o cookie local. Quem precisa derrubar tudo usa o `set-password`, que incrementa o `tokenVersion` |
| **Política de senha no `.env`** | O mínimo de 12 caracteres é constante no `auth.schema.ts`. Não há demanda para torná-lo configurável |
| **Segundo fator obrigatório por grupo** | Hoje o 2FA é opcional e de iniciativa de cada pessoa. "Todo mundo de `access.manage` precisa ter" é uma regra defensável e é decisão NOVA: ela precisa de um lugar para morar (uma flag no grupo) e de uma resposta para a pessoa que entra hoje sem ter cadastrado — bloquear o login dela ou obrigá-la a cadastrar na hora |
| **SAML** | Só OIDC (D78). Entra ID fala os dois, e SAML pediria uma segunda biblioteca, uma segunda forma de validar asserção assinada e um segundo caminho de login para manter. Nenhum provedor em uso aqui exige SAML |
| **Reset de senha por e-mail** | O caminho hoje é alguém com `access.manage` definir a senha (`POST /api/users/:id/set-password`). Um fluxo de "esqueci a senha" é um token de uso único por e-mail — o mesmo mecanismo do termo de aceite (F4) —, e ele reabre uma superfície pública que ninguém pediu |

> **O RBAC e o 2FA SAÍRAM desta tabela** — a F11 os fez existir. A autorização é a
> união das permissões dos grupos (D76), conferida por um hook global que **derruba o
> boot** se alguma rota não declarar o que exige (D137); o segundo fator está na
> seção acima. E a linha do RBAC dizia que *"o filtro entra no `setUserPassword`"* —
> entrou, e com a chave que a auditoria escolheu: `access.manage`, não `users.edit`,
> porque quem troca a senha de alguém entra como essa pessoa e herda os grupos dela.

> **Nota sobre o mínimo de 12 caracteres:** ele vale para **definir** senha
> (`setPasswordSchema`), não para o login. No login só existe o teto de 128
> caracteres — quem já tem uma senha curta precisa continuar entrando, e recusar
> por tamanho ali entregaria a regra de comprimento a quem está adivinhando.

---

## Onde cada coisa mora

```
server/domain/auth/
├── auth.maestro.ts                      rotas + ROTA_DE_CREDENCIAL (bodyLimit, no-store, Origin, só cookie)
├── auth.types.ts                        SessionUser, SessaoEmitida, o payload do JWT (duas formas)
├── controllers/auth.controller.ts        só HTTP: assina o JWT, grava o cookie
├── cli/desativar-totp.cli.ts            a linha de escape do 2FA (comando, nunca rota)
├── helpers/
│   ├── actor.helper.ts                  quem está agindo (o actorId do D23) + a sessão das rotas /me
│   ├── api-token.helper.ts              a forma `prefixo.segredo`, e o sha256 do segredo
│   ├── auth-hardening.helper.ts         semCache + verificarOrigem
│   ├── authenticate-request.helper.ts   o que o preHandler global chama — cookie OU Bearer
│   ├── password.helper.ts               argon2id, hash descartável, precisaRehash
│   ├── request-context.helper.ts        ip + user-agent para a trilha
│   ├── session-cookie.helper.ts         atributos do cookie, iguais na gravação e na limpeza
│   └── totp.helper.ts                   RFC 6238 em função pura: segredo, URI, janela, recuperação
├── schemas/auth.schema.ts               loginSchema (+ totp/recoveryCode), setPasswordSchema
└── use-cases/
    ├── authenticate-api-token.usecase.ts  o Bearer, para AGENT e para USER
    ├── current-user.usecase.ts          releitura por requisição (2 variantes)
    ├── login.usecase.ts                 as três recusas + o segundo fator
    ├── manage-api-tokens.usecase.ts     emitir/listar/revogar, por ESCOPO de dono
    ├── manage-totp.usecase.ts           cadastro em dois passos, códigos, desativação
    ├── record-auth-event.usecase.ts     a trilha, best-effort
    └── set-user-password.usecase.ts     senha + username + increment do tokenVersion

server/domain/access/                    a OUTRA metade da sessão: o que ela alcança
├── helpers/permission-catalog.ts        as 35 chaves, em código
├── helpers/route-permissions.ts         método + rota → chave (o mapa que o boot confere)
├── helpers/require-permission.ts        temPermissao() e exigirPermissao() (403 que nomeia a chave)
├── helpers/directory-config.helper.ts   LDAP e OIDC: ausente = DESLIGADO
├── cli/conceder-administrador.cli.ts    a linha de escape do acesso
├── controllers/oidc.controller.ts       os dois redirecionamentos e o cookie do desafio
├── jobs/ldap-sync.job.ts                uma rodada por dia (job_runs: `sync-ldap`)
└── use-cases/
    ├── effective-permissions.usecase.ts a UNIÃO dos grupos (D76), na consulta de sessão (D136)
    ├── oidc-login.usecase.ts            state, nonce, PKCE — e as três recusas do D78
    ├── set-auth-source.usecase.ts       o vínculo explícito (access.manage)
    └── sync-ldap.usecase.ts             traz e MARCA; nunca desliga

server/core/http/require-auth.ts         a porta fechada por padrão (sessão)
server/core/http/permission-guard.ts     a porta fechada por padrão (autorização) + a conferência do boot
server/app.ts                            ROTAS_PUBLICAS — a allowlist inteira
tests/invariantes/sessao.test.ts         16 testes, todos por HTTP
tests/invariantes/permissao.test.ts      a cobertura do mapa e o "nunca sem administrador"
tests/invariantes/segundo-fator.test.ts  os três estados do 2FA, o login em dois envios, as duas contagens
tests/invariantes/token-pessoal.test.ts  o que o token alcança — e o que ele NÃO pode fazer
tests/acesso/                            o diretório e o SSO, inclusive o comportamento do desligado
```

---

## Ver também

- `docs/historico/fase-03-autenticacao-e-ator.md` — como a autenticação foi construída (D22, D23, Etapas A–G)
- `docs/historico/fase-11-acesso-avancado.md` — a autorização, o segundo fator, o token pessoal e o SSO
  (D72–D78, D135–D142), com a revisão do plano e o fechamento no mesmo arquivo
- `docs/referencia/invariantes.md` — as regras que o banco garante
- `docs/referencia/testes.md` — por que a suíte só fala HTTP
