# Invariantes do SentinelWeb

> Fatos que **nunca** podem ser falsos no banco, e onde cada um é defendido.
>
> Complementa o [`MODELO-POSSE.md`](./MODELO-POSSE.md), que diz *o que* o modelo
> significa. Esta página diz *o que o sistema recusa* para que o significado
> continue verdadeiro.

---

## A regra de onde cada uma mora

| Mora no **banco** quando… | Mora na **aplicação** quando… |
|---|---|
| é forma ou unicidade de **uma** tabela, expressável como índice/constraint | precisa **cruzar tabelas** que um índice não alcança |
| precisa valer contra **corrida** entre duas requisições | precisa de uma **mensagem que ensina**, não de um 409 genérico |
| precisa valer para **qualquer escritor** — seed, `psql`, script de migração | depende de estado anterior (*mudou de X para Y?*) |

O critério de desempate é o do `MODELO-POSSE.md`: *a regra vive no banco, não na
memória de quem escreve a próxima query*. Quando as duas colunas se aplicam, é o
banco que garante e a aplicação que **explica** — a aplicação checa antes para
dar a mensagem boa, o índice fica atrás para pegar a corrida.

---

## As dezoito

| # | Invariante | Onde | O que o usuário vê |
|---|---|---|---|
| 1 | Uma posse aberta por ativo | **banco** — índice único parcial | 409 `Registro já existe` |
| 2 | Uma ocupação aberta por (posto, pessoa) | **banco** — índice único parcial | 409 `Registro já existe` |
| 3 | O tipo de um status em uso não muda | **aplicação** — `status-label.spec.ts` | 409 `Não é possível mudar o tipo: status em uso por 200 registros.` |
| 4 | Estado × posse: ativo entregue não fica `DEPLOYABLE` nem `ARCHIVED` | **aplicação** — `assert-status-posse.usecase.ts` | 409 `"Pronto p/ Uso" é um status de estoque, e este ativo está entregue. Faça a devolução antes de mudar o status.` |
| 5 | A forma da posse: um alvo coerente, nunca a si mesmo, devolução depois da entrega | **banco** — três `CHECK` | 409 `Registro já existe` (a API recusa antes, com frase própria) |
| 6 | Colaborador desligado ou na lixeira não tem posse direta, unidade de acessório direta, **assento de licença** nem ocupação aberta | **aplicação** — 409 no `DELETE` + trava de linha no `offboard`/`checkout` | 409 `Este colaborador ainda responde por 2 ativos, está com 1 acessório, ocupa 1 assento de licença e ocupa 1 posto. Faça o desligamento antes de excluir.` |
| 7 | O alvo de uma entrega de acessório é UM, e é o que casa com o `targetType` | **banco** — CHECK `accessory_checkout_alvo_xor` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 8 | Nenhuma saída de estoque passa do disponível | **aplicação** — `COUNT` + `SELECT … FOR UPDATE` na linha-pai, dentro da transação | 409 `Sem unidade suficiente deste acessório: 0 disponível(is) de 5.` |
| 9 | O alvo de um assento de licença é UM: pessoa **ou** ativo, nunca os dois, nunca nenhum | **banco** — CHECK `license_seat_alvo_xor` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 10 | Um assento de licença não está em duas mãos | **banco** — índice único parcial `license_seat_uma_aberta_por_assento` | 409 `Sem assento livre em "Office 2024": 5 de 5 ocupados.` |
| 11 | `COUNT(assentos sem retiredAt)` **é** `seatsTotal` | **aplicação** — `reconcile-seats.usecase.ts`, na transação da gravação | 409 `Não há assentos livres suficientes para reduzir o contrato: 2 precisariam ser aposentados e só 1 está livre.` |
| 12 | Uma máquina é no máximo um ativo, e um ativo no máximo uma máquina | **banco** — `@unique` em `Endpoint.assetId` | 409 `Este ativo já está vinculado a outra máquina. Use a fusão se for a mesma máquina reinstalada.` |
| 13 | A mesma sugestão não empilha na fila | **banco** — índice único parcial `sugestao_pendente_por_alvo` | nada: o job trata o `P2002` como "outro já criou" |
| 14 | A observação de uso é uma linha por (máquina, conta, dia) | **banco** — índice único `endpoint_user_daily` | nada: o `upsert` incrementa em vez de inserir |
| 15 | O `slug` de um campo customizado não muda depois de criado | **aplicação** — `custom-field.spec.ts` → `beforeWrite` | 409 `O identificador de um campo não muda depois de criado: ele é a chave do valor em cada ativo. Este campo é "ip_fixo". Para trocar o identificador, crie outro campo — o nome visível, esse sim, pode ser editado à vontade.` |
| 16 | Um campo com valor gravado não vira cifrado, nem deixa de ser | **aplicação** — `custom-field.spec.ts` → `beforeWrite` | 409 `Não é possível ligar a cifra de "chave_wifi": 12 ativos já têm valor gravado neste campo. Os valores existentes estão em claro e não seriam cifrados retroativamente. Crie um campo novo com a configuração desejada.` |
| 17 | Sempre existe alguém, com login, que alcança `access.manage` | **aplicação** — `assertSobraAdministrador()`, DEPOIS da escrita e dentro da transação | 409 `Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. Dê "Gerenciar grupos, permissões e tokens de API" a outra pessoa com login antes de seguir.` |
| 18 | Uma credencial de API sempre tem dono | **banco** — FK `api_tokens_userId_fkey` com `Cascade` | nada: a FK impede o órfão, e apagar a pessoa leva os tokens dela |

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
`ActivityLog` nenhum. "Pronto p/ Uso" virando `ARCHIVED` arquiva a frota em
silêncio.

**Por que na aplicação:** a regra é *"mudou de X para Y **e** há quem aponte"* —
precisa do valor anterior e de um `COUNT` em outra tabela. Nem índice nem CHECK
fazem isso. E o 409 genérico do banco não diria **quantos**.

A mesma guarda existe em `category.spec.ts`, e **aqui é mais grave**: o tipo da
categoria diz a que módulo o registro pertence; o tipo do status decide se o
equipamento pode ser entregue a alguém.

> **A guarda vale o que a contagem enxerga.** A da categoria contava modelos e
> ativos, e nada mais — então uma categoria usada **só por acessórios** contava
> zero e mudava de `ACCESSORY` para `ASSET` sem recusa. O acessório terminava
> numa categoria de tipo `ASSET`: exatamente o estado que
> `assert-stock-references.usecase.ts` recusa com **422** na criação do item.
> A guarda existia na porta do item; a da categoria estava aberta.
>
> Contar é a regra inteira aqui — `countUsages` de categoria, fabricante,
> fornecedor e localização precisa conhecer **toda** tabela que aponta para
> elas, e as seis da F5 apontam. Uma tabela nova numa fase futura reabre isto em
> silêncio; é o preço de uma regra que é uma soma.

**A saída correta** é a mesma do delete: criar o status novo e mover os ativos —
operação visível, uma por ativo, auditada.

### 4 — Estado × posse

`server/domain/asset/use-cases/assert-status-posse.usecase.ts`, chamada pelo
`updateAsset` dentro da transação que já existe.

Ativo com `Assignment` aberta não pode receber status de tipo `DEPLOYABLE`
("está no estoque, pode ser entregue") nem `ARCHIVED` ("saiu da operação"). As
duas frases são falsas sobre um equipamento que está na mão de alguém.

| Tipo do status | Sem posse aberta — *estoque* | Com posse aberta — *entregue* |
|---|---|---|
| `DEPLOYABLE` | ✅ o caso normal do estoque | ❌ **proibido** — não está no estoque |
| `IN_USE` | ✅ posto vago: sinal operacional, volta ao estoque | ✅ o caso normal |
| `PENDING` | ✅ aguardando, em trânsito | ✅ foi ao conserto e **volta para a mesma pessoa** |
| `ARCHIVED` | ✅ saiu da operação | ❌ **proibido** — sumiria do relatório continuando com ela |
| `UNDEPLOYABLE` | ✅ quebrado, no depósito | ✅ notebook quebrado **ainda na gaveta dela** |

**2 proibidas de 10, e a estreiteza é de propósito.** `PENDING` e
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
  num_nonnulls("targetUserId", "targetAssetId", "targetLocationId") = 1
  AND (   ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
       OR ("targetType" = 'ASSET'    AND "targetAssetId"    IS NOT NULL)
       OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL))
);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_nao_entregue_a_si_mesmo" CHECK (
  "targetAssetId" IS NULL OR "targetAssetId" <> "assetId"
);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);
```

Três afirmações sobre a mesma linha: o alvo polimórfico é **coerente** (uma FK
preenchida, e é a que casa com o `targetType`), o ativo **não responde por si
mesmo**, e a posse **não fecha antes de abrir**.

**Por que no banco, se o `assertAlvoCoerente` já valida:** porque a validação da
aplicação defende quem passa pela API, e esta tabela tem outros escritores — o
seed, um `psql` à mão, o importador de CSV da F10, uma migração futura. Uma
linha com `targetType: 'USER'` e `targetLocationId` preenchido é aceita pelo
Postgres sem CHECK, e a Camada 3 a resolve como *"sem responsável"* — em
silêncio, que é o pior jeito de um equipamento sumir de vista.

A `Assignment` era a **única** tabela do modelo de posse sem CHECK: o assento já
é defendido pelo índice único parcial (#2) e o `AccessoryCheckout` da F5 nasce
com o dele. A tabela que carrega a Camada 1 ficaria a mais frouxa das três.

**`>=` e não `>`** na data: entrega e devolução no mesmo instante é real — é o
desligamento no mesmo dia da entrega, e o `offboard` carimba os dois com
relógios que podem coincidir no milissegundo.

**Onde está:** `prisma/migrations/20260923105500_check_do_assignment/migration.sql`.
A aplicação continua recusando antes, com a frase que ensina o modelo; o CHECK é
a rede de baixo.

### 6 — Desligado não fica com posse aberta

`server/domain/user/use-cases/lock-user.usecase.ts`, chamada como **primeira**
instrução da transação em `offboardUser`, `deleteUser`, `checkoutAsset` (alvo
`USER`) e `addLocationOccupant`.

O `DELETE` já respondia 409 com as duas contagens (`count-user-posse.usecase.ts`)
e o `checkout` já recusava entregar a `isActive = false`. **As duas guardas eram
furáveis por corrida**, e esta é a metade que faltava:

```
T1 (entrega)       lê o usuário  → isActive: true, segue
T2 (desligamento)  lê as posses  → não há nenhuma, fecha nada
T2                 grava isActive = false, terminatedAt   → COMMIT
T1                 cria a Assignment                      → COMMIT
```

Resultado: **desligado com posse aberta**. Os dois caminhos fizeram exatamente o
que está escrito neles. Em `READ COMMITTED` — o padrão do Postgres e o nosso —
nenhum `if` pega isso: as duas transações leem um estado consistente de antes, e
nenhuma enxerga o que a outra ainda não confirmou.

E o estado é **invisível**: nada falha, nada é logado como erro. Quem descobre é
o `DELETE`, meses depois, respondendo 409 *"ainda responde por 1 ativo"* sobre um
cadastro que a tela mostra como desligado — e a tela do desligamento já não
oferece devolver nada, porque a pessoa já está desligada.

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

> **Encontrada por teste, não por leitura.** `tests/corridas/posse.test.ts`
> dispara desligamento e entrega sem `await` entre eles e confere o estado final.
> Antes da trava, ele ficava vermelho com `{ posses: 1 }`.

---

### 7 — `accessory_checkout_alvo_xor`

```sql
ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkout_alvo_xor"
  CHECK (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL AND "targetLocationId" IS NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL AND "targetUserId"     IS NULL)
  );
```

Um discriminante ao lado de duas FKs nuláveis admite **quatro** estados, e três
deles são mentira: as duas preenchidas, nenhuma preenchida, e a preenchida que
não corresponde ao `targetType`.

**Nenhum dá erro sozinho.** O que acontece é a resolução de responsáveis
devolver `[]` em silêncio — *"ninguém responde por esta unidade"* — para uma
unidade que está na mão de alguém.

**Esta é a diferença da F5 para a F4.** No `Assignment` a mesma coerência é
guarda de APLICAÇÃO (`assertAlvoCoerente`), porque com três FKs o CHECK ficaria
longo e o Prisma não o expressa de qualquer jeito. Aqui são só duas, e o CHECK
foi escrito à mão na migration — então a garantia alcança o `psql`, o importador
de CSV da F10 e qualquer caminho futuro que não passe pelo use-case.

**Onde está:** `prisma/migrations/20260923190000_estoque/migration.sql`. A
aplicação continua validando por cima, para dar 422 com o nome do campo que
falta: o erro do CHECK fala de constraint, que não ensina nada a quem preencheu
o formulário.

> **Provado por fora da API.** `tests/estoque/invariantes.test.ts` faz um
> `INSERT` cru com as duas FKs preenchidas e espera a recusa — é isso que
> demonstra que a garantia não depende do use-case.

### 8 — Nenhuma saída passa do disponível

```ts
await prisma.$transaction(async (tx) => {
  await travarItemOuFalhar(tx, 'ACCESSORY', 'acessório', id);   // SELECT … FOR UPDATE
  const emUso = await contarEmUsoDe(tx, 'ACCESSORY', id);        // COUNT das linhas abertas
  assertDisponivel('acessório', 1, item.qty, emUso);             // 409 com os números
  await tx.accessoryCheckout.create({ /* … */ });
});
```

**Por que não é uma coluna `qtyAvailable`** (D34): a coluna pode DIVERGIR das
linhas. Basta um `INSERT` de checkout que não passe pelo decremento — falha no
meio de uma operação sem transação, correção à mão no `psql`, importador da F10 —
e a partir daí ela mente **para sempre**, porque a coluna *é* a resposta: não
existe ninguém para discordar dela. Com `COUNT`, a resposta não pode divergir
das linhas — ela **são** as linhas.

**Por que o `COUNT` sozinho não basta: contar não é travar.** Duas requisições
podem contar "4 de 5 ocupados" e as duas inserirem, dando 6 de 5. Em READ
COMMITTED nenhuma enxerga o checkout que a outra ainda não confirmou, e nenhum
`if` pega isso. Quem serializa é o `FOR UPDATE` na linha do ITEM — que precisa
estar **dentro** da transação: um lock em autocommit dura zero milissegundo.

**Por que na aplicação, e não no banco:** a regra cruza duas tabelas (o item e
as saídas dele), e um CHECK não faz join. O que o banco oferece aqui é a
**trava**, não a verificação — exatamente como na invariante 6.

**Ordem de travamento: usuário antes do item, e componente antes de ativo.** A
primeira é extensão direta do *usuário antes de ativo* da invariante 6; a
segunda entrou com a recusa abaixo. O grafo de travas do sistema é `usuário →
ativo`, `usuário → item de estoque` e `componente → ativo` — acíclico, e é isso
que precisa continuar verdadeiro: duas transações que travem os mesmos dois
recursos em ordens opostas travam uma à outra, e o Postgres mata uma delas.

**A unidade não pode ficar presa do outro lado.** A mesma invariante tem uma
segunda ponta, e ela não é sobre quantidade — é sobre haver caminho de volta:

- `deleteStockItem` recusa mandar o item para a lixeira com unidade fora;
- `deleteAsset` recusa mandar o ATIVO para a lixeira com peça dentro.

Sem a segunda, as unidades instaladas sumiam do `disponivel` para sempre: a
contagem olha `component_assets`, que não tem `deletedAt` e não sabe que o ativo
foi apagado, e a tela que ofereceria a retirada responde 404. O `onDelete:
Restrict` da FK não alcança — soft delete é `UPDATE`, e o Postgres não vê
`DELETE` nenhum. É o mesmo ponto cego da invariante 6.

> **Provado por corrida.** `tests/estoque/corridas.test.ts` dispara cinco
> entregas de um estoque de três sem `await` entre elas: passam três `201` e
> dois `409`, e o disponível fecha em `0` — nunca em `-2`.
>
> **E por estado.** `tests/estoque/operacoes.test.ts` tenta apagar um ativo com
> 4 unidades instaladas, espera o 409 com o número, retira a peça e confere que
> o disponível volta inteiro.

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
ordem de consulta. Com ele, a operação certa fica evidente — é fusão, não vínculo
(D103) —, e é isso que a cascata de merge propõe antes de qualquer sugestão de
vínculo.

> `onDelete: SetNull` é o outro lado: apagar um ativo de verdade **não** leva
> junto a telemetria da máquina. O preço é que o vínculo se desfaz em silêncio, e
> é por isso que existe linha de `ActivityLog` para `UNLINK`.

### 13 — `sugestao_pendente_por_alvo`

```sql
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" ("kind", "endpointId",
    COALESCE("assetId", '000…'::uuid), COALESCE("targetUserId", '000…'::uuid),
    COALESCE("targetLocationId", '000…'::uuid), COALESCE("mergeIntoEndpointId", '000…'::uuid))
  WHERE "state" = 'PENDING';
```

**PARCIAL porque o histórico PRECISA repetir:** a mesma sugestão pode ter sido
recusada em março, substituída em abril e aceita em maio, e as três linhas contam
essa história. O que não pode repetir é o que está **esperando decisão**.

**`COALESCE` porque quatro das FKs de alvo são nuláveis**, e num índice único do
Postgres `NULL` não colide com `NULL` — sem ele, duas sugestões de vínculo para o
mesmo par (as duas com `targetUserId` nulo) passariam as duas, e o índice não
impediria nada.

O que ele protege não é o banco: é a **fila**. O job roda de hora em hora sobre a
frota inteira e reencontra as mesmas evidências; sem o índice, uma semana de
operação vira 168 cópias de cada sugestão, e a fila que deveria ser lida por uma
pessoa vira uma lista que ninguém abre duas vezes.

> **Provado em** `tests/descoberta/fila.test.ts`: três rodadas seguidas do job e a
> contagem de `PENDING` não cresce.

### 14 — `endpoint_user_daily` único por (máquina, conta, dia)

```prisma
@@unique([endpointId, userKey, day])
```

O D49 em forma de índice. A agregação por dia é garantida **pelo banco**, não pelo
`upsert` lembrar de acertar a chave — e a diferença aparece na fusão de máquinas,
que é o único lugar que move essas linhas de um endpoint para outro: sem o índice,
mover cegamente criaria duas linhas do mesmo dia para a mesma pessoa, e a contagem
de "em quantos dias ela apareceu" — que é o que decide se há posto compartilhado —
passaria a contar dobrado.

É também a forma do limite de privacidade: **em que dias e em que faixa de hora**,
nunca um rastro minuto a minuto. Uma linha por handshake seria um histórico de
presença de pessoa, que este sistema não se propõe a guardar, e teria a retenção de
90 dias protegendo um dado que não deveria existir nesse formato.

---

### 15 — O `slug` de um campo customizado é imutável

`server/domain/catalog/specs/custom-field.spec.ts` → `beforeWrite`

═══════════════════════════════════════════════════════════════════════════════

**Esta é a invariante que torna o `JsonB` da F9 seguro**, e ela existe porque o
D59 aceitou um preço declarado: **não há integridade referencial entre as chaves
do JSON e a tabela `custom_fields`**. Uma coluna por campo customizado daria essa
integridade e morreria no `migrate diff` seguinte (é o D7); uma tabela EAV daria
e transformaria a listagem num pivô. O JsonB é a escolha certa, e esta regra é o
que paga por ela.

O `slug` é o **nome da propriedade** dentro de `assets.customFields`, em N mil
linhas. Renomeá-lo é um `UPDATE` sobre a tabela inteira que teria que ser
transacional com a linha do campo — e um meio-caminho (o processo morre, o
`statement_timeout` corta) deixa metade dos ativos com a chave velha e metade com
a nova, **sem nada que acuse**: as duas são chaves válidas de um JSON válido, a
tela simplesmente deixa de mostrar o valor de metade da frota.

**Por que na aplicação:** a regra é *"mudou de X para Y?"* — precisa do valor
anterior. É a mesma forma da invariante 3, e a mesma razão de ela não caber num
CHECK.

**Por que não há migração em massa oferecida:** ela existiria para servir a um
caso que tem saída melhor. O `name` — que é o que aparece em toda tela — muda à
vontade; o `slug` é infraestrutura, e ninguém além de quem escreve
`?cf[ip_fixo]=` à mão precisa vê-lo. Uma regra de três linhas no lugar de um
script de migração e de um modo de falha.

> **Pelo mesmo motivo, trocar o conjunto de um ativo NÃO apaga as chaves que
> sobraram** (D60). Elas são dado do cliente, o conjunto antigo pode voltar, e
> mantê-las custa zero. A tela de detalhe as mostra marcadas como "de um conjunto
> anterior"; o formulário não as edita e a validação as ignora. Apagar dado do
> cliente porque um `<select>` mudou é a "limpeza" que ninguém pede e todos
> lamentam.

### 16 — A cifra de um campo não vira com valor gravado

`server/domain/catalog/specs/custom-field.spec.ts` → `beforeWrite`

**Os dois sentidos estragam, e estragam diferente:**

| Operação | O que aconteceria |
|---|---|
| ligar `encrypted` | os valores antigos ficam **em claro** dentro do JsonB com o sistema tratando-os como cifrados. A leitura os mostra crus (não casam com `enc:v1:`), e a rota de revelar responde 422 "não é cifrado" para um campo que a tela desenha com cadeado |
| desligar `encrypted` | os valores existentes continuam cifrados, e a tela passa a mostrar `enc:v1:e99fe939:…` como se fosse o valor |

**Por que não há recifragem em massa:** ela teria que decifrar e recifrar N mil
linhas numa transação, e o que falhasse no meio ficaria **ilegível** — não
"errado", ilegível. O AAD amarra cada valor à linha e ao campo onde ele mora
(D81 + `aadDoCampo`), então nem um `UPDATE` cruzado salvaria o que ficasse pelo
caminho.

A saída é a do slug: **criar outro campo**. E a contagem que sustenta o 409 usa
`?` do Postgres em SQL cru, porque o `path`/`not: DbNull` do Prisma tipado não
alcança o índice GIN — ver
[`FASE-9-PLANO-ITAM.md`](./FASE-9-PLANO-ITAM.md).

---

### 17 — Nunca sem administrador

```ts
// access/helpers/ultimo-administrador.ts, no FIM da transação
await assertSobraAdministrador(tx);
```

**A checagem roda DEPOIS da escrita, dentro da transação** — e é isso que a torna
completa. Prever se uma operação vai deixar o sistema sem administrador exigiria
simular a união de permissões para cada caminho (tirar a chave do grupo, apagar o
grupo, tirar a pessoa do grupo, desligar a pessoa, apagar a pessoa), e o quinto
caminho seria o esquecido. Aplicando e **contando depois**, há uma pergunta só:
*ainda existe alguém?* Se não, o `throw` desfaz tudo e nada aconteceu.

**Quem conta como administrador precisa poder ENTRAR**: `passwordHash` não nulo
(a base nasceu sem login — a maior parte dos cadastros existe só para receber
equipamento), `isActive`, e fora da lixeira. Um "administrador" que não faz login
não destrava nada.

**E a contagem reusa `unirPermissoes()`**, a mesma função do `preHandler`. Uma
consulta JsonB própria (`permissions: { path: ['access.manage'], equals: true }`)
seria uma segunda definição de "tem a permissão" — e no dia em que a união mudasse,
a checagem continuaria contando pela regra antiga.

> **O que esta invariante NÃO cobre, e por isso existe a linha de escape:** o
> caminho da tela. Grupo esvaziado por `psql`, restore parcial, ou a única conta com
> a chave que perdeu a senha E o segundo fator deixam o sistema de pé e **trancado**.
> A saída é `npm run acesso:administrador -- <login>`, que exige acesso ao servidor —
> e **não** uma rota de emergência, que seria uma rota concedendo `access.manage` sem
> ter `access.manage`.

---

### 18 — `api_tokens_userId_fkey`

```sql
ALTER TABLE "api_tokens"
  ADD CONSTRAINT "api_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
```

A coluna existia desde a F0 **sem** chave estrangeira: nada impedia um token
apontar para um uuid que nunca foi usuário. Não doía enquanto ninguém a preenchia;
o token pessoal (F11) é o primeiro a preencher.

**`Cascade`, e não `SetNull` como em `AuthEvent.userId`** — e a diferença entre os
dois diz o que cada tabela é. Um evento de autenticação é **registro**, e tem de
sobreviver ao cadastro que ele descreve: é justamente o que a auditoria vem
procurar. Um token é **poder**, e poder sem dono é uma credencial que autentica
como ninguém — `ownerType: 'USER'` com `userId` nulo passaria pela busca por
prefixo e pela conferência do segredo, e só quebraria depois, ao carregar a sessão.

⚠️ Isto vale para o `DELETE` de verdade. **Desligar** alguém é `isActive: false`
(soft), e o token continua existindo — por isso o desligamento o **revoga**
explicitamente, em vez de confiar na FK.

---

## O que **não** é invariante, e por isso não está aqui

- **`Asset.assignedToId` bate com a `Assignment` aberta.** É *cache*, não
  invariante: quem escreve nele é só o checkout/checkin, e ele saiu do
  `createAssetSchema`/`updateAssetSchema` justamente para que não exista um
  segundo escritor com quem divergir (`MODELO-POSSE.md`). A defesa é **não ter a
  operação**, não ter uma checagem.
- **`qty` de um item de estoque só muda pelo `adjust-quantity`.** Mesmo caso, uma
  fase depois: a chave **não é declarada** no `strictObject` do schema de edição,
  então o `PUT` com `qty` responde 422 sem que exista `if` nenhum a manter. Um
  CHECK ou trigger no banco não serviria — ele barraria também o próprio ajuste,
  que é quem tem o direito de escrever.
- **`disponivel` nunca é negativo.** Ele **pode** ser, e isso é de propósito: é o
  sinal de que a contagem física e a nominal brigaram (alguém criou linha de
  saída por fora, ou baixou `qty` no `psql`). Zerar o número esconderia a
  inconsistência que o alerta existe para mostrar. O que o sistema garante é não
  CRIAR o negativo sozinho — o ajuste recusa baixar abaixo do que já saiu
  (invariante 8, do outro lado).
- **A máscara da chave de produto bate com a chave.** Ela **não é coluna** — é
  derivada na leitura de detalhe, decifrando. Guardá-la ao lado da chave cifrada
  criaria um segundo lugar dizendo o mesmo fato, e ele divergiria no dia em que
  alguém escrevesse só um. É o D16 aplicado ao segredo.
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
- **A permissão efetiva de uma sessão bate com os grupos da pessoa.** Ela é
  DERIVADA a cada requisição, na mesma consulta que relê o usuário (D136) — não há
  cópia com que divergir. É o D16 aplicado ao acesso: materializar a união numa
  coluna exigiria recalculá-la a cada troca de grupo, e no dia em que o recálculo
  falhasse alguém continuaria alcançando o que já lhe foi tirado.
- **Quem sumiu do diretório está desligado.** Ele **não** está, e é o D78: a
  sincronização MARCA (`directoryMissingAt`) e uma pessoa decide. Um filtro LDAP
  mal escrito devolve "zero pessoas", e um job que desligasse por isso devolveria o
  inventário da empresa ao estoque numa madrugada.
- **Toda chave de `assets.customFields` corresponde a um campo cadastrado.** Ela
  **não** corresponde, e é de propósito (invariante 15, do outro lado): trocar o
  modelo de um ativo deixa as chaves do conjunto anterior no JSON, intactas. O
  que o sistema garante é não CRIAR chave desconhecida, e vale nos **dois** caminhos
  que escrevem a coluna: `validate-custom-fields` recusa com 422 o que não está no
  conjunto resolvido do ativo, e o preenchimento em massa
  (`bulk-fill-field.usecase.ts`) recusa o LOTE INTEIRO quando algum ativo
  selecionado não pede aquele campo — gravar chave desconhecida em 200 linhas de uma
  vez é o mesmo furo multiplicado. E o `countUsages` do campo soma os ativos com a
  chave presente para que apagar o campo não deixe órfão em silêncio.
- **O valor gravado ainda está na `listValues` do campo.** Ele pode não estar: a
  lista é editável depois, e valor que saiu dela **não é apagado**. A tela o
  mostra marcado como fora da lista, e o `<select>` o injeta como opção extra —
  senão ele cairia na primeira opção e o dado do cliente seria trocado por um
  default no primeiro render. É o D60 outra vez.

## Acrescentar uma invariante

1. Decida a coluna da tabela lá em cima. Na dúvida entre as duas: **banco**.
2. Se for de aplicação, ela mora no use-case **dentro da transação** de quem
   grava, nunca no controller — o controller não é o único caminho até o dado.
3. Escreva a mensagem antes do código. Se a mensagem não ensina o que fazer em
   seguida, a regra ainda não está entendida.
4. Acrescente a linha na tabela do começo do arquivo — e corrija o número no
   título dela. Referir-se a ela por "As onze" era o que fazia esta instrução
   apontar para um título que não existia mais a cada fase.
