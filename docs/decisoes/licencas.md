# Decisões das licenças

> O contrato de software e seus assentos materializados, com a chave de produto cifrada em repouso.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 142 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D39–D44, D90–D94.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D39 — Assento de licença **não** vai para um posto

**Decidido:** o alvo do assento é `User` **XOR** `Asset`. `Location` não é alvo.
**Descartado:** acrescentar `assignedLocationId` para o caso real do posto com desktop fixo.

**Por quê — três argumentos, o terceiro é o que fecha:**

1. **Licença é consumida por uma instalação.** O fornecedor licencia *por dispositivo* ou
   *por usuário nomeado*; não existe EULA que licencie um móvel. Quando o auditor da
   Microsoft pergunta onde o assento está, "na Mesa 1" não é uma resposta que conte.
2. **A F7 quebraria.** A conformidade alimentada pelo software instalado é o join
   `LicenseSeat → Asset → Endpoint → SoftwareInstallation`. Um assento apontando para uma
   `Location` não tem caminho até uma instalação: seria um buraco exatamente no relatório
   que justifica o módulo.
3. **O caso do posto compartilhado já tem resposta, e a resposta é mais honesta.** O
   desktop fixo da Mesa 1 é um `Asset`: o assento vai **para o ativo**, a `Assignment`
   daquele ativo aponta para a `Location`, e os responsáveis saem da Camada 2. A cadeia
   inteira já existe — acrescentar `LOCATION` criaria um **segundo caminho** para o mesmo
   fato, que é o que este projeto recusa desde o D16.
   E se a licença for *por usuário nomeado*, então Laura e Ana precisam de **dois**
   assentos, não de um pendurado na mesa. Um assento no posto **esconderia** duas pessoas
   atrás de um móvel — que é precisamente a exposição de conformidade que o módulo deveria
   estar apontando. O modelo está certo em fazer esse custo aparecer.

**O que se perde, declarado:** contar "quantos assentos estão na Sala 3" exige o salto pelo
ativo (`seat → asset → assignment → location`). É um join a mais num relatório, contra uma
coluna que tornaria o dado ambíguo.

---

## D40 — Assento materializado, ocupação em tabela própria

**Decidido:** `LicenseSeat` é a linha do assento (existe mesmo vazio) e
`LicenseSeatCheckout` é a ocupação, aberta/fechada como toda posse do projeto.
**Descartado:** `assignedUserId`/`assignedAssetId` mutáveis **no próprio assento**, com um
log ao lado — que é o que o Snipe-IT faz.

**Por quê:** as colunas mutáveis guardam só o *agora*; o "quem pegou, quem devolveu" viraria
responsabilidade do log, e log e colunas divergem sem nada detectar — o mesmo par de
fontes de verdade que o D17 tirou do `assignedToId`. Com a ocupação em linhas, o histórico
é o próprio dado e `UPDATE` nunca apaga fato nenhum.

**Por que então materializar o assento, se a ocupação já é linha?** Porque é preciso ter
**o que travar**. Sem a linha do assento, "pegue um livre" é uma conta sobre um contador e
duas requisições simultâneas chegam ao mesmo número (D34, um andar acima). A linha existe
para ser bloqueada.

---

## D41 — `FOR UPDATE SKIP LOCKED`, e o preço dele

**Decidido:** a escolha do assento livre é `$queryRaw` com `FOR UPDATE OF s SKIP LOCKED`,
**dentro** de `$transaction`. **Descartado:** `isolationLevel: 'Serializable'` no Prisma.

**Por quê não o Serializable:** ele resolve, mas exige laço de repetição para o erro 40001
em toda operação de checkout, e serializa mais do que o necessário. `SKIP LOCKED` faz duas
requisições simultâneas pegarem assentos **diferentes** sem nenhuma esperar.

**O preço, declarado:** sob contenção alta, `SKIP LOCKED` pode devolver "sem assento livre"
mesmo havendo um assento cuja transação concorrente vai cair no rollback um instante
depois — um 409 falso e raro. A alternativa (`FOR UPDATE` sem skip) troca isso por fila:
todo mundo espera o primeiro. Para entrega de licença, falhar rápido e mandar tentar de
novo é melhor do que enfileirar requisições HTTP.

---

## D42 — Chave cifrada numa coluna versionada, sem plano B em claro

> ⚠️ **Reconciliado — ver [`README.md`](README.md), D81.** O formato é `enc:v1:<kid>:<iv>:<tag>:<ct>`, com o identificador da chave e AAD amarrando o
> valor ao lugar onde ele mora — o mesmo da F9, num arquivo só (`core/crypto/cipher.ts`).

**Decidido:** AES-256-GCM, chave de 32 bytes em `APP_ENCRYPTION_KEY`, valor guardado como
`enc:v1:<kid>:<iv>:<tag>:<ct>` numa coluna só. **Descartado:** três colunas (`iv`, `tag`, `ct`) e
"se a chave não estiver configurada, grava em claro".

**Por quê uma coluna versionada:** três colunas precisariam de uma quarta no dia da rotação
de algoritmo — o prefixo já é essa quarta, e ele viaja junto com o dado.

**Por que sem plano B:** gravar em claro quando falta configuração é como o `/agent-hub`
aberto que a F0 fechou — o sistema funciona, ninguém percebe, e o segredo está no banco. Se
`APP_ENCRYPTION_KEY` não existir, **o campo de chave é recusado com 422** e a licença é
criada sem chave. Em produção o boot para, exatamente como já para sem `AGENT_TOKEN`.

**A chave nunca entra em `audited`.** O diff do `ActivityLog` grava valor antigo e novo em
`changes`; um `productKey` na lista de campos auditados publicaria o segredo em claro numa
tabela que ninguém pensa em proteger. O campo também entra no `core/logger/sanitize.ts`.

**Duas coisas desta decisão mudaram na execução, e as duas estão no D91:** "uma chave em
`APP_ENCRYPTION_KEY`" virou **chaveiro** (o `kid` do formato só serve para alguma coisa
se existir mais de uma chave), e "o campo entra no `sanitize.ts`" era uma linha que **não
funcionaria** — o regex de lá não casa com `productKey`.

---

## D43 — `burnedAt` e `retiredAt` são fatos diferentes

> ⚠️ **A aritmética desta decisão está ERRADA e foi corrigida pelo D92.** A fórmula
> continua escrita abaixo, tachada, porque apagá-la esconderia o erro que ela causa — e
> ele é o tipo de erro que volta: subtrair o aposentado de um total do qual ele já saiu.
> O **modelo** do D43 (duas colunas, dois fatos) continua valendo inteiro.

**Decidido:** duas colunas nuláveis. `burnedAt` = devolvido numa licença
`reassignable = false`, e o assento **não volta** ao contrato; `retiredAt` = o contrato
encolheu e este assento não existe mais.

**Por quê não uma coluna só com motivo:** queima é **perda de dinheiro** ("compramos 50,
temos 43 utilizáveis") e aposentadoria é **mudança de contrato** — relatórios diferentes.
Empacotadas num enum, a primeira consulta que quiser só uma delas volta a separar por
string. ~~`livres = seatsTotal − ocupados − queimados − aposentados`~~, sempre calculado
— **a subtração está errada, ver D92**: `livres` sai das LINHAS, e `aposentados` é número
exibido, nunca subtraído.

---

## D44 — Status da licença é derivado, nunca coluna

**Decidido:** `ATIVA / VENCENDO / EXPIRADA / ENCERRADA` sai de um helper puro sobre
`terminationDate`, `expirationDate` e a data de hoje.

**Por quê:** o status muda **pela passagem do tempo**, sem ninguém escrever nada. Coluna
exigiria um job diário para continuar verdadeira, e no dia em que o job falhasse o
inventário mentiria sem sintoma. É o D16 aplicado ao tempo em vez de à posse.

---

## D90 — Quem reconcilia trava tudo; quem entrega trava um assento

**Decidido:** `reconcile-seats` trava a linha da licença **e todos os assentos dela**
(`FOR UPDATE`, sem `SKIP LOCKED`, `ORDER BY "seatNumber"`) antes de contar.
`checkout-seat` continua travando **um** assento, com `SKIP LOCKED`.
**Descartado:** reconciliar "dentro de uma transação", como a Etapa E dizia, sem
dizer o que se trava.

**Por quê:** transação não é trava. Encolher de 5 para 3 lê "2 livres", marca os dois
`retiredAt`, e uma entrega simultânea — que trava **o assento**, não a licença — leva um
deles no meio. O resultado é um assento ocupado e aposentado ao mesmo tempo: some da
conta de livres, some da conta de comprados, e continua na mão de alguém. Em READ
COMMITTED nada acusa, e é o mesmo tipo de falha muda do D34.

**Por que assimétrico:** entregar é o caminho quente e reconciliar é edição de contrato,
que acontece quando chega nota fiscal. Travar a licença inteira na entrega enfileiraria
todo checkout da mesma licença e jogaria fora o D41; travar nada na reconciliação
corrompe a conta. Cada um paga onde é barato.

**Sem deadlock, e o argumento é a ordem:** os dois tomam assentos em `seatNumber`
crescente, e ninguém segura assento esperando a licença — a licença é sempre a primeira.
Uma reconciliação que esbarra num assento em uso **espera** aquela entrega terminar e
recomeça a contagem já enxergando o resultado dela.

**O preço, declarado:** enquanto a reconciliação está de pé, todo checkout daquela
licença vê os assentos travados, o `SKIP LOCKED` pula todos e responde 409 "sem assento
livre". É o mesmo falso 409 do D41, na mesma moeda: falhar rápido em vez de enfileirar.

---

## D91 — Chaveiro, não chave: o `kid` vem da própria chave

**Decidido:** `APP_ENCRYPTION_KEY` é a chave **ativa** (32 bytes, hex ou base64) e
`APP_ENCRYPTION_KEYS_ANTIGAS` é a lista separada por vírgula das chaves que ainda
**decifram** e não cifram mais. O `kid` de cada uma é derivado dela —
`sha256(chave).hex.slice(0, 8)` — e nunca configurado à mão.
**Descartado:** `APP_ENCRYPTION_KEY_ID` ao lado de cada chave.

**Por quê:** o D81 exige o `kid` dentro do valor para que rotação seja gradual. Isso
implica chaveiro, e chaveiro implica identificar cada chave. Um `kid` **configurado**
pode ser digitado errado, repetido entre duas chaves ou trocado sem trocar a chave — e
qualquer um dos três produz o erro que a rotação existia para evitar, mais tarde e com
uma causa a mais para procurar. Derivado, o `kid` **não pode discordar** da chave: ele é
uma função dela.

**Por que só 8 caracteres:** ele identifica entre as duas ou três chaves configuradas,
não no universo. E ele fica gravado em toda linha cifrada — o valor inteiro do hash
custaria 56 bytes por linha para não responder nenhuma pergunta a mais.

**O canário, e o que ele derruba.** `AppSetting.cryptoCanary` guarda um texto conhecido
cifrado. No boot: coluna vazia → é gravada com a chave ativa; preenchida → é decifrada,
e o `kid` de dentro escolhe a chave no chaveiro. `kid` desconhecido ou tag que não
confere **para o boot** com a frase do que houve. Sem ele, trocar a chave é um sistema
que sobe perfeito e só falha semanas depois, na primeira tentativa de revelar — com um
500 no meio de uma tela e nenhuma pista.

**Sem plano B em claro** (D42, mantido): sem chave configurada, o campo `productKey` é
recusado com **422** e a licença é criada sem chave. Em produção o boot para, como já
para sem `AGENT_TOKEN`.

**O id gerado pela aplicação é consequência disto, não capricho.** O AAD é
`"licenses:productKey:<id>"`, então o id tem que existir antes do INSERT: `License.id`
perde o `@default(uuid())` e `create-license` gera com `randomUUID()`. Uma linha, contra
uma chave que se pode copiar de uma licença para outra e o sistema revela como legítima.

---

## D92 — `livres` sai das linhas; `aposentados` não entra na subtração

**Decidido:** `livres = COUNT(assentos sem burnedAt, sem retiredAt, sem ocupação aberta)`,
e a invariante do contrato é `COUNT(retiredAt IS NULL) = seatsTotal`.
**Corrige** a fórmula do D43, que subtrai os aposentados de `seatsTotal`.

**Por quê:** a fórmula do D43 funciona enquanto ninguém encolhe o contrato e passa a
mentir no instante em que alguém encolhe. Contrato de 5 vira 3, dois assentos ganham
`retiredAt`, `seatsTotal = 3`: `livres = 3 − 0 − 0 − 2` dá **1**, e a resposta certa é
**3**. O aposentado já saiu de `seatsTotal` quando o contrato encolheu — subtraí-lo de
novo é contá-lo duas vezes.

**O que o D43 acerta, e continua valendo:** `burnedAt` e `retiredAt` são fatos
diferentes e precisam de colunas diferentes. Queima é perda de dinheiro ("compramos 50,
temos 43 utilizáveis"); aposentadoria é mudança de contrato. A correção é na aritmética,
não no modelo.

**Aposentado vira número exibido, não subtraído:** a tela mostra
`livres / seatsTotal`, com `queimados` e `aposentados` ao lado — o segundo explica por
que a tabela tem mais linhas que o contrato.

**E a aposentadoria só alcança assento livre**, o que mantém `burnedAt` e `retiredAt`
disjuntos na prática sem precisar de um CHECK para isso.

---

## D93 — Assento é posse, e a posse do projeto já tem três lugares

**Decidido:** assento de licença entra em `count-user-posse`, no `offboard` e no 409 do
`DELETE` de ativo, na Etapa G — antes das telas.
**Descartado:** tratar licença como módulo isolado, que é o que a Etapa C fazia
ao não mencionar nenhum dos três.

**Por quê:** a pergunta que decide se algo é posse não é "tem tabela própria?", é
*"alguém responde por isto quando a pessoa sai?"*. Assento responde sim — ele custa
dinheiro por mês e é nominal. A F5 já respondeu essa pergunta para o acessório e a
resposta mudou quatro arquivos fora do domínio dela; a F6 responde igual.

**O que aconteceria sem isto**, e é o motivo de a etapa vir antes das telas: o
desligamento fecharia tudo **menos** a licença, e o sintoma não é um erro — é um número
de assentos ocupados que nunca desce. A empresa compra assento novo porque "não tem
livre", e os livres estão com gente que saiu. É o D82 outra vez: o passo que não dá erro
quando falta é o que precisa estar escrito no mesmo lugar dos outros.

**A assimetria declarada:** assento de alvo `ASSET` **não** é fechado pelo desligamento.
Ele não é da pessoa.

---

## D94 — Anexo de licença sai da fase

**Decidido:** a F6 não entrega anexo de licença. O item continua no `../ROADMAP.md`, com
o pré-requisito escrito.
**Descartado:** "depende do upload que nasce na F2", como os pré-requisitos anotavam.

**Por quê:** o upload da F2 nasceu, e nasceu **de ativo**. `Attachment.assetId` é
`NOT NULL` com FK para `assets` e `onDelete: Cascade` — não há onde pendurar uma licença
sem tornar o dono polimórfico, o que significa migração, discriminante, CHECK e uma
decisão sobre o que acontece com o arquivo quando o dono some. Isso é do tamanho de uma
etapa inteira, e não é sobre licença: é sobre anexo.

**O que se perde, declarado:** a nota fiscal e o contrato da licença continuam fora do
sistema por mais uma fase. Contra isso, `orderNumber`, `purchaseDate` e `purchaseCost`
já entram na F6 — a *referência* ao documento existe, o arquivo é que não.
