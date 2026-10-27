# Decisões de acesso: sessão, permissão e identidade

> Quem entra, o que alcança e por qual porta. O contrato está em [`referencia/acesso.md`](../referencia/acesso.md).
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D22–D26, D72–D78, D80, D89, D135–D142, P da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)) e R, S, T, U, W, X, Z e AB, que vieram depois da varredura
> Q e continuaram a letra.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D22 — Sessão em cookie `httpOnly`, não em `localStorage`.

**Decidido:** JWT curto em cookie `httpOnly` + `Secure` em produção, assinado com
`JWT_SECRET`. Nenhum token no corpo da resposta.
**Descartado:** Bearer token guardado no `localStorage` pelo front.
**Por quê:** um XSS em qualquer página do app lê o `localStorage` inteiro e leva a
sessão embora; o cookie `httpOnly` não é legível por JavaScript, então o mesmo XSS
consegue *usar* a sessão enquanto a aba está aberta, mas não *exportá-la*. O preço
é CSRF, e ele se paga com `SameSite` mais o CORS já fechado da F0 — que recusa
`*` e trabalha com allowlist de origem desde o primeiro dia.

---

## D23 — `actorId` é parâmetro obrigatório, não `AsyncLocalStorage`.

> **Superada por [X](#x--o-histórico-não-guarda-quem-fez):** o histórico deixou de guardar quem fez, e o
> parâmetro saiu de todos os use-cases.
>
> **E revivida por [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** o autor volta, obrigatório por parâmetro, como último argumento
> de cada use-case — agora um `Ator` (conta, sistema ou login sem sessão), não só o `actorId`.

**Decidido:** o controller lê `request.user.id` e passa adiante; a assinatura do
use-case **exige** o argumento.
**Descartado:** `AsyncLocalStorage` em `core` guardando o ator da requisição.
**Por quê:** o ALS é menos digitação e falha em silêncio — um caminho que não
propague o contexto (um job, um `setImmediate`, o hub do agente) grava `null` e
ninguém descobre até auditar. O parâmetro obrigatório transforma cada esquecimento
em erro de compilação, que é a única verificação automática que este repositório
tem hoje. E manteria "ator" dentro de `core`, que não pode conhecer negócio.
O preço é tocar ~20 assinaturas **uma vez**.

---

## D24 — O histórico anterior fica sem ator. Não há backfill.

> **Superada por [X](#x--o-histórico-não-guarda-quem-fez):** não há mais autor em histórico nenhum, antigo ou novo.
>
> **E de volta com [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** o autor volta só daqui para a frente. As linhas gravadas sem autor não
> foram carimbadas em ninguém — ficaram fora da tabela nova, guardadas fora do projeto.

**Decidido:** tudo que foi gravado antes do login continua com `actorId: null`, e
a tela mostra "—".
**Descartado:** atribuir os registros antigos ao primeiro administrador, ou criar
um usuário `system` e carimbar tudo nele.
**Por quê:** auditoria falsificada é pior que auditoria ausente, porque parece
confiável. "Fulano arquivou 40 ativos em janeiro" seria mentira com aparência de
prova, e alguém a usaria numa conversa real. É a mesma razão pela qual
`ActivityLog.actorId` nasceu nulável em vez de segurar o `ActivityLog` até a F3:
registro sem ator é registro; registro com ator errado é dano.

---

## D25 — Ocupação de posto não ganha coluna de ator.

> **Superada por [X](#x--o-histórico-não-guarda-quem-fez):** as colunas de autor saíram também da entrega e do
> estoque, e a pergunta "quem cadastrou a Laura na Mesa 1?" deixou de ter resposta.
>
> **E de volta com [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** a pergunta volta a ter resposta, e no lugar que este parágrafo
> dizia — a auditoria (`audit_logs`), não uma coluna na ocupação.

**Decidido:** `LocationOccupant` continua sem `openedById`/`closedById`.
**Descartado:** espelhar `checkoutById`/`checkinById` por simetria.
**Por quê:** `Assignment` tem essas colunas porque **o nome sai impresso no termo
de entrega** — é dado de negócio, que precisa sobreviver a qualquer expurgo de
log. A ocupação não gera documento: "quem cadastrou a Laura na Mesa 1?" é pergunta
de auditoria, e a resposta é o `ActivityLog`. Duas colunas por simetria seriam
dado duplicado com uma fonte a mais para divergir.

---

## D26 — `createdById`/`updatedById` só onde a tela mostra.

**Decidido:** as duas colunas no `Asset`, não nas 14 tabelas.
**Descartado:** o item do TODO como está escrito ("em todas as tabelas").
**Por quê:** o `ActivityLog` já responde *quem criou isto* — a linha `CREATE` está
lá, com o ator. A coluna existe para não fazer essa consulta **por linha** na tela
de detalhe do ativo, que é a única que mostra o dado. Nas outras treze, seria
desnormalização paga sem ninguém para cobrar. Quando uma tela nova precisar, é
migração aditiva de duas colunas.

> **Superada pela varredura [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai):** as duas colunas saíram do `Asset` —
> e do `License` e do `StockItem`, que as tinham ganhado depois. A tela de detalhe do ativo nunca
> chegou a mostrá-las; quem criou e quem editou continua no `ActivityLog`, que é onde este
> parágrafo já dizia que a resposta estava.
>
> **E depois, [X](#x--o-histórico-não-guarda-quem-fez):** o `ActivityLog` também deixou de guardar o autor.
>
> **E depois, [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** o autor volta, na `audit_logs`. As colunas continuam fora.

---

## D72 — Posto responde pelo ativo; departamento agrupa pessoas; gestor escalona.

**Decidido:** a tabela da Etapa F. **Descartado:** `Department` como detentor de ativo; e gestor
entrando na resolução de responsabilidade. Entregar "para o Comercial" é entregar para uma sala ou
para uma pessoa — departamento não tem mesa, não tem chave e não assina nada. Aceitá-lo como alvo
de `Assignment` acrescentaria um quarto valor ao `AssignmentTarget` cujo "responsável" seria a
lista inteira de quem trabalha lá: a pluralidade voltaria a crescer multiplicativamente, que é o
que o D14 evitou. E gestor não responde porque responsabilidade, aqui, é *quem está com o
equipamento*. Se um dia "o gestor responde junto" for regra do cliente, é **decisão nova e
explícita** — não efeito colateral de as duas colunas existirem.

---

## D73 — `resolverEscalonamento()` é função separada de `resolverResponsaveis()`.

**Decidido:** duas funções. **Descartado:** um `else` dentro de `resolverResponsaveis()` devolvendo
o gestor da localidade quando o posto está vago. O `else` é tentador e destrói o sinal mais útil do
modelo: com ele **todo ativo passa a ter responsável**, e *"ativo em posto vago"* — o relatório da
F2, o alerta da auditoria da F8 — deixa de ser expressável. São perguntas diferentes: *quem está
com isto* e *para quem eu ligo*; uma admite vazio, a outra existe para preencher o vazio da
primeira.

`resolverEscalonamento()` sobe a árvore de `Location` até achar um `managerId`, com teto de
profundidade — a mesma guarda que o `location-cycle.helper.ts` já usa, pelo mesmo motivo: o banco
aceita ciclo (provado na F1).

---

## D74 — Desligar não é apagar. E encerrar ocupações é passo do fluxo.

**Decidido:** `terminatedAt` + `isActive`, com o passo 3 da Etapa G. **Descartado:** soft delete no
desligamento; e "a pessoa inativa some da resolução sozinha". `deletedAt` significa *este cadastro
não devia existir*; `terminatedAt` significa *esta pessoa trabalhou aqui*, e quem saiu continua
aparecendo no histórico de posse — é a pergunta "quem estava com o notebook antes?" que o
`../referencia/modelo-de-posse.md` protege ao nunca apagar histórico. A segunda parte é técnica e está verificada:
a extension **não escopa leitura aninhada** (D8), então nenhuma flag em `users` remove a pessoa da
lista de ocupantes de um posto.

---

## D75 — `Department` é a décima spec do catálogo, e a troca de coluna é em duas migrações.

**Decidido:** `department.spec.ts` em `specs/index.ts`; `add + backfill` numa migração, `drop` na
seguinte. **Descartado:** um domínio `department/` completo; e migração única. É CRUD plano — nome,
busca, 409 por uso —, e o `../referencia/arquitetura.md` diz que acrescentar tabela de catálogo *é escrever a
spec*. Os dois tempos são o preço de a janela do D6 ter fechado: com dado dentro,
`add`+`backfill`+`drop` num commit só transforma um rollback em perda de dado.

*(O plano dizia "oitava spec"; quando a fase foi executada o catálogo já tinha nove, e o
`Department` entrou como a décima.)*

---

## D76 — Permissão é união permissiva. Não existe `deny`.

**Decidido:** efetiva = união das chaves dos grupos. **Descartado:** flag de negação por grupo.
Negação em união cria dependência de ordem e transforma *"por que ela não consegue ver?"* numa
investigação por N grupos; sem `deny`, a resposta é sempre a mesma — **nenhum grupo dela concede a
chave** —, e quem não deve ter algo perde o grupo. O risco do modelo é o contrário do óbvio: chave
digitada errada em `permissions` não dá erro nenhum, só **nega em silêncio**. Por isso o catálogo
de chaves é declarado em código, e a verificação confere que toda chave usada em
`requirePermission` existe nele.

---

## D77 — Dado sensível é filtrado no `select`, não mascarado na resposta.

**Decidido:** o dado que não deve sair **não é lido**. O `select` explícito por domínio é, desde a
F0, o único lugar onde se decide o que sai. **Descartado:** ler tudo e apagar campo antes de
responder.

**Obrigação cruzada:** a allowlist de colunas da F10 — export CSV, report builder, seletor de
colunas — passa a ser **filtrada pelas mesmas permissões**. Sem isso, exportar é a porta dos fundos
do custo de compra, e o report builder é a da chave de licença.

**O alcance real, pela revisão:** não é `assetSelect(perms)`/`licenseSelect(perms)` como o plano
escrevia. São três mecanismos, porque os três dados sensíveis são diferentes — ver o defeito 4, o
D138 e o D140.

> **Revisão (varredura Q):** sobrou um dado sensível, o custo de compra do ativo, e ele vazava
> por três portas que a leitura não cobria: a resposta das escritas (lidas com o select cheio),
> o diff do histórico e a busca do leitor. As escritas passaram a responder sem o custo para
> todo cargo, a escrita do técnico descarta o custo que chegar — o formulário dele abria o campo
> vazio e o salvar apagava o valor —, o histórico tira a coluna do diff de quem não é `ADMIN` e a
> busca devolve só o que identifica o ativo. O mapa das quatro portas está em
> [`../referencia/acesso.md`](../referencia/acesso.md#a-autorização-cargo-não-permissão).
>
> **E depois, [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** o histórico do ativo deixou de
> ter diff — é só movimentação —, e a porta do diff fechou. A edição do custo fica na auditoria,
> que tela nenhuma lê.

---

## D78 — LDAP sincroniza; OIDC autentica; ninguém entra sem cadastro.

**Decidido:** `ldapts` só importa e atualiza cadastro; o login corporativo é OIDC (Entra ID), com
vínculo pelo `oid`. **Descartado:** bind de senha contra o AD; SAML; e provisionamento JIT.
Autenticar contra o AD faz a aplicação virar funil de credencial corporativa, com TLS a pinar e
senha a trafegar, e o OIDC resolve login sem que a senha passe por aqui. O vínculo é pelo `oid`,
**não pelo e-mail**: no Entra, `preferred_username` diverge de `mail` com frequência e e-mail muda
quando a pessoa casa ou a empresa troca de domínio; `oid` é imutável. Sem JIT porque o TODO pede
recusar quem não está cadastrado, e porque criar colaborador no login faz o cadastro de pessoas
depender de quem clicou primeiro.

---

## D80 — Um `ApiToken` só, com dono polimórfico.

**O conflito.** A F3 (Etapa G) cria `ApiToken` com `endpointId` — o token **por
agente**. A F11 (Etapa F) cria `ApiToken` com `userId` — o token **pessoal**. Os
dois planos acham que criam *"o"* `ApiToken`.

**Decidido:** **uma** tabela, com uma coluna dizendo quem é o dono.

```prisma
enum ApiTokenOwner { AGENT  USER }

model ApiToken {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  ownerType   ApiTokenOwner
  userId      String?  @db.Uuid      // só quando ownerType = USER
  endpointId  String?  @db.Uuid      // só quando ownerType = AGENT — e NULO ATÉ O PRIMEIRO HANDSHAKE
  prefix      String   @unique
  tokenHash   String
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdById String?  @db.Uuid
  @@map("api_tokens")
}
```

**Por que uma tabela:** o caminho de autenticação é **idêntico** nos dois casos —
procurar pelo prefixo, comparar o hash em tempo constante, conferir `revokedAt`,
carimbar `lastUsedAt`. Duas tabelas seriam duas cópias da parte mais sensível do
sistema, e a segunda esqueceria uma das quatro no primeiro ajuste.

**O detalhe que muda o desenho:** o token do agente é gerado **antes de a máquina
existir no sistema** — no momento em que o agente é instalado. Então
`endpointId` nasce **nulo** e é preenchido no primeiro handshake. A partir daí,
o mesmo token chegando de **outra** máquina é sinal de token copiado, e vira
alerta — não um `UPDATE` silencioso do vínculo.

**O CHECK que garante a coerência** (o Prisma não o expressa; vai à mão na
migration, como os índices parciais):

```sql
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_dono_coerente" CHECK (
     ("ownerType" = 'USER'  AND "userId" IS NOT NULL AND "endpointId" IS NULL)
  OR ("ownerType" = 'AGENT' AND "userId" IS NULL)
);
```

Note que `AGENT` **não** exige `endpointId`: é justamente o estado de antes do
primeiro handshake.

**Afeta:** [`../historico/fase-03-autenticacao-e-ator.md`](../historico/fase-03-autenticacao-e-ator.md) (Etapa G) e
[`../historico/fase-11-acesso-avancado.md`](../historico/fase-11-acesso-avancado.md) (Etapa F). A F3 cria a tabela inteira,
com o enum e o CHECK; a F11 só acrescenta a tela e o caminho `USER`.

---

## D89 — A troca do `AGENT_TOKEN` pelo `ApiToken` é por convivência, com prazo.

**Decidido:** durante a transição, `authenticate-agent.helper.ts` aceita **os dois**: o
`ApiToken` por prefixo e, se não casar, o `AGENT_TOKEN` compartilhado — este último logando
`warn` com o IP a cada uso. Quando o log parar de aparecer, o caminho antigo sai, num commit só,
deliberado.
**Descartado:** corte seco na subida da migration.
**Por quê:** o agente é um binário C# que **não está neste repositório** e roda em máquinas que
ninguém desliga para atualizar em bloco. Cortar o token compartilhado num deploy derruba a frota
inteira e, pior, derruba o canal por onde se descobriria que ela caiu: quem não conecta não
reporta.

**O log de depreciação é a parte que não pode faltar.** Sem ele, a convivência vira permanente
por esquecimento — o token compartilhado fica no `.env` por mais um ano e a fase é dada como
concluída. Com ele, a pergunta *"já dá para cortar?"* tem resposta observável.

---

## D135 — O contrato do departamento muda na Etapa D, não no `DROP COLUMN`.

**Decidido:** `USER_PUBLIC_SELECT` continua **sem** departamento; nasce `USER_LIST_SELECT` com
`department: { select: { id, name } }` para a listagem de pessoas. **Descartado:** `department:
{ select: … }` no select embutido; e deixar front, importador e `USER_SORTABLE` para o commit final.
O select público é o `assignedTo` de todo ativo e o `user` de toda ocupação — é o mesmo argumento que
já manteve `isActive`/`terminatedAt` no `USER_DETAIL_SELECT`. E deixar os 19 arquivos para a migração
N+1 transforma um `DROP COLUMN` numa refatoração de contrato com o banco já mudado.

---

## D136 — Permissão efetiva é lida na consulta de sessão que já existe, e não entra no `request.user`.

**Decidido:** `include` dos grupos em `carregarSessaoParaValidacao()`, reduzido a `Set<string>` em
`request.permissions`. **Descartado:** permissão no `USER_PUBLIC_SELECT`; e um
`effective-permissions` em consulta própria por requisição. O select público é o contrato do que
**sai** de um usuário — o que ele **pode** não é dado dele, e embarcado ali viajaria em cada linha de
histórico de todo ativo. E a releitura por requisição já é o caminho mais quente do sistema: uma
segunda consulta ali dobra o custo de toda requisição autenticada, que é exatamente o que o
`tokenVersion` foi desenhado para não fazer.

---

## D137 — Rota sem permissão declarada derruba o boot.

**Decidido:** mapa central `método + caminho → chave`, com dispensas explícitas e `motivo` escrito,
conferido contra a tabela de rotas do Fastify no boot. **Descartado:** `preHandler` escrito rota por
rota dentro de cada maestro. São 177 rotas em 23 maestros, e por rota a 178ª **nasce liberada** —
sem erro, sem log, igual à rota que nascia sem sessão antes do `require-auth.ts`. O D76 já aponta o
mesmo silêncio pelo outro lado (chave errada nega sem avisar): o catálogo em código cobre o typo, só
a conferência no boot cobre o esquecimento. E rota de catálogo é declarada **por spec**, não por
caminho: as 5 rotas servem 10 cadastros.

---

## D138 — Relatório que é sobre dinheiro exige a permissão na rota, não na coluna.

**Decidido:** `/api/reports/depreciacao` inteiro atrás de `assets.viewCost`; nos outros caminhos
(builder, export, relatório de responsabilidade) a chave filtra a coluna e o `SUM`. **Descartado:**
filtrar `purchaseCost` dentro do relatório de depreciação. Ele devolve custo total, custo
depreciável e valor contábil por linha — sem custo não sobra relatório, e um 200 com todos os
números nulos é pior do que um 403: parece frota sem valor cadastrado.

---

## D139 — O escalonamento tem uma implementação, e o aceite passa a usá-la.

**Decidido:** `resolverEscalonamento()` sobe a árvore, e `issue-acceptance.usecase.ts` o chama no
lugar de ler `Location.manager` da folha. **Descartado:** nascer a função deixando o aceite como
está. O aceite já responde "quem responde pelo espaço" (D27) e responde **pior**: sem subir, a Mesa
1 sem gestor dentro de um Andar 2 com gestor é 409 — recusa um caso que a função nova aceita. Duas
respostas para a mesma pergunta no mesmo código é o D16 renascendo, e o D130 é o precedente de que
basta uma. O `resolverResponsaveis()` continua intocado: são perguntas diferentes (D73), e é o termo
que vai ao gestor — não a responsabilidade.

---

## D140 — O D77 é regra de coluna. Em JsonB, mascarar depois é o limite, não a exceção.

**Decidido:** `mascararCampos()` da F9 fica como está, com o motivo escrito ao lado. **Descartado:**
"consertar" a F9 para filtrar no `select`. `Asset.customFields` é **uma** coluna com valor cifrado e
comum lado a lado — não existe `select` parcial de JsonB, e foi por isso que o prefixo `enc:` passou
a viajar dentro do valor (D81, item 1). Sem esta decisão escrita, a primeira pessoa a aplicar o D77
ao pé da letra vai tentar, não vai conseguir, e provavelmente vai deixar o campo cifrado de fora da
resposta inteira — quebrando o selo "tem segredo" da listagem.

---

## D141 — O portal se chama pelo que lista.

**Decidido:** `src/pages/meus-equipamentos/`. **Descartado:** `src/pages/portal/`. A convenção do
projeto é a tela levar o nome do que ela lista — `ativos`, `estoque`, `licencas`, `postos`,
`tokens` —, e "portal" não diz o que tem dentro. Os dois baldes continuam sendo dois baldes; o que
muda é a pessoa saber, pela URL, o que vai encontrar.

---

## D142 — `api_tokens.userId` ganha FK antes de existir token pessoal.

**Decidido:** `FOREIGN KEY … ON DELETE SET NULL` mais a relação no schema, na etapa do
desligamento. **Descartado:** confiar no CHECK. O CHECK garante que `userId` **existe quando
`ownerType = 'USER'`**, não que ele aponte para alguém — um token pessoal pode referenciar um
cadastro que nunca existiu, e o passo que revoga tokens no desligamento passaria por cima disso sem
notar. É aditivo e barato agora; com linhas dentro, é validação a mais.

---

## P — `USUARIO` não entra no painel

> **Superada por [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos):**
> o cargo `USUARIO` saiu. Quem recebe equipamento é colaborador, outra tabela, e não tem conta.

**Decidido:** o login recusa o cargo `USUARIO` com 403 e uma frase que diz o que fazer, em vez
de abrir um painel vazio que responde 403 em tudo. A sessão já emitida de quem for rebaixado
continua valendo até expirar, respondendo 403 a cada rota — fechar essa janela exigiria mexer na
releitura de sessão, por um ganho que não compensa o risco de tocar nela.
**Consequência de:** [D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
— `USUARIO` sempre foi o cargo de quem só recebe equipamento, sem conta para operar o sistema; o
que faltava era o login dizer isso antes de abrir um painel sem nada para mostrar.

**Por quê 403 e não 401:** a senha está certa. O que falta é autorização, não autenticação — e
as duas respostas existem precisamente para essa distinção, que o fluxo de login não respeitava
antes desta decisão.

**O que isso mudou no harness:** sessões de teste passam a nascer `TECNICO` por padrão, porque
`USUARIO` não loga — um harness que criasse sessão `USUARIO` por padrão pararia de testar o
sistema e começaria a testar a tela de recusa em todo lugar.

---

## R — A senha nasce no cadastro, e o login é o e-mail

> **Superada em parte por [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos):**
> a senha é obrigatória para todo usuário, e a conferência da promoção saiu com o `USUARIO`. O
> login pelo e-mail e a "Nova senha" continuam como estão aqui.

**Decidido:** o login é `{ email, password }`. `User.username` sai do schema e da `0_init`, com o
índice `users_username_unique_undeleted` — não existe mais "nome de usuário" à parte. A senha vem
no cadastro e na edição do usuário: `POST /api/users` e `PUT /api/users/:id` aceitam `password`,
com a mesma regra `senhaNova` que mora em `auth.schema.ts` (mínimo de 12). Ela é **obrigatória**
para `TECNICO` e `ADMIN` — 422 se faltar, inclusive ao promover a Técnico quem nunca teve senha —
e dispensável para `USUARIO`, que o login recusa de qualquer jeito. Na edição, `password` ausente
mantém a atual; presente troca a senha, destrava a conta e incrementa o `tokenVersion`. Saem
`POST /api/users/:id/set-password`, o `set-user-password.usecase.ts` e a ação **Definir acesso**
da ficha do colaborador.
**Supera:** nada do D1–D164 — o nome de acesso e a rota de senha nasceram de uma decisão da
EXECUÇÃO da F3, não desta pasta: o item 2 de
[*Três decisões que a implementação teve de tomar*](../historico/fase-03-autenticacao-e-ator.md#três-decisões-que-a-implementação-teve-de-tomar)
("credencial não entrou no formulário de colaborador; entrou no `set-password`").
**Mantém:** [P](#p--usuario-não-entra-no-painel) — é ele que torna a senha do `USUARIO`
dispensável — e [D162](./escopo.md#d162--minha-conta-sai-e-o-cargo-vira-campo-do-formulário-de-usuário):
o formulário de Usuários, que já levava o cargo, passa a levar a senha.

**Por quê:** o pedido foi direto — criar usuário com nome, e-mail, cargo e, para quem entra,
senha. O caminho que existia fazia duas paradas para a mesma pessoa: o cadastro, em Usuários, e
depois a credencial à parte — a rota `set-password`, com um nome de acesso e uma senha, que
chegou a ganhar a ação **Definir acesso** na ficha do colaborador antes desta decisão. A
segunda parada não protegia nada que a primeira não protegesse — as duas exigiam `ADMIN` —, e o
nome de acesso era um segundo identificador ao lado de um que já era único (índice parcial
`users_email_unique_undeleted`), já era normalizado em minúsculas e que a pessoa já sabe de cor.
Duas chaves de entrada eram duas coisas para a pessoa esquecer, dois índices parciais para
manter e duas metades de uma credencial para manter coerentes — senha sem nome de acesso não
entrava, e nome de acesso sem senha também não.

**O argumento da F3 era certo no sistema que ela tinha, e o cargo o desfez.** Ela separava *dar
acesso* de *cadastrar alguém para receber equipamento* porque, na F3, todo cadastro com senha
entrava: a senha ERA a decisão de acesso, e merecia rota própria. Desde o
[D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem) e o
[P](#p--usuario-não-entra-no-painel), quem decide se a pessoa entra é o CARGO — `USUARIO` é
recusado mesmo com a senha certa. Escolher Técnico ou Administrador no formulário já é dar
acesso, e a senha virou o complemento dessa escolha, não uma segunda decisão: é por isso que o
campo aparece exatamente quando o cargo o pede.

**Por quê a recusa da senha que falta mora no servidor:** a tela esconde o campo para o
`USUARIO` e o marca **Senha\*** no cadastro dos outros dois, mas o caso que engana é a
PROMOÇÃO. O colaborador cadastrado só para receber equipamento vira Técnico pela edição, onde o
campo se chama **Nova senha** e é opcional — e, sem a conferência no `PUT`
(`credencial.helper.ts`, que olha o `passwordHash` gravado quando o corpo não traz senha), a
promoção passaria e produziria um operador que não consegue entrar. O defeito só apareceria no
primeiro login dele, longe de quem o cadastrou. É a mesma divisão do P: a tela antecipa, o
servidor recusa.

**O que a troca pela edição carrega, e o que a trilha grava:** o mesmo que o `set-password`
fazia. Destrava a conta (zera `failedLoginCount` e `lockedUntil` — o caminho de suporte para quem
se trancou fora) e incrementa o `tokenVersion`, que derruba toda sessão aberta da pessoa na
requisição seguinte. O `ActivityLog` grava `credencial: 'senha definida'` no cadastro e
`'senha redefinida'` na edição — o QUE mudou, nunca o valor. E como `POST` e `PUT` de usuário
passaram a carregar senha, ganharam o `verificarOrigem` das rotas de credencial
(`user.maestro.ts`): a segunda camada anti-CSRF, atrás do `SameSite` do cookie.

**O que mudou junto:** a frase das três recusas indistinguíveis do login virou
`E-mail ou senha inválidos.`; a tela de login pede E-mail e Senha; `ADMIN_USERNAME` deixou de
existir (e o seed do administrador saiu depois, no [T](#t--não-há-conta-semeada)); e a linha de
escape do [D164](./escopo.md#d164--o-default-da-coluna-tranca-o-sistema-e-a-migração-precisa-do-backfill)
recebe o e-mail — `npm run acesso:administrador -- <e-mail>`.

---

## S — O papel passa a se chamar cargo

**Decidido:** o nível de acesso da pessoa — `USUARIO`, `TECNICO` ou `ADMIN` — se chama **cargo**
em todo lugar: na interface (o rótulo **Cargo** no formulário de usuário), nas mensagens ("Esta
ação exige o cargo de …", "peça ao administrador o cargo de Técnico", "Dê o cargo de
Administrador a outra pessoa…"), no código e nos docs. No código, o
enum `Papel` vira `Cargo`, `access/helpers/papel.ts` vira `cargo.ts`, `PAPEIS` vira `CARGOS`,
`papelAlcanca` vira `cargoAlcanca`, `request.papel` vira `request.cargo`, e assim com os demais
nomes. A coluna continua `role` e os valores continuam os mesmos três; o tipo do Postgres foi
renomeado de `"Papel"` para `"Cargo"` na `0_init`, editada no lugar como toda mudança de schema
enquanto não existe banco em produção.
**Mantém:** [D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
inteiro — muda o nome, não a regra. Por ser troca de nome e não de regra, o texto das decisões e
da referência passou a usar o nome novo no lugar, inclusive nos títulos do D148, do D162 e do
D163 (e nas âncoras deles); [`../historico/`](../historico/) continua dizendo "papel", porque
registra a época.

**Por quê:** pedido do usuário — "cargo" é a palavra que a equipe usa para isso. A troca não
colide com nada: o campo de RH `jobTitle`, que a tela traduzia como "cargo", saiu na varredura
[Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai), e não sobrou outro
"cargo" no sistema para confundir com o nível de acesso.

---

## T — Não há conta semeada

**Decidido:** o `npm run db:seed` cria só o que o sistema precisa para funcionar —
configuração, categorias e status. O seed do administrador (e o que repunha o cargo dele) saiu;
o primeiro administrador de um ambiente novo é criado à mão por quem instala, no terminal. Saem
junto as variáveis `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` do `.env.example`. O harness de
teste cria o seu próprio administrador (`ADMIN_DE_TESTE`, em `tests/setup/database.ts`), direto
no banco, porque é ele que abre a primeira sessão.

**Por quê:** a revisão das mudanças da [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)
e do [R](#r--a-senha-nasce-no-cadastro-e-o-login-é-o-e-mail) mostrou que, com o e-mail virando
login e editável na tela, o seed procurava o administrador pelo e-mail do `.env`: bastava o
administrador trocar o próprio e-mail e alguém rodar o seed de novo para nascer uma segunda conta
`ADMIN`, com a senha do `.env` — ou, fora de produção, com a senha padrão publicada no código. Uma
conta que o seed recria sozinha é uma porta que reabre toda vez que ele roda; o usuário preferiu
que ela não exista.

**Depois:** a conta voltou só no seed de **demonstração** (`npm run db:seed:demo`), que não roda em
produção nem nos testes: `admin@sentinel.com`, senha `admin`, para o ambiente de desenvolvimento
abrir com um login. A porta descrita acima continua valendo lá — quem trocar esse e-mail e rodar o
demo de novo ganha uma segunda conta `ADMIN` —, e é aceita por ser banco de desenvolvimento.


---

## U — Quem recebe equipamento sai de `User`: colaborador vira catálogo, e sobram dois cargos

> **Superada em parte por [V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira):**
> excluir colaborador passou a mandar para a lixeira, recusando só quem está com algo agora — e
> não mais "apagar de verdade, e só sem histórico". O resto continua como está aqui.
>
> **Superada em parte por [Z](#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir):** sobra um cargo só, `ADMIN`, e a
> separação de cargos é decisão a tomar.
>
> **Superada em parte por [AH](#ah--o-menu-por-assunto-o-colaborador-ganha-página-própria-e-ativos-vira-computadores):** o colaborador saiu de Configurações para uma página
> própria, `/colaboradores`, na seção Pessoas do menu, com a ficha em `/colaboradores/:id`. O
> cadastro e a API são os mesmos.
>
> **Completada por [W](#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo):** a linha
> do usuário excluído, que ficava no banco com `deletedAt`, passou a ser apagada; e o
> administrador não rebaixa, não desativa e não exclui a si mesmo.

**Decidido:** a tabela `users` passa a guardar só quem OPERA o sistema — Técnico e
Administrador. Quem RECEBE equipamento é **colaborador**, uma tabela própria (`Person`, `people`)
que é a sexta aba do catálogo em Configurações: nome, e-mail opcional, desativar, excluir. As
quatro posses (`Assignment.targetPersonId`, `LocationOccupant.personId`,
`LicenseSeatCheckout.assignedPersonId`, `StockMovement.targetPersonId`) apontam para `people`, e
o alvo `USER` dos enums de posse virou `PERSON`. O cargo `USUARIO` sai do enum `Cargo`; a senha
passa a ser obrigatória (`passwordHash` não nulo) e o cargo padrão passa a ser `TECNICO`. A tela
Usuários (`/usuarios`) é toda do `ADMIN`, leitura inclusive, sem lixeira e sem restaurar; a
ficha de quem recebe equipamento foi para `/configuracoes/colaboradores/:id`.
**Supera:** [P](#p--usuario-não-entra-no-painel) — não há mais `USUARIO` para o login recusar —
e, no [R](#r--a-senha-nasce-no-cadastro-e-o-login-é-o-e-mail), a senha dispensável e a
conferência da promoção: todo usuário tem senha desde o cadastro, e não há de onde promover.
**Mantém:** [D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
(cargo com ordem, a rede do último administrador) e o resto do R (o login é o e-mail, a "Nova
senha" destrava e derruba as sessões).

**Por quê:** pedido do usuário — a página de Usuários é para quem faz a gestão do sistema, e as
pessoas que só terão a posse de um PC se cadastram em Configurações. A mistura custava em todo
lugar: o login precisava recusar um cargo que só existia para dizer "esse não entra", o
formulário escondia a senha conforme o cargo, a edição tinha de conferir a senha na promoção, e a
mesma linha respondia por login e por posse.

**Por quê duas tabelas, e não uma com o cargo opcional:** com uma tabela só, as duas telas
mexeriam no mesmo registro — excluir o colaborador tiraria o acesso, desativar num lugar
desativaria no outro. Com duas, cada tela é dona do que mostra. O custo é o Técnico que também
tem um notebook: ele é cadastrado nos dois lugares, uma conta para entrar e um colaborador para
receber.

**Por quê catálogo:** o cadastro de colaborador é o mesmo das outras cinco abas — nome,
desativar em vez de excluir quando há uso, `/options` só com os ativos —, e o CRUD genérico já
fazia tudo isso (`catalog/specs/person.spec.ts`). Excluir apaga de verdade, como no resto do
catálogo: só sai quem nunca recebeu nada (o cadastro feito errado), porque as quatro FKs são
`Restrict` em cada linha de posse, devolvida inclusive. Quem tem histórico se desativa, e a
invariante 6 continua valendo na desativação: só desativa quem não responde por nada, com a
mesma frase que conta ativo, assento, item de estoque e posto.

**O que mudou junto:** os colaboradores existentes saíram de `users` com o MESMO id, então as
posses não foram tocadas e `/users/:id` redireciona para a ficha nova; o `ActivityLog` deles
passou a `entityType: 'Person'`. A tela Usuários ordena por nome, perdeu a aba Lixeira e o
Restaurar (excluído não volta — cadastra de novo), e as iniciais coloridas saíram de todas as
telas. `GET /api/users/options`, `/:id` e `/:id/history` saíram; o seletor de pessoa da entrega
é `GET /api/people/options`.

---

## W — Excluir usuário apaga a linha, e ninguém rebaixa, desativa ou exclui a si mesmo

> **Superada em parte por [X](#x--o-histórico-não-guarda-quem-fez):** a exclusão de usuário não grava mais
> `ActivityLog`, e o histórico não guarda o autor de nada. O resto continua como está aqui.
>
> **E de volta em parte com [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** cadastrar, editar e excluir usuário voltam a gravar — na
> auditoria, com quem fez.
>
> **Superada em parte por [Z](#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir):** com um cargo só, não há para onde
> rebaixar, e a regra de não rebaixar a si mesmo saiu. Desativar e excluir a si mesmo continuam
> recusados.

**Decidido:** duas regras da tela Usuários.

- **Excluir apaga de verdade.** `DELETE /api/users/:id` faz `DELETE` na linha, e `users` perde
  o `deletedAt`. O índice parcial `users_email_unique_undeleted` vira o `@unique` comum do
  e-mail: sem linha apagada, não há o que deixar fora do índice. A exclusão continua gravando
  `ActivityLog` (`entityType: 'User'`, `DELETE`) e continua recusando o último administrador.
- **Ninguém tira a própria conta do jogo.** Com o id da própria sessão, três coisas são 409,
  cada uma com a sua frase (`Você não pode rebaixar a si mesmo. Peça a outro administrador.`,
  e o mesmo com *desativar* e *excluir*):
  - `PUT /api/users/:id` com um `role` diferente do atual. Só o administrador chega à rota,
    então mudar o próprio cargo é sempre rebaixar. Reenviar o cargo igual passa, porque o
    formulário manda todo campo;
  - `PUT /api/users/:id` com `isActive: false`;
  - `DELETE /api/users/:id`.

  Na tela, o campo Cargo fica travado quando a pessoa edita a si mesma, e os botões Desativar e
  Excluir da própria linha ficam desligados, com o motivo no balão de ajuda.
- **A lista mostra o cargo**, numa coluna entre E-mail e Ações. Antes ele só aparecia dentro do
  formulário.

**Supera:** a lixeira do usuário que vinha da F0 — o `deletedAt` e o `unique_undeleted` do
e-mail —, que o [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)
já tinha tirado da tela (sem aba Lixeira, sem Restaurar) mas deixado no banco.
**Mantém:** o U inteiro, e a rede do último administrador do
[D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem).

**Por quê apagar:** pedido do usuário, depois de perguntar para que servia a linha excluída. A
resposta foi "para nada": nenhuma FK aponta para `users` — o `actorId` do `ActivityLog`, o
`checkoutById` da entrega e o `createdById` do estoque são colunas soltas, sem relação — e
nenhuma tela busca o nome do autor por esse id: o histórico mostra os oito primeiros
caracteres do id (`por 3f2a1b4c…`), com a linha existindo ou não. A linha guardada só servia a
quem abrisse o banco à mão para descobrir de quem era aquele id, e custava o índice parcial
escrito à mão e o escopo da lixeira em toda leitura de usuário.

**O que se perde, e foi aceito:** depois da exclusão, o id do autor no histórico não leva mais a
um nome, nem no banco. Se um dia o histórico passar a mostrar o nome de quem fez, a saída é a
da [V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira):
gravar o nome por escrito na exclusão — e não trazer a lixeira de volta.

**Por quê a própria conta:** pedido do usuário — primeiro o rebaixar, depois o desativar e o
excluir, que são o mesmo caso. O que a regra fecha: a rede do último administrador só impede o
sistema de ficar sem ninguém, e deixava um de dois administradores tirar a si mesmo do jogo —
perdendo a tela Usuários, ou o sistema inteiro, no mesmo clique, sem ter como desfazer sozinho.
Com a regra, quem rebaixa, desativa ou exclui um administrador é sempre outro administrador.

**O que muda na rede do último administrador:** o último não a alcança mais sozinho — tudo o
que ele faria contra a própria conta é recusado antes. Ela continua cobrindo a corrida: dois
administradores rebaixando, desativando ou excluindo um ao outro no mesmo instante, cada um
contando "sobra eu". A trava `travarAdministracao` põe os dois em fila e o segundo é 409.

---

## X — O histórico não guarda quem fez

> **Superada por [AB](#ab--a-auditoria-volta-quem-fez-só-no-banco):** a auditoria de quem fez volta, só no banco. As telas continuam sem
> mostrar o autor, e os históricos das telas passam a ser só movimentação.

**Decidido:** saem as cinco colunas de autor — `activity_logs.actorId`,
`assignments.checkoutById`/`checkinById` e `stock_movements.createdById`/`returnedById` — e o
parâmetro `actorId` que descia do controller até cada use-case, com o
`auth/helpers/actor.helper.ts` que o lia da sessão. O histórico continua gravando o que mudou e
quando, na mesma transação da operação. Junto:

- **usuário não grava histórico:** cadastrar, editar e excluir usuário não escrevem mais
  `ActivityLog`;
- **as telas perdem o autor:** Movimentações de Estoque e Histórico da Licença deixam de mostrar
  `por 3f2a1b4c…` / "sem autor registrado", e a aba Histórico do ativo perde o aviso de que o
  autor só existe a partir da F3;
- **a regra da própria conta fica:** `updateUser` e `deleteUser` continuam recebendo quem pede
  (`sessaoId`, de `request.user.id`) — é o que o [W](#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo)
  compara;
- o `CHECK` `stock_movements_forma` perde a cláusula que amarrava `returnedById` a `returnedAt`.

**Supera:** [D23](#d23--actorid-é-parâmetro-obrigatório-não-asynclocalstorage) (o autor
obrigatório por parâmetro), [D24](#d24--o-histórico-anterior-fica-sem-ator-não-há-backfill) (o
histórico antigo sem autor — agora não há autor em histórico nenhum) e
[D25](#d25--ocupação-de-posto-não-ganha-coluna-de-ator) (a ocupação sem coluna de autor, por
simetria com uma coluna que deixou de existir); e, em parte, o
[W](#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo), que
mantinha o `ActivityLog` da exclusão de usuário.
**Mantém:** a sessão relida a cada requisição, o cargo e `request.user` — a autorização nunca
dependeu do autor gravado no histórico.

**Por quê:** pedido do usuário, depois de ver que nenhuma tela mostrava o nome de quem fez. As duas
que mostravam alguma coisa mostravam os oito primeiros caracteres do id; as outras, nada. O que
sobrava era auditoria — responder "quem entregou o notebook da Laura" —, e o sistema não vai ter
auditoria. Sem leitor, a coluna era só custo: um parâmetro em cada use-case e um arquivo de teste
inteiro (`ator.test.ts`) provando que um dado sem uso chegava ao banco.

**Por quê o histórico de usuário também:** nenhuma tela lê o `ActivityLog` com
`entityType: 'User'` desde o U, que tirou a ficha de usuário. Sem o autor, era uma trilha que
ninguém abria.

**O que se perde, e foi aceito:** "quem fez" deixa de ter resposta, inclusive no banco. Se a
auditoria voltar, o caminho é gravar o NOME por escrito na linha do histórico — como a
[V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)
faz com a localização —, e não o id: o id de um usuário excluído não leva a ninguém (W).

---

## Z — Sobra um cargo só: Administrador, e a separação de cargos fica para decidir

**Decidido:** o cargo `TECNICO` sai. O enum `Cargo` fica só com `ADMIN`, que passa a ser o
`@default` da coluna `users.role`; a `0_init` foi editada no lugar, e o banco de
desenvolvimento, alinhado. Toda rota que exigia `TECNICO` passa a exigir `ADMIN` no mapa de
rotas, e o menu inteiro passa a ser `ADMIN`. O formulário de usuário perde o campo Cargo — não
há o que escolher —, e a lista de Usuários mantém a coluna Cargo, que mostra Administrador. A
API continua aceitando `role`, e um cargo que não existe é 422. Sai junto a regra de não
rebaixar a si mesmo do [W](#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo):
sem cargo abaixo de `ADMIN`, não há para onde rebaixar.
**Supera:** o [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)
na parte "sobram dois cargos", e o W na parte do rebaixar.
**Mantém:** toda a validação de `ADMIN` — o cargo com ordem do
[D148](./escopo.md#d148--permissão-vira-cargo-grupo-diretório-sso-e-segundo-fator-saem)
(`CARGOS` e `cargoAlcanca`), o mapa de rotas conferido no boot (D137), o `temCargo` dos
`select` por cargo (D77), o `usePode` e o `SoAdmin` da tela —, a rede do último administrador e
o resto do W (não desativar nem excluir a si mesmo).

**Por quê:** pedido do usuário — ele ainda não decidiu como separar os cargos e prefere todo
mundo Administrador até decidir. A conferência de `ADMIN` fica inteira; o que era do Técnico —
as rotas que ele alcançava, o rebaixar, as menções a ele no código, nos testes e nos docs — sai.
Se a separação vier, ela é construída do zero, e não a partir do desenho antigo.

**O que se perdeu, e foi aceito:** os testes que provavam o que quem não é `ADMIN` não vê nem
alcança precisavam de uma sessão abaixo de `ADMIN`, e saíram. A mensagem do 403 continua provada
direto no `exigirPermissao`, e o que o `ADMIN` vê continua provado pela API.

**A decidir — a separação de cargos:**

- **quais cargos existem** além do `ADMIN`, e em que ordem;
- **o que cada um alcança**, linha a linha do mapa de rotas;
- **qual cargo nasce por padrão** — o `@default` da coluna, que já trancou o sistema uma vez
  ([D164](./escopo.md#d164--o-default-da-coluna-tranca-o-sistema-e-a-migração-precisa-do-backfill));
- **o que a tela de Usuários precisa** para escolher o cargo, e quem pode mudar o de quem.

---

## AB — A auditoria volta: quem fez, só no banco

> **Superada em parte por [AC](./licencas.md#ac--a-chave-vira-lista-cada-uma-cobre-uma-quantidade-e-a-entrega-escolhe-uma):**
> a chave de licença deixa de ir como `chave: 'informada' | 'alterada' | 'removida'`. A auditoria
> conta as chaves da lista (`chaves: { incluidas, alteradas, removidas }`) e, na entrega e na
> troca, guarda qual chave pelo `licenseKeyId`. O texto continua fora.

**Decidido** (2026-10-25): `activity_logs` vira `audit_logs` (`AuditLog`), e toda escrita grava
QUEM fez, na mesma transação da operação. A tabela é do administrador, consultada no banco: tela
nenhuma a lê.

- **O autor, por escrito.** `actorType` diz de onde veio: `USER` (a conta da sessão), `SYSTEM`
  (o job, ou o comando de terminal) ou `ANONYMOUS` (a tela de login, sem sessão). A conta vai com
  `actorId`, `actorName` e `actorEmail` como estavam no momento — a conta pode mudar de nome ou
  ser excluída, e a linha continua dizendo quem fez. `source` é a origem (`painel`,
  `job:reconciliacao`, `cli:conceder-administrador:<usuário do sistema operacional>`), e
  `requestId` é o número da requisição, o mesmo do `X-Request-Id` e da linha do log.
- **O registro, por escrito.** `entityLabel` é a etiqueta do ativo, o nome do item, da licença, o
  e-mail da conta, o hostname da máquina. `entityId` é nulo só no que não é um registro: a
  configuração da descoberta e a rodada de reconciliação (`CHECK` `audit_logs_registro_com_id`).
- **Sem FK, e a linha não muda.** Excluir o registro ou a conta não leva junto a linha que diz
  quem os excluiu. O `CHECK` `audit_logs_autor_coerente` exige a conta inteira no `USER`, nada no
  `SYSTEM` e só a requisição no `ANONYMOUS`; ele e o `audit_logs_registro_por_escrito` recusam o
  texto em branco, inclusive o que é só espaço; e o trigger `audit_logs_imutavel` recusa `UPDATE`
  e `DELETE`.
- **O "de" é lido com a linha travada.** Toda edição que grava `{ de, para }` trava a linha antes
  de ler o "de" — duas edições ao mesmo tempo, e a segunda diria "de A" quando a mudança foi de B.
  A exclusão de conta trava antes do retrato, pelo mesmo motivo.
- **O autor é parâmetro obrigatório** ([D23](#d23--actorid-é-parâmetro-obrigatório-não-asynclocalstorage)
  de volta): o controller monta o `Ator` da sessão (`atorDaRequisicao`) e ele desce como último
  argumento até `recordAudit`. Nunca do corpo: o `strictObject` recusa um autor no corpo com 422.
- **O número da requisição é do servidor.** O `X-Request-Id` que o cliente mande é ignorado: aceito,
  uma conta repetiria o número de outra requisição — até de outra conta.
- **O que grava:** cadastros e catálogo, colaborador, posto e ocupação; ativo (cadastro, edição,
  posse, baixa, lixeira); estoque; vínculo, aceite, recusa, triagem e a rodada pedida pela tela;
  licença (cadastro, edição, entrega, troca de chave, devolução, encerramento, exclusão); conta de
  usuário; configuração da descoberta; comando à máquina; login e logout; e o
  `conceder-administrador` quando o cargo muda — com um cargo só (Z), hoje ele nunca muda, e
  "de ADMIN para ADMIN" não é linha. Como toda edição, só grava o que mudou — e vincular a máquina
  ao ativo a que ela já está vinculada não grava `LINK` nenhum.
- **O aceite é uma coisa só.** A sugestão vira `ACCEPTED` na mesma transação do vínculo, e a
  linha `LINK` leva o `sugestaoId`. Separados, uma falha entre os dois deixava a sugestão encerrada
  como substituída pelo próprio vínculo, e o expurgo a apagava. Dois aceites ao mesmo tempo: passa
  um, o outro recebe 409.
- **Dado sensível não entra.** A senha vai só como `senha: 'alterada'`, nem o hash. A chave de
  licença vai só como `chave: 'informada' | 'alterada' | 'removida'`, nunca o valor.
- **O comando à máquina** grava só o que saiu para o agente, e depois do envio: o desconectado e
  a falha não entregaram nada, e uma linha antes do envio afirmaria um desligamento que nunca
  saiu. "Saiu" é a conexão aberta ter aceitado o envio — o agente não confirma a execução, e a
  máquina que perdeu a rede sem fechar a conexão não recebe o que a linha diz que foi mandado.
- **O que já aconteceu fora do banco não vira erro.** O comando que saiu, a rodada pedida e a
  saída da conta gravam sem transação para desfazer junto. Se a gravação falhar, a resposta diz o
  que aconteceu, e a linha vai inteira para o log do servidor no lugar dela: um 500 depois do
  comando diria que ele não saiu, e o clique de novo mandaria o segundo desligamento; no logout,
  o cookie ficaria no navegador.
- **O login.** A entrada é da conta (`USER`). A senha errada, a conta bloqueada e a desativada
  gravam na conta, mas como `ANONYMOUS`: quem digitou não provou ser a dona dela, e gravar como a
  conta a acusaria de uma tentativa que pode ser de outro. E-mail que não existe não grava nada.
  O contador de erros é somado pelo banco (`increment`), e cada linha leva o número certo mesmo
  em rajada. Durante o bloqueio fica **uma** linha por bloqueio, e não uma por tentativa: a senha
  nem é conferida ali, e cada tentativa custaria só uma linha numa tabela que não se apaga —
  qualquer um que soubesse o e-mail a encheria. A conta é travada antes de procurar a linha, senão
  uma rajada procuraria toda antes de qualquer uma gravar.
- **O que roda sozinho.** O único caminho `SYSTEM` do servidor é o vínculo automático da
  reconciliação em `ON` (`job:reconciliacao`) — também quando a rodada foi pedida pela tela: a
  linha `RUN` diz quem pediu, e o vínculo diz que quem decidiu foi a regra. A rodada pedida que
  quebrou no meio também grava o `RUN`, com `concluida: false`: os vínculos que ela já fez estão no
  banco, e sem a linha não se saberia que foi uma conta que a pediu. O agente e o resto do
  job (telemetria, online e offline, último contato, uso agregado, sugestões, mudança de hardware,
  expurgo) não mexem em cadastro, posse nem estoque, e não gravam.
- **As telas não leem a auditoria.** As abas Histórico do ativo e do colaborador passam a ser só
  movimentação — entregas, devoluções, postos e licenças. A observação da baixa, que só aparecia
  lá, vira a coluna `assets.retiredNotes`: a aba Detalhes a mostra enquanto a baixa vale, e
  desfazer a baixa a limpa (a de cada baixa fica na auditoria).
- **A máquina é travada no vincular e no desvincular**, depois do ativo. Dois vínculos da mesma
  máquina ao mesmo tempo passavam os dois, e o segundo apagava o primeiro sem `UNLINK` nenhum.

**Supera:** o [X](#x--o-histórico-não-guarda-quem-fez); revive o D23; devolve a resposta do
[D25](#d25--ocupação-de-posto-não-ganha-coluna-de-ator) e, em parte, do
[W](#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo); e, em
parte, o [D18](./catalogo-e-ativo.md#d18--assetlog-não-nasce-a-aba-histórico-lê-o-activitylog)
(a aba Histórico não lê mais a trilha), a revisão do
[D77](#d77--dado-sensível-é-filtrado-no-select-não-mascarado-na-resposta) (a porta do diff do
histórico fechou) e o
[AA](./licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)
(a licença deixa de ficar sem trilha).
**Mantém:** o [D24](#d24--o-histórico-anterior-fica-sem-ator-não-há-backfill) — nada foi carimbado
em ninguém: as linhas antigas, sem autor, ficaram fora da tabela nova e estão guardadas fora do
projeto —, as colunas de autor fora das tabelas (D26, Q, X), a sessão relida a cada requisição e
as regras da própria conta do W.

**Por quê:** pedido do usuário — *"a ideia é deixar apenas no banco de dados, não vamos usar isso
em nenhuma tela, é realmente para o admin fazer a auditoria para não acusarem o sistema de um erro
que foi um usuário que cometeu"*. Por isso a separação entre conta e sistema é o centro, e a linha
não pode ser reescrita pela aplicação.

**Por quê sem IP:** *"não precisa de IP real, só a conta mesmo, não é para duas pessoas usarem a
mesma conta"*. Cada pessoa tem a própria conta, e conta compartilhada não é cenário.

**O que fica de fora, e foi aceito:** as leituras (inclusive ver a chave da licença), o seed e o
SQL à mão não gravam. O trigger barra o `UPDATE` e o `DELETE` da aplicação e de SQL comum, não o
dono da tabela — e o usuário de banco da aplicação é o dono: ele ainda pode desligar o trigger ou
esvaziar a tabela. Nenhum código faz isso. Se for preciso mais, o caminho é um usuário de banco
para a aplicação que só faça `INSERT` na auditoria, o que muda a implantação.

**Como consultar:** [`prisma/verificacoes/auditoria.sql`](../../prisma/verificacoes/auditoria.sql),
com as perguntas prontas no horário de Brasília.

## AH — O menu por assunto: o colaborador ganha página própria, e Ativos vira Computadores

**Decidido** (em 2026-10-27, na conferência das telas padronizadas — o usuário perguntou se o
colaborador não devia sair de Configurações e ter uma página só para ele; dada a recomendação,
respondeu "ok, faça". No meio do trabalho, pediu as seções do menu por assunto, com o nome da
página Ativos trocado, e escolheu os nomes entre os sugeridos — Computadores, Recursos e
Pessoas —, com Pessoas abaixo de Convergência e Gestão por último):

- **O menu se agrupa por assunto**, nesta ordem, que é a do usuário:

  | Seção | Itens |
  |---|---|
  | **Ativos** | Computadores, Postos |
  | **Recursos** | Estoque, Licenças |
  | **Convergência** | Descobertas |
  | **Pessoas** | Colaboradores |
  | **Sistema** | Configurações |
  | **Gestão** | Usuários |

  "Operação", que juntava tudo de cima, sai. Ativos é o que se patrimonia e onde fica;
  Recursos, o que se conta e se distribui, com a mesma lógica nos dois (AE).
- **A página Ativos vira Computadores**, em `/computadores` e `/computadores/:id`: "Ativos"
  passou a nomear a seção, e a tela leva o nome do que lista — ativo é computador (decisão I), e
  as categorias de ativo são Notebook, Desktop e Servidor. A palavra **ativo** continua sendo a
  do item: a etiqueta, a ficha do ativo, "Nenhum ativo entregue".
- **Colaboradores vira página**, sozinha na seção Pessoas: a lista em `/colaboradores` e a
  ficha em `/colaboradores/:id`. Configurações fica com as cinco abas de referência —
  categorias, status, fabricantes, modelos e localizações.
- **O cadastro não muda.** É o mesmo componente das abas (`CadastroDoCatalogo`, que passa a
  morar em `src/pages/components/catalogo/` por servir a duas páginas), com a mesma spec, os
  mesmos botões e frases, a lixeira e o Restaurar. A API também não muda: o colaborador continua
  uma das seis tabelas do CRUD do catálogo, em `/api/people`.
- **Pessoas fica fora de Gestão**, de propósito: conta de login e colaborador são tabelas e
  telas diferentes ([U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)), e lado a lado na mesma seção trariam a confusão de volta.
- **Os endereços antigos redirecionam**, com o mesmo id: `/ativos` e `/ativos/:id` (e o `/itam`
  de antes) levam a `/computadores`; `/configuracoes/colaboradores/:id` e `/users/:id`, a
  `/colaboradores/:id`. O `?aba=` de Configurações sai: só existia para a ficha voltar à aba
  Colaboradores.

**Supera:** em parte [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos) (o cadastro como sexta aba de Configurações e a ficha em
`/configuracoes/colaboradores/:id`). E o endereço `/ativos`, que tinha substituído o `/itam` sem
decisão própria.
**Mantém:** a [U](#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos) no resto — duas tabelas, o colaborador não entra no sistema, o CRUD do
catálogo — e a [V](./posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira) (a lixeira).

**Por quê:** quando a U pôs o colaborador em Configurações, ele era nome e e-mail, como as outras
abas. Depois ganhou a lixeira (V), a ficha com o que está com ele e o histórico de quatro fontes,
e virou o alvo de ativo, posto, licença e estoque. As outras cinco abas são referência que se
monta uma vez; o colaborador se mexe toda semana — contratação, entrega, desligamento —, e o
menu é ordenado pela frequência de uso. O posto fez o mesmo caminho ([Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)): saiu de
Localizações, em Configurações, quando ficou claro que ele recebe. No Snipe-IT e no GLPI as
pessoas também ficam no menu principal, não nas configurações. As seções vieram do usuário: uma
lista de cinco telas sob "Operação" não dizia o que cada uma era, e por assunto o menu se lê
sozinho.

**O que a migração faz:** nada — a mudança é só de tela, rota e menu.
