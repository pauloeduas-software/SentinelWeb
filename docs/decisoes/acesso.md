# Decisões de acesso: sessão, permissão e identidade

> Quem entra, o que alcança e por qual porta. O contrato está em [`referencia/acesso.md`](../referencia/acesso.md).
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D22–D26, D72–D78, D80, D89, D135–D142.
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
