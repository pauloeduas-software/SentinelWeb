# Invariantes do SentinelWeb

> Fatos que **nunca** podem ser falsos no banco, e onde cada um é defendido.
>
> Complementa o [`modelo-de-posse.md`](modelo-de-posse.md), que diz *o que* o modelo
> significa. Esta página diz *o que o sistema recusa* para que o significado
> continue verdadeiro.

---

## A regra de onde cada uma mora

| Mora no **banco** quando… | Mora na **aplicação** quando… |
|---|---|
| é forma ou unicidade de **uma** tabela, expressável como índice/constraint | precisa **cruzar tabelas** que um índice não alcança |
| precisa valer contra **corrida** entre duas requisições | precisa de uma **mensagem que ensina**, não de um 409 genérico |
| precisa valer para **qualquer escritor** — seed, `psql`, script de migração | depende de estado anterior (*mudou de X para Y?*) |

O critério de desempate é o do `modelo-de-posse.md`: *a regra vive no banco, não na
memória de quem escreve a próxima query*. Quando as duas colunas se aplicam, é o
banco que garante e a aplicação que **explica** — a aplicação checa antes para
dar a mensagem boa, o índice fica atrás para pegar a corrida.

---

## As treze

> **A numeração é a original, e por isso salta.** O corte do ITAM levou as
> invariantes 7, 8, 15, 16 e 18 junto com as tabelas que elas defendiam
> (acessório, estoque, campo customizado, token de API); a segunda rodada levou a
> 14 junto com `EndpointUserDaily`, quando a reconciliação deixou de inferir
> pessoa pela conta do sistema operacional
> ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)).
> Renumerar as que ficaram quebraria as citações no código —
> `assert-status-posse.usecase.ts` diz "invariante 4", `reconcile-seats.usecase.ts`
> diz "invariante 11" —, e um número que muda de significado é pior que um
> número que falta.

| # | Invariante | Onde | O que o usuário vê |
|---|---|---|---|
| 1 | Uma posse aberta por ativo | **banco** — índice único parcial | 409 `Registro já existe` |
| 2 | Uma ocupação aberta por (posto, pessoa) | **banco** — índice único parcial | 409 `Registro já existe` |
| 3 | O tipo de um status em uso não muda | **aplicação** — `status-label.spec.ts` | 409 `Não é possível mudar o tipo: status em uso por 200 registros.` |
| 4 | Estado × posse: ativo entregue não fica `DEPLOYABLE` | **aplicação** — `assert-status-posse.usecase.ts` | 409 `"Pronto p/ Uso" é um status de estoque, e este ativo está entregue. Faça a devolução antes de mudar o status.` |
| 5 | A forma da posse: um alvo coerente, devolução depois da entrega | **banco** — dois `CHECK` | 409 `Registro já existe` (a API recusa antes, com frase própria) |
| 6 | Colaborador desativado ou na lixeira não tem posse direta, **assento de licença**, **unidade de estoque** nem ocupação aberta | **aplicação** — 409 no `DELETE`, no `checkout` e no cadastro de ocupante + trava de linha | 409 `Este colaborador ainda responde por 2 ativos, ocupa 1 assento de licença, está com 3 itens de estoque e ocupa 1 posto. Devolva o que está com ele e encerre as ocupações antes de excluir.` |
| 9 | O alvo de um assento de licença é UM: pessoa **ou** ativo, nunca os dois, nunca nenhum | **banco** — CHECK `license_seat_alvo_xor` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 10 | Um assento de licença não está em duas mãos | **banco** — índice único parcial `license_seat_uma_aberta_por_assento` | 409 `Sem assento livre em "Office 2024": 5 de 5 ocupados.` |
| 11 | `COUNT(assentos sem retiredAt)` **é** `seatsTotal` | **aplicação** — `reconcile-seats.usecase.ts`, na transação da gravação | 409 `Não há assentos livres suficientes para reduzir o contrato: 2 precisariam ser aposentados e só 1 está livre.` |
| 12 | Uma máquina é no máximo um ativo, e um ativo no máximo uma máquina | **banco** — `@unique` em `Endpoint.assetId` | 409 `Este ativo já está vinculado a outra máquina. Desfaça aquele vínculo antes, pela aba Máquina do ativo.` |
| 13 | A mesma sugestão não empilha na fila | **banco** — índice único parcial `sugestao_pendente_por_alvo` | nada: o job trata o `P2002` como "outro já criou" |
| 17 | Sempre existe alguém, com login, que é `ADMIN` | **aplicação** — `assertSobraAdministrador()`, DEPOIS da escrita e dentro da transação | 409 `Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. Dê o papel de Administrador a outra pessoa com login antes de seguir.` |
| 19 | No máximo um ativo por posto de trabalho | **aplicação** — três portas: a entrega e a restauração da lixeira (`ativoDoPosto()`, com `FOR UPDATE` na linha do posto) e a da marca (`locationSpec.beforeWrite`) | 409 `Este posto de trabalho já tem um ativo: ATV-00042 (Dell OptiPlex). Faça a devolução dele antes.` |

---

### 1 — `assignments_um_aberto_por_ativo`

```sql
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;
```

Um equipamento tem **um** detentor por vez. Duas assignments abertas para o
mesmo ativo significariam duas pessoas responsáveis pelo mesmo notebook sem
nenhuma das duas saber — e a Camada 3 (`resolverResponsaveis`) não teria como
escolher.

**Por que no banco:** dois checkouts simultâneos do mesmo ativo passam por
qualquer `if` de aplicação — os dois leem "não há posse aberta" antes de
qualquer um gravar. Só o índice único pega isso.

**Onde está:** `prisma/migrations/20260923011728_posse_e_ocupacao/migration.sql`.
Parcial (`WHERE "checkinAt" IS NULL`) porque o histórico fechado é ilimitado: o
mesmo ativo pode ter sido entregue cem vezes.

> **Hoje a mensagem é genérica.** O P2002 cai no `error-handler` e vira
> `Registro já existe`, que não diz nada a quem clicou em "Entregar". Traduzir
> isso para *"este ativo já está com outra pessoa — faça a devolução primeiro"*
> é dívida do use-case de checkout, não deste índice.

### 2 — `location_occupants_um_aberto_por_pessoa_local`

```sql
CREATE UNIQUE INDEX "location_occupants_um_aberto_por_pessoa_local"
  ON "location_occupants"("locationId", "userId") WHERE "endedAt" IS NULL;
```

A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo tempo. Sem isto,
cadastrar a Laura na Mesa 1 duas vezes (manhã e tarde) a faria aparecer
**duplicada** em toda resolução de responsável daquele posto, e "quantas pessoas
usam esta mesa?" passaria a mentir.

**Por que no banco:** mesmo motivo do #1 — é corrida, e é unicidade de uma
tabela só.

**Note o que ele NÃO proíbe:** a mesma pessoa em **postos diferentes** (a chave
é o par), e **pessoas diferentes** no mesmo posto — que é justamente o que a
Camada 2 existe para permitir (Laura + Ana na Mesa 1).

### 3 — O tipo de um status em uso não muda

`server/domain/catalog/specs/status-label.spec.ts` → `beforeWrite`

Trocar o `type` de um `StatusLabel` que 200 ativos usam muda o significado dos
200 de uma vez, **sem escrever uma linha em `assets`** — e portanto sem
`ActivityLog` nenhum. Um status disponível virando `UNDEPLOYABLE` inutiliza a
frota em silêncio.

**Por que na aplicação:** a regra é *"mudou de X para Y **e** há quem aponte"* —
precisa do valor anterior e de um `COUNT` em outra tabela. Nem índice nem CHECK
fazem isso. E o 409 genérico do banco não diria **quantos**.

A mesma guarda existe em `category.spec.ts`, e **aqui é mais grave**: o tipo da
categoria diz a que módulo o registro pertence; o tipo do status decide se o
equipamento pode ser entregue a alguém.

> **A guarda vale o que a contagem enxerga.** Uma contagem que esquece uma
> tabela deixa a guarda aberta sem avisar: ela responde "zero em uso" e a troca
> de tipo passa.
>
> Contar é a regra inteira aqui — `countUsages` de categoria, fabricante e
> localização precisa conhecer **toda** tabela que aponta para
> elas, e as seis da F5 apontam. Uma tabela nova numa fase futura reabre isto em
> silêncio; é o preço de uma regra que é uma soma.

**A saída correta** é a mesma do delete: criar o status novo e mover os ativos —
operação visível, uma por ativo, auditada.

### 4 — Estado × posse

`server/domain/asset/use-cases/assert-status-posse.usecase.ts`, chamada pelo
`updateAsset` dentro da transação que já existe.

Ativo com `Assignment` aberta não pode receber status de tipo `DEPLOYABLE`
("está no estoque, pode ser entregue"). A frase é falsa sobre um equipamento que
está na mão de alguém.

| Tipo do status | Sem posse aberta — *estoque* | Com posse aberta — *entregue* |
|---|---|---|
| `DEPLOYABLE` | ✅ o caso normal do estoque | ❌ **proibido** — não está no estoque |
| `IN_USE` | ✅ posto vago: sinal operacional, volta ao estoque | ✅ o caso normal |
| `PENDING` | ✅ aguardando, em trânsito | ✅ foi ao conserto e **volta para a mesma pessoa** |
| `UNDEPLOYABLE` | ✅ quebrado, no depósito | ✅ notebook quebrado **ainda na gaveta dela** |

**1 proibida de 8, e a estreiteza é de propósito.** `PENDING` e
`UNDEPLOYABLE` com responsável descrevem operação real: fechar a posse quando o
notebook vai à assistência obrigaria a refazer o checkout na volta e perderia a
continuidade de quem responde por ele enquanto está fora.

**Bloqueia, nunca limpa sozinho.** A alternativa "tudo bem, fecho a assignment
junto" é **perda de dado silenciosa**: quem mandou o status para `DEPLOYABLE`
queria registrar uma **devolução** — com data, quem recebeu, em que estado — e o
sistema apagaria a única informação de quem estava com o equipamento em troca de
um campo. O checkin existe para isso.

**Por que na aplicação:** cruza `assets`, `assignments` e `status_labels`, e o
valor da regra está na mensagem. Um CHECK constraint não faz join e não sabe
dizer *"faça a devolução antes"*.

**Por que dentro da transação:** ela lê a assignment aberta. Fora dela, um
checkout concorrente entre a checagem e o `UPDATE` passaria.

---

### 5 — A forma da `Assignment`

```sql
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
  num_nonnulls("targetUserId", "targetLocationId") = 1
  AND (   ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
       OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL))
);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);
```

Duas afirmações sobre a mesma linha: o alvo polimórfico é **coerente** (uma FK
preenchida, e é a que casa com o `targetType`), e a posse **não fecha antes de
abrir**.

**Por que no banco, se o `assertAlvoCoerente` já valida:** porque a validação da
aplicação defende quem passa pela API, e esta tabela tem outros escritores — o
seed, um `psql` à mão, o importador de CSV da F10, uma migração futura. Uma
linha com `targetType: 'USER'` e `targetLocationId` preenchido é aceita pelo
Postgres sem CHECK, e a Camada 3 a resolve como *"sem responsável"* — em
silêncio, que é o pior jeito de um equipamento sumir de vista.

A `Assignment` era a **única** tabela do modelo de posse sem CHECK: a ocupação é
defendida pelo índice único parcial (#2) e o assento de licença tem o
`license_seat_alvo_xor` (#9). A tabela que carrega a Camada 1 ficaria a mais
frouxa das três.

**`>=` e não `>`** na data: entrega e devolução no mesmo instante é real — é a
devolução no mesmo dia da entrega, com dois relógios que podem coincidir no
milissegundo.

**Onde está:** na migration `0_init` e, o da coerência, refeito para dois alvos
em `20261010220000_o_alvo_ativo_sai_da_posse`. A aplicação continua recusando
antes, com a frase que ensina o modelo; o CHECK é a rede de baixo.

### 6 — Desativado não fica com posse aberta

`server/domain/user/use-cases/lock-user.usecase.ts`, chamada como **primeira**
instrução da transação em `deleteUser`, `checkoutAsset` (alvo `USER`),
`checkoutSeat` (alvo `USER`), `checkoutStock` (alvo `USER`) e
`addLocationOccupant`.

**QUATRO PONTAS, e são as quatro que fazem alguém responder por equipamento:**
ativo no nome (`Assignment` alvo `USER`), assento de licença
(`LicenseSeatCheckout.assignedUserId`), unidade de estoque no nome
(`StockMovement` de SAIDA alvo `USER`) e ocupação de posto (`LocationOccupant`)
— esta última porque ocupante responde pelos ativos e pelo estoque do posto por
derivação da Camada 3. A pergunta que decide se algo entra aqui não é *"tem
tabela própria?"*, é ***"alguém responde por isto quando a pessoa sai?"***.

**As três guardas de leitura são furáveis por corrida**, e a trava é a metade que
faltava:

```
T1 (entrega)       lê o usuário  → isActive: true, segue
T2 (desativação)   lê as posses  → não há nenhuma, fecha nada
T2                 grava isActive = false                 → COMMIT
T1                 cria a Assignment                      → COMMIT
```

Resultado: **desativado com posse aberta**. Os dois caminhos fizeram exatamente o
que está escrito neles. Em `READ COMMITTED` — o padrão do Postgres e o nosso —
nenhum `if` pega isso: as duas transações leem um estado consistente de antes, e
nenhuma enxerga o que a outra ainda não confirmou.

E o estado é **invisível**: nada falha, nada é logado como erro. Quem descobre é
o `DELETE`, meses depois, respondendo 409 *"ainda responde por 1 ativo"* sobre um
cadastro que a tela mostra como inativo.

> **A assimetria que existia até o corte do ITAM:** `checkoutAsset` recusava
> entregar ativo a quem está desativado e `addLocationOccupant` só conferia
> existência. Como responsável de posto é DERIVADO da ocupação, a brecha reabria
> por fora do checkout exatamente a responsabilidade que a desativação fecha — e
> a fila de reconciliação chegava a oferecer o botão que fazia isso, porque o
> aceite de uma sugestão `OCCUPANCY` passa por ali. Hoje as duas recusam com 409,
> e a fila não propõe nada para quem está desativado
> (`upsert-suggestion.usecase.ts`, passo 0).

**A saída** é serializar as duas na linha que as duas disputam: `SELECT … FOR
UPDATE` na linha do usuário. A segunda transação espera a primeira confirmar, e a
releitura enxerga o estado novo — aí as guardas que já existem funcionam.

**Ordem de travamento: usuário antes de ativo**, em todo caminho que trave os
dois. Duas transações que travam os mesmos recursos em ordens opostas travam uma
à outra, e o Postgres mata uma com erro. É por isso que a chamada é a **primeira**
instrução de cada transação, antes de ler ativo e antes de contar posse.

**Por que na aplicação:** um CHECK não faz join, e a regra cruza `users`,
`assignments` e `location_occupants`. O que o banco oferece aqui é a trava, não
a verificação.

> **A corrida é testada, não argumentada.** `tests/corridas/posse.test.ts`
> dispara duas entregas do mesmo ativo e duas ocupações do mesmo posto sem
> `await` entre elas, e a asserção não é "deu certo": é *exatamente UMA passou, e
> o banco tem exatamente UMA linha*.

---

### 9 — `license_seat_alvo_xor`

```sql
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_alvo_xor"
  CHECK (num_nonnulls("assignedUserId", "assignedAssetId") = 1);
```

Duas colunas nuláveis admitem quatro estados, e **dois são mentira**: as duas
preenchidas ("este assento está com a Laura E com o notebook") e nenhuma
preenchida ("este assento está ocupado por ninguém"). Nenhum dos dois dá erro
sozinho — o assento sai da conta de livres sem aparecer em lista nenhuma: pago,
indisponível e invisível.

É o irmão do 7, com uma diferença: aqui **não há discriminante** para conferir,
porque com dois alvos possíveis a FK preenchida já diz qual é. Um `targetType`
ao lado seria uma terceira coisa capaz de discordar das outras duas.

A aplicação recusa antes, com 422 e a frase que ensina o modelo (*"Posto de
trabalho não é alvo de licença — entregue ao ativo que está na mesa"*, D39); o
CHECK é a rede para quem não passa pelo use-case.

> **Provado em** `tests/licencas/posse.test.ts` e pelo `psql`: o `INSERT` com as
> duas FKs e o `INSERT` com nenhuma são recusados pelo banco.

### 10 — `license_seat_uma_aberta_por_assento`

```sql
CREATE UNIQUE INDEX "license_seat_uma_aberta_por_assento"
  ON "license_seat_checkouts"("seatId") WHERE "checkinAt" IS NULL;
```

Mesma forma da invariante 1, um nível abaixo: lá o que não se duplica é a posse
de um ativo, aqui é a ocupação de um assento.

**Quem a defende no caminho quente não é o índice**, e essa é a diferença: a
escolha do assento livre é `SELECT … FOR UPDATE OF s SKIP LOCKED` dentro da
transação (D41), então duas entregas simultâneas pegam assentos **diferentes** e
nunca disputam esta linha. O índice é a rede para o `psql` à mão, o importador
de CSV da F10 e qualquer caminho futuro.

Ele também sustenta a contagem: o `LEFT JOIN` de `contarAssentos` só não
multiplica linhas porque cada assento tem no máximo uma ocupação aberta para
casar. É a mesma invariante servindo a duas coisas.

> **Provado por corrida.** `tests/licencas/corridas.test.ts` dispara oito
> entregas numa licença de cinco assentos sem `await` entre elas: passam cinco
> `201` e três `409`, os cinco em assentos **distintos**, e nenhum assento fica
> com duas ocupações abertas. Reproduzido contra o servidor real com
> `xargs -P8`.

### 11 — `COUNT(assentos sem retiredAt)` **é** `seatsTotal`

A única invariante da F6 que o **banco não garante sozinho**: ela atravessa duas
tabelas, e um CHECK não enxerga a outra. Mora em
`license/use-cases/reconcile-seats.usecase.ts`, na mesma transação que grava a
licença.

Mudar `seatsTotal` **cria ou aposenta linhas junto**: aumentar insere assentos
numerados a partir de `MAX(seatNumber) + 1` — nunca `COUNT + 1`, porque a linha
aposentada continua na tabela e a contagem colidiria com `license_seats_numero`
—; diminuir marca `retiredAt` nos **livres de maior número**, e recusa com 409
quando não há livres suficientes.

Em dois passos, haveria a janela em que o relatório mostra 50 comprados e 40
existentes. E sem a trava de **todos** os assentos antes de contar (D90), uma
entrega simultânea levaria o assento que a redução está aposentando — ele
terminaria ocupado **e** aposentado: fora da conta de livres, fora da conta de
comprados, e na mão de alguém.

> **A conta que depende dela** é o `livres` (D92), e ela corrige a fórmula do
> plano prospectivo: `livres = seatsTotal − ocupados − queimados`, com
> `aposentados` **exibido e nunca subtraído** — ele já saiu de `seatsTotal`
> quando o contrato encolheu, e subtraí-lo de novo o contaria duas vezes.
>
> **Provado em** `tests/licencas/reconciliacao.test.ts`: sobe 5→8, desce 8→6,
> volta 6→8 (conferindo que a numeração não colide com os aposentados), e tenta
> descer abaixo do ocupado — 409, com a transação inteira voltando atrás.

---

### 12 — `endpoints_assetId_key`

```prisma
assetId String? @unique @db.Uuid
```

O 1:1 do D45, garantido pelo banco e não pela aplicação. Ele existe porque a
alternativa não é "duas máquinas no mesmo ativo": é **duas verdades sobre a mesma
máquina** — dois `hostname`, dois inventários de software, duas datas de último
contato, e nenhuma forma de saber qual vale.

O caso que ele pega de verdade é a **reimagem**: a máquina volta com `hwid` novo e
o serial casando com um ativo que já tem endpoint. Sem o índice, o segundo vínculo
entraria e a tela do ativo passaria a mostrar a máquina errada, escolhida por
ordem de consulta. Com ele, a tentativa é recusada com 409, apontando para
"Desvincular" na aba Máquina — não há mais fusão (saiu com
[H](../decisoes/reconciliacao.md#h--a-fusão-de-máquinas-sai): o `hwid` é derivado
do hardware e estável entre reinstalações, então a duplicação que a fusão
resolvia não acontece mais).

> `onDelete: SetNull` é o outro lado: apagar um ativo de verdade **não** leva
> junto a telemetria da máquina. O preço é que o vínculo se desfaz em silêncio, e
> é por isso que existe linha de `ActivityLog` para `UNLINK`.

### 13 — `sugestao_pendente_por_alvo`

```sql
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" ("kind", "endpointId",
    COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "state" = 'PENDING';
```

**PARCIAL porque o histórico PRECISA repetir:** a mesma sugestão pode ter sido
recusada em março, substituída em abril e aceita em maio, e as três linhas contam
essa história. O que não pode repetir é o que está **esperando decisão**.

**Hoje um alvo só — `assetId`.** O índice chegou a cobrir quatro alvos
(`targetUserId`, `targetLocationId` e `mergeIntoEndpointId` além de `assetId`),
de quando a fila também propunha ocupação de posto e fusão de máquinas; os dois
saíram ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional),
[H](../decisoes/reconciliacao.md#h--a-fusão-de-máquinas-sai)), e com eles as três
colunas. `SuggestionKind` hoje só tem `LINK`.

**`COALESCE` continua, mesmo com um alvo só** — e não é cerimônia: a coluna
segue nulável, e em Postgres dois `NULL` nunca colidem num índice único. Uma
linha `PENDING` com `assetId` nulo (bug, carga à mão) voltaria a poder empilhar
sem limite, em silêncio, sem o `COALESCE`.

O que ele protege não é o banco: é a **fila**. O job roda de hora em hora sobre a
frota inteira e reencontra as mesmas evidências; sem o índice, uma semana de
operação vira 168 cópias de cada sugestão, e a fila que deveria ser lida por uma
pessoa vira uma lista que ninguém abre duas vezes.

> **Provado em** `tests/descoberta/fila.test.ts`: três rodadas seguidas do job e a
> contagem de `PENDING` não cresce.

> **A invariante 14 saiu com `EndpointUserDaily`** quando a reconciliação deixou de inferir
> pessoa pela conta do sistema operacional
> ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)).
> Ela garantia que a agregação por dia fosse uma linha por (máquina, conta, dia); a tabela que
> ela defendia não existe mais.

---

### 17 — Nunca sem administrador

```ts
// access/helpers/ultimo-administrador.ts, no FIM da transação
await assertSobraAdministrador(tx);
```

**A checagem roda DEPOIS da escrita, dentro da transação** — e é isso que a torna
completa. Prever se uma operação vai deixar o sistema sem administrador exigiria
simular cada caminho (rebaixar o papel, desativar a pessoa, apagar a pessoa), e o
terceiro seria o esquecido. Aplicando e **contando depois**, há uma pergunta só:
*ainda existe alguém?* Se não, o `throw` desfaz tudo e nada aconteceu.

Um caminho novo que mexa em papel herda a proteção só por chamar isto no fim — e
foi o que aconteceu com o `isActive` editável: a checagem roda em TODO `update`
de usuário, não só quando `role` vem no corpo, então desativar o último
administrador responde 409 sem ninguém ter escrito uma linha para isso.

**Quem conta como administrador precisa poder ENTRAR**: `passwordHash` não nulo
(a base nasceu sem login — a maior parte dos cadastros existe só para receber
equipamento), `isActive`, `role = ADMIN` e fora da lixeira. Um "administrador"
que não faz login não destrava nada.

> **O que esta invariante NÃO cobre, e por isso existe a linha de escape:** o
> caminho da tela. Um restore parcial, ou a única conta `ADMIN` que perdeu a
> senha, deixam o sistema de pé e **trancado**. A saída é
> `npm run acesso:administrador -- <login>`, que exige acesso ao servidor — e
> **não** uma rota de emergência, que seria uma rota concedendo `ADMIN` sem ser
> `ADMIN`.

---

### 19 — No máximo um ativo por posto de trabalho

```ts
// workstation/helpers/ativo-do-posto.helper.ts, nas duas portas que TRAVAM
// (entrega e restauração da lixeira), dentro da transação
const ocupante = await ativoDoPosto(tx, locationId, assetId);
if (ocupante) throw new AppError(jaTemAtivo(ocupante), 409);

// catalog/specs/location.spec.ts — a porta da MARCA
const quantos = await contarAtivosNoLocal(client, id);
if (quantos > 1) throw new AppError(/* … */, 409);
```

Um posto de trabalho é uma mesa, uma bancada, um guichê: uma pessoa por turno,
um computador. Duas máquinas entregues à mesma mesa não são um cenário de
inventário — são um cadastro errado que ninguém percebe, porque a tela do posto
mostraria duas e a telemetria somaria o uso das duas como se fosse daquele posto.

**Ativo é computador.** Nada que não seja máquina é cadastrado em `/ativos`:
monitor, teclado, mouse e cabo são estoque, por quantidade, sem patrimônio
individual. É isso que faz a regra ser sobre o **ativo**, e não sobre "ativo com
máquina vinculada": o agente instalado ou não instalado não muda o que o
equipamento é, só o que a ficha dele consegue mostrar. Um desktop cujo agente
ainda não chegou já é o computador da mesa, e o segundo é recusado na entrega.

**Por que na aplicação:** a regra cruza `assignments`, `assets` e `locations`
(`isWorkstation` numa, `deletedAt` noutra). Não é a forma nem a unicidade de uma
tabela só, então não há índice que a expresse — é o mesmo argumento da
invariante 6.

**E por isso ela trava a linha do posto.** Estar dentro da transação não basta:
em READ COMMITTED duas entregas simultâneas de dois ativos ao mesmo posto leem
as duas um estado de antes, nenhuma enxerga a posse que a outra não confirmou, e
as duas passam. É o mesmo furo que a invariante 6 fecha com `travarUsuario`, e
nenhum `if` o pega. Sem rede no banco, a serialização é explícita:
`SELECT id FROM locations WHERE id = $1 FOR UPDATE` antes da leitura, na linha
que as duas transações disputam — depois de travar o ativo, que é a ordem do
grafo de travas (`lock-asset.usecase.ts`).

**São TRÊS portas, e nenhuma é redundante:**

| porta | o que ela impede |
| --- | --- |
| `checkout-asset.usecase.ts` | entregar ao posto um segundo ativo |
| `locationSpec.beforeWrite` | **marcar como posto** um local que já tem mais de um ativo |
| `restore-asset.usecase.ts` | **restaurar da lixeira** um ativo cuja posse aberta aponta para um posto que, enquanto ele estava fora, recebeu outro |

Sem a segunda, a regra seria contornável pela marca: entregar dois ativos a uma
sala de reunião, onde a regra não vale, e marcar a sala como posto depois. É
`mais de um`, e não `um`, porque a regra é "no máximo um": marcar uma sala que
já tem exatamente um ativo é legítimo, e é como um posto nasce com o
equipamento já lá. A guarda só dispara na TRANSIÇÃO — um PUT que não menciona a
marca, ou que a reafirma, não passa por ela.

Sem a terceira, seria contornável pela lixeira: o `delete-asset` só carimba
`deletedAt` e **não fecha a posse**, e as outras duas portas ignoram o ativo na
lixeira de propósito — um ativo que nenhuma tela mostra não pode trancar a mesa.
Juntas, as duas decisões abrem o caminho: a vaga é ocupada enquanto o ativo
está na lixeira, e restaurá-lo o devolve a uma mesa que já não tem lugar para
ele. A porta reconfere na volta, com o mesmo helper e a mesma frase.

**O vínculo de máquina NÃO é porta**, e já foi: enquanto "computador" era
"ativo com máquina vinculada", entregar o desktop sem agente e vincular depois
contornava a entrega, e o vínculo tinha de reconferir. Com a regra sobre o
ativo, a vaga é decidida na entrega e o vínculo só muda o que a ficha mostra.

**Note o que ela NÃO proíbe:** vários ocupantes no posto, que são o desenho da
Camada 2; dois ativos em local **sem** `isWorkstation` — a sala de reunião e o
depósito continuam livres, porque proibir ali quebraria o uso que já existe; e
o estoque na mesa, que não é ativo. **Posto sem ativo continua válido**: a regra
é "no máximo um", não "exatamente um". (O `postoVago` é outra coisa, e não tem
relação com esta invariante: ele é posto **sem ocupante** — gente, não máquina.)

**O que a porta da marca NÃO cobre, e é aceito:** ela conta os ativos no
instante da marca e não trava a linha do local. Marcar a sala como posto ao
mesmo tempo em que alguém entrega o segundo ativo a ela é uma corrida que passa
— ligar a marca é operação de cadastro, feita uma vez por mesa, e a guarda
existe para impedir quem marca o local errado. As portas de entrega e de
restauração, que são as que recebem tráfego, continuam travando.

> **A regra é testada, não argumentada.** `tests/invariantes/ativo-por-posto.test.ts`
> cobre a porta da entrega sem agente, os dois ativos na sala de reunião, o que
> libera a vaga e a porta da restauração; `tests/descoberta/vincular-e-entregar.test.ts`
> cobre a entrega com agente e prova que desvincular a máquina NÃO libera a vaga;
> `…-marca.test.ts` cobre a porta da marca, incluindo a sala com UM ativo que
> vira posto e o PUT que não menciona a marca. **A corrida também:**
> `tests/corridas/ativo-por-posto.test.ts` dispara duas entregas simultâneas ao
> mesmo posto e exige que exatamente uma entre.

---

## O que **não** é invariante, e por isso não está aqui

- **`Asset.assignedToId` bate com a `Assignment` aberta.** É *cache*, não
  invariante: quem escreve nele é só o checkout/checkin, e ele saiu do
  `createAssetSchema`/`updateAssetSchema` justamente para que não exista um
  segundo escritor com quem divergir (`modelo-de-posse.md`). A defesa é **não ter a
  operação**, não ter uma checagem.
- **O status da licença.** `ATIVA/VENCENDO/EXPIRADA/ENCERRADA` sai de um helper
  puro sobre duas datas e o dia de hoje (D44). Não há linha gravada com que
  divergir — que é justamente por que ele não é coluna: uma coluna exigiria um
  job diário para continuar verdadeira, e no dia em que o job falhasse o
  inventário mentiria sem sintoma.
- **Só `DEPLOYABLE` libera checkout.** É regra de fluxo do checkout (F4), não
  fato sobre linhas já gravadas.
- **Validação de formato** (uuid, tamanho, enum) — é do `zod`, na borda.
- **Toda rota declara a permissão que exige.** É garantia de **BOOT**, não
  invariante de dado: `core/http/permission-guard.ts` confere o mapa contra a
  tabela de rotas do Fastify e **derruba o processo** com a lista das que faltam
  (D137). Não cabe nesta lista porque não há linha gravada que possa violá-la — o
  que ela protege é uma rota existir alcançável sem ninguém ter decidido isso. E o
  lugar certo para ela é o boot, não uma checagem por requisição: `npm test` fica
  vermelho antes de qualquer deploy.
- **O papel efetivo de uma sessão bate com a coluna.** Ele é LIDO a cada
  requisição, na mesma consulta que relê o usuário (D136/D148) — não há cópia com
  que divergir. É o D16 aplicado ao acesso: guardar o papel no token exigiria
  reemitir a sessão a cada troca, e no dia em que a reemissão falhasse alguém
  continuaria alcançando o que já lhe foi tirado.
- **A fila de sugestões só fala de gente que opera.** Não é invariante de dado,
  é regra de PROPOSTA: a sugestão de quem foi desativado depois de ela nascer
  existe no banco, e é legítima — ela sai da fila como `SUPERSEDED` na rodada
  seguinte (`invalidate-suggestions.usecase.ts`), e volta se a pessoa for
  reativada. O que o sistema garante é não PROPOR nada novo, e não que nenhuma
  linha pendente aponte para alguém inativo entre duas rodadas do job.

---

## Para acrescentar uma

O passo a passo está em
[`../guias/acrescentar-uma-invariante.md`](../guias/acrescentar-uma-invariante.md) — incluindo a
regra de corrigir o número no título desta página, que é o que mantinha a instrução apontando
para um título que não existia mais a cada fase.
