# Decisões da convergência RMM × ITAM

> O vínculo entre a máquina que o agente descobre e o ativo que alguém cadastrou — e a fila de sugestões que ninguém aceita no automático. O assunto com mais decisões do projeto, porque é o que mais erra em silêncio.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. As supersessões estão em [`README.md`](./README.md).
>
> Decisões neste arquivo: D45–D51, D95–D122, e A/D/E/H/CV/CW/CX/CY/CZ/DA/DB/DC/DD/DE/DF/DI/DJ/DK da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).

---

## D45 — A FK mora no `Endpoint`, e as tabelas não se fundem

**Decidido:** `Endpoint.assetId String? @unique`, `onDelete: SetNull`.
**Descartado:** fundir as duas tabelas; e pôr a FK no `Asset`.

**Por quê não fundir:** a maioria dos ativos nunca terá agente (monitor, cadeira, cabo,
switch) e parte dos endpoints nunca terá cadastro (a máquina do estagiário que ninguém
registrou). Uma tabela só obrigaria metade das linhas a carregar colunas de RMM nulas e a
outra metade a carregar colunas de patrimônio nulas — e, pior, faria o agente **criar
patrimônio** só por existir.

**Por quê no `Endpoint`:** é o lado que a reconciliação escreve, e é o lado menor. No
`Asset` a coluna ficaria nula na maioria esmagadora das linhas. O `@unique` já garante o
1:1, e `SetNull` garante que apagar um ativo não leve junto a telemetria da máquina.

---

## D46 — Evidência ambígua é evidência **zero**

**Decidido:** qualquer sinal que case com mais de um candidato pontua zero e vira alerta.
Além disso, listas de lixo conhecidas **antes** da comparação.

**Por quê:** os identificadores de hardware mentem de formas específicas e repetidas.
**Serial de fábrica em branco** — `To Be Filled By O.E.M.`, `System Serial Number`,
`Default string`, `None`, `0123456789` — é compartilhado literalmente por dezenas de
máquinas, e casar por ele vincularia a frota inteira ao mesmo ativo. **UUID de template de
VM** se repete em toda máquina clonada daquele template, e
`00000000-0000-0000-0000-000000000000` aparece em hardware barato. **MAC de dock** é o
caso mais traiçoeiro: a dock passa o MAC *dela* ao notebook encaixado, e três notebooks que
revezam a mesma dock parecem a mesma máquina — é por isso que MAC vale 85 e não 100, e que
MAC repetido vale 0. **Hostname** é renomeável e volta atrás.

Pegar o primeiro candidato numa colisão é pior do que não vincular: cria vínculo errado
que ninguém revisa, porque o sistema disse que estava certo.

> **O que a árvore acrescentou:** a mesma regra vale para o casamento de pessoa,
> que hoje tem **dois** sinais e não um, porque existe `User.username`.

---

## D47 — O usuário logado sugere **ocupação** quando a posse é do posto

> **Superada por [A](#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional):** a fila deixa de inferir pessoa; sai a invariante 14, e o D50 fica.

**Decidido:** quando a `Assignment` aberta do ativo tem alvo
`LOCATION`, a sugestão gerada é `LocationOccupant`, não checkout.

**Descartado:** sugerir sempre checkout do ativo para o usuário logado, que é o que
qualquer ITAM faria.

**Por quê:** porque a sugestão errada aqui **desfaz cadastro certo**. Se o desktop da Mesa 1
está corretamente entregue ao posto e o sistema sugere "atribuir para a Ana", aceitar essa
sugestão fecha a assignment do posto e transforma um ativo compartilhado em ativo pessoal
— perdendo a Laura, o turno dela e a responsabilidade solidária. O operador clica em
"aceitar" achando que está corrigindo o inventário e está degradando o modelo. A sugestão
tem que **respeitar a camada em que a posse já está**.

E na direção certa ela é útil de um jeito que não tinha como existir antes: ninguém cadastra
ocupação de posto com prazer. A observação do agente é exatamente a fonte de dado que
falta para a Camada 2 sair do papel.

---

## D48 — Dois usuários na mesma máquina é **evidência de posto compartilhado**

> **Superada por [A](#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional):** a fila deixa de inferir pessoa; sai a invariante 14, e o D50 fica.

**Decidido:** duas ou mais pessoas com presença recorrente no mesmo endpoint geram uma
sugestão de **posto compartilhado** — criar/escolher a `Location`, mover a posse para ela
e abrir as ocupações com turno inferido.

**Descartado:** tratar como conflito e escolher a pessoa mais frequente (ou a mais
recente), que é o comportamento padrão de quem só tem `Asset ⟷ User`.

**Por que nenhum ITAM de prateleira faz isso:** não é falta de dado — o dado é o mesmo, o
usuário logado está no WMI de qualquer coleta. É falta de **onde guardar**. Num modelo com
uma única aresta ativo→pessoa, "duas pessoas" é uma contradição: o software precisa
escolher um vencedor, e escolher errado toda semana faz o vínculo oscilar. O jeito de não
oscilar é descartar a observação — e é por isso que ela é tratada como ruído.

Com as três camadas, a mesma observação é **consistente**: o ativo é do posto (uma
assignment), as pessoas são ocupantes (duas linhas), e o turno é um rótulo no vínculo
pessoa↔posto. Não há contradição para resolver, então não há nada para descartar. **O
modelo de posse não é enfeite de modelagem: é o que transforma uma observação descartada
em cadastro.** É a capacidade mais difícil de copiar, porque copiá-la exige
copiar o modelo inteiro.

**O limite, declarado:** é sugestão. Duas pessoas numa máquina também podem ser um técnico
de TI logando para dar suporte, ou uma conta de serviço — e é por isso que o D101 traz a
allowlist. A sugestão entra na fila com a evidência visível (quais dias,
quais horas, quantas amostras) e alguém confirma. O auto-provisionamento **nunca** cria
ocupação sozinho, em nenhum modo.

---

## D49 — Observação de usuário é agregada por dia, com retenção

> **Superada por [A](#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional):** a fila deixa de inferir pessoa; sai a invariante 14, e o D50 fica.

**Decidido:** `EndpointUserDaily` — uma linha por (endpoint, usuário, dia), com primeira e
última hora vistas e contagem de amostras. Expurgo aos 90 dias.
**Descartado:** uma linha por handshake (log de sessão).

**Por quê:** volume e privacidade, nessa ordem de esforço e na ordem inversa de importância.
Uma linha por mensagem faria a consulta varrer milhões de linhas para responder "quem usa
essa máquina". E, sendo dado de pessoa, o formato certo é o menor que responde à pergunta:
**em que dias e em que faixa de hora**, não um rastro minuto a minuto. O propósito é
declarado (identificar posto e ocupante), a retenção é curta, e o que sai dali é sugestão
para um humano — não vigilância de produtividade, que este sistema não se propõe a fazer.

---

## D50 — `lastSeenByAgentAt` existe e **nunca** se chama `lastSeen`

**Decidido:** a coluna do último contato no `Asset` chama `lastSeenByAgentAt` (D13). A
consulta de *fantasma* usa essa coluna; o `Endpoint.lastSeen` continua sendo o batimento do
RMM e não é copiado a cada mensagem.

**Por quê o nome:** é a regra permanente do D13 e a rede de segurança é o compilador. Se o
`Asset` tivesse uma coluna `lastSeen`, o `markStaleEndpointsOffline` apontando para o model
errado **compilaria** — e marcaria a frota inteira como OFFLINE em silêncio. Com o nome
diferente, o mesmo erro é 11 erros de compilação.

**Por quê uma coluna, e não só derivar pelo `Endpoint`:** porque reimagem cria endpoint
novo (`hwid` muda) e o histórico de "um agente já viu este ativo" não pode zerar junto.

> ⚠️ **O mecanismo desta decisão está corrigido pelo D95.** Ela dizia "escrita no handshake,
> no máximo uma vez por dia"; a árvore mostra que `touchEndpoint` é um `UPDATE` por
> mensagem por máquina, e que o teto diário ainda custa um `UPDATE` condicional em `assets`
> nesse mesmo caminho. **O nome e o teto continuam valendo; quem escreve mudou.**

---

## D51 — Auto-provisionamento nasce em `SUGGEST`

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o modo sai; a série única liga a máquina sozinha, sempre, e nada cria computador.

**Decidido:** `discoveryMode` com `OFF | SUGGEST | ON`, default **SUGGEST**.

**Por quê:** em `ON`, a primeira VM de teste que alguém subir vira patrimônio — e **consome
uma etiqueta do contador**, que o `nextAssetTag()` nunca devolve (e o `MAX_PULOS` do
`app-settings.usecase.ts` prova que a sequência já é assunto delicado). O estrago não é a
linha a mais: é a sequência de etiquetas furada para sempre.

> **Revisão (varredura Q):** o `ON` que existe hoje não cria ativo nem consome etiqueta. Ele só
> **vincula sozinho** a máquina ao ativo já cadastrado quando há um candidato único com a
> pontuação máxima (`match-endpoint.usecase.ts`); fora disso, propõe na fila como o `SUGGEST`. O
> default continua `SUGGEST` pelo mesmo cuidado — vínculo errado reescreve o inventário —, mas o
> motivo da etiqueta furada deixou de valer.

---

## D95 — Quem carimba o ativo é o **job**, não o handshake

> **Superada por [DD](#dd--agentes-ganha-sumidos-e-o-excluir-e-o-excluir-revoga-o-agente):** o carimbo sai com a coluna `lastSeenByAgentAt`; os Sumidos contam as máquinas.

> **Superada em parte por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o job continua carimbando o último contato, mas não reconcilia mais; o vínculo é decidido no handshake.

**Decidido:** `Asset.lastSeenByAgentAt` é propagado pelo `reconcile.job.ts`, num único
`UPDATE … FROM` que cobre a frota inteira. O `touchEndpoint` continua tocando
**só** `endpoints`.
**Descartado:** escrever em `assets` dentro do `touchEndpoint`, com teto diário (o
mecanismo que o D50 previa).

**Por quê:** `touchEndpoint` é o caminho mais quente do sistema — roda a cada Handshake,
Telemetry e Ping de **cada** máquina. O teto diário não evita o custo, só evita a escrita:
a instrução condicional é executada em toda mensagem de qualquer jeito, e são máquinas ×
mensagens por dia de `UPDATE` que quase sempre não casa. Pior, ela acopla a tabela de
patrimônio ao caminho de ingestão: um lock em `assets` (um `bulk-update` rodando) passa a
poder atrasar o batimento do RMM, e o `zombie-cleaner` marcaria máquinas vivas como OFFLINE.

**A precisão perdida é de uma hora, e a pergunta tolera dias.** Fantasma é "não é visto há
`ghostDays` (padrão 30)". Uma coluna com até uma hora de atraso responde isso exatamente
igual — e é por isso que a propagação por job não é um atalho, é o desenho certo.

---

## D96 — **Uma** tabela de sugestão, com discriminante

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a fila de sugestões sai.

> **Superada em parte por [CZ](#cz--a-fila-de-sugestões-perde-o-kind-e-a-resposta-o-que-a-tela-não-lê):** o `kind` sai; a fila só propõe vínculo.

**Decidido:** `ReconciliationSuggestion` com `kind SuggestionKind` e FKs de alvo nuláveis
(`assetId`, `targetUserId`, `targetLocationId`, `mergeIntoEndpointId`), no padrão que a
`Assignment` já usa.
**Descartado:** uma tabela por tipo de sugestão (vínculo, checkout, ocupação, posto,
merge).

**Por quê:** o que essas cinco coisas têm em comum é **tudo o que dá trabalho** — nascer
de um job idempotente, não duplicar, guardar evidência, ser aceita ou recusada por uma
pessoa, lembrar da recusa, expirar quando a evidência muda, aparecer numa fila só. Cinco
tabelas seriam cinco cópias disso, e invariante copiada é invariante que um dia diverge (é
o mesmo argumento que uniu os três tipos de estoque, D35, e as duas naturezas de `ApiToken`,
D80). O que varia — qual FK está preenchida — é justamente a parte barata.

**O preço, declarado:** a coerência entre `kind` e qual FK está preenchida não é
expressável no schema do Prisma e é validada no use-case, exatamente como o `assertAlvoCoerente`
da `Assignment`. Se a fila crescer para além de uma tela, vira CHECK na migration.

---

## D97 — A recusa tem memória, e a memória tem chave

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** sem fila não há recusa; a memória do "não" é o `autoLinkOff` que o Desvincular liga.

**Decidido:** a sugestão guarda `evidenceHash` (sha256 da evidência normalizada). O job não
reoferece um par cujo `REJECTED` mais recente tenha o **mesmo** hash; com hash diferente,
reoferece. Aceita ou recusada, a linha fica.
**Descartado:** recusa como booleano permanente por par; e recusa sem memória nenhuma.

**Por quê:** sem memória, o job de hora em hora reoferece o mesmo par para sempre e a fila
vira ruído — quem a usa aprende a ignorá-la, que é o pior estado possível de uma fila de
revisão. Com memória burra (par enterrado para sempre), a recusa certa de hoje esconde a
sugestão certa de amanhã: recusar "este endpoint é o ATV-00012" porque o serial estava em
branco é correto; quando a máquina passar a mandar o serial de verdade, **é outra
afirmação**, e enterrá-la junto seria perder exatamente o caso que o rollout do agente vai
criar às centenas.

O hash é a diferença entre "já me disseram não sobre **isto**" e "já me disseram não sobre
este par, faça o que fizer".

---

## D98 — `AgentStatus` tem **dois** valores; "nunca visto" é pergunta do ativo

**Decidido:** `enum AgentStatus { ONLINE OFFLINE }`. A pergunta *"cadastrado e nunca visto
pelo agente"* é respondida pelo `Asset` (sem endpoint vinculado, ou `lastSeenByAgentAt IS
NULL`), no painel de cobertura.
**Descartado:** `NEVER_SEEN` no enum.

**Por quê:** uma linha de `endpoints` **só existe porque um handshake chegou**. Um valor que
nenhuma linha jamais pode ter não é um estado: é uma coluna mentindo sobre o que a tabela
significa — e alguém, um dia, escreveria a consulta `WHERE status = 'NEVER_SEEN'` para
procurar fantasmas na tabela onde eles, por construção, não estão. A resposta viria vazia e
pareceria boa notícia.

O enum descreve o **agente**; fantasma é fato do **patrimônio**. São eixos diferentes.

---

## D99 — O teste do agente entra por **WebSocket de verdade**

> **Superada em parte por [CY](#cy--o-servidor-lê-o-que-o-sentinelagente-manda-e-só-isso):** o parser lê só PascalCase, sem sinônimos.

**Decidido:** os testes do agente abrem `app.listen({ port: 0 })` e falam com `/agent-hub`
por um cliente `ws` real, num helper `tests/helpers/agente.ts`. `ws` entra como
`devDependency` explícita.
**Descartado:** chamar `handleAgentMessage()` direto; e simular o handshake com
`prisma.endpoint.create`.

**Por quê:** hoje **nenhum teste atravessa o hub** — `invariantes/api-token.test.ts` usa
`inject` e para no 401 do `preHandler`, porque `inject` não faz upgrade de WebSocket. E é
justamente a borda do agente que está em jogo: `parse-agent-message` →
`normalize-payload` → `registerHandshake`. Chamar o use-case direto pularia o parser, os
sinônimos PascalCase/camelCase e o `readOptionalBigInt` — ou seja, pularia exatamente onde
o agente velho e o novo se distinguem, que é o risco número um do rollout. É o mesmo
princípio que fez o [`../referencia/testes.md`](../referencia/testes.md) exigir cenário pela API e não por
`prisma.create`: o teste tem que exercitar o que roda em produção.

Depender de `ws` transitivamente (por `@fastify/websocket`) funcionaria e é o tipo de
dependência que some num `npm update` sem aviso.

---

## D100 — A chave do pacote é derivada, e o hash do software é do **servidor**

**Decidido:** `SoftwarePackage.normalizedKey` (minúsculo, `nome|versão|fabricante ?? ''`)
com `@unique`, e `Endpoint.softwareHash` calculado no servidor sobre a lista normalizada e
ordenada.
**Descartado:** `@@unique([name, version, publisher])`; e confiar num hash mandado pelo
agente.

**Por quê a chave derivada:** em Postgres, `NULL` **não é igual a `NULL`** dentro de um
índice único. `UNIQUE(name, version, publisher)` deduplica "Chrome 120 / Google" e **não**
deduplica "Chrome 120 / (sem fabricante)" — e software sem fabricante declarado é comum.
O catálogo ganharia uma linha nova por máquina, por handshake, e a conformidade contaria
instalações que são a mesma.

**Por quê o hash no servidor:** agente velho não manda hash nenhum, e o que ele manda é o
que ele acha da própria lista — se ele errar (cache, coleta parcial), a normalização **nunca
mais** roda para aquela máquina e o inventário de software congela em silêncio. Calcular
sobre a lista recebida custa um sha256 de string por handshake e é a única forma de o hash
descrever **o que chegou**.

---

## D101 — A allowlist de usuários ignorados não fica para depois

**Decidido:** `AppSetting.ignoredUserKeys String[]`, aplicada antes da detecção de posto
compartilhado e da sugestão de posse.
**Descartado:** deixar para depois.

**Por quê:** o técnico de TI loga em todas as máquinas que atende, e a conta de serviço
aparece em todas as que rodam o serviço. Sem o filtro, o sistema entrega **no primeiro dia**
uma fila com dezenas de "posto compartilhado" falsos misturados aos verdadeiros — e uma
fila cujo primeiro contato é ruído não é revisada uma segunda vez. O custo é uma coluna e
um `NOT IN`; o custo de adiar é a única entrega que o concorrente não copia
nascer desacreditada.

Ela nasce **vazia**: preencher com palpites (`admin`, `administrator`) esconderia um
administrador que é uma pessoa de verdade usando a máquina dela.

---

## D102 — Licença ↔ pacote é vínculo **explícito**, nunca casamento por nome

> **Superada por [G](./licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):** licença vira cadastro simples, sem conformidade de software nem chave cifrada.

**Decidido:** tabela `LicenseSoftware (licenseId, packageId)`, preenchida por uma pessoa
escolhendo entre os pacotes que a descoberta já normalizou.
**Descartado:** casar `License.name` com `SoftwarePackage.name` por semelhança.

**Por quê:** o nome comercial e o nome instalado quase nunca coincidem — "Office 365 E3" no
contrato é "Microsoft 365 Apps for enterprise" no Programas e Recursos, e "Adobe Acrobat
Pro" convive com "Adobe Acrobat (64-bit)" e com o Reader, que é grátis. Casamento
aproximado erra nos dois sentidos, e os dois erros são caros: um falso **"instalado sem
licença"** manda comprar assento que já existe; um falso **"coberto"** entrega auditoria de
fornecedor com resposta errada — que é exatamente a pergunta que o módulo de licença existe
para responder valendo dinheiro.

Um vínculo explícito é trabalho humano uma vez por licença, e é o único que alguém pode
**conferir**. É a mesma régua do D46, um andar acima: evidência que não distingue não é
evidência.

---

## D103 — Merge não apaga: o endpoint perdedor ganha `mergedIntoId`

> **Superada por [H](#h--a-fusão-de-máquinas-sai):** o `hwid` é estável entre reinstalações; não há o que fundir.

**Decidido:** a fusão move telemetria, presença e instalações, e **mantém a linha** do
endpoint antigo com `mergedIntoId` preenchido, fora das listagens.
**Descartado:** `DELETE` no endpoint antigo depois de mover o que interessa.

**Por quê:** merge é destrutivo e não tem desfazer. Com a linha viva, o `hwid` antigo
continua existindo — e isso importa por dois motivos concretos: o agente antigo pode
**voltar** (a reimagem não pegou, a placa foi devolvida) e recriaria um endpoint órfão sem
saber que já foi fundido; e o `ApiToken` daquela instalação aponta para `endpointId` (D80),
que com `DELETE` viraria FK pendurada. A linha preservada é também a única testemunha de
que a fusão aconteceu, ao lado do `ActivityLog`.

---

## D104 — MAC é sinal de **MERGE**, não de vínculo

> **Superada por [H](#h--a-fusão-de-máquinas-sai):** o `hwid` é estável entre reinstalações; não há o que fundir.

**Decidido:** duas cascatas. `endpoint × ativo` pontua `SERIAL` (100), `UUID` (100) e
`HOSTNAME` (60); `endpoint × endpoint` pontua `SERIAL`, `UUID` e **`MAC` (85)**.
**Descartado:** a cascata única de quatro sinais.

**Por quê:** escrevendo o helper, o sinal de MAC não tinha contra o que comparar — **o
`Asset` não tem coluna de endereço MAC**. Ele tem `assetTag`, `serial` e `name`, todos
digitados por gente. Não existe MAC do lado cadastrado, e não vai existir: ninguém vai
digitar o MAC de 500 máquinas num formulário.

O que o MAC de fato responde é outra pergunta — *estas duas MÁQUINAS são a mesma?* —, e
essa pergunta é a do merge: reimagem ou troca de placa muda o `hwid` e cria linha nova.
Deixá-lo na cascata errada não seria só inútil: seria pontuar 85 num sinal que **nunca
casa**, e a partir daí a pontuação descreveria uma coisa que não acontece.

O `HOSTNAME`, pelo caminho inverso, **saiu** da cascata de merge: máquina reimaginada quase
sempre mantém o nome, e fundir duas linhas por 60 pontos de um campo renomeável é
destrutivo demais para o que o sinal garante. Merge não tem desfazer (D103), então o piso
dele é mais alto que o do vínculo.

---

## D105 — Dois hashes de software: o que **chegou** e o que foi **normalizado**

**Decidido:** `Endpoint.softwareHash` (a lista que o agente mandou) e
`Endpoint.softwareNormalizedHash` (a lista que as tabelas refletem). O job processa quem
tem os dois diferentes.
**Descartado:** uma coluna só, como o D100 previa.

**Por quê:** com uma coluna, a pergunta "quem mudou?" não tem resposta barata — o job
teria que **ler e re-hashear o JSON de software de 500 máquinas a cada hora** só para
descobrir que 498 não mudaram. O hash existe exatamente para esse trabalho não acontecer, e
uma coluna só o devolvia pela porta dos fundos.

Com duas, a varredura é `WHERE "softwareNormalizedHash" IS NULL OR <> "softwareHash"` —
comparação de duas colunas, e numa frota estável ela devolve zero linhas. O D100 continua
valendo inteiro no que ele decidiu: o hash é calculado **no servidor**, nunca aceito do
agente.

---

## D106 — O que o agente velho não sabe, ele **não desfaz**

**Decidido:** todo campo de identidade é gravado com `?? undefined`, nunca `?? null`.
**Descartado:** `?? null`, que é o que "campo opcional" sugere em quase toda outra situação.

**Por quê:** em Prisma, `undefined` significa **não escreva esta coluna** e `null` significa
**apague o que está nela**. A diferença pesa durante o rollout do agente C#:
uma máquina que já mandou o serial e reconecta com a versão antiga do agente — rollback,
reinstalação, imagem desatualizada — **apagaria o próprio serial**, e com ele o vínculo que
a reconciliação já tinha resolvido. O operador veria a máquina voltar para a fila de
descobertas sem nada ter acontecido no mundo real.

"Opcional no parser" protege contra o agente velho **quebrar**; isto
protege contra ele **destruir**. São coisas diferentes e as duas eram necessárias.

---

## D107 — O aceite **age e depois fecha**, e a ordem erra para o lado certo

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o aceite sai com a fila.

**Decidido:** `aceitarSugestao` executa a ação (que abre a própria transação) e só então
marca a sugestão como `ACCEPTED`, em duas operações separadas.
**Descartado:** as duas na mesma transação.

**Por quê o descarte é forçado:** as ações chamam use-cases que **já abrem
transação** — o checkout tem seis passos e uma trava de linha —, e transação aninhada não é
suportada. Reimplementar o checkout aqui dentro para caber numa transação só seria a
segunda cópia da posse, que é o que o `accept-suggestion` inteiro existe para evitar.

**Por quê a ordem escolhida:** entre as duas falhas possíveis, elas não são simétricas.
Com *agir → fechar*, um processo que morra no meio deixa a sugestão `PENDING` sobre um
cadastro que já mudou — alguém a vê de novo numa fila que reflete o mundo novo, e a
descarta. Com *fechar → agir*, sobra uma sugestão marcada como **aceita que nunca
aconteceu**: o sistema afirma ter feito algo que não fez, e ninguém tem como descobrir.

---

## D108 — A fusão preserva o `lastSeen` mais recente, não o `createdAt` mais antigo

**Decidido:** o vencedor fica com o **maior** `lastSeen` dos dois, e as colisões de
`endpoint_user_daily` e `software_installations` são **consolidadas** (somando amostras,
esticando as datas), não movidas.
**Descartado:** "preservar o `createdAt` mais antigo".

**Por quê:** **`Endpoint` não tem `createdAt`.** A tabela nasceu como registro de
presença, e o que ela guarda é `lastSeen`. A promessa descrevia um campo que não
existe — e escrever a fusão foi o que revelou isso.

**A consolidação:** `endpoint_user_daily` é única por (máquina,
conta, dia) e `software_installations` por (máquina, pacote). As duas linhas podem ter
registros do MESMO dia e do MESMO pacote — é o caso **normal**, aliás, porque a reimagem
acontece no meio de um dia de trabalho. Mover cegamente violaria o índice e derrubaria a
fusão inteira na metade. E consolidar não é só evitar o erro: `firstSeenAt` de um software
é fato da MÁQUINA, não da linha — se o Office estava instalado antes da reimagem,
"instalado desde" é a data antiga.

---

## D109 — O hash é da **afirmação**, não da evidência

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o hash da sugestão sai com a fila.

**Decidido:** `ReconciliationSuggestion.evidenceHash` guarda o sha256 de uma
**afirmação** — o subconjunto que identifica o que a sugestão diz —, e não da
evidência inteira. `proporSugestao` recebe os dois campos separados, e a
`afirmacao` é obrigatória.
**Descartado:** hashear o objeto de evidência.

**Por quê:** a evidência de posse carrega o que **sustenta** a afirmação — em
quantos dias a pessoa apareceu, quantas amostras, em que horas, qual foi o último
dia. Esses números **crescem sozinhos**. Com o hash sobre eles, um único dia a
mais de presença produzia hash novo, e a sugestão que alguém já tinha **recusado
voltava para a fila** como se fosse outra afirmação. Não era: era a mesma frase
("a Laura usa esta máquina") com o contador incrementado.

O efeito é que o D97 valia só para `LINK` e `MERGE`, cujas evidências são
estáveis — e é justamente para as três de posse que a fila é usada todo dia. A
regra para montar uma afirmação cabe numa linha: **se o valor muda sozinho com o
tempo, ele não entra.** Quem é a pessoa, qual é o ativo, qual foi o sinal e qual
o valor que casou entram; contador, histograma e data não. O turno também fica
fora — é palpite que uma pessoa corrige (D15), não parte da frase.

**E a evidência visível continua crescendo:** quando a afirmação já está na fila,
o `evidence` é atualizado e o hash não. Congelar a evidência para proteger o hash
resolveria a memória mentindo na tela, que é trocar um defeito por outro.

**A consulta da memória também mudou:** ela procura pelo **hash**, e não pela
linha mais recente do par. Com "a mais recente", uma recusa ficava **escondida**
atrás de qualquer linha posterior — um `SUPERSEDED` de ontem mascarava o
`REJECTED` de anteontem, e a sugestão recusada voltava por esse caminho também.
Memória se consulta pela chave que a define.

---

## D110 — A fila tem **três** portas de saída, e a terceira é o mundo

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a fila sai, e com ela o encerramento das obsoletas e o expurgo das substituídas.

**Decidido:** `encerrarSugestoesObsoletas()` roda no começo de cada rodada do job
e marca `SUPERSEDED` toda sugestão pendente que deixou de descrever o mundo. O
`desvincular` faz o mesmo para a máquina dele, na própria transação. E o aceite
recusa com 409 o que a varredura ainda não alcançou.
**Descartado:** confiar que a sugestão só sai da fila por aceite ou recusa.

**Por quê:** uma sugestão sai da fila quando alguém a aceita, quando alguém a
recusa — e quando **o mundo muda e ela deixa de descrever qualquer coisa**. A
terceira é a mais comum das três (alguém entrega o ativo à mão, alguém desfaz um
vínculo, a posse passa para um posto) e era a que não existia: `proporSugestao`
só substituía quando chegava uma proposta **nova** para o mesmo alvo, e
`sugerirPosseOuOcupacao` desistia com `return 0` deixando a sugestão velha viva.

**E o estrago não era fila suja.** O aceite de `CHECKOUT` é checkin + checkout,
então aceitar "entregar à Ana" um ativo **já entregue à Ana** gravava no histórico
de posse uma **devolução que nunca aconteceu**. Num sistema cujo núcleo é o razão
de posse, isso é pior que um inventário errado: é uma afirmação falsa sobre o
passado, e ninguém tem como descobrir que ela é falsa. A mesma guarda existe nos
dois lugares de propósito — o job cobre o caso normal, o aceite cobre a janela de
até uma hora entre o mundo mudar e a varredura seguinte.

**`SUPERSEDED` e nunca `REJECTED`:** ninguém disse não. Recusa é ato de gente e
tem memória (D97); isto é o mundo tendo andado, e enterrar por isso uma afirmação
que amanhã pode valer de novo seria inventar uma recusa que não houve.

> **O expurgo que veio com ela:** `SUPERSEDED` com mais de 180 dias é apagado, e
> só ele. `REJECTED` é a memória do D97 e apagá-lo reoferece o que uma pessoa já
> recusou; `ACCEPTED` é a trilha de quem mandou o sistema mudar o cadastro. O que
> sobra — a linha substituída porque o mundo andou — não responde pergunta
> nenhuma depois de meio ano. Constante e não coluna de `AppSetting`: a retenção
> que **é** de pessoa (D49) continua configurável porque aquela é sobre gente.

---

## D111 — A janela da agregação corta na **meia-noite**, não em "há N×24 horas"

> **Superada por [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos):** a agregação do uso diário sai com a aba Ociosos.

**Decidido:** `agregarUsoDosAtivos` calcula `desde` como a meia-noite UTC do dia
mais antigo da janela.
**Descartado:** `Date.now() - dias × 24h`, que era o que estava escrito.

**Por quê:** o corte por horas cai **no meio** do dia mais antigo. O
`GROUP BY … ::date` então recalculava aquele dia usando só a telemetria posterior
ao corte, e o `ON CONFLICT DO UPDATE` sobrescrevia o total certo por um parcial.
Rodando de hora em hora o dia **encolhia a cada rodada** até sair da janela e
congelar truncado: um dia de trabalho inteiro virava a última hora dele, para
sempre, e nenhum erro aparecia em lugar nenhum.

A palavra que a agregação promete é **idempotente**, e idempotente quer dizer que
a segunda passada escreve o **mesmo** valor. Alinhado à meia-noite, todo dia que
entra na janela entra completo — e é o mesmo eixo do
`(t."timestamp" AT TIME ZONE 'UTC')::date` do agrupamento, o que torna a
propriedade legível no próprio SQL em vez de depender de quando o job acordou.

---

## D112 — `discoveryMode = OFF` desliga a descoberta

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o `discoveryMode` sai.

**Decidido:** em `OFF`, `reconciliarEndpoint` desiste antes da cascata: não nasce
`LINK` nem `MERGE`, e não há vínculo automático. Posse e posto compartilhado
continuam, porque falam de máquina que **já tem** cadastro.
**Descartado:** ler só o `ON`, que era o comportamento real — `OFF` se comportava
exatamente como `SUGGEST`.

**Por quê:** um enum de três valores em que um não é lido por ninguém é pior que
uma configuração que falta. A que falta é pedida; esta é **procurada,
encontrada, ajustada — e o problema continua**, com a pessoa achando que
desligou. Quem põe `OFF` está dizendo "pare de me propor coisas sobre máquina que
eu não cadastrei", e é exatamente isso que a chave passa a fazer.

**O limite é o que o enum diz que ele governa:** *o que o sistema faz quando
descobre máquina sem cadastro*. Estender `OFF` para calar também a sugestão de
ocupação seria desligar a entrega mais valiosa (D48) por uma chave cujo
nome não anuncia isso — e ela responde outra pergunta, sobre máquina que o
cadastro já conhece.

---

## D113 — O turno é a **moda** dos turnos, não a média das horas

**Decidido:** `turnoPelaHora` classifica cada hora observada num dos três turnos
(madrugada conta como **Noite**) e devolve o que mais aparece; empate devolve `null`.
**Descartado:** a média aritmética das horas com corte em 12 e 18, que era o que estava
escrito.

**Por quê:** hora é grandeza **circular**, e a média de grandeza circular não significa
nada. Quem trabalha 22h–2h aparece nas horas `[22, 23, 0, 1]` — média 11,5, e `11,5 < 12`
rotulava o plantão da noite como **"Manhã"**. Não era caso de borda: era o turno da noite,
todas as noites. E o erro tinha a pior forma possível — o sistema apresentava um rótulo
calculado, que ninguém contesta.

O corte de `hora < 12` também jogava a madrugada inteira (0h–5h) para "Manhã", então metade
das horas de um turno noturno contava para o turno oposto. Classificar primeiro e contar
depois é o que faz a meia-noite deixar de ser um precipício no meio da conta.

**Empate devolve `null`, e isso é o D46 aplicado ao turno:** a escala 12x36 produz horas em
dois turnos com a mesma frequência (`[7, 19]`), e a média dizia "Tarde" — errado para os
dois lados. Sem rótulo, a ocupação nasce sem turno e quem cadastra escreve o que é, que é
exatamente por que a coluna é texto livre (D15). 12x36 já estava fora de escopo;
o que não se podia aceitar é uma resposta errada em vez de nenhuma.

---

## D114 — O seletor de posto oferece **posto**, e a spec de localizações já dizia onde

**Decidido:** o `SHARED_POST` monta o seletor com `GET /api/workstations`.
**Descartado:** `GET /api/locations/options`, que era o que estava ligado — com um comentário
ao lado afirmando "só os postos de trabalho".

**Por quê:** `/options` devolve **todas** as localizações, de propósito e documentado em
`catalog/specs/location.spec.ts` ("o pai de uma mesa é uma sala, e uma sala não é posto").
O seletor oferecia a filial e o andar ao lado da Mesa 1 — e o comentário do código afirmava
o contrário, que é a forma de defeito mais caro de achar: quem lê acredita.

**E o estrago passava até o fim.** Nem o aceite nem o `checkoutAsset` checam `isWorkstation`,
então escolher "Matriz — São Paulo" criava uma posse de **posto** apontando para uma
localização que não é posto. A `Assignment` fica válida, `/postos` nunca mostra aquele ativo,
e o `postoVago` — o sinal de "ninguém responde por este equipamento" — não tem como falar
dele. A entrega mais valiosa produzindo cadastro que `/postos` não enxerga.

A própria spec aponta o caminho certo, e a correção é usá-lo em vez de abrir `optionFilter`
para booleano (que o `z.enum` de valores de texto não expressa, e que a spec já tinha
recusado com motivo).

---

## D115 — A rota da aba chama `/machine`, e devolve o que a aba mostra

> **Superada por [D](#d--a-telemetria-e-o-comando-vão-para-a-ficha-do-ativo-e-a-do-posto):** a telemetria e o comando vão para a ficha do ativo e a do posto.
>
> **Superada em parte por [BY](#by--a-aba-máquina-mostra-o-que-o-agente-manda):** a rota não devolve mais as especificações nem as mudanças de hardware.
>
> **Superada em parte por [BZ](#bz--vincular-e-desvincular-moram-em-descobertas):** a rota não devolve mais os dois carimbos de último contato.

**Decidido:** `GET /api/assets/:id/machine` devolve especificações, os **dois** carimbos de
último contato, as mudanças de hardware detectadas e a lista de software.
**Descartado:** `GET /api/assets/:id/software` devolvendo só a lista de programas.

**Por quê:** a aba Máquina prometia "specs, último contato, software e desvincular" e
entregava dois dos quatro. Pior: o cabeçalho do componente gastava oito linhas explicando
**por que** as specs aparecem ali (o D16 — o dado do lado que descobre não vira coluna do
ativo) e elas não apareciam em lugar nenhum. Documentação de uma decisão que o código não
executa é pior que ausência das duas.

Com quatro conteúdos na resposta, `software` nomeava um quarto dela. É a mesma regra que
aposentou `/itam` em favor de `/ativos` e que fez a tela se chamar `/descobertas`: **o nome
é do que a coisa é, não do que ela era quando nasceu.** O use-case saiu de
`license-compliance.usecase.ts` junto — vizinhança de tabela (`SoftwareInstallation`) não é
vizinhança de assunto.

**As duas datas vão lado a lado, com a diferença escrita na tela.** `Endpoint.lastSeen` é o
batimento; `Asset.lastSeenByAgentAt` é o carimbo que o **job** propaga (D95), e ele fica até
uma hora atrás. Sem a frase que explica isso, quem vê a segunda data atrasada conclui que o
batimento falhou.

---

## D116 — A `AssetChange` ganha escritor, e ele mora no handshake

> **Superada por [DA](#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai):** a `AssetChange` sai, com o escritor e a memória total, que só ela lia.

**Decidido:** o `registerHandshake` devolve a fotografia das specs que ele estava por
sobrescrever, e o roteador do agente compara e grava — ao lado de onde já grava a observação
de usuário.
**Descartado:** deixar a tabela esperando "quando a comparação de specs entrar".

**Por quê:** a tabela nasceu com FK, índice e nenhuma linha. **Tabela sem escritor
não é meio caminho andado** — é uma promessa no schema que a tela não cumpre, e é o mesmo
defeito que o `installedSoftware` tinha (três ocorrências no código, todas
de escrita).

**Tem que ser no handshake**, porque é o único instante em que o ANTES e o DEPOIS existem ao
mesmo tempo: depois do `upsert`, o valor velho não está em lugar nenhum. A alternativa seria
guardar uma segunda cópia das specs para comparar contra — segunda fonte de verdade para o
mesmo dado, que é o que o D16 recusa. O preço é **uma** leitura por `hwid` (coluna `@unique`,
busca por índice) num caminho que roda quando o agente sobe, não a cada amostra.

**E isto não contraria o D95.** O D95 tirou do caminho de ingestão a escrita em `assets` — a
tabela de patrimônio, que a tela tranca em `bulk-update` e cujo lock atrasaria o batimento do
RMM. `asset_changes` é tabela de **log**: append-only, sem ninguém trancando, sem ninguém
editando. São dois custos diferentes com o mesmo nome. E numa frota estável a comparação
devolve zero e não há `INSERT` nenhum.

**Três coisas não são mudança:** `null` → valor é a **primeira coleta** (o rollout do agente
C# produziria isso às centenas no mesmo dia, transformando o histórico de cada ativo num
relatório de deploy); valor → `null` é o D106 do lado da detecção ("não sei" não é "sumiu");
e diferença só de espaço ou caixa vazia não é diferença. Sem ativo vinculado não nasce linha —
`AssetChange.assetId` é obrigatório porque a pergunta é do patrimônio, e máquina órfã não tem
patrimônio para contestar.

---

## D117 — A conformidade ganha **porta de entrada**: o catálogo de pacotes

**Decidido:** nasce `GET /api/software-packages` (com busca, ordenado por número de
instalações) e `GET /api/licenses/:id/software`, e a tela da licença ganha o formulário da
ponte mais o relatório.
**Descartado:** considerar a ponte entregue porque as rotas de escrita e de relatório
existiam.

**Por quê:** havia `PUT /api/licenses/:id/software` e
`GET /api/licenses/:id/compliance`, e faltava a pergunta do meio — *quais pacotes existem
para eu ligar?* Sem ela, nenhuma tela tinha de onde tirar um `packageId`: `LicenseSoftware`
não recebia linha por caminho de produto nenhum, e `calcularConformidade` respondia
`semVinculoDeSoftware: true` **para sempre**. Motor completo, resposta vazia.

É o defeito da etiqueta automática, do [`../referencia/testes.md`](../referencia/testes.md), na forma mais pura: funcionalidade verificada
pelo caminho da API e inalcançável pelo caminho do formulário. O teste provava a
ponte pegando o `packageId` direto do Prisma — coisa que nenhuma tela pode fazer —, e foi
justamente esse atalho que escondeu a lacuna. Os testes novos entram pela rota.

**Ordena por instalação e não por nome**, porque a pergunta de quem abre a lista é "que
licença eu amarro primeiro". O catálogo de uma frota real tem milhares de linhas (cada
runtime, cada driver, cada atualização), e em ordem alfabética as primeiras cem são todas
`7-Zip` e `Adobe AIR`.

---

## D118 — A configuração da descoberta ganha tela, e a allowlist com ela

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o painel Configurar sai; os Sumidos contam 30 dias fixos.

> **Superada em parte por [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos):** o `shadowHours` sai com a triagem; ficam o modo e o `ghostDays`.

**Decidido:** o painel de `/descobertas` ganha os cinco controles — modo, `ghostDays`,
`shadowHours`, `userDailyRetentionDays` e `ignoredUserKeys`.
**Descartado:** deixá-los só na rota, como estavam.

**Por quê:** as cinco colunas existiam no `AppSetting`, a rota existia com zod e tetos, o
hook do front existia — e a página **nunca desenhou nada disso**: ela não desestruturava nem
`configuracao` nem `handleSalvarModo`. Configuração sem tela é o mesmo que configuração que
não funciona, e é pior que uma que falta: a que falta é pedida; esta é procurada no código,
encontrada, e continua sem jeito de mexer. É o mesmo raciocínio do D112, uma camada acima —
lá era o enum que ninguém lia, aqui é o formulário que ninguém desenhou.

**A allowlist é a que dói.** As três guardas da fila não são opcionais, e ela é
a terceira: sem ela, o técnico de TI que loga em 40 máquinas gera 40 sugestões de posto
compartilhado no primeiro dia — e fila cujo primeiro contato é ruído não é revisada uma
segunda vez. A guarda estava implementada no servidor e inalcançável.

**Fica ao lado do painel de cobertura, não numa tela de ajustes:** os controles explicam os
números que a pessoa acabou de ler. "Por que tenho 12 fantasmas?" se responde mexendo em
`ghostDays`, e separar as duas coisas em telas diferentes esconderia a resposta da pergunta.

---

## D119 — Assinatura na `key`, nunca `setState` em efeito

**Decidido:** os dois formulários novos (a configuração e o seletor de pacotes) semeiam
estado com inicializador **preguiçoso** e remontam por uma `key` derivada do dado do
servidor.
**Descartado:** `useEffect` copiando a resposta da consulta para `useState`.

**Por quê:** o lint desta casa reprova `setState` dentro de efeito, e com razão — encadeia
renders. Mas o motivo de o padrão importar aqui é outro, e é de correção: o
`PUT /api/licenses/:id/software` recebe o **conjunto inteiro** e desliga o que não está nele.
Um conjunto marcado que abrisse vazio por um instante e fosse salvo naquele instante apagaria
a ponte toda, em silêncio. Com `key`, o componente só existe depois de o dado existir.

O efeito colateral é o certo: salvar invalida a consulta, o servidor responde o que ele
**aceitou**, a assinatura muda e o formulário reexibe o valor gravado — não o digitado. Quem
mandou `ghostDays: 0` e levou 422 vê o número que continua valendo, em vez de um campo
mentindo que a mudança pegou.

---

## D120 — `proporSugestao` não recebe cliente, porque abre transação

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o `proporSugestao` sai com a fila.

**Decidido:** a função perde o parâmetro `client` e usa o `prisma` global.
**Descartado:** manter o `Pick<typeof prisma, 'reconciliationSuggestion'>`, que aceitava um
`tx`.

**Por quê:** o tipo dizia que dava para chamar de dentro de uma transação, e no ramo da
**substituição** a função abria `prisma.$transaction` por conta própria, ignorando o cliente
recebido. Os seis chamadores passavam `prisma`, então não havia defeito — havia uma **promessa
falsa na assinatura**, do tipo que só cobra no ramo que roda quando uma sugestão substitui
outra, em produção.

A substituição precisa da própria transação (`SUPERSEDED` + `create`, ou o par fica sem
nenhuma pendente), então a honestidade é dizer que esta função abre transação e não roda
dentro de uma. Parâmetro removido em vez de tipo alargado: um `client` que só aceita o
`prisma` global não é parâmetro, é decoração.

---

## D121 — Casar a conta busca os **candidatos**, não o cadastro inteiro

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a sugestão sai com a fila.

**Decidido:** `registrarUsuarioObservado` filtra no banco por `username` igual ou parte local
de e-mail igual, e entrega esse recorte ao `casarPessoa`.
**Descartado:** `findMany` sem `where`, que era o que estava lá.

**Por quê:** a consulta carregava **todos** os usuários a cada handshake para comparar duas
strings. Numa empresa de 2.000 pessoas são 2.000 linhas trafegadas por handshake de cada
máquina, para responder "quem é ana.silva".

**O filtro preserva a ambiguidade, e é isso que o torna aceitável:** ele reproduz os dois
sinais do helper, então duas pessoas que casam pela mesma chave entram as duas no recorte e é
o `casarPessoa` puro que conclui "não sei" (D46). Um `take: 1` é que romperia a regra, e é
justamente o que não está lá. `mode: 'insensitive'` nos dois porque o helper compara em
minúsculas — sem isso, `ANA.SILVA` no Windows deixaria de casar com `ana.silva` no cadastro,
e um filtro de desempenho teria mudado o resultado.

---

## D122 — `Asset.suggestions`, e não o nome que o `prisma format` escreveu

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a relação sai com a tabela de sugestões.

**Decidido:** o campo de relação em `Asset` chama `suggestions`.
**Descartado:** `ReconciliationSuggestion ReconciliationSuggestion[]`, que o gerador escreveu
sozinho e que ficou.

**Por quê:** os outros três lados da mesma relação (`Endpoint`, `User`, `Location`) já a
chamavam de `suggestions`. Nome de campo de relação **não existe no banco**, então a troca não
pede migração — `migrate diff` contra o banco com todas as migrações aplicadas volta vazio. O
que ela muda é o que se lê num `include`, e nome gerado por ferramenta é o que se copia na
próxima vez.

---

## A — A reconciliação deixa de inferir pessoa pela conta do sistema operacional

> **Superada em parte por [CY](#cy--o-servidor-lê-o-que-o-sentinelagente-manda-e-só-isso):** o `loggedOnUser` sai do tipo e do parser.

**Decidido:** saem a observação de usuário logado (`EndpointUserDaily`), a sugestão de
ocupação de posto por inferência (`OCCUPANCY`) e a de posto compartilhado por dois usuários na
mesma máquina. `SuggestionKind` fica só com `LINK` e `MERGE` (e, depois de
[H](#h--a-fusão-de-máquinas-sai), só `LINK`); a sugestão passa a ter **dois** alvos possíveis em
vez de quatro, e sem turno.
**Supera:** [D47](#d47--o-usuário-logado-sugere-ocupação-quando-a-posse-é-do-posto) (o usuário
logado sugerindo ocupação), [D48](#d48--dois-usuários-na-mesma-máquina-é-evidência-de-posto-compartilhado)
(dois usuários = posto compartilhado) e [D49](#d49--observação-de-usuário-é-agregada-por-dia-com-retenção)
(a agregação diária que alimentava as duas) — e a invariante 14 (`endpoint_user_daily`), que sai
de [`../referencia/invariantes.md`](../referencia/invariantes.md) junto com a tabela.
**Mantém:** [D50](#d50--lastseenbyagentat-existe-e-nunca-se-chama-lastseen) —
`Endpoint.lastSeenByAgentAt` continua respondendo "quando esta máquina foi vista pela última
vez", que é pergunta sobre a MÁQUINA, não sobre quem estava logado nela.

> **Revisão:** `lastSeenByAgentAt` é coluna do **ativo** (`Asset`); a da máquina é
> `Endpoint.lastSeen` ([D13](./catalogo-e-ativo.md#d13--a-segurança-do-rename-depende-de-o-asset-novo-não-ter-status-lastseen-nem-hwid),
> [D50](#d50--lastseenbyagentat-existe-e-nunca-se-chama-lastseen)). As duas continuam respondendo
> "quando foi visto pela última vez", cada uma do seu lado — e nenhuma delas fala de quem estava
> logado, que é o que o argumento acima precisa.

**Por quê:** a conta do sistema operacional é o sinal mais fraco que a descoberta tinha —
"fulano estava logado" não é "fulano ocupa esta mesa", e as duas sugestões que dependiam disso
(ocupação e posto compartilhado) erravam exatamente nos casos em que mais importava não errar: a
conta de serviço, o turno que troca de usuário sem trocar de posto, a sessão que fica aberta. O
projeto já tinha o sinal forte para "quem ocupa o posto" — a ocupação cadastrada em
`LocationOccupant` — e inferir o mesmo fato por um caminho mais fraco era manter dois lugares que
podiam discordar.

**O que isso custa, e é aceito:** a fila deixa de propor ocupação para quem a tela ainda não
cadastrou. O cadastro continua manual, pela ficha do posto — o que sai é a sugestão automática
baseada em quem fez login, não a possibilidade de cadastrar.

**O protocolo não muda:** `loggedOnUser` continua no tipo e no parser do handshake; o servidor
só para de gravar. Trocar o protocolo exigiria coordenar a troca com o agente já instalado, e não
havia necessidade — o campo chegando e sendo ignorado é mais simples que renegociar o contrato.

---

## H — A fusão de máquinas sai

> **Superada em parte por [CV](#cv--a-máquina-reinstalada-herda-a-própria-linha-como-no-glpi):** o `hwid` deixa de ser
> estável entre reinstalações. A segunda linha para a mesma máquina continua não existindo, mas porque o handshake
> reconhece a máquina reinstalada pelo firmware, e não porque o `hwid` nunca muda.

> **Superada em parte por [BZ](#bz--vincular-e-desvincular-moram-em-descobertas):** o 409 de vínculo aponta para Descobertas, não para a aba Máquina.

**Decidido:** saem `merge-endpoints`, a cascata máquina↔máquina, o sinal `MAC` e
`normalizeMac`. `SuggestionKind` fica só com `LINK`; `MatchSignal` fica com `SERIAL`, `UUID` e
`HOSTNAME`. `Endpoint.mergedIntoId` e `ReconciliationSuggestion.mergeIntoEndpointId` saem do
schema.
**Supera:** [D103](#d103--merge-não-apaga-o-endpoint-perdedor-ganha-mergedintoid) e
[D104](#d104--mac-é-sinal-de-merge-não-de-vínculo), que descreviam a fusão e o sinal que a
disparava.

**Por quê:** o `hwid` é derivado do hardware e estável entre reinstalações — não existe mais
"segunda linha para a mesma máquina" para fundir. O D103 e o D104 resolviam um problema real
quando o `hwid` podia mudar; deixou de existir o cenário que os justificava.

**O que isso simplificou:** a mensagem do 409 de vínculo deixa de mandar usar a fusão e passa a
apontar o "Desvincular" da aba Máquina, que já existe. Os sete filtros de `mergedIntoId: null`
somem — inclusive os dois em SQL cru (`stamp-last-seen`, `aggregate-usage`) que o compilador não
alcançava e que quebrariam em runtime se ficassem apontando para uma coluna inexistente. A
invalidação ganha o outro lado do 1:1 que a fusão escondia: uma sugestão pendente cujo ATIVO
ganhou outra máquina por outro caminho ficava `PENDING` para sempre, e aceitá-la devolvia o
`P2002` cru em vez de um 409 com frase.

**O que NÃO se perde:** as máquinas já fundidas em bancos existentes **não são apagadas** —
apagar levaria junto a telemetria que o D103 preservava, por um caso que nenhum banco deste
projeto tem.

**O que a cascata ganhou com a simplificação:** o candidato entregue a um posto com outro
computador (ver [B](./posse.md#b--invariante-19-na-forma-final-um-ativo-por-posto-de-trabalho))
sai da lista **depois** de pontuar, como o ativo já ocupado — tirá-lo antes desligaria o D46
(evidência ambígua é evidência zero), porque a colisão é contada sobre a lista de candidatos.

---

## D — A telemetria e o comando vão para a ficha do ativo e a do posto

> **Superada em parte por [BN](./posse.md#bn--o-devolver-mora-só-na-ficha-do-que-foi-entregue):** a ficha do posto não devolve mais, e a devolução presa ao posto sai da API.
>
> **Superada em parte por [DB](#db--a-telemetria-é-cpu-memória-e-discos):** a rede e os processos saem do painel.

**Decidido:** a tela de frota (`/`) sai — `/` redireciona para `/ativos` e o item Telemetria
deixa o menu. `GET /api/endpoints/:id` nasce: a telemetria passa a ser consultada por máquina,
não pela frota inteira a cada ciclo. `POST /api/endpoints/:hwid/command` vira
`POST /api/endpoints/:id/command`, com o use-case resolvendo o `hwid` por dentro — a identidade
de hardware sai da URL. `TelemetriaDaMaquina` é o painel compartilhado (medidas, processos, rede,
discos, HWID com copiar, os três comandos), usado na aba Máquina do ativo e na ficha do posto.
**Supera:** [D115](#d115--a-rota-da-aba-chama-machine-e-devolve-o-que-a-aba-mostra), que falava
da rota da aba de telemetria do jeito antigo.

**Por quê:** a telemetria sempre foi pergunta sobre UMA máquina — "como está o computador desta
mesa", "o que está instalado neste notebook" — e uma tela separada que lista a frota inteira
obriga quem pergunta isso a sair da ficha do ativo, achar a linha certa e voltar. Consolidá-la
na ficha é a mesma régua de C (o ativo entregue a um posto se olha em `/postos`, não em
`/ativos`): a pergunta tem um lugar, e esse lugar não é uma tela à parte.

**O que isso corrigiu, e não era sobre telemetria:** "máquina não existe" e "agente
desconectado" eram o mesmo 404; passam a ser 404 e 409 — o segundo dizendo qual máquina não
respondeu. `telemetries` ganha índice `(endpointId, timestamp DESC)`, sem o qual cada ciclo de
cada tela aberta varria a tabela inteira. O comando por `sendToAgent` passou a conferir o
`readyState` do socket e esperar o callback do `send` — ele devolvia sucesso só por achar o
socket no mapa, e entre a queda da conexão e o `close` do servidor havia um "Comando enviado" sem
nada ter saído; agora são três respostas (entregue, desconectado 409, escrita que falhou 502). A
devolução pela ficha do posto passou a aceitar `targetLocationId` e só fechar a posse se ela
apontar para aquela localização — sem isso, uma ficha velha aberta fechava a posse de quem
recebeu o ativo entre o carregar da tela e o clique.

---

## E — `/descobertas` ganha vínculo manual e "Reconciliar agora"

> **Superada em parte por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** o Procurar agora e a rota `POST /api/reconciliation/run` saem; o vínculo à mão e o vincular e entregar ficam, em `/agentes`.

> **Superada em parte por [BF](./plataforma.md#bf--a-resposta-a-um-clique-vai-para-o-cartão-do-canto-inferior-direito):** o placar da rodada vai para o cartão, como toda resposta a um clique.

**Decidido:** `/descobertas` passa a mostrar as máquinas **sem vínculo** e as **vinculadas**
(`?vinculo=`, que já filtrava sem a tela usar), com vínculo manual inline — escolher
um ativo sem máquina e, opcional, um posto — e `POST /api/endpoints/:id/link-and-checkout`, que
encadeia vínculo e entrega em sequência. `POST /api/reconciliation/run` (ADMIN) roda a mesma
varredura do job sob demanda, sem esperar a janela da hora, com um botão na tela e o placar da
última rodada ao lado.

**Por quê o vínculo manual:** a cascata automática nem sempre acerta — hostname ambíguo,
máquina que chegou antes do cadastro do ativo — e até esta decisão a única saída para esses
casos era aceitar uma sugestão de baixa confiança ou esperar. Oferecer o vínculo à mão, na
mesma tela que já lista as máquinas sem vínculo, fecha o caso sem precisar de uma sugestão para
aceitar.

**Por quê "vincular e entregar" não é atômico, por decisão:** vincular primeiro, entregar depois,
em sequência — não numa transação só. Quando a entrega falha (por exemplo, o posto já tem um
ativo — [B](./posse.md#b--invariante-19-na-forma-final-um-ativo-por-posto-de-trabalho)), o
vínculo **fica** e a resposta diz isso. Desfazer o vínculo também seria uma escolha válida, mas
esconderia que o vínculo é informação verdadeira e estável (qual máquina é qual ativo) enquanto a
entrega é operação de posse, que pode ser repetida depois sem custo. Desfazer o que já é
verdade para tentar de novo uma operação independente teria o único efeito de obrigar a
descoberta a propor a mesma máquina outra vez.

**Por quê "Reconciliar agora" é serializado:** uma segunda chamada com outra rodada em
andamento responde 409 — o job de hora em hora passa pelo mesmo guarda. Rodar a varredura duas
vezes ao mesmo tempo não dá resultado errado, mas dá trabalho em dobro sobre a mesma frota sem
nenhum ganho, e a segunda rodada terminando depois da primeira poderia reabrir sugestões que a
primeira já tinha fechado.

---

## BY — A aba Máquina mostra o que o agente manda

> **Superada em parte por [CP](#cp--a-aba-máquina-mostra-o-sistema-o-processador-o-ip-e-o-mac):** o sistema operacional, o processador, o IP e o MAC voltam para a aba.
>
> **Superada em parte por [CY](#cy--o-servidor-lê-o-que-o-sentinelagente-manda-e-só-isso):** o chassi e o total de disco saem do handshake.
>
> **Superada em parte por [DA](#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai):** a comparação e a `AssetChange` saem; o servidor deixa de guardar a memória total.

**Decidido** (2026-11-07, comparando a aba Máquina do computador com o `HandshakePacket` do SentinelAgente):

- **Saem da aba as Especificações coletadas pelo agente e as Mudanças detectadas.** O handshake do agente real traz
  `hostname`, `osVersion`, `macAddress`, `localIp` e `cpuModel`. Fabricante, modelo, chassi, série da BIOS, UUID e os
  totais de memória e disco não vêm nele: quem manda esses campos é o agente falso do repositório.
- **`GET /api/assets/:id/machine` deixa de devolver `especificacoes` e `mudancas`.**
- **O título Como está agora passa para o `TelemetriaDaMaquina`,** para a ficha do computador e a do posto mostrarem o
  painel igual ([BX](./posse.md#bx--a-máquina-do-posto-tem-aba-própria)).
- **A coleta fica no servidor:** o handshake continua guardando os campos que chegarem, a cascata de matching continua
  lendo-os e a comparação continua gravando em `AssetChange`. A tabela fica sem leitor na tela até o agente ser revisto.

**Supera em parte:** [D115](#d115--a-rota-da-aba-chama-machine-e-devolve-o-que-a-aba-mostra) (as especificações e as
mudanças de hardware na rota da aba).

**Por quê:** o bloco prometia o que o agente real não coleta. Numa máquina de verdade, a maior parte da grade ficaria
em branco, e a lista de mudanças nunca falaria da troca de um pente de memória ou de um disco.

**O que fica de fora, declarado:** processador, sistema operacional, MAC e IP local o agente manda de verdade, e saem
junto com o bloco. Reavaliar quando o agente, Colaboradores e Computadores forem revistos.

---

## BZ — Vincular e desvincular moram em Descobertas

> **Superada em parte por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a tela se chama Agentes, e o vínculo mora na lista única dela.

> **Superada em parte por [DF](#df--a-máquina-tem-ficha-em-agentes):** a máquina tem ficha, e a linha da aba Máquina abre a ficha dela.

**Decidido** (2026-11-07, olhando o card Máquina vinculada na ficha do computador):

- **O vínculo tem uma tela só.** Descobertas vincula, em Sugestões e Sem vínculo, e desvincula, no `⋯` da lista
  Vinculadas, com a mesma pergunta sem vermelho. O botão Desvincular sai da ficha do computador, e nenhuma ficha mexe no
  vínculo. O cargo não muda: é `TECNICO`.
- **A aba Máquina é igual no computador e no posto:** o link, a telemetria e os comandos, tudo no
  `TelemetriaDaMaquina`. O card Máquina vinculada sai, com a data gravada no ativo.
- **O link segue o molde da ficha:** a `TabelaDaFicha`, com o nome da máquina e o último contato, e a linha inteira
  abre a máquina em Descobertas. Descobertas não tem ficha de máquina, então a linha abre a lista Vinculadas já
  buscada pelo nome (`/descobertas?aba=com&busca=`).
- **`GET /api/assets/:id/machine` diz só qual é a máquina:** `endpointId` e `hostname`. O resto o painel lê em
  `GET /api/endpoints/:id`, revalidando, e os dois carimbos de último contato saem.
- **A recusa do vínculo repetido aponta para Descobertas,** não mais para a aba Máquina.

**Supera em parte:** [D115](#d115--a-rota-da-aba-chama-machine-e-devolve-o-que-a-aba-mostra) (os dois carimbos de último
contato), [H](#h--a-fusão-de-máquinas-sai) (o 409 que aponta a aba Máquina) e
[BW](./catalogo-e-ativo.md#bw--a-linha-da-lixeira-abre-a-ficha-só-para-consulta) (o Desvincular que some na lixeira).

**Completa:** [BX](./posse.md#bx--a-máquina-do-posto-tem-aba-própria) e [BY](#by--a-aba-máquina-mostra-o-que-o-agente-manda).

**Por quê:** o mesmo vínculo tinha duas telas: nascia em Descobertas e se desfazia na ficha do computador. A aba Máquina
serve para olhar e comandar; quem decide se a máquina é aquele computador é Descobertas.

**O que fica de fora, declarado:** desvincular pede sair da ficha, e Descobertas não tem seta: volta-se pelo navegador. A
máquina de um computador na lixeira continua na lista Vinculadas e pode ser desvinculada, o que a rota sempre aceitou.

---

## CP — A aba Máquina mostra o sistema, o processador, o IP e o MAC

**Decisão.** Embaixo da máquina vinculada, a aba Máquina mostra o que o agente real manda no handshake: **Sistema
operacional**, **Processador**, **Endereço IP** e **Endereço MAC**, o IP e o MAC em fonte monoespaçada. O campo que a
máquina não mandou não aparece. É o mesmo `TelemetriaDaMaquina`, então vale para a ficha do computador e a do posto.

- **Só a tela muda:** `GET /api/endpoints/:id` já devolvia os quatro campos, e o handshake já os guardava.
- **O resto da identidade continua fora:** fabricante, modelo, chassi, série da BIOS, UUID e os totais de memória e
  disco, que o agente real não coleta (BY).

**Supera em parte:** [BY](#by--a-aba-máquina-mostra-o-que-o-agente-manda), que tirou os quatro junto com as
Especificações coletadas e deixou a volta para a revisão de Computadores.

**Por quê:** são as perguntas do atendimento: qual Windows está ali, em que IP a máquina responde para o acesso remoto,
qual MAC liberar na rede. O GLPI mostra o sistema, o processador, o MAC e o IP que o agente dele coleta na ficha do
computador, e o Snipe-IT, com as integrações de RMM, o MAC, o IP e o sistema.

**O custo:** quatro linhas no painel, acima das medidas.

**O que ficou de fora:** histórico de IP, mais de uma placa de rede e o que o agente não manda.

---

## CS — A máquina calada vira OFFLINE em 2 minutos

**Decisão.** Os tempos do servidor, tirados do Fleet e do Remotely, com o `Ping` que chega do agente
([agente.md](../referencia/agente.md)):

| | Valor | De onde |
|---|---|---|
| OFFLINE sem mensagem | **2 minutos**: o maior intervalo do `Ping` mais 60 s | Fleet: o intervalo de check-in mais `OnlineIntervalBuffer = 60` (`server/fleet/hosts.go`) |
| OFFLINE quando a conexão fecha | na hora (continua) | Remotely: `OnDisconnectedAsync` em `Server/Hubs/AgentHub.cs` |

- **Só o `STALE_AFTER_MS` muda aqui**, de 4 para 2 minutos (`mark-stale-endpoints-offline.usecase.ts`). O job
  continua a cada 60 s, então a máquina que caiu sem fechar a conexão aparece OFFLINE entre 2 e 3 minutos depois.

**Por quê:** os dois separam o sinal de vida, leve e frequente, da coleta pesada, que vai de vez em quando. Com a
telemetria de hora em hora, é o `Ping` que mantém a máquina ONLINE, e o limite segue a regra do Fleet: o intervalo
mais uma folga contra a rede lenta. Um limite maior não economiza nada, porque o job roda a cada 60 s de qualquer
jeito, e só deixaria o painel mostrar ONLINE uma máquina sem energia.

**O custo:** o número. Cada `Ping` é uma escrita de `lastSeen` (`touchEndpoint`), como toda mensagem do agente.

**O que ficou de fora.**
- **Um estado de "sumido"**, como o `overdue` de 30 minutos do Tactical RMM. Lá ele existe para mandar alerta por
  e-mail ou SMS, e aqui não há alerta de máquina. O sumido de longo prazo já é o fantasma do painel de cobertura
  (`ghostDays`, 30 dias), o mesmo papel do `missing` do Fleet.

---

## CT — O lixo de fábrica se reconhece sem separadores, e a lista cresce

> **Completa:** [D46](#d46--evidência-ambígua-é-evidência-zero) (as listas de seriais e UUIDs de fábrica).

**Decisão.** Em `normalize-identity.helper.ts`:

- **O serial de fábrica se confere sem `-`, `:` e espaço**, em minúsculas: a lista, o corte de 4 caracteres e o
  caractere repetido olham o valor compactado. `0000-0000`, `00 00 00 00` e `SystemSerialNumber` passam a ser lixo. O
  serial que serve continua voltando como veio, em minúsculas e com os separadores.
- **A lista de seriais ganha sete**, os que o Fleet (`IsPlaceholderHardwareSerial`, em `server/fleet/hosts.go`) e o
  GLPI Agent (`isInvalidBiosValue`, em `lib/GLPI/Agent/Tools/Generic.pm`) já reconhecem: `default`, `base board serial
  number`, `baseboard serial number`, `not available`, `not present`, `1234567890` e `1234567`.
- **A lista de UUIDs ganha quatro:** os dois que o osquery acrescenta (`kPlaceholderHardwareUUIDList`, em
  `osquery/core/system.cpp`) e os dois de fábrica da AMI na outra ordem de bytes. No SMBIOS anterior ao 2.6, o kernel
  imprime o `product_uuid` com os primeiros campos invertidos (`drivers/firmware/dmi_scan.c`, `dmi_save_uuid`), e o
  `03000200-0400-0500-0006-000700080009` da AMI aparece como `00020003-0004-0005-0006-000700080009`.

**Por quê:** com a limpeza olhando o valor com separadores, `0000-0000` passava: toda máquina com ele ganhava o
mesmo HWID e casava com o mesmo computador por 100 pontos. Nenhuma máquina tem ainda token do agente novo, então
esta é a hora de fechar a lista: depois, mudá-la muda o HWID de máquina cadastrada.

**O que ficou de fora.** A comparação do serial em si continua com os separadores: `ABC-123` e `ABC123` não casam.
Juntar os dois mudaria o vínculo de computador que já existe, e não há caso que peça.

---

## CV — A máquina reinstalada herda a própria linha, como no GLPI

> **Supera em parte:** [H](#h--a-fusão-de-máquinas-sai) (a premissa de que o `hwid` é estável entre reinstalações).

**Decisão.** O `hwid` passa a ser **o id da instalação do agente**, e não da máquina: a máquina formatada chega com
outro ([agente.md](../referencia/agente.md)). Quem diz que a máquina é a
mesma é o firmware do handshake. Quando chega um `hwid` que o servidor nunca viu, `herdarMaquinaReinstalada`
(`server/modules/endpoint/use-cases/adopt-reinstalled-endpoint.usecase.ts`) procura a máquina conhecida com as regras
de importação do GLPI, na mesma ordem (`RuleImportAsset.xml`):

1. serial e UUID iguais (a regra 11 de lá);
2. serial igual, e a linha antiga sem UUID (a 12);
3. os dois vieram e nada casou com os dois: máquina nova (a 13);
4. só o serial veio: serial igual (a 14).

Achando, a linha antiga ganha o `hwid` novo, o token da instalação velha é apagado, e a auditoria grava `REINSTALL`
com o `hwid` de antes e o de depois. O vínculo com o ativo, a telemetria e as sugestões continuam na mesma linha, e o
handshake segue como atualização: a mudança de hardware compara com o que a máquina tinha antes de formatar.

**Duas travas que o GLPI não tem**, porque lá o erro custa um inventário e aqui custa os comandos de outra máquina:
- **Um candidato só.** Dois endpoints com o mesmo serial são evidência zero
  ([D46](#d46--evidência-ambígua-é-evidência-zero)): a máquina entra como nova, e o log diz por quê.
- **O candidato desligado.** A máquina que continua ONLINE não foi reinstalada: o outro agente com o mesmo serial é
  um clone, ou um serial repetido que a lista de fábrica não conhece. A herança tomaria o lugar de uma máquina viva.

**Fica de fora, como no GLPI:**
- **O UUID sozinho** (a regra 15 de lá vem desligada): é o valor que a VM clonada e o firmware genérico repetem.
- **O nome**, que é renomeável e se repete; o D46 já lhe dava 60 pontos, e não o vínculo automático.
- **A troca de placa-mãe.** O serial e o UUID mudam juntos, e a máquina entra como nova; a antiga fica OFFLINE e vira
  fantasma no painel de cobertura. Nenhum dos sistemas olhados resolve isso sozinho (o Jamf e o Intune pedem que alguém
  apague o registro antigo).

**Por quê:** um `hwid` derivado do firmware não era imutável de verdade: ele muda com a placa-mãe, com o serial que a
BIOS passa a preencher e com cada revisão da regra, e cada mudança deixava duas
linhas para a mesma máquina sem ferramenta para juntá-las, porque a H tinha tirado a fusão. Os sistemas de inventário
olhados separam as duas perguntas. O agente do GLPI se identifica com um id sorteado e guardado em disco (`agentid`,
`deviceid`, em `lib/GLPI/Agent.pm`), e o servidor decide qual computador é pelas regras de importação, apontando o
agente novo para o computador antigo e apagando o agente velho (`MainAsset::rulepassed`). Fazendo o mesmo, o servidor
decide com o parque inteiro à vista, que é o que a lista de fábrica e os valores repetidos precisam, e a máquina sem
serial de produto deixa de não ter identidade.

**O que o fio não muda:** o campo continua `Hwid`, e o servidor nunca leu o que havia dentro dele.


---

## CW — Descobertas perde a triagem, os Ociosos e os números repetidos

> **Superada em parte por [DI](#di--agentes-fechada-e-com-agente-é-o-número-da-vista-com-computador):** Sem agente conta também o computador da máquina sumida.

> **Superada em parte por [DD](#dd--agentes-ganha-sumidos-e-o-excluir-e-o-excluir-revoga-o-agente):** os Sumidos contam as máquinas, e não os computadores.

> **Superada em parte por [DA](#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai):** a série, o fabricante e o modelo voltam para a aba Máquina, com as placas de vídeo.

> **Supera:** [D111](#d111--a-janela-da-agregação-corta-na-meia-noite-não-em-há-n24-horas) (a agregação do uso diário)
> e [D118](#d118--a-configuração-da-descoberta-ganha-tela-e-a-allowlist-com-ela) (em parte: o `shadowHours`);
> [BU](./plataforma.md#bu--o-nome-é-status-em-toda-tela-e-o-valor-vai-no-masculino) (em parte: o Conhecido e o Não autorizado).

**Decisão** (2026-11-15, olhando a tela contra o que o SentinelAgente manda):

- **A triagem sai.** Saem os itens "Marcar como conhecida" e "Marcar como não autorizada", a coluna Status de Sem
  vínculo, o card Shadow IT, o campo `shadowHours`, a coluna `endpoints.reviewState` com o enum `ReviewState` e a
  rota `PATCH /api/endpoints/:id/review`.
- **A aba Ociosos sai**, com a rota `GET /api/reconciliation/idle`, a agregação `agregarUsoDosAtivos` e a tabela
  `asset_usage_daily`. O expurgo da telemetria crua continua, uma vez por dia.
- **O painel de cima fica com três números:** Com agente (de N cadastrados), Sem agente e Sumidos. Saem Nunca vistos
  e Sem vínculo, e `GET /api/reconciliation/coverage` devolve `cadastrados`, `comAgente`, `semAgente` e `sumidos`.
- **A coluna Pontos sai de Sugestões.** A pontuação continua no servidor, que é quem a usa.

**Por quê:**
- **A triagem pressupunha a máquina estranha na rede.** Desde a [CR](./acesso.md#cr--cada-máquina-tem-o-seu-token-e-o-segredo-único-só-cadastra),
  só tem agente a máquina em que a TI pôs o segredo de instalação. A que aparece em Sem vínculo é um computador que
  falta cadastrar, e "Não autorizado" não bloqueava nada, só pintava o ponto de vermelho. A máquina que não é da
  empresa sai revogando o token (`bun run agente:revogar`). Nem o GLPI nem o Snipe-IT triam máquina com agente. O
  "não gerenciado" do GLPI é o que a varredura de rede acha sem agente.
- **Ociosos repetia os Sumidos com outro nome.** O uso era contado pela telemetria que chega, uma amostra por hora
  e sem o usuário logado. "Ocioso" virava "não ligou em 30 dias", que é o Sumidos com o mesmo prazo, e o
  "Último uso" mostrava a última leitura, não o último uso.
- **Os números repetidos:** Sem vínculo é a contagem da aba logo embaixo, e Nunca vistos dá quase sempre o mesmo que
  Sem agente, porque o computador que nenhum agente viu é o que não tem máquina.

**O que ficou de fora.**
- **A aba Máquina** continua mostrando o que a [CP](#cp--a-aba-máquina-mostra-o-sistema-o-processador-o-ip-e-o-mac)
  escolheu. A série, o UUID, o fabricante, o modelo e a memória também chegam, mas mostrá-los é regra nova
  em Computadores, que está fechada.
- **Uso de verdade** (horas com alguém na máquina) pede o usuário logado ou a atividade de teclado, que o agente não
  manda.

---

## CX — Os nomes de Descobertas

> **Superada em parte por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a tela se chama Agentes, e o Procurar agora saiu.

**Decisão.** Os textos da tela passam para o vocabulário do sistema:

| Antes | Depois |
|---|---|
| Online / Offline (Vinculadas e aba Máquina) | **Conectado / Desconectado** |
| Reconciliar agora, Varrendo… | **Procurar agora**, Procurando… |
| Fantasmas, "Dias para virar fantasma" | **Sumidos**, "Dias sem contato" |
| Série da BIOS (coluna de Sem vínculo) | a série **sem rótulo, embaixo do nome da máquina** ([CI](./plataforma.md#ci--a-série-vai-embaixo-da-etiqueta-em-toda-tela)) |
| Série da BIOS, UUID do sistema (sinal da sugestão, painel Vincular) | **Série**, **UUID** |

**Por quê:** nenhuma frase em inglês chega a quem usa, e o Status vai no masculino ([BU](./plataforma.md#bu--o-nome-é-status-em-toda-tela-e-o-valor-vai-no-masculino)).
"Reconciliar" é o nome do processo, que a tela já tinha evitado no título. "Fantasma" é gíria de ferramenta, não
Status. E o `BiosSerial` pode vir do serial da placa, então "da BIOS" deixou de ser verdade.

**O que não muda:** os valores da API (`ONLINE`, `OFFLINE`), as rotas e o `ghostDays`.

---

## CY — O servidor lê o que o SentinelAgente manda, e só isso

> **Superada em parte por [DB](#db--a-telemetria-é-cpu-memória-e-discos):** a telemetria não traz rede, e o teste do campo ignorado sai.
>
> **Supera em parte:** [D99](#d99--o-teste-do-agente-entra-por-websocket-de-verdade) (os sinônimos PascalCase/camelCase),
> [A](#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional) (o `loggedOnUser` no tipo e no parser),
> [G](./licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples) (o `installedSoftware` no tipo e no parser),
> [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai) (o protocolo que ficou a conferir) e
> [BY](#by--a-aba-máquina-mostra-o-que-o-agente-manda) (o chassi e o total de disco que o handshake guardava).

**Decisão** (2026-11-15, conferindo o `HandshakePayload` e o `TelemetryPayload` do SentinelAgente):

- **Saem as colunas `endpoints.chassisType` e `endpoints.diskTotalBytes`,** com o lugar delas no handshake, na
  comparação de hardware (`AssetChange`) e na resposta de `/api/endpoints`.
- **O parser lê só PascalCase e só os nomes do SentinelAgente.** Saem o envelope em minúsculas (`type`, `payload`), a
  leitura em camelCase e os nomes antigos `serialNumber`, `uuid`, `model`, `chassis`, `totalPhysicalMemory`, `userName`,
  `cpuUsage`, `ramTotal`, `ramUsed` e `diskUsageBytes`.
- **A aba Máquina lê a telemetria do mesmo jeito** (`src/helpers/metrics.helper.ts`): só PascalCase, as listas como
  lista e a rede pelos bytes. Saem o texto JSON no lugar do objeto, o mapa de discos por nome e o `TotalRxGb`/`TotalTxGb`,
  que o `NetworkPayload` não tem. Nada muda na tela.
- **`installedSoftware` e `loggedOnUser` saem do tipo e do parser.** O campo que o servidor não lê é ignorado sem
  erro, como já era com o `Gpus`; o teste do handshake continua mandando `InstalledSoftware` e `Gpus` para provar isso.

**Por quê:**
- **O SentinelAgente não manda `ChassisType` nem `DiskTotalBytes`**, e nenhuma tela mostrava os dois.
- **O agente que mandava camelCase e os nomes antigos não conecta mais:** desde a
  [CR](./acesso.md#cr--cada-máquina-tem-o-seu-token-e-o-segredo-único-só-cadastra) o hub pede o token da máquina, que
  ele não tem. O "agente em campo" que o A, o G e o Q protegiam deixou de existir.
- **Ler e descartar é igual a não ler.** O `installedSoftware` e o `loggedOnUser` entravam no `HandshakeData` e
  ninguém os lia depois.

---

## CZ — A fila de sugestões perde o `kind`, e a resposta, o que a tela não lê

> **Superada por [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha):** a fila sai inteira.

> **Supera em parte:** [D96](#d96--uma-tabela-de-sugestão-com-discriminante) (o discriminante).

**Decisão** (2026-11-15):

- **Saem a coluna `reconciliation_suggestions.kind` e o enum `SuggestionKind`.** O índice
  `sugestao_pendente_por_alvo` passa a ser só `endpointId` e `assetId`, e o `(state, kind)` vira `(state)`.
- **`GET /api/reconciliation/suggestions` e as respostas do aceite e da recusa** devolvem o `id`, o sinal, a
  evidência, a máquina (`id`, `hostname` e série) e o computador. Saem `kind`, `score`, `state`, `createdAt`,
  `resolvedAt`, `endpoint.hwid` e `endpoint.lastSeen`.
- **O `score` e o `state` ficam no banco:** a cascata decide o vínculo automático pelo `score`, e a recusa o grava na
  auditoria. **O `resolvedAt` também fica:** o expurgo das substituídas conta os 180 dias por ele.

**Por quê:** o `kind` só tinha `LINK` desde que a fusão (H) e a ocupação (A) saíram, e o D96 o guardava para um tipo
novo que não veio. Voltar a ter um custa uma coluna. Os campos da resposta, a tela não lia: a coluna Pontos saiu
na [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos), e a fila só lista as pendentes.

---

## DA — O que o agente manda vai para a aba Máquina, e o que ninguém lê sai

> **Superada em parte por [DJ](#dj--a-lista-de-agentes-mostra-o-ip-e-a-busca-o-acha):** `GET /api/endpoints` devolve também o IP.
>
> **Superada em parte por [DB](#db--a-telemetria-é-cpu-memória-e-discos):** a telemetria não traz processos, e o handshake não traz `RamTotalBytes` nem `InstalledSoftware`.
>
> **Supera:** [D116](#d116--a-assetchange-ganha-escritor-e-ele-mora-no-handshake);
> [BY](#by--a-aba-máquina-mostra-o-que-o-agente-manda) (em parte: a comparação que continuava gravando);
> [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos) (em parte: a série, o fabricante e o modelo fora da aba).

**Decisão** (2026-11-15, revendo Descobertas e a aba Máquina contra o SentinelAgente depois da CW, da CY e da CZ):

- **A aba Máquina mostra o que a máquina diz de si:** fabricante, modelo, série, sistema, processador, IP, MAC,
  as placas de vídeo e o HWID, num quadro só. As placas (`Gpus`) passam a ser guardadas em
  `endpoints.gpus`, a lista como veio, e aparecem com o nome e a memória. O UUID fica de fora da tela: só a
  reconciliação o usa.
- **Saem a tabela `asset_changes`, a comparação do handshake e a coluna `endpoints.ramTotalBytes`.** A memória total
  já vem na telemetria, no medidor de Memória. O agente continua mandando `RamTotalBytes` e `InstalledSoftware`, e o
  servidor os ignora sem erro.
- **O fabricante, o modelo e as placas que não vieram num handshake ficam como estavam,** como a série.
- **O expurgo guarda só a última amostra de telemetria de cada máquina**, uma vez por dia, em vez de 3 dias.
  Sai o índice em `telemetries.timestamp`, que só servia ao corte por data.
- **`GET /api/endpoints` devolve o que as listas leem** (`id`, `hostname`, `osVersion`, `biosSerial`, `status`,
  `lastSeen` e o computador), e **`GET /api/endpoints/:id`, o que a aba Máquina mostra.** O `Pid` dos processos sai
  da leitura.
- **As listas e a aba Máquina se releem a cada 30 s**, e não a cada 5.
- **A aba tem a linha da máquina e dois blocos embaixo:** o que a máquina é e como está, e os Comandos, por último.
  A hora da leitura só aparece quando é de um minuto ou mais antes do último contato.

**Por quê:**
- **O agente revisto manda o inventário de verdade**, e a CW deixou de mostrá-lo só porque
  Computadores estava fechada. No posto, a aba é o único lugar em que o fabricante e o modelo da máquina aparecem;
  no computador, eles se conferem com o cadastro. O GLPI mostra os mesmos campos, com as placas de vídeo.
- **A `AssetChange` não tinha leitor.** A BY tirou as mudanças da aba e deixou a tabela "sem leitor na tela até o
  agente ser revisto"; o agente foi revisto e ela continuou sem.
- **A série da telemetria não tinha leitor** desde que a agregação de uso saiu com os Ociosos (CW): as duas telas
  mostram só a última amostra.
- **A resposta das máquinas mandava a linha inteira**, e a tela lia metade. É o critério da CZ.
- **O que muda mais depressa é o último contato**, a cada Ping de 30 a
  60 s; a telemetria chega de hora em hora, e o Desconectado leva uns 3 minutos
  ([CS](#cs--a-máquina-calada-vira-offline-em-2-minutos)). Reler a cada 5 s trazia o mesmo dado.
- **A hora da leitura repetia o último contato** quando a leitura foi a última coisa que a máquina mandou, que é o
  caso da máquina desconectada.

**O que fica de fora, declarado:** o histórico de troca de peça, que o GLPI mostra no computador, e os programas
instalados, que pedem uma lista própria. Voltam só com a tela que os leia.

---

## DB — A telemetria é CPU, memória e discos

> **Supera em parte:** [D](#d--a-telemetria-e-o-comando-vão-para-a-ficha-do-ativo-e-a-do-posto) (a rede e os processos
> no painel), [CY](#cy--o-servidor-lê-o-que-o-sentinelagente-manda-e-só-isso) (a rede pelos bytes) e
> [DA](#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai) (o `Pid` dos processos e o
> `RamTotalBytes` e o `InstalledSoftware` do handshake).

**Decisão** (2026-11-15, conferindo de novo o que o SentinelAgente manda):

- **Saem as colunas `telemetries.network` e `telemetries.topProcesses`,** com a leitura de `Network` e `TopProcesses`
  no parser e na resposta de `GET /api/endpoints/:id`.
- **A aba Máquina perde os quadros Rede e "O que está consumindo memória".** Ficam os medidores de CPU, memória e
  disco, e o Armazenamento quando há mais de um disco.
- **A placa de vídeo perde o fabricante.** O `Gpus` traz só `Name` e `MemoryBytes`.
- **O `Gpus` e o `Disks` se montam item por item antes de gravar:** `{ Name, MemoryBytes }` e
  `{ Name, TotalGb, UsedGb }`. O item sem `Name` sai, e a lista para em 16 placas e 64 discos. Antes as duas iam para
  a coluna Json como vinham, com o que o agente antigo mandava e do tamanho que fosse.
- **A mensagem do agente tem teto de 1 MiB** (`maxPayload` do `/agent-hub`, era o padrão de 100 MiB do `ws`). A
  acima dele fecha a conexão com 1009 antes de ser lida.
- **Sai o teste do handshake com `RamTotalBytes` e `InstalledSoftware`,** que provava que o servidor ignora os dois.

**Por quê:** o SentinelAgente manda na telemetria só `CpuUsagePercentage`, `RamTotalBytes`, `RamUsedBytes` e `Disks`,
e o handshake não traz mais os programas instalados nem a RAM. Os dois quadros mostravam zero e "A leitura não trouxe
processos." em toda máquina, e o teste provava um caso que o agente não produz mais. É o critério da CY: o servidor lê o
que o agente manda, e só isso.

---

## DC — Descobertas vira Agentes, e a série liga a máquina sozinha

> **Superada em parte por [DI](#di--agentes-fechada-e-com-agente-é-o-número-da-vista-com-computador):** a coluna Computador da lista fica com o traço, e a dica e o aviso vão para a ficha.

> **Superada em parte por [DD](#dd--agentes-ganha-sumidos-e-o-excluir-e-o-excluir-revoga-o-agente):** Agentes ganha a vista Sumidos, e a máquina sem computador ganha o Excluir.

> **Supera:** [D51](#d51--auto-provisionamento-nasce-em-suggest) e [D112](#d112--discoverymode--off-desliga-a-descoberta)
> (o modo), [D96](#d96--uma-tabela-de-sugestão-com-discriminante), [D97](#d97--a-recusa-tem-memória-e-a-memória-tem-chave),
> [D107](#d107--o-aceite-age-e-depois-fecha-e-a-ordem-erra-para-o-lado-certo),
> [D109](#d109--o-hash-é-da-afirmação-não-da-evidência), [D110](#d110--a-fila-tem-três-portas-de-saída-e-a-terceira-é-o-mundo),
> [D120](#d120--proporsugestao-não-recebe-cliente-porque-abre-transação),
> [D121](#d121--casar-a-conta-busca-os-candidatos-não-o-cadastro-inteiro),
> [D122](#d122--assetsuggestions-e-não-o-nome-que-o-prisma-format-escreveu) e
> [CZ](#cz--a-fila-de-sugestões-perde-o-kind-e-a-resposta-o-que-a-tela-não-lê) (a fila);
> [D118](#d118--a-configuração-da-descoberta-ganha-tela-e-a-allowlist-com-ela) (o Configurar);
> [E](#e--descobertas-ganha-vínculo-manual-e-reconciliar-agora) (em parte: o Procurar agora);
> [D95](#d95--quem-carimba-o-ativo-é-o-job-não-o-handshake) (em parte: o job que reconcilia);
> [BZ](#bz--vincular-e-desvincular-moram-em-descobertas) e [CX](#cx--os-nomes-de-descobertas) (em parte: o nome da tela).

**Decisão** (2026-11-16, comparando a tela com o GLPI, o OCS, o Fleet, o iTop, o Snipe-IT, o ServiceNow, o Lansweeper,
o NinjaOne, o Freshservice, o Intune e o Jamf):

- **A série liga a máquina ao computador sozinha, na hora.** A máquina sem computador cuja série é igual à de **um**
  computador vivo (fora da lixeira e sem baixa) e sem máquina é ligada a ele no handshake. O computador salvo com
  série (cadastro, edição, restaurar da lixeira, reverter a baixa) procura a máquina que chegou antes dele. A
  auditoria grava o `LINK` como o sistema (`vinculo-automatico`), com o sinal `SERIAL`. É a regra 14 de importação do
  GLPI ("update by serial") contra o computador cadastrado.
- **Não liga:**
  - a série de fábrica e a série repetida em outra máquina ([D46](#d46--evidência-ambígua-é-evidência-zero), [CT](#ct--o-lixo-de-fábrica-se-reconhece-sem-separadores-e-a-lista-cresce));
  - a série de um computador baixado, ou de um que já tem outra máquina;
  - o UUID, que o computador não guarda: ele reconhece a máquina reinstalada ([CV](#cv--a-máquina-reinstalada-herda-a-própria-linha-como-no-glpi));
  - o nome, que é renomeável e se repete.
- **O Desvincular desliga o automático da máquina** (`endpoints.autoLinkOff`). Sem isso, o handshake seguinte a ligaria
  ao mesmo computador, e o vínculo errado não teria correção. O vínculo à mão o religa.
- **Saem a fila e o modo:** a tabela `reconciliation_suggestions`, os enums `SuggestionState`, `MatchSignal` e
  `DiscoveryMode`, as colunas `app_settings.discoveryMode` e `ghostDays`, as rotas de sugestão (`GET`, aceitar e
  recusar), `POST /api/reconciliation/run` e `GET`/`PUT /api/settings/discovery`. O job de hora em hora fica com o
  último contato do computador e o expurgo da telemetria.
- **Os Sumidos contam 30 dias fixos** (`DIAS_SEM_CONTATO`), e a cobertura devolve o prazo para a frase do painel.
- **A tela passa a se chamar Agentes** (`/agentes`, e `/descobertas` redireciona). É uma lista só, com as vistas
  **Com computador**, a primeira e o endereço limpo, porque é o estado normal, como Ativos em Computadores, e **Sem
  computador**, a exceção que a série não ligou. As colunas são Máquina, Computador, Sistema operacional, Último contato e Status, e
  no `⋯` o Vincular a um computador ou o Desvincular. Na máquina sem computador, a sublinha da coluna Computador diz
  por que a série não a ligou ("A série é a de ATV-00012, que já tem a máquina PC-X") ou qual computador ela parece ser
  ("Mesmo nome que ATV-00012"), e o Vincular abre com ele escolhido. `GET /api/endpoints` devolve `dica` e `aviso` com
  a mesma regra do vínculo automático, então a tela nunca contradiz o handshake.
- **Saem os botões Procurar agora e Configurar.**

**Por quê:**
- **Nenhum dos onze sistemas tem fila de sugestão para aprovar.** O casamento é por regra, decidido na chegada do
  inventário: se casa, atualiza; se não casa, cria ou recusa (`RuleImportAsset` e `MainAsset::rulepassed` do GLPI, o
  IRE do ServiceNow, o reconciliation engine do Lansweeper, o `action_on_zero` do iTop). A pessoa só entra no caso
  ambíguo, e a ação é desvincular ou fundir.
- **Sugestões e Sem vínculo listavam as mesmas máquinas.** Toda máquina com sugestão estava sem vínculo, e aceitar a
  sugestão dava o mesmo resultado que vincular à mão.
- **O Procurar agora só existia porque o vínculo esperava o job da hora.** Decidido no handshake, não há o que
  esperar.
- **O modo protegia o vínculo automático de uma regra de 100 pontos que incluía o UUID contra o `serial` do
  computador.** Sobrou a série única, a mesma regra que reconhece a reinstalação desde a CV, e o mercado não tem
  "vincular sozinho: ligado ou desligado". O `ghostDays` só explicava o número dos Sumidos, e o Fleet usa 30 dias
  fixos para o "missing".
- **O nome Agentes é o da lista de Agentes do GLPI,** que mostra cada instalação do agente com a coluna Item vazia
  quando não há computador. "Descobertas" vinha da fila, que saiu.

**O que fica de fora, declarado:**
- **Criar o computador sozinho**, que o GLPI faz quando nada casa: aqui o computador exige o modelo do catálogo e gasta
  uma etiqueta da sequência, o motivo da D51. A máquina fica em Sem computador.
- **A série da placa-mãe** que o agente manda quando a do produto vem de fábrica não bate com a da
  etiqueta digitada no cadastro: essa máquina se vincula à mão.
- **A troca de placa-mãe com a série regravada** entra como máquina nova, com o aviso de que o computador já tem a
  máquina antiga: desvincula-se a antiga e vincula-se a nova.
- **Dois computadores com a mesma série** não existem vivos (`assets_serial_unique_undeleted`), e a regra não liga se
  existirem.

---

## DD — Agentes ganha Sumidos e o Excluir, e o Excluir revoga o agente

> **Superada em parte por [DF](#df--a-máquina-tem-ficha-em-agentes):** o link para uma máquina abre a ficha dela, e o `?maquina=` sai.

> **Supera em parte:** [CR](./acesso.md#cr--cada-máquina-tem-o-seu-token-e-o-segredo-único-só-cadastra) (o
> `bun run agente:revogar` e a revogação pelo painel, deixada de fora); [DC](#dc--descobertas-vira-agentes-e-a-série-liga-a-máquina-sozinha)
> (as duas vistas); [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos) (os Sumidos contados nos
> computadores); [D95](#d95--quem-carimba-o-ativo-é-o-job-não-o-handshake) (o carimbo do último contato no computador).

**Decisão** (2026-11-16, comparando Agentes com o GLPI, o Fleet, o NinjaOne, o Lansweeper, o ServiceNow e o Intune):

- **Agentes tem três vistas, que não se sobrepõem:** Com computador, Sem computador e **Sumidos**, a máquina sem contato
  há mais de 30 dias, com computador ou sem. A sumida sai das outras duas, como o baixado sai de Ativos em Computadores.
  `GET /api/endpoints?vista=com|sem|sumidos` (era `?vinculo=com|sem`).
- **O cartão Sumidos do painel conta as máquinas da vista,** e não mais os computadores. Sai a coluna
  `assets.lastSeenByAgentAt`, com o índice e o carimbo de hora em hora, que só esse cartão lia.
- **`DELETE /api/endpoints/:id`, do Supervisor:** apaga a máquina (a telemetria vai junto) e a credencial do agente, e fecha
  a conexão aberta com 1008. A reconexão leva 401, e a máquina só volta reinstalando o agente com o segredo de instalação.
  O Handshake confere de novo a credencial, para a conexão aberta antes da exclusão não recriar a máquina. Na auditoria,
  `DELETE` do `Endpoint` com o nome e o HWID por escrito. Sem lixeira.
- **A máquina com computador não se exclui:** 409 "A máquina PC-X está vinculada a ATV-00012. Desvincule antes de
  excluir.", com o computador em link. O Excluir fica no `⋯` da máquina sem computador, em Sem computador e em Sumidos.
- **Sai o `bun run agente:revogar`.** Revogar é excluir a máquina.
- **O link para uma máquina leva o id** (`/agentes?maquina=<id>`), e Agentes abre a vista em que ela está, já buscada pelo
  nome. Quem monta o link (a aba Máquina, a recusa da baixa) não sabe se a máquina sumiu.

**Por quê:**
- **Todos os seis excluem a máquina pelo painel,** e o Fleet seleciona as Missing e as apaga. Sem isso, a máquina
  formatada ou descartada ficava para sempre na lista e no número dos Sumidos.
- **A CR deixou o botão de fora por custo, não por segurança:** "pede tela, cargo e rota". A tela agora existe. E o
  painel faz melhor que o comando, que rodava fora do servidor e não fechava a conexão aberta; e a auditoria leva o nome
  de quem excluiu, e não o usuário do terminal.
- **Excluir sem revogar não servia:** o agente vivo recriaria a máquina no próximo handshake, a queixa que aparece no
  fórum do Fleet.
- **Sumidos como vista, e não só um número:** o número dizia que havia máquina a conferir e não dizia qual.

**O que fica de fora, declarado:**
- **A limpeza automática dos sumidos** (a "host expiry" do Fleet, as "cleanup rules" do Intune): apagaria sozinha a
  máquina que só estava guardada numa gaveta. Com o Excluir à mão, a decisão fica com quem conhece o parque.

---

## DE — A lista de Agentes mostra a versão do agente

**Decisão** (2026-11-16, quando o handshake passou a trazer a versão do agente):

- **O handshake ganha `AgentVersion`,** gravado em `endpoints.agentVersion`. O handshake sem ele **apaga** a versão
  gravada, ao contrário da série: é um agente que não manda a versão, e a de antes mentiria.
- **A lista de Agentes tem a coluna Versão do agente,** e a busca a encontra. A aba Máquina mostra a versão junto do
  resto do que a máquina diz de si.

**Por quê:** depois de uma atualização do agente, a versão é o que diz quem ficou para trás; o GLPI, o Fleet e o
NinjaOne mostram a coluna.

**O que fica de fora, declarado:** marcar a versão velha com cor ou aviso. Com um pacote só, a coluna e a busca
bastam para achar quem não atualizou.

---

## DF — A máquina tem ficha em Agentes

**Decisão** (2026-11-16, pedida olhando a lista de Agentes, e comparada com o GLPI, o Fleet e o NinjaOne):

- **`/agentes/:id` é a ficha da máquina,** no molde das outras: o card com o Status (Conectado, Desconectado), o último
  contato, o computador e tudo o que a máquina diz de si, do fabricante ao HWID com o Copiar; e duas abas.
- **A aba Computador** é a tabela do computador do posto (`ComputadoresNaFicha`), sem as duas datas da entrega: a linha
  abre a ficha do computador. Sem computador, ela diz o que a lista diz na sublinha, a dica ou o aviso, com o Vincular.
- **A aba Máquina** é o `TelemetriaDaMaquina` sem a linha da máquina e sem o inventário, que estão no card: só como ela
  está agora e os comandos.
- **As ações ficam no card, como a linha da lista:** Vincular e, para o Supervisor, Excluir na máquina sem computador;
  Desvincular na com computador. Excluir volta para a lista.
- **A linha da lista abre a ficha nas três vistas.** A com computador abria o computador, e a sem computador não abria
  nada. A linha da aba Máquina do computador e do posto, e o link da recusa, abrem a ficha também, e o `?maquina=<id>`
  que procurava a vista certa sai.
- **`GET /api/endpoints/:id` traz o computador vinculado,** com o modelo, a categoria e o status, e a dica e o aviso da
  máquina sem computador, pela mesma conta da lista.

**Por quê:** a lista mostra cinco colunas, e o resto do que a máquina diz de si só aparecia na ficha do computador:
a máquina sem computador não tinha onde ser vista. O Fleet e o NinjaOne abrem a página do host pela linha, e o GLPI, a
do agente, com o item ligado a ela. Com a ficha, cada máquina tem um endereço, e o link não precisa mais adivinhar a
vista.

**O que fica de fora, declarado:** a aba Histórico. O vínculo e a exclusão já estão na auditoria e no histórico do
computador, e a máquina não tem outro evento que alguém consulte.


---

## DI — Agentes fechada, e Com agente é o número da vista Com computador

> **Supera em parte:** [CW](#cw--descobertas-perde-a-triagem-os-ociosos-e-os-números-repetidos) (o Sem agente só
> como o computador sem máquina).

**Decisão** (2026-11-17, na passada que fechou Agentes):

- **Com agente conta o computador com máquina que deu sinal nos últimos 30 dias,** o mesmo corte dos Sumidos. Passa
  a ser o número da vista Com computador. **Sem agente** é o resto dos cadastrados, sem máquina ou com ela sumida, e
  a frase do cartão diz isso: "cadastrados sem máquina, ou com ela sumida".
- **A recusa da invariante 12 diz "Desvincule a outra máquina antes, em Agentes."**, o verbo da baixa e do Excluir.
- **O Vincular se chama "Vincular a um computador"** no card da ficha, como no `⋯` da lista e na aba Computador, e o
  da aba espera a ação em andamento, como os outros dois.
- **O seletor do Vincular mostra a etiqueta do computador da dica** quando ele está além das 200 primeiras opções.
  Antes, o campo dizia "Vínculo atual", que a máquina sem computador não tem.
- **Na máquina sem computador, a coluna Computador fica com o traço,** e a busca da lista não acha a máquina pela
  etiqueta da dica. A frase "Mesma série que ATV-00012" e o aviso não cabiam na largura da etiqueta e saíam
  cortados; a lista de agentes do GLPI também mostra só o item ligado.
- **Qual computador a máquina parece ser, ou por que a série não a ligou, vai para um aviso na ficha,** entre o card
  e as abas, à vista em todas elas, como o aviso da baixa no computador (BR). Antes estava só no vazio da aba
  Computador, que fica com a frase e o Vincular.
- **A coluna fica "Computador" em Agentes,** e "Etiqueta" em Postos, o que a [DH](./plataforma.md#dh--a-coluna-aparece-quando-cabe)
  deixou de fora. Em Agentes a coluna é a ligação com outro registro, e as vistas se chamam Com computador e Sem
  computador.

**Por quê:** a máquina sumida não cobre o computador, como o "missing" do Fleet, que sai da contagem dos hosts vistos.
Com o corte, o cartão e a vista dizem o mesmo número, e Com agente mais Sem agente continuam somando os cadastrados.

**O que fica diferente, de propósito:** Sem agente conta computadores, e a vista Sem computador conta máquinas. As
frases dos cartões dizem o que cada um conta.

**A tela fecha:** a lista, a ficha, o vínculo, o Excluir e as vistas foram conferidos no código e nos testes, e
`tests/e2e/agentes.spec.ts` cobre pela tela o Vincular, o Vincular e entregar, os Sumidos e o link morto.

---

## DJ — A lista de Agentes mostra o IP, e a busca o acha

> **Supera em parte:** [DA](#da--o-que-o-agente-manda-vai-para-a-aba-máquina-e-o-que-ninguém-lê-sai) (o IP fora da
> resposta da lista).

**Decisão** (2026-11-17, pedida comparando Agentes com o GLPI, o Fleet, o NinjaOne, o Intune, o Lansweeper e o
ServiceNow):

- **`GET /api/endpoints` devolve o `localIp`,** e a lista ganha a coluna Endereço IP, que aparece em moldura larga,
  antes do Sistema operacional (DH). A coluna tem tipo próprio, `ip`, com a largura do IPv4 mais largo
  (`255.255.255.255`) em mono: o agente só manda IPv4, e o IP cortado no `…` não serve a quem busca por ele.
- **A busca da lista acha a máquina pelo IP.** A do servidor já achava; a da tela, que procura nas linhas que chegaram,
  não.

**Por quê:** o chamado que chega só com o IP não achava a máquina, que só mostrava o IP na ficha. O Fleet mostra o IP
na lista de hosts.

---

## DK — Atualizar agora: a máquina manda o inventário e a telemetria na hora

**Decisão** (2026-11-17, pedida comparando Agentes com o GLPI, o Fleet, o Intune e o Lansweeper):

- **O `⋯` da ficha da máquina e o da linha de Agentes ganham Atualizar agora.** O servidor manda o comando
  `REFRESH`, e o agente responde com o handshake e uma amostra de telemetria.
- **`POST /api/endpoints/:id/refresh` espera a resposta,** e não só o envio: volta quando o handshake e a telemetria
  que o pedido provocou estão gravados, ou com 504 depois de 15 s. A ficha relida já mostra o dado novo. Dois pedidos
  juntos para a mesma máquina esperam a mesma resposta, e só um sai.
- **O agente anterior à 0.2.0 é 409,** com a frase que manda atualizá-lo, e o pedido não sai: ele o recusaria no log, e
  a rota esperaria os 15 s à toa. A máquina desconectada é 409, como o comando.
- **É do Técnico,** porque só lê a máquina; os comandos de energia continuam do Supervisor (AV). A auditoria grava quem
  pediu, como `COMMAND` com o comando `REFRESH`.
- **O item fica no `⋯`, e não num botão do card:** com o Vincular, o card passava da largura do celular, e a ação
  secundária mora no `⋯` em toda ficha, como o Clonar do computador. A espera vai no cartão do canto ("Atualizando
  NB-01…"), que a resposta substitui.
- **Habilitado também na máquina desconectada,** como os comandos: o status da tela atrasa até uns 3 minutos, e quem
  responde é o servidor.

**Por quê:** a peça trocada e o IP novo só chegavam no próximo handshake ou no reenvio diário. O GLPI tem o
"Request inventory", o Fleet o "Refetch", o Intune o "Sync", e o Lansweeper reescaneia o ativo. Esperar a resposta é o
que o Fleet faz com o "Fetching…" da página do host: sem resposta, o painel não saberia se ela rodou.

**O que fica de fora, declarado:** atualizar várias máquinas de uma vez (O).

