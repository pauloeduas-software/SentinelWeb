# Autenticação — como a sessão nasce, vive e morre

> **Este documento é o contrato da sessão.** Ele descreve **o que ela é hoje**, por
> que cada peça está onde está, e o que deliberadamente ainda não existe.
>
> Só existe senha + cookie.

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
        │                    (trava vencida: a contagem recomeça do zero)
        ├─ isActive: false ─────────────────────────────────────► 403
        └─ acerto
             ├─ rehash transparente se o hash for de parâmetros antigos
             ├─ zera contador/trava
             ├─ relê pelo USER_PUBLIC_SELECT, com o cargo, o tokenVersion e o mustChangePassword
             └─ 200
        │
        ▼
  controller assina JWT { sub, tv }   ← `tv` = tokenVersion, a geração da sessão
        │
        ▼
  Set-Cookie: sentinel_sessao  (httpOnly, SameSite=Lax, Secure em produção, 48h)
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

**Não há segundo fator, SSO nem token de API** ([D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem), [D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token)). O agente conversa por `AGENT_TOKEN` fixo no `.env`,
fora deste fluxo inteiramente (`/agent-hub`, autenticação própria).

---

## As seis decisões que sustentam tudo

### 1. A porta é fechada por padrão

O `preHandler` global exige sessão em **toda** rota, e a exceção é escrita à mão
em `ROTAS_PUBLICAS` (`server/app.ts`): os dois health checks, o login e o
`/agent-hub` (que tem autenticação própria) — quatro linhas, cada uma com o motivo ao lado, mais as duas do Swagger fora de produção.

**E há uma segunda porta fechada por padrão, do lado da AUTORIZAÇÃO:**
`infra/http/permission-guard.ts` exige que toda rota declare o **cargo mínimo** que pede — e
rota registrada sem declaração **derruba o boot**, com o nome dela no erro (D137).
Os dois guards são o mesmo desenho pelo mesmo motivo, e o segundo tem um degrau a
mais: o esquecimento não vira API aberta em silêncio, vira servidor que não sobe.
Ficam fora da conferência as rotas de `ROTAS_PUBLICAS`, os dois health checks
nomeados um a um em `foraDaConferencia` e — em produção, pelo mesmo flag
`estaticoPublico` do guard de sessão — os arquivos do painel: o
`@fastify/static` registra uma rota por arquivo do `dist`, com hash no nome, e o
catch-all `GET /*` entrega o `index.html`. A regra é a mesma do guard de sessão,
GET fora de `/api`; é pelo padrão da rota, para `/api/nao-existe` continuar sendo o
404 da API e não um 500 por "rota não declarada".

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
`Origin` nas rotas de credencial — login, logout, cadastro, edição e senha temporária de
usuário, e o nome e a senha de Minha conta —, e o CORS com allowlist.

> **Por que `Lax` e não `Strict`:** em desenvolvimento o painel roda na 3000 e a
> API na 3001 (o Vite faz proxy com `changeOrigin`). Com `Strict` o navegador
> simplesmente não envia o cookie, e o sintoma é 401 em tudo **depois de um
> login que respondeu 200**, sem erro nenhum no console.

### 3. O usuário é relido a cada requisição

Parece caro e é a defesa principal contra o token que sobrevive ao usuário:
excluir alguém não apaga o JWT que já está no navegador dele.

Excluir apaga a linha ([W](../decisoes/acesso.md#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo)),
então a releitura não encontra quem foi excluído. E ela procura com `isActive: true`, então o
desativado cai junto.

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
`tv` e conferido contra a coluna a cada requisição. Trocar a senha — a própria, em Minha
conta, ou gerar a temporária de alguém — faz `increment: 1`, e todo token emitido antes
morre de uma vez, sem tabela de sessão e sem lista de revogação.

> `increment`, não `set`: duas redefinições simultâneas leriam o mesmo valor e
> gravariam o mesmo número, e uma das duas não invalidaria nada.

> `tv` é **obrigatório**: ausente ou diferente, é 401.

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

A trava dura 15 minutos e **a contagem recomeça do zero quando ela vence**: o primeiro erro depois
do desbloqueio é o primeiro de novo, e não o sexto — sem isso, a conta travava outra vez a cada erro
até alguém acertar a senha. O zero é um `UPDATE` condicional (`lockedUntil <= agora`) na mesma
transação do erro, para uma rajada somar certo.

O 423 é a brecha que ficou, e foi aceita: o e-mail sem conta nunca trava, então quem errar a
senha cinco vezes de propósito descobre que aquele e-mail tem conta. Fechar exigiria contar
tentativa também de e-mail que não existe, que não tem linha onde guardar a contagem. E
responder "e-mail ou senha inválidos" à conta travada deixaria a pessoa de verdade sem saber
por que a senha certa não entra. Com o teto de 20 tentativas por minuto por IP, são quatro
e-mails por minuto, para descobrir o que o formato `nome.sobrenome@empresa` já entrega.

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
desbloqueio manual troca um ataque barato por um chamado garantido. Gerar uma
senha temporária também destrava, que é o caminho de suporte para quem
se trancou fora.

O teto por IP é desligado em `NODE_ENV=test` ([L](../decisoes/plataforma.md#l--o-teto-de-requisições-é-desligado-em-node_envtest-com-guarda-contra-produção)),
com uma função pura afirmada por teste garantindo que produção nunca sobe sem ele.

---

## A autorização: cargo, não permissão

**Três cargos, em ordem: `TECNICO < SUPERVISOR < ADMIN`** ([AV](../decisoes/acesso.md#av--três-cargos-técnico-supervisor-e-administrador)). Os cargos têm ordem (D148),
cada rota declara o cargo MÍNIMO que exige em `route-permissions.ts`, e a pergunta de toda
requisição é só "a sessão alcança esse mínimo?" — aritmética sobre a posição no array, não uma
lista de cargos aceitos por rota. A conta nova nasce `TECNICO`.

| | Técnico | Supervisor | Administrador |
|---|:-:|:-:|:-:|
| Ler tudo da operação, e o catálogo (os formulários escolhem categoria, modelo, localização) | ✅ | ✅ | ✅ |
| Entregar, devolver, ocupar posto, trocar a chave da entrega | ✅ | ✅ | ✅ |
| Cadastrar e editar computador, item de estoque e colaborador | ✅ | ✅ | ✅ |
| Vincular máquina, aceitar ou recusar sugestão, marcar revisão | ✅ | ✅ | ✅ |
| Excluir, desativar, lixeira, baixa, encerrar e reabrir licença | — | ✅ | ✅ |
| Cadastrar e editar posto, licença e o catálogo (Configurações) | — | ✅ | ✅ |
| Ver o custo, comando remoto, Reconciliar agora, configurar a descoberta | — | ✅ | ✅ |
| Usuários | — | — | ✅ |

**Desativar vai pelo `PUT` da edição** (colaborador e item de estoque), que é do Técnico: o mapa
não separa os dois, e o controller exige Supervisor quando o corpo traz `isActive`. A lixeira
(`?view=trashed` em computadores e colaboradores) é recusada do mesmo jeito, e a ficha do
computador e a do colaborador excluídos só abrem para o Supervisor: para o Técnico é 404. O 403 nomeia o
cargo que falta: "Esta ação exige o cargo de Supervisor ou acima." A tela esconde o que o cargo
não alcança — item do menu, URL digitada (volta para a raiz, `SoCargo` em `App.tsx`), botões e a
aba Lixeira —, e isso é interface: quem autoriza é o servidor.

**Usuário é quem opera o sistema; colaborador é quem recebe equipamento**
([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)).
São duas tabelas: `users` (quem entra, todos com senha) e `people` (o colaborador, alvo de
posse, sem conta — a página Colaboradores). Quem opera o sistema e também tem um
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

**O custo de compra do ativo é do `SUPERVISOR`** ([D77](../decisoes/acesso.md#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta)),
e são três portas, todas em `asset/helpers/asset-select.helper.ts` ou ao lado dele:

- **a leitura** (listagem, detalhe, ficha do posto) não lê a coluna para quem não é `SUPERVISOR`;
- **a resposta das escritas** (criar, editar, entregar, devolver, dar baixa, restaurar) não leva
  o custo para cargo nenhum (`ASSET_WRITE_SELECT`);
- **a escrita de quem não é `SUPERVISOR`** descarta o custo que chegar (`custoSoDoSupervisor`): o
  formulário não tem o campo, e um `purchaseCost: ''` apagaria o valor que não se vê;

O custo da licença segue a mesma regra na leitura: `licenseSelect(podeVerCusto)` tira a coluna da
listagem e do detalhe para quem não é `SUPERVISOR`, e as escritas da licença já são dele.

A quarta porta era o diff do histórico do ativo, e ela fechou: o histórico é só movimentação, e a
edição do custo fica na auditoria, que tela nenhuma lê ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)).

**O login é o e-mail, e ninguém escolhe a senha de outra pessoa** ([R](../decisoes/acesso.md#r--a-senha-nasce-no-cadastro-e-o-login-é-o-e-mail), [AU](../decisoes/acesso.md#au--ninguém-escolhe-a-senha-de-outra-pessoa)).
Não há nome de usuário à parte nem ação separada para dar acesso: o formulário de Usuários
pede nome, e-mail e cargo ([D162](../decisoes/escopo.md#d162--minha-conta-sai-e-o-cargo-vira-campo-do-formulário-de-usuário), [AV](../decisoes/acesso.md#av--três-cargos-técnico-supervisor-e-administrador)), e **nenhuma senha**.

A regra é do servidor, nas duas rotas do formulário — ambas `ADMIN`:

- `POST /api/users` cria a conta com uma **senha temporária**, que volta uma vez na resposta
  (`temporaryPassword`) e a tela mostra para entregar; a conta nasce com `mustChangePassword` e a
  pessoa escolhe a dela ao entrar. Senha no corpo é **422** (`createUserSchema`);
- a edição muda nome, e-mail e cargo, e desativa ou ativa; senha no corpo também é **422**. A de quem
  esqueceu é a temporária, abaixo; a própria é em Minha conta;
- as duas gravam na auditoria, com quem fez ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)): o retrato da conta no cadastro e o
  `{ de, para }` na edição — senha nenhuma entra;
- as duas rotas têm o `verificarOrigem` das rotas de credencial (`user.maestro.ts`).
- A exceção é o comando de terminal que cria administrador ([AP](../decisoes/acesso.md#ap--o-administrador-nasce-por-comando-como-no-snipe-it)):
  ali quem roda é a própria pessoa, e a senha do comando é a dela.

### A senha temporária e Minha conta ([AR](../decisoes/acesso.md#ar--a-senha-temporária-e-minha-conta-voltam))

Quem esqueceu a senha não precisa de um administrador que a escolha: ele **gera uma temporária**
(`POST /api/users/:id/temporary-password`, `ADMIN`) e a entrega.

```
  admin: "Gerar senha temporária" ──► senha aleatória de 16 símbolos, em grupos de 4
        │                              (sai UMA vez na resposta, `no-store`; nada dela na auditoria)
        ▼
  a conta fica com mustChangePassword = true, o login destrava e as sessões abertas caem
        │
        ▼
  a pessoa entra com a temporária ──► a sessão só alcança três rotas:
        │                              GET /api/auth/me · POST /api/auth/logout · PUT /api/auth/password
        │                              (qualquer outra: 403 "Troque a senha temporária antes de continuar.")
        ▼
  o painel mostra só a tela "Escolha a sua senha" ──► PUT /api/auth/password
        │
        ▼
  marca zerada; a sessão que trocou recebe o cookie novo e segue dentro
```

- **Para a própria conta é 409:** a sua você troca em Minha conta. Gerar uma temporária para si
  mesmo só o jogaria para fora.
- **Para a conta desativada também é 409:** o login a recusa, então a temporária não serviria, e
  ainda apagaria a senha da pessoa. A tela nem oferece: ative antes.
- **Gerada, a senha tranca o painel:** os campos travam e o rodapé vira só Fechar, como no cadastro.
  O Salvar fechava o painel sem perguntar, e a senha ia junto.
- **A lista de Usuários avisa** ([CB](../decisoes/acesso.md#cb--usuários-avisa-quem-está-com-a-senha-temporária)): a
  conta com a marca leva o selo Senha temporária ao lado do nome, da conta nova até a troca. A senha não
  volta: quem a perdeu gera outra.
- **Minha conta** (`/conta`, aberta pelo menu do usuário, no cabeçalho) tem o **nome** (`PATCH /api/auth/me`)
  e a **senha** (`PUT /api/auth/password`). O e-mail é o login e o cargo é dado de administrador:
  os dois ficam em Usuários. As duas rotas são `null` no mapa — a sessão basta, e o id vem dela,
  nunca do caminho. A tela segue o Meu Perfil da IntraNet (AY): quem é à esquerda, e as abas Dados
  pessoais e Senha à direita.
- **Trocar a própria senha não derruba quem trocou.** O `tokenVersion` sobe e derruba as *outras*
  sessões da conta; a resposta traz o cookie da geração nova (`reemitirSessao`), e só a sessão que
  trocou sobrevive.
- **A troca obrigatória não pede a temporária de novo** (AU): a pessoa acabou de digitá-la no login, e
  a sessão com ela não alcança mais nada. Só recusa a nova igual à temporária.
- **Em Minha conta, a troca pede a senha atual** e recusa a igual e a curta. A
  atual errada é 422, e não 401: a sessão é válida, o dado é que está errado — um 401 faria o
  painel dizer "sessão expirada". O teto contra quem adivinha a atual com uma sessão roubada é o de
  20/min por IP, o mesmo do login; o erro não conta contra a trava da conta, porque isso deixaria
  quem roubou a sessão travar o dono fora.
---

## A auditoria — quem fez, só no banco

Toda escrita grava em `audit_logs` quem a fez, na mesma transação ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)). Tela nenhuma a lê: é
do administrador, no banco, para responder se um erro foi de uma conta ou do sistema.

- **`USER`** — a conta da sessão (`atorDaRequisicao`), com nome e e-mail por escrito e o número
  da requisição, que o servidor gera sempre (o `X-Request-Id` do cliente é ignorado);
- **`SYSTEM`** — o vínculo automático da reconciliação em `ON` (`job:reconciliacao`) e a conta
  criada pelo `acesso:administrador` (`cli:criar-administrador:<usuário do sistema operacional>`,
  [AP](../decisoes/acesso.md#ap--o-administrador-nasce-por-comando-como-no-snipe-it));
- **`ANONYMOUS`** — a tela de login sem sessão: a senha errada, a conta bloqueada e a desativada
  gravam na conta, mas sem autor, porque quem digitou não provou ser ela. Na conta bloqueada, uma
  linha por bloqueio, e não uma por tentativa. A entrada certa é `USER` (`LOGIN`), e a saída
  também (`LOGOUT`). E-mail que não existe não grava nada.

A linha não se altera nem se apaga (trigger `audit_logs_imutavel`), e a coerência do autor é
`CHECK`. As consultas prontas estão em
[`prisma/verificacoes/auditoria.sql`](../../prisma/verificacoes/auditoria.sql).

---

## O que ainda não existe (e é decisão, não esquecimento)

| Falta | Por quê |
|---|---|
| **Revogar uma sessão específica** | Exige tabela de sessão: saber QUAIS sessões existem para derrubar uma. O `tokenVersion` derruba **todas** de uma pessoa de uma vez, e é com ele que trocar a senha corta o acesso. "Desconectar este aparelho" continua sem existir |
| **Logout derrubar as outras sessões** | Hoje `logout` só apaga o cookie local. Quem precisa derrubar tudo troca a própria senha em Minha conta, ou o administrador gera uma temporária; os dois incrementam o `tokenVersion` |
| **Política de senha no `.env`** | O mínimo de 12 caracteres é constante em `auth.schema.ts`. Não há demanda para torná-lo configurável |
| **Segundo fator, SSO, diretório, token pessoal de API** | Existiram e saíram — [D148](../decisoes/escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)/[D149](../decisoes/escopo.md#d149--o-apitoken-sai-e-o-agente-volta-ao-agent_token). Voltar é decisão nova, não bug |
| **Trilha de tentativas de login** (`AuthEvent`) | Saiu com o D148, por não ter leitor que sobrevivesse ao corte. `failedLoginCount`/`lockedUntil` continuam protegendo a conta; o que falta é um registro consultável de *quando* |
| **Reset de senha por e-mail** | Não há mais e-mail no sistema (segundo de-escopo, O). O caminho é alguém com cargo `ADMIN` gerar uma **senha temporária** (AR). Se nenhum administrador lembra a senha, o `bun run acesso:administrador` cria outro no servidor ([AP](../decisoes/acesso.md#ap--o-administrador-nasce-por-comando-como-no-snipe-it)) |

> **Nota sobre o mínimo de 12 caracteres:** ele vale para **definir** senha
> (`senhaNova`, da troca da própria senha e do comando que cria administrador), não para o login. No login só existe o teto de 128
> caracteres — quem já tem uma senha curta precisa continuar entrando, e recusar
> por tamanho ali entregaria a regra de comprimento a quem está adivinhando.

---

## Onde cada coisa mora

- `server/modules/auth/`: o login, o cookie e a troca da própria senha.
- `server/modules/user/`: a conta, onde a senha nasce e se troca (R, U).
- `server/modules/access/`: o que a sessão alcança. `helpers/route-permissions.ts` é o mapa que o boot
  confere, e `cli/criar-administrador.cli.ts` é a primeira conta e a linha de escape (AP).
- `server/infra/http/`: `require-auth.ts` e `permission-guard.ts`, as duas portas fechadas por padrão.
- `server/app.ts`: `ROTAS_PUBLICAS`, a allowlist inteira.
- `tests/invariantes/`: `sessao`, `credencial`, `senha-temporaria` e `permissao`.

---

## Ver também

- `docs/decisoes/acesso.md` — por que a sessão, a permissão e a identidade são assim
- `docs/referencia/invariantes.md` — as regras que o banco garante
- `docs/referencia/testes.md` — por que a suíte só fala HTTP
