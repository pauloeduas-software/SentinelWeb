# Decisões das licenças

> O contrato de software, a quantidade comprada e as entregas a colaborador ou computador.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D39–D44, D90–D94, G da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)), AA, AC, AD e AF.
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D39 — Assento de licença **não** vai para um posto

> **Superada em parte por [U](./acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos),
> [Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe) e [G](#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):**
> a decisão fica de pé com os nomes de hoje — o alvo é colaborador (`Person`) **XOR** ativo, e o
> posto é `Workstation`, que também não é alvo. O argumento 2 (o join até `SoftwareInstallation`)
> perdeu o objeto com G. Desde [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas) não há mais "assento": o alvo é da ENTREGA.

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

> **Superada por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** a vaga numerada saiu. A licença guarda a quantidade, e cada uso
> é uma linha em `license_checkouts`; o que se trava é a linha da licença.

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

> **Superada por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** sem vaga para escolher, não há o que pular. A entrega trava o
> alvo e a licença, conta e insere — e o falso 409 deste preço deixou de existir.

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

> **Superada por [D81](./plataforma.md#d81--um-arquivo-e-um-formato-de-cifra-para-os-dois-usos) (o formato) e, inteira, por
> [G](#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):** a
> chave de produto e a cifra saíram.

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

> **Superada por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** a licença não tem mais reatribuível nem queima —
> devolvida, ela volta a ficar livre —, e o aposentado saiu com a vaga numerada: reduzir a
> quantidade só muda o número.

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

> **Superada em parte por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** continua derivado; o "hoje" passou a ser o dia de
> Brasília, não a meia-noite UTC.

**Decidido:** `ATIVA / VENCENDO / EXPIRADA / ENCERRADA` sai de um helper puro sobre
`terminationDate`, `expirationDate` e a data de hoje.

**Por quê:** o status muda **pela passagem do tempo**, sem ninguém escrever nada. Coluna
exigiria um job diário para continuar verdadeira, e no dia em que o job falhasse o
inventário mentiria sem sintoma. É o D16 aplicado ao tempo em vez de à posse.

---

## D90 — Quem reconcilia trava tudo; quem entrega trava um assento

> **Superada por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** não há reconciliação. A edição, a entrega, o Encerrar e a
> exclusão travam a mesma linha — a da licença —, e a entrega ESPERA a edição em vez de receber o
> 409 que este preço declarava. Antes de AA, a entrega já tinha passado a travar a licença
> `FOR SHARE`, sem decisão registrada; AA é o registro.

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

> **Superada por [G](#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples):**
> a cifra saiu inteira, e o chaveiro com ela.

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

> **Superada por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** `livres` continua saindo das linhas, agora as de entrega:
> compradas − em uso − queimadas. `aposentados` saiu com a vaga numerada.

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

> **Superada em parte por [O](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai)
> e [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):** o `offboard` saiu com O; a regra fica — a licença aberta entra no 409 da
> desativação e da exclusão do colaborador (`count-person-posse`) e no da baixa e da exclusão do
> ativo, e a do ativo continua não sendo da pessoa. Com AA, o 409 escreve o nome de cada
> licença com um link para o detalhe dela — o único lugar que devolve.

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

**Decidido:** a F6 não entrega anexo de licença. O item continua no roadmap do projeto, com
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

> **Sem objeto desde o [segundo de-escopo](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai):** os anexos saíram
> inteiros (domínio `attachment`, `core/storage`), e com eles o upload de ativo que este item
> estenderia. O roadmap que guardava o pendente também foi apagado; não há item em aberto.

---

## G — Software instalado e conformidade de licença saem; licença vira cadastro simples

> **Superada em parte por [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas):**
> a chave de produto volta — a da licença e a de cada entrega —, em texto, sem a cifra que saiu
> aqui. O que a protege é só o detalhe devolvê-la e a tela mostrá-la escondida.

**Decidido:** saem `license-compliance`, `normalize-software`, `list-software-packages` e
`software-key.helper`; `SoftwarePackage`, `SoftwareInstallation` e `LicenseSoftware` saem do
schema, com os sete índices deles. `Endpoint` perde `installedSoftware` e os dois hashes de
software. A cifra da chave de produto sai inteira — `core/crypto`, `reveal-product-key`,
`License.productKey`, `AppSetting.cryptoCanary` — ver o
[segundo de-escopo](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai).
A tela de conformidade sai inteira; o modal da licença fica com a grade de assentos e o
histórico.
**Supera:** [D42](#d42--chave-cifrada-numa-coluna-versionada-sem-plano-b-em-claro) e
[D91](#d91--chaveiro-não-chave-o-kid-vem-da-própria-chave) (a cifra, que não tem mais onde
morar) e [D102](./reconciliacao.md#d102--licença--pacote-é-vínculo-explícito-nunca-casamento-por-nome)
(licença ↔ pacote — a ponte some com os dois lados dela).

**Por quê:** conformidade de licença respondia "o que está instalado bate com o que a empresa
comprou?", e essa pergunta precisa do catálogo de pacotes, da normalização de nome de software
e do hash do que o agente reporta — uma cadeia inteira que só serve a essa pergunta. O
[D143](./escopo.md#d143--o-escopo-é-itam--rmm-e-o-critério-de-corte-é-a-ponte) pede "serve ao
núcleo ou à ponte" — e a conformidade de licença **é** a ponte original do projeto, mas a
segunda rodada decidiu que o assento materializado (D40) e a reconciliação de contrato (D41, D90,
D92) já são a demonstração da convergência onde ela mais conta: dinheiro e assento nominal. A
conformidade por hash de instalação era uma segunda demonstração da mesma tese, pagando de novo
pelo que o estoque e a ocupação já provam.

**Por quê a cifra não sobrevive sem o produto que a usava:** o
[D145](./escopo.md#d145--campos-customizados-saem-inteiros) já tinha reduzido a cifra a um uso
só — a chave de produto da licença. Com a conformidade saindo,
revelar a chave de produto perde o cenário que a justificava (provar a instalação contra o que
foi comprado); o que sobra é a licença como contrato e assento, sem segredo para guardar.

**O que NÃO muda:** o domínio `license` em si — a ponte morava toda na reconciliação e na
cifra, nenhum deles é o domínio. Os assentos, a numeração, o `FOR UPDATE SKIP LOCKED` (D41) e a
fórmula de `livres` (D92) continuam exatamente como eram.

**O protocolo não muda:** `installedSoftware` e `softwareHash` continuam no tipo e no parser do
handshake, com a nota de que o servidor não guarda — mesma escolha do A para `loggedOnUser`.

> **Revisão:** só `installedSoftware` ficou no tipo e no parser (`agent-protocol.types.ts`,
> `normalize-payload.helper.ts`); `softwareHash` não existe no protocolo de hoje. O argumento não
> muda — o que o agente manda e o servidor ignora continua no fio, sem renegociar o contrato.

---

## AA — A licença vira quantidade e entregas: sem vaga numerada, sem lixeira, com Encerradas

> **Superada em parte por [AG](./estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão):**
> a licença que já foi entregue também se exclui, se nenhuma entrega está aberta — as devolvidas
> perdem a ligação e a chave, e guardam o nome por escrito, que até ali a entrega não guardava. Só
> a licença em uso recusa, e o 409 diz com quem. O Encerrar continua, para o contrato que se quer
> guardar.

> **Superada em parte por [AF](#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro):**
> a aba Encerradas sai — a encerrada fica na lista, esmaecida e marcada, e o filtro de status a
> separa —, e o Encerrar vira o botão do Desativar, com Reabrir na volta. A data continua mandando.

> **Superada em parte por [AD](#ad--renovar-é-editar-o-vencimento-o-suporte-a-oem-e-o-comprovante-não-viram-campo):**
> a renovação é a mesma licença, com o vencimento editado; o nome repetido é o contrato novo, que
> convive com o antigo encerrado.

> **Superada em parte por [AC](#ac--a-chave-vira-lista-cada-uma-cobre-uma-quantidade-e-a-entrega-escolhe-uma):**
> a chave da licença deixa de ser texto de várias linhas e a da entrega deixa de ser digitada —
> a licença tem uma lista de chaves, cada uma com quanto cobre, e a entrega escolhe uma. O índice
> `license_checkouts_chave_aberta_unica` sai.

> **Superada em parte por [AB](./acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco):** a licença
> deixa de ficar sem trilha. Cadastro, edição, entrega, troca de chave, devolução, encerramento e
> exclusão gravam na auditoria, com quem fez — a chave só como "informada", "alterada" ou
> "removida". O histórico da licença na tela continua só entregas e devoluções.

**Decidido** (na revisão da página de Licenças, de 2026-10-22 a 2026-10-24):

- **Sem vaga numerada.** `LicenseSeat` e `LicenseSeatCheckout` viram uma tabela só,
  `license_checkouts`: cada linha é uma entrega (colaborador **XOR** ativo, entrega, devolução).
  A licença guarda `seatsTotal`, a quantidade comprada, e `livres = seatsTotal − em uso`. Saem a
  reconciliação, a numeração MAX+1, o "aposentado" e o `SKIP LOCKED`. A entrega trava o alvo e
  depois a licença; a edição, o Encerrar e a exclusão travam a licença. Reduzir não passa do que
  está em uso (invariante 22).
- **Sem reatribuível nem queima.** O campo `reassignable` sai, e com ele toda a lógica de queima:
  a marca `burned` da entrega, a conta de queimadas, o "Devolver e queimar" e o desfazer queima.
  Devolvida, a licença volta a ficar livre.
- **Sem "com manutenção".** O campo `maintained` era só anotação; o que for preciso registrar
  sobre suporte vai nas notas.
- **A quantidade é ao menos 1.** Zero não é contrato: a licença que acabou se encerra.
- **O vencimento e o encerramento não antecedem a data da compra**, cada um conferido só com os
  dois lados preenchidos. O encerramento não é comparado com o vencimento. A aplicação responde 422
  com as duas datas; na edição, a data que não veio é a que está gravada.
- **A chave de produto volta**, em texto: a da licença (a de volume, ou a lista das compradas) e a
  de cada entrega, que não se repete entre as entregas abertas da licença (índice único parcial).
  Só o detalhe a devolve, e a tela a mostra escondida, com Mostrar e Copiar. Na entrega aberta,
  troca-se só a chave.
- **A recusa diz quais licenças voltam.** Desativar ou excluir o colaborador, dar baixa ou excluir
  o ativo com licença aberta: o 409 escreve os nomes e manda cada uma como `refs`, e a tela põe um
  link para o detalhe de cada licença — o Devolver só existe lá.
- **O alerta conta cada motivo**, com link para a aba e o filtro que mostram todas aquelas
  ("2 encerradas em uso · 5 vencidas · 3 vencendo"), e aparece só na tela de Licenças.
- **Sem trilha de auditoria.** Cadastro, edição, encerramento e exclusão da licença não gravam no
  `activity_logs`; o histórico da licença é só entregas e devoluções. É a regra do sistema inteiro
  (*"o único histórico que teremos é o de onde cada item passou e com quem"*), aplicada aqui
  primeiro.
- **A devolução é pela entrega**, não pela vaga: a tela velha não devolve mais quem recebeu depois.
  E mora **só no detalhe da licença**: a aba Licenças do ativo e a ficha do colaborador mostram o
  que está com cada um e levam até lá por link.
- **A entrega e a devolução têm dia.** Vêm com hoje e podem voltar para registrar o que já
  aconteceu; futuro é recusado, e a devolução nunca fica antes da entrega. O dia passado é gravado
  ao meio-dia de Brasília, e as telas mostram só o dia.
- **A entrega no passado não se sobrepõe.** O dia não antecede a data da compra, nem o dia em que
  o mesmo alvo devolveu esta licença — o histórico o mostraria com ela duas vezes no mesmo
  período. As duas recusas são 422; no próprio dia da devolução passa. **A quantidade no passado
  não é conferida**: quantas estavam em uso naquele dia fica de fora, e a conta de livres é
  sempre a de agora.
- **O valor da compra tem máscara na tela** (`R$ 1.234,56`, enviado como `1234.56`). O servidor
  continua sem ponto de milhar, e a recusa diz o campo: `valor de compra: use um valor como
  1234.50`.
- **O mesmo alvo não recebe a mesma licença duas vezes** enquanto a primeira está aberta
  (invariante 23, índices únicos parciais). O caso real que pediria duas — servidor licenciado por
  núcleo — não é deste inventário; se vier, é um campo de quantidade na entrega.
- **Sem lixeira.** A licença que acabou se **encerra** (botão Encerrar, que grava hoje em
  `terminationDate`; limpar a data reabre) e vai para a aba **Encerradas** — **mesmo com alguém
  usando**: a tela pergunta com a contagem, e a licença fica no alerta "encerrada, ainda em uso"
  até tudo voltar. É o padrão do sistema para o que tem data (a vencida também só alerta) e para o
  que se desativa (não recebe nada novo, o que está fica); recusar não impediria nada, porque a
  data futura do formulário chega sozinha. Só a licença que **nunca foi entregue** se **exclui de
  vez** — a que já foi tem o histórico de quem a usou, e se encerra. Por isso toda entrega aponta
  para a licença (`licenseId` obrigatório, FK `Restrict`), sem nome guardado por escrito. Sem
  restaurar. O nome deixa de ser único: a renovação convive com o contrato encerrado.
- **Histórico separado por alvo.** A entrega ao computador aparece no histórico do computador, e
  não no da pessoa que responde por ele; a entrega à pessoa aparece no dela. A licença lê o seu da
  tabela de entregas, com o nome de quem recebeu e a observação.
- **Sem alerta de mínimo** — no sistema inteiro, e ele só existia aqui (`minSeats`). Fica o alerta
  de prazo, numa lista só: encerrada ainda em uso, vencida (até ser renovada ou encerrada) e
  vencendo em 30 dias, nessa ordem.
- **O "hoje" do status é o dia de Brasília** (`hojeNoBrasil`). Com a meia-noite UTC, a licença que
  vence hoje virava vencida às 21h.
- **A tela mostra contagem e lista** ("10 compradas · 7 em uso · 3 livres"), sem
  grade nem "#3 de 10", e sem cor por status.

**Supera:** [D40](#d40--assento-materializado-ocupação-em-tabela-própria),
[D41](#d41--for-update-skip-locked-e-o-preço-dele),
[D43](#d43--burnedat-e-retiredat-são-fatos-diferentes) (a queima e o aposentado),
[D90](#d90--quem-reconcilia-trava-tudo-quem-entrega-trava-um-assento),
[D92](#d92--livres-sai-das-linhas-aposentados-não-entra-na-subtração), em parte
[D44](#d44--status-da-licença-é-derivado-nunca-coluna) (o "hoje"), em parte
[G](#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples) (a chave de
produto volta, sem a cifra), em parte [Q](./escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)
(o erro ganha `refs`, que a tela lê), e a lixeira da licença da F6 (`deletedAt`,
`licenses_name_unico_ativo`, a rota de restaurar).
**Mantém:** [D39](#d39--assento-de-licença-não-vai-para-um-posto) (o alvo),
D44 (o status derivado), [D93](#d93--assento-é-posse-e-a-posse-do-projeto-já-tem-três-lugares)
(a licença aberta é posse) e a regra do encerramento: chegado o dia marcado, a licença está
encerrada; o vencimento no próprio dia ainda vale.

**Por quê:** a auditoria da página achou o modelo maior do que a tela. A vaga numerada só servia
para travar e para desenhar a grade, e o usuário pediu contagem e lista; com ela foram a
reconciliação e boa parte dos defeitos achados — a devolução pela vaga, o "#7 de 5", o falso 409, o
teste de corrida que não corria. A lixeira não se pagava: a licença que acabou tem lugar
(Encerradas), e a cadastrada errado não tem passado próprio que valha guardar — o passado que
importa é o do computador e o da pessoa, e esse fica com o nome por escrito. O alerta de mínimo
não tinha uso no ambiente do usuário. Na revisão item a item, o usuário tirou o reatribuível com a
queima e a manutenção, pôs o piso de 1 na quantidade e a ordem das datas com a compra. Na
revisão linha a linha que veio depois, recusou a entrega no passado que se sobrepõe à do mesmo
alvo, deixou de fora a conta da quantidade no passado e tirou o ponto de milhar do servidor —
quem resolve é a máscara do campo.

**O que a migração faz:** zero licenças no banco de desenvolvimento, então é só DDL — as duas
tabelas de assento saem, `license_checkouts` entra com `licenseId` obrigatório, a chave, dois
CHECKs (alvo XOR, devolução não antecede a entrega) e três índices parciais (uma aberta por pessoa,
uma por ativo, a chave aberta única), e `licenses` perde `minSeats`, `deletedAt`, `reassignable`,
`maintained` e o índice de nome único, e ganha a chave e três CHECKs: a quantidade de ao menos 1
(`licenses_seats_positivo`, no lugar do `licenses_seats_nao_negativo`) e o vencimento e o
encerramento que não antecedem a compra.

---

## AC — A chave vira lista: cada uma cobre uma quantidade, e a entrega escolhe uma

**Decidido** (2026-10-26, na conversa sobre o que falta para a licença ficar completa):

- **A chave de produto vira uma lista**, `license_keys`: uma linha por chave, cada uma com
  quantas licenças cobre (`seats`) — 1 na chave individual, mais na de volume. O formulário tem
  "Adicionar chave", uma embaixo da outra, e colar uma lista com várias linhas cria uma chave por
  linha. Sai `License.productKey`, o texto de várias linhas.
- **As chaves somam no máximo o que foi comprado**: 422 no formulário, e 409 ao reduzir a
  quantidade abaixo do que elas cobrem. A mesma chave não aparece duas vezes na licença.
- **A entrega escolhe uma das chaves**, pelo id (`licenseKeyId`), em vez de digitar: é o que diz
  qual chave está com cada pessoa ou computador. Sai `LicenseCheckout.productKey`.
  - Com chaves cadastradas, escolher é **obrigatório** (422).
  - A chave não vai para mais entregas abertas do que cobre (409).
  - Se todas as chaves estão tomadas e ainda há licença livre, a recusa manda cadastrar a chave
    da próxima (409).
  - A conta da quantidade vem antes: sem licença livre, a frase é a de sempre.
  - A licença **sem chave nenhuma** — a assinatura por conta, como o Microsoft 365 — entrega sem
    chave.
- **A chave da entrega é da própria licença no banco**: a FK composta (`licenseKeyId`,
  `licenseId`) → `license_keys(id, licenseId)` recusa a chave de outra licença até pelo `psql`.
  O índice `license_checkouts_chave_aberta_unica` sai: a chave de volume vai, de propósito, para
  várias entregas abertas, e quem conta quantas é a aplicação, com a licença travada
  (invariante 24).
- **Trocar a chave da entrega aberta é escolher outra da lista** (`PATCH` com `licenseKeyId`), e
  "limpar" não existe. É também como a entrega feita antes de a licença ter chaves ganha a sua.
- **A edição recebe a lista inteira como ficará.**
  - A chave com `id` pode mudar o texto (a correção de digitação, que vale para as entregas
    dela) e o "cobre", que nunca fica abaixo das entregas abertas com ela.
  - A chave sem `id` entra.
  - A que ficou fora da lista sai, e só se nunca foi entregue, como a licença.
  - Sem a lista no corpo, as chaves ficam como estão.
- **A auditoria nunca guarda o texto.** No cadastro e na edição, conta as chaves
  (`chaves: { incluidas, alteradas, removidas }`). Na entrega e na troca, guarda qual chave, pelo
  `licenseKeyId`.
- **A tela numera as chaves**, com a mesma posição no detalhe, no "Com quem está" e na entrega, e
  as mostra escondidas, com Mostrar e Copiar, como antes.

**Supera em parte:** [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)
(a chave da licença em texto de várias linhas, e a da entrega digitada, única entre as abertas) e
[AB](./acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco) (a marca "informada", "alterada" ou
"removida" da chave na auditoria).

**Por quê:** com o campo livre, a chave da entrega era um texto qualquer — nada garantia que fosse
uma das compradas. E a mesma chave de volume, entregue a dez pessoas, colidia no índice que proibia
repetir. A lista resolve as duas coisas: cada entrega aponta para uma chave comprada, e a de volume
diz para quantas serve.

**Por que "Adicionar chave", e não um campo para cada licença comprada:** uma assinatura de 300
licenças, que não tem chave, abriria 300 campos vazios, e a chave de volume deixaria os outros
campos sobrando. O "cobre" diz a mesma coisa com uma linha, e o "Adicionar" para quando as chaves
chegam à quantidade comprada.

**O que se perde, declarado:** a licença que tem chaves não entrega sem chave. Quem cadastrou 8
chaves para 10 licenças cadastra a nona antes da nona entrega. É o preço de a resposta "qual chave
está com quem" ser sempre completa.

---

## AD — Renovar é editar o vencimento; o suporte, a OEM e o comprovante não viram campo

**Decidido** (2026-10-26, nos quatro casos de uso que a AC deixou sugeridos):

- **Renovar é editar o vencimento da mesma licença.** Quem está com ela continua com ela, e o
  pedido, a data e o valor da compra podem passar a ser os da renovação: a licença mostra a compra
  que dá o direito de hoje. Se a renovação trouxe chave nova, troca-se o texto da chave na lista,
  e vale para quem está com ela. Não existe botão Renovar nem lista de renovações na tela: o
  vencimento, o pedido e o valor de antes ficam na auditoria, no banco, com quem mudou (AB).
- **O nome repetido é o contrato novo**, não a renovação: outra versão (o Office 2021 que vira
  Office 2024), outro fornecedor, outra forma de licenciar. A licença nova recebe as entregas, e a
  antiga se encerra quando a última for devolvida.
- **O vencimento é até quando pode usar**, e só isso. A licença perpétua fica sem vencimento — e
  entrega sempre. O fim do suporte, seja o contrato de manutenção, seja o fim da versão no
  fabricante, vai nas notas, como a AA já tinha decidido para o "com manutenção". O formulário diz
  as duas coisas embaixo do Vencimento, que é onde se errava.
- **A licença OEM não entra em Licenças.** O Windows ou o Office que veio de fábrica no computador
  é do computador: não passa para outro e acaba com ele. O comprovante é o pedido do próprio ativo,
  e o sistema instalado aparece na aba Máquina do ativo, pelo que o agente reporta. O formulário da licença nova diz isso
  embaixo do Nome.
- **O comprovante é o número do pedido**, que já existe e que a busca encontra. Sem campo de link
  e sem arquivo. O formulário diz embaixo do campo que ali vai o pedido ou a nota fiscal.

**Supera em parte:** [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)
("a renovação convive com o contrato encerrado": quem convive é o contrato novo; a renovação é a
mesma licença).

**Por quê, caso a caso:**

- **Renovar.** Licença nova a cada renovação obrigaria a devolver e entregar de novo, uma por uma,
  cada pessoa e computador, porque não existe ação em lote. Editar a data não mexe em ninguém. Uma
  lista de renovações na tela seria um segundo histórico, e o da tela é só por onde a licença
  passou e com quem. Quem precisar do valor do ano passado acha na auditoria.
- **Fim do suporte.** O problema era a perpétua com suporte: quem punha o fim do suporte no
  Vencimento via a licença vencer e parar de entregar, mas o direito de usar continuava. Um campo
  próprio traria de volta, com data e alerta, o "com manutenção" que a AA tirou. O que travava era
  o campo ser ambíguo, e a frase embaixo dele resolve isso.
- **OEM.** Ela só caberia com o reatribuível e a queima, que a AA tirou: devolvida, a OEM ficaria
  "livre" para outro computador, o que ela não pode. E a baixa do computador pediria antes a
  devolução de uma licença que morre com ele.
- **Comprovante.** O anexo saiu inteiro no segundo de-escopo (O). Um link aponta para fora do
  sistema e quebra quando o arquivo muda de pasta. O número do pedido é o que o financeiro usa
  para achar a nota.

**O que se perde, declarado:** o fim do suporte não tem alerta, e quem renova perde de vista na
tela o valor e o pedido de antes. Se a data da compra passar a ser a da renovação, a entrega
registrada no passado não vai antes dela.

---

## AF — A licença entra no cadastro das Configurações, e o Editar manda o formulário inteiro

**Decidido** (2026-10-26, no levantamento do Editar, do Desativar e do Excluir no sistema inteiro):

- **O cadastro é o das Configurações em todas as telas.** Editar, Desativar/Ativar e Excluir,
  nessa ordem, com os mesmos ícones e as mesmas frases. O desativado fica na mesma lista,
  esmaecido e marcado, sem aba. O Excluir sempre clica, e o 409 diz por quê e manda desativar. Os
  botões aparecem ao passar o mouse. O estoque entrou pela
  [AE](./estoque.md#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira);
  Postos e Usuários, pelo visual. Usuários fica com as frases da conta de login e com a trava de
  não agir sobre si mesmo.
- **Na licença, o Desativar é o Encerrar, e continua com data.** `terminationDate` segue mandando
  no status, no alerta e no filtro (AA,
  [D44](#d44--status-da-licença-é-derivado-nunca-coluna)). O que muda é a tela:
  - a aba Encerradas sai. A encerrada fica na lista, por nome, esmaecida e com a marca
    "encerrada", e a coluna Vencimento diz "encerrada em" e a data;
  - o botão do meio é Encerrar/Reabrir, com os ícones do Desativar/Ativar. Encerrar pergunta com a
    frase do padrão e, com alguém usando, diz quantos ainda estão com ela. Reabrir apaga a data
    sem perguntar — a mesma edição que o formulário já fazia;
  - o filtro de status ganha "Encerradas", pela mais recente. Só com ele aparece o "Ainda em uso",
    que é para onde leva o link do alerta "encerradas em uso";
  - a rota recusa `view` (422), e `status=ENCERRADA` passa a valer.
- **O Editar manda o formulário inteiro, em todas as telas.** A licença e o estoque deixam de
  mandar só o que mudou, como as Configurações, Postos, Usuários e Ativos já faziam.
- **Ativos e colaboradores ficam como estão.** O ativo não se desativa: os status dele são outros,
  e o fim é a baixa. O Excluir dos dois manda para a lixeira, com a mesma frase (`Excluir "X"? Vai
  para a lixeira e pode ser restaurado.`). Descobertas não tem cadastro, e fica fora.

**Supera em parte:** [AA](#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)
(a aba Encerradas, o Encerrar sem volta na linha e a pergunta própria dele).
**Mantém:** AA (o encerramento por data, mesmo com alguém usando, e o alerta até tudo voltar) e
D44.

**Por quê:** o usuário pediu o sistema inteiro num padrão só: quem aprendeu a desativar uma
categoria sabe encerrar uma licença. A data não podia sair, porque é ela que diz desde quando a
licença acabou e que põe no alerta a encerrada ainda em uso. Por isso o Encerrar ficou no lugar
do Desativar, com o nome que tem. A aba tirava a encerrada da lista; esmaecida, ela fica à vista,
como o desativado.

**O que se perde, declarado:** com o formulário inteiro, quem salva um formulário aberto há tempo
desfaz a edição que outra pessoa salvou nesse meio-tempo — o total do estoque, a lista de chaves,
a data de encerramento. O servidor continua barrando o que quebraria regra: o total abaixo do que
está em uso, a chave já entregue que sai da lista, as datas fora de ordem. No resto, vale a
última gravação, como nas Configurações. Com um cargo só
([Z](./acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)), o caso é raro.
