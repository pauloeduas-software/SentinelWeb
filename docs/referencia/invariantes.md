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

## As quinze

> **A numeração é a original, e por isso salta.** O corte do ITAM levou as
> invariantes 7, 8, 15, 16 e 18 junto com as tabelas que elas defendiam
> (acessório, estoque, campo customizado, token de API); a segunda rodada levou a
> 14 junto com `EndpointUserDaily`, quando a reconciliação deixou de inferir
> pessoa pela conta do sistema operacional
> ([A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional));
> e a [AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas) levou a 10 e a 11 junto com a vaga numerada da licença, e trouxe a 22 e a 23.
> Renumerar as que ficaram quebraria as citações no código —
> `assert-retire-posse.usecase.ts` diz "Invariante 4", `license-count.helper.ts`
> diz "invariante 22" —, e um número que muda de significado é pior que um
> número que falta.

| # | Invariante | Onde | O que o usuário vê |
|---|---|---|---|
| 1 | Uma posse aberta por ativo | **banco** — índice único parcial | 409 `Este ativo já está entregue. Faça a devolução antes.` (a API confere antes; o `P2002` da corrida vira a mesma frase) |
| 2 | Uma ocupação aberta por (posto, pessoa) | **banco** — índice único parcial | 409 `Esta pessoa já ocupa este posto.` (idem) |
| 3 | O tipo de um status ou de uma categoria em uso não muda | **aplicação** — `status-label.spec.ts`, `category.spec.ts`, com a linha travada | 409 `Não é possível mudar o tipo: status em uso por 200 registros.` |
| 4 | Estado × posse: ativo entregue não fica `DEPLOYABLE` | **aplicação** — `assert-status-posse.usecase.ts` | 409 `"Disponível" é um status de estoque, e este ativo está entregue. Faça a devolução antes de mudar o status.` |
| 5 | A forma da posse: um alvo coerente, devolução depois da entrega — e só a posse **devolvida** de um posto excluído fica sem FK, com o nome por escrito | **banco** — dois `CHECK` | 409 `Registro já existe` (a API recusa antes, com frase própria) |
| 6 | Colaborador desativado ou na lixeira não tem posse direta, **licença**, **unidade de estoque** nem ocupação aberta | **aplicação** — 409 na desativação (`personSpec.beforeWrite`), na exclusão (`personSpec.motivoParaNaoExcluir`), no `checkout` e no cadastro de ocupante + trava de linha | 409 `Este colaborador ainda responde por 2 ativos, tem 1 licença (Office), está com 3 itens de estoque e ocupa 1 posto. Devolva o que está com ele e encerre as ocupações antes de excluir.` (ou *antes de desativar*), com as licenças como `refs` — a tela põe um link em cada uma |
| 9 | A forma da entrega de licença: o alvo é UM (pessoa **ou** ativo), a devolução vem depois da entrega, e toda entrega aponta para a licença | **banco** — dois `CHECK` e o `NOT NULL` de `licenseId` em `license_checkouts`, com a FK `Restrict` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 12 | Uma máquina é no máximo um ativo, e um ativo no máximo uma máquina | **banco** — `@unique` em `Endpoint.assetId` | 409 `Este ativo já está vinculado a outra máquina. Desfaça aquele vínculo antes, pela aba Máquina do ativo.` |
| 13 | A mesma sugestão não empilha na fila | **banco** — índice único parcial `sugestao_pendente_por_alvo` | nada: o job trata o `P2002` como "outro já criou" |
| 17 | Sempre existe alguém ativo que é `ADMIN` | **aplicação** — `assertSobraAdministrador()`, DEPOIS da escrita e dentro da transação, na edição e na exclusão de usuário | 409 `Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. Dê o cargo de Administrador a outra pessoa com login antes de seguir.` |
| 19 | No máximo um ativo por posto de trabalho | **aplicação** — duas portas: a entrega e a restauração da lixeira (`ativoDoPosto()`, com `FOR UPDATE` na linha do posto) | 409 `Este posto de trabalho já tem um ativo: ATV-00042 (Dell OptiPlex). Faça a devolução dele antes.` |
| 20 | Ativo baixado não tem posse aberta nem licença | **aplicação** — duas portas: a baixa (`assertSemPosseParaBaixa` e a contagem de licenças) e a entrega (`checkout-asset`, `checkout-license`), as duas com o ativo travado | 409 `ATV-00042 teve baixa em 15/10/2026 e não pode ser entregue. Desfaça a baixa antes.` |
| 21 | Localização ou posto desativado não recebe nada novo | **aplicação** — `assertLocalRecebe()` em cada porta que guarda (ativo, item, posto) e `assertPostoRecebe()` em cada porta que entrega ou ocupa, com a linha travada | 409 `"Mesa 1" está desativado e não recebe entrega nova.` |
| 22 | O que está em uso nunca passa da quantidade comprada | **aplicação** — a entrega e a edição contam com a linha da licença travada (`lock-license.usecase.ts`) | 409 `Sem licença livre em "Office 2024": 5 compradas, 5 em uso. Devolva uma entrega ou aumente a quantidade comprada.` |
| 23 | Uma entrega aberta por alvo e licença — e a mesma chave em uma entrega aberta só | **banco** — três índices únicos parciais: um por alvo e um pela chave | 409 `Laura Souza já está com "Office 2024".` / `Esta chave já está em outra entrega aberta de "Office 2024".` (a API confere antes) |

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

**Onde está:** no bloco escrito à mão de `prisma/migrations/0_init/migration.sql`.
Parcial (`WHERE "checkinAt" IS NULL`) porque o histórico fechado é ilimitado: o
mesmo ativo pode ter sido entregue cem vezes.

> **A mensagem é a do use-case, nos dois caminhos.** O checkout confere a posse
> aberta antes e responde *"Este ativo já está entregue. Faça a devolução
> antes."*; quando a corrida passa pela conferência e é o índice que recusa, o
> `P2002` é capturado ali mesmo e vira a mesma frase. O `Registro já existe`
> genérico do `error-handler` não chega a quem clicou em "Entregar". O cadastro
> de ocupante faz o mesmo com a invariante 2 (*"Esta pessoa já ocupa este
> posto."*).

### 2 — `workstation_occupants_um_aberto_por_pessoa_posto`

```sql
CREATE UNIQUE INDEX "workstation_occupants_um_aberto_por_pessoa_posto"
  ON "workstation_occupants"("workstationId", "personId") WHERE "endedAt" IS NULL;
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

A mesma guarda existe em `category.spec.ts` — contando modelos, ativos, itens
de estoque **e licenças**, lixeira inclusive — e **aqui é mais grave**: o tipo da
categoria diz a que módulo o registro pertence; o tipo do status decide se o
equipamento pode ser entregue a alguém.

**Com a linha travada.** A troca de tipo trava a linha `FOR UPDATE` antes de
contar, e todo leitor do tipo (cadastro de licença, de item de estoque, de
modelo, de ativo, entrega, devolução) a lê `FOR SHARE`
(`catalog/helpers/catalog-lock.helper.ts`). Sem isso, um cadastro que já tinha
lido o tipo velho gravava depois da contagem e a guarda era contornada por uma
corrida.

> **A guarda vale o que a contagem enxerga.** Uma contagem que esquece uma
> tabela deixa a guarda aberta sem avisar: ela responde "zero em uso" e a troca
> de tipo passa.
>
> Contar é a regra inteira aqui — `countUsages` de categoria e de localização
> precisa conhecer **toda** tabela que aponta para elas, e as duas do estoque
> apontam (`StockItem` para categoria e localização, `StockMovement` para
> localização). Uma tabela
> nova reabre isto em silêncio; é o preço de uma regra que é uma soma.

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

**Por que com o ativo travado:** ela lê a assignment aberta, e estar dentro da
transação não basta — em READ COMMITTED a entrega simultânea confirmava a posse
depois da guarda olhar, e o `UPDATE` da edição gravava o status de estoque por
cima. O `updateAsset` e o checkout travam a linha do ativo antes de ler
(`lock-asset.usecase.ts`), e o status escolhido é lido `FOR SHARE`. A devolução
também trava o ativo, e só fecha a posse que ainda está ABERTA: duas devoluções
simultâneas, ou uma devolução atrasada depois de uma entrega nova, não fecham a
posse errada nem gravam "Disponível" num ativo entregue.

---

### 5 — A forma da `Assignment`

```sql
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
     ("targetType" = 'PERSON' AND "targetPersonId" IS NOT NULL AND "targetWorkstationId" IS NULL)
  OR ("targetType" = 'WORKSTATION' AND "targetPersonId" IS NULL AND (
          "targetWorkstationId" IS NOT NULL
       OR ("checkinAt" IS NOT NULL AND "targetWorkstationName" IS NOT NULL)
     ))
);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);
```

Duas afirmações sobre a mesma linha: o alvo polimórfico é **coerente** (uma FK
preenchida, e é a que casa com o `targetType`), e a posse **não fecha antes de
abrir**.

**A exceção é o posto excluído** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira),
[Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)): o posto segue a regra do status e
sai quando nada está nele agora. A posse JÁ DEVOLVIDA para ele perde a FK e
guarda o nome por escrito em `targetWorkstationName` — e só a devolvida: a aberta
aponta sempre para o posto. A saída de estoque (`stock_movements_forma`) e a
ocupação (`workstation_occupants_posto_presente`) têm a mesma exceção, com a mesma
condição.

**Por que no banco, se o `assertAlvoCoerente` já valida:** porque a validação da
aplicação defende quem passa pela API, e esta tabela tem outros escritores — o
seed, um `psql` à mão, uma migração futura. Uma linha com `targetType: 'PERSON'` e
`targetWorkstationId` preenchido é aceita pelo Postgres sem CHECK, e a Camada 3 a resolve como *"sem responsável"* — em
silêncio, que é o pior jeito de um equipamento sumir de vista.

A `Assignment` era a **única** tabela do modelo de posse sem CHECK: a ocupação é
defendida pelo índice único parcial (#2) e a entrega de licença tem os CHECKs
da #9. A tabela que carrega a Camada 1 ficaria a mais
frouxa das três.

**`>=` e não `>`** na data: entrega e devolução no mesmo instante é real — é a
devolução no mesmo dia da entrega, com dois relógios que podem coincidir no
milissegundo.

**Onde está:** no bloco escrito à mão da migration `0_init` — o da coerência já
na forma de dois alvos ([K](../decisoes/posse.md#k--o-alvo-asset-sai-da-posse)).
A aplicação continua recusando antes, com a frase que ensina o modelo; o CHECK é
a rede de baixo.

### 6 — Desativado não fica com posse aberta

`server/domain/person/use-cases/lock-person.usecase.ts`, chamada como **primeira**
trava da transação na edição do colaborador (`personSpec.beforeWrite`),
`checkoutAsset` (alvo `PERSON`), `checkoutLicense` (alvo `PERSON`), `checkoutStock`
(alvo `PERSON`) e `addWorkstationOccupant`.

**QUATRO PONTAS, e são as quatro que fazem alguém responder por equipamento:**
ativo no nome (`Assignment` alvo `PERSON`), licença no nome
(`LicenseCheckout.assignedPersonId`), unidade de estoque no nome
(`StockMovement` de SAIDA alvo `PERSON`) e ocupação de posto (`WorkstationOccupant`)
— esta última porque ocupante responde pelos ativos e pelo estoque do posto por
derivação da Camada 3. A pergunta que decide se algo entra aqui não é *"tem
tabela própria?"*, é ***"alguém responde por isto quando a pessoa sai?"***.

**Desativar e excluir contam as quatro pontas abertas.** A edição que desliga
`isActive` e a exclusão contam as quatro (`count-person-posse.usecase.ts`), com
a trava antes, e o 409 diz quantas de cada — a frase só troca o fim, *"…antes
de excluir"* ou *"…antes de desativar"*. Nenhuma das duas fecha nada sozinha:
quem sai da empresa some das listas de escolha, e a posse que ficasse aberta
não teria mais quem a devolvesse pela tela.

**Excluir manda para a lixeira** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)): o histórico — o que já foi devolvido —
não segura, porque a linha da pessoa fica e continua sendo o que o histórico
dos ativos aponta.

**As três guardas de leitura são furáveis por corrida**, e a trava é a metade que
faltava:

```
T1 (entrega)       lê a pessoa   → isActive: true, segue
T2 (desativação)   lê as posses  → não há nenhuma, segue
T2                 grava isActive = false                 → COMMIT
T1                 cria a Assignment                      → COMMIT
```

Resultado: **desativado com posse aberta**. Os dois caminhos fizeram exatamente o
que está escrito neles. Em `READ COMMITTED` — o padrão do Postgres e o nosso —
nenhum `if` pega isso: as duas transações leem um estado consistente de antes, e
nenhuma enxerga o que a outra ainda não confirmou.

E o estado é **invisível**: nada falha, nada é logado como erro, e a pessoa some
dos seletores levando um equipamento no nome.

> **A assimetria que existia até o corte do ITAM:** `checkoutAsset` recusava
> entregar ativo a quem está desativado e o cadastro de ocupante só conferia
> existência. Como responsável de posto é DERIVADO da ocupação, a brecha reabria
> por fora do checkout exatamente a responsabilidade que a desativação fecha — e
> a fila de reconciliação chegava a oferecer o botão que fazia isso, porque o
> aceite de uma sugestão de ocupação passava por ali. Hoje as duas recusam com
> 409, e a fila nem propõe mais ocupação: o tipo `OCCUPANCY` saiu com
> [A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional).

**A saída** é serializar as duas na linha que as duas disputam: `SELECT … FOR
UPDATE` na linha da pessoa (`people`). A segunda transação espera a primeira
confirmar, e a releitura enxerga o estado novo — aí as guardas que já existem
funcionam.

**Ordem de travamento: pessoa antes de ativo**, em todo caminho que trave os
dois. Duas transações que travam os mesmos recursos em ordens opostas travam uma
à outra, e o Postgres mata uma com erro. É por isso que a chamada é a **primeira**
trava de cada transação, antes de ler ativo e antes de contar posse.

**Por que na aplicação:** um CHECK não faz join, e a regra cruza `people`,
`assignments` e `workstation_occupants`. O que o banco oferece aqui é a trava, não
a verificação.

> **A corrida é testada, não argumentada.** `tests/corridas/posse.test.ts`
> dispara duas entregas do mesmo ativo e duas ocupações do mesmo posto sem
> `await` entre elas, e a asserção não é "deu certo": é *exatamente UMA passou, e
> o banco tem exatamente UMA linha*.

---

### 9 — A forma da entrega de licença

```sql
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_alvo_xor"
  CHECK (num_nonnulls("assignedPersonId", "assignedAssetId") = 1);
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_devolucao_nao_antecede"
  CHECK ("checkinAt" IS NULL OR "checkinAt" >= "checkoutAt");
-- e "licenseId" UUID NOT NULL, com a FK ON DELETE RESTRICT
```

Duas colunas de alvo nuláveis admitem quatro estados, e **dois são mentira**: as duas
preenchidas ("esta licença está com a Laura E com o notebook") e nenhuma preenchida
("está em uso por ninguém"). Nenhum dos dois dá erro sozinho — a licença sai da conta de
livres sem aparecer em lista nenhuma: paga, indisponível e invisível.

É o irmão da forma da posse (#5), com uma diferença: aqui **não há discriminante** para
conferir, porque com dois alvos possíveis a FK preenchida já diz qual é.

O outro é a forma no tempo: a devolução não antecede a entrega (`>=`, como na posse). E
**toda entrega aponta para a licença** — aberta ou devolvida: a licença que já foi entregue não
se exclui, se encerra, e a FK `Restrict` é o que impede excluir por fora
([AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)).

A aplicação recusa antes, com 422 e a frase que ensina o modelo (*"Posto de trabalho não é
alvo de licença — entregue ao ativo que está na mesa"*, D39); os CHECKs são a rede para quem
não passa pelo use-case.

> **Provado em** `tests/licencas/invariantes.test.ts`, por `INSERT` cru — como a #5 em
> `tests/invariantes/check-assignment.test.ts`.

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
simular cada caminho (mudar o cargo, desativar a pessoa, apagar a pessoa), e o
terceiro seria o esquecido. Aplicando e **contando depois**, há uma pergunta só:
*ainda existe alguém?* Se não, o `throw` desfaz tudo e nada aconteceu.

Um caminho novo que mexa em cargo herda a proteção só por chamar isto no fim — e
foi o que aconteceu com o `isActive` editável: a checagem roda em TODO `update`
de usuário, não só quando `role` vem no corpo, então desativar o último
administrador responde 409 sem ninguém ter escrito uma linha para isso.

**E o terceiro caminho foi, de fato, o esquecido.** Até a varredura
[Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai),
só a edição chamava a checagem: excluir o único administrador — inclusive a si
mesmo — passava, e o sistema ficava trancado por fora. Hoje `deleteUser` a chama
no fim da transação, como a edição.

**O último administrador não alcança mais a rede sozinho** desde o
[W](../decisoes/acesso.md#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo): desativar
e excluir a si mesmo são recusados antes. Ela continua cobrindo a corrida — dois
administradores tirando um ao outro no mesmo instante, cada um contando "sobra eu" —, que
`travarAdministracao` põe em fila. Provado em `tests/invariantes/permissao.test.ts`.

**Quem conta como administrador precisa poder ENTRAR**: `isActive`,
`role = ADMIN` e a linha existir — excluir apaga (W). A senha não entra na conta porque todo usuário
tem uma — `passwordHash` é obrigatório desde
[U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos).

> **O que esta invariante NÃO cobre, e por isso existe a linha de escape:** o
> caminho da tela. Um restore parcial deixa o sistema de pé e **trancado**, e a
> saída é `npm run acesso:administrador -- <e-mail>`, que exige acesso ao
> servidor — e **não** uma rota de emergência, que seria uma rota concedendo
> `ADMIN` sem ser `ADMIN`. O comando só dá o cargo a um usuário que já existe:
> se a única conta `ADMIN` perdeu a senha, a troca é direto no banco.

---

### 19 — No máximo um ativo por posto de trabalho

```ts
// workstation/helpers/ativo-do-posto.helper.ts, nas duas portas (entrega e
// restauração da lixeira), dentro da transação
const ocupante = await ativoDoPosto(tx, workstationId, assetId);
if (ocupante) throw new AppError(jaTemAtivo(ocupante), 409);
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

**Por que na aplicação:** a regra cruza `assignments` e `assets` (o `deletedAt`
do ativo). Não é a forma nem a unicidade de uma tabela só — o índice único da
posse aberta é por ativo, não por posto —, então não há índice que a expresse.
É o mesmo argumento da invariante 6.

**E por isso ela trava a linha do posto.** Estar dentro da transação não basta:
em READ COMMITTED duas entregas simultâneas de dois ativos ao mesmo posto leem
as duas um estado de antes, nenhuma enxerga a posse que a outra não confirmou, e
as duas passam. É o mesmo furo que a invariante 6 fecha com `travarPessoa`, e
nenhum `if` o pega. Sem rede no banco, a serialização é explícita:
`SELECT id FROM workstations WHERE id = $1 FOR UPDATE` antes da leitura, na linha
que as duas transações disputam — depois de travar o ativo, que é a ordem do
grafo de travas (`lock-asset.usecase.ts`).

**São DUAS portas, e nenhuma é redundante:**

| porta | o que ela impede |
| --- | --- |
| `checkout-asset.usecase.ts` | entregar ao posto um segundo ativo |
| `restore-asset.usecase.ts` | **restaurar da lixeira** um ativo cuja posse aberta aponta para um posto que, enquanto ele estava fora, recebeu outro |

Houve uma terceira, a da **marca**: enquanto o posto era uma localização com
`isWorkstation`, marcar como posto uma sala que já tinha dois ativos contornava
a entrega. Ela saiu com a marca
([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)):
o posto nasce posto, e só ele recebe entrega.

Sem a segunda, seria contornável pela lixeira: o `delete-asset` só carimba
`deletedAt` e **não fecha a posse**, e a entrega ignora o ativo na lixeira de
propósito — um ativo que nenhuma tela mostra não pode trancar a mesa.
Juntas, as duas decisões abrem o caminho: a vaga é ocupada enquanto o ativo
está na lixeira, e restaurá-lo o devolve a uma mesa que já não tem lugar para
ele. A porta reconfere na volta, com o mesmo helper e a mesma frase.

**O vínculo de máquina NÃO é porta**, e já foi: enquanto "computador" era
"ativo com máquina vinculada", entregar o desktop sem agente e vincular depois
contornava a entrega, e o vínculo tinha de reconferir. Com a regra sobre o
ativo, a vaga é decidida na entrega e o vínculo só muda o que a ficha mostra.

**Note o que ela NÃO proíbe:** vários ocupantes no posto, que são o desenho da
Camada 2; dois ativos **guardados** numa localização — a sala de reunião e o
depósito não recebem entrega, e o que fica guardado neles não tem limite; e o
estoque na mesa, que não é ativo. **Posto sem ativo continua válido**: a regra
é "no máximo um", não "exatamente um". (O `postoVago` é outra coisa, e não tem
relação com esta invariante: ele é posto **sem ocupante** — gente, não máquina.)

> **A regra é testada, não argumentada.** `tests/invariantes/ativo-por-posto.test.ts`
> cobre a porta da entrega sem agente, o que libera a vaga e a porta da
> restauração; `tests/descoberta/vincular-e-entregar.test.ts` cobre a entrega com
> agente e prova que desvincular a máquina NÃO libera a vaga. **A corrida
> também:** `tests/corridas/ativo-por-posto.test.ts` dispara duas entregas
> simultâneas ao mesmo posto e exige que exatamente uma entre.

---

### 20 — Ativo baixado não tem posse aberta

```ts
// asset/use-cases/retire-asset.usecase.ts — a porta da BAIXA
await travarAtivoOuFalhar(tx, id);
await assertSemPosseParaBaixa(tx, id, antes.assetTag);

// assignment/use-cases/checkout-asset.usecase.ts — a porta da ENTREGA
if (ativo.retiredAt) throw new AppError(`${ativo.assetTag} teve baixa em …`, 409);
```

"Vendido" e "na mão da Laura" não podem ser verdade ao mesmo tempo. Se fossem, o
equipamento sumiria do inventário continuando com ela, e a devolução — que
registra em que estado ele voltou e quem recebeu — não aconteceria.

**São duas portas, uma em cada sentido:**

| porta | o que ela impede |
| --- | --- |
| `retire-asset.usecase.ts` | dar baixa em ativo **entregue** — `Faça a devolução antes.` — ou que **tem licença** — `Devolva pela tela de Licenças antes de dar baixa.` |
| `checkout-asset.usecase.ts` | **entregar** ativo baixado — e isso vale com **qualquer** status, porque a baixa não mexe no status: um vendido pode estar "Disponível" |

A entrega de **licença** a ativo (`checkout-license.usecase.ts`) recusa o baixado
pelo mesmo motivo: a licença ficaria presa a uma máquina que não existe mais.

**Bloqueia, nunca fecha a posse sozinha** — o mesmo argumento da invariante 4.

**Por que na aplicação:** cruza `assets.retiredAt` com `assignments`, e o valor
está na mensagem. **E por isso trava:** a baixa e a entrega travam a linha do
ativo antes de ler (`lock-asset.usecase.ts`); sem a trava, as duas liam "sem
posse" e "sem baixa" e o ativo terminava baixado e entregue.

**Desfazer a baixa** (`unretire-asset.usecase.ts`) não tem guarda: um ativo que
volta ao patrimônio não contradiz nada. O que é a baixa e como ela aparece na
tela está em [`baixa.md`](baixa.md).

> **Testado:** `tests/invariantes/posse.test.ts` (o baixado não é entregue;
> desfeita a baixa, volta a poder) e `tests/corridas/posse.test.ts` (baixa ×
> entrega do mesmo ativo, várias rodadas, nunca os dois).

---

### 21 — Localização ou posto desativado não recebe nada novo

```ts
// catalog/helpers/catalog-lock.helper.ts
await assertLocalRecebe(tx, locationId, 'ativo novo');            // 404 ou 409
await assertPostoRecebe(tx, workstationId, 'entrega nova', 'UPDATE');
```

A localização e o posto com algo neles **agora** não se excluem
([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira),
[Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)). Desativar
(`isActive = false`) é outra coisa: continuam na lista, e desativados não
**recebem** nada novo. O que já está lá fica — desativar não devolve nem encerra
nada, igual ao colaborador desativado.

**As portas da localização** — o que passa a ficar GUARDADO nela: `create-asset`
e `update-asset` (o local do ativo), `create-stock-item` e `update-stock-item`
(o local de guarda do item de estoque) e o cadastro do posto
(`workstationSpec.beforeWrite`, o posto novo ou que se muda para ela) — nas
edições, só quando o local **muda**: o formulário reenvia todo campo.

**As portas do posto** — o que ele RECEBE: `checkout-asset` (entrega),
`checkout-stock` (saída de estoque) e `add-workstation-occupant` (ocupante).

**Por que na aplicação:** depende do estado do local ou do posto no momento da
escrita, e cruza tabelas. **E por isso trava:** a desativação trava a linha
(`FOR NO KEY UPDATE`), e cada porta a lê `FOR SHARE` — a entrega de ativo,
`FOR UPDATE`, porque logo depois trava o mesmo posto pela invariante 19.

O mesmo princípio vale para categoria, status, fabricante e modelo desativados —
não são **escolhidos** de novo (`assertEscolhaAtiva`) —, mas ali é regra de
formulário, não fato sobre o lugar: está em
[`configuracoes.md`](configuracoes.md).

> **Testado:** `tests/invariantes/localizacao.test.ts` e `tests/invariantes/posto.test.ts`.

---

### 22 — O que está em uso nunca passa da quantidade comprada

A conta da licença é `livres = seatsTotal − em uso`, sobre as linhas de
`license_checkouts` ([AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)), e esta é a invariante que a mantém de pé. O
banco **não garante sozinho**: ela cruza a licença com as entregas, e um CHECK não enxerga a
outra tabela.

Mora em quem conta e grava: a **entrega** (`checkout-license.usecase.ts`) e a **edição** que
reduz a quantidade (`update-license.usecase.ts`). As duas contam com a linha da licença travada
(`lock-license.usecase.ts`): sem a trava, duas entregas liam "1 livre" e as duas gravavam, e
a redução contava "2 em uso" enquanto uma entrega gravava a terceira.

**A ordem das travas é alvo → licença**, na entrega, o caminho que trava os dois. A devolução
trava só a linha da entrega — ela só diminui o que está em uso, e travar a licença depois da
entrega fecharia um ciclo com a troca de chave, que trava a licença e depois a linha da
entrega.

**A frase diz quantas estão em uso**, e que devolver libera: `Não dá para reduzir "Office
2021" para 6: 7 estão em uso. Devolva para liberar.`

> **Provado em** `tests/licencas/corridas.test.ts` (oito entregas a oito pessoas diferentes
> numa licença de três: passam três, e o banco tem três abertas; a redução contra a entrega
> nunca deixa a conta passar do contrato) e `tests/licencas/operacoes.test.ts` (o piso e a
> frase).

### 23 — Uma entrega aberta por alvo e licença — e uma chave por entrega aberta

```sql
CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_pessoa"
  ON "license_checkouts"("licenseId", "assignedPersonId")
  WHERE "checkinAt" IS NULL AND "assignedPersonId" IS NOT NULL;
CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_ativo"
  ON "license_checkouts"("licenseId", "assignedAssetId")
  WHERE "checkinAt" IS NULL AND "assignedAssetId" IS NOT NULL;
CREATE UNIQUE INDEX "license_checkouts_chave_aberta_unica"
  ON "license_checkouts"("licenseId", "productKey")
  WHERE "checkinAt" IS NULL AND "productKey" IS NOT NULL;
```

O mesmo computador ou colaborador não fica com a mesma licença duas vezes. Computador de
mesa, notebook e pessoa nunca precisam de duas; o caso que pediria (servidor licenciado por
núcleo) não é deste inventário, e se vier é um campo de quantidade na entrega, não uma segunda
linha.

**Dois índices, um por alvo**: num índice só, com uma das colunas sempre nula, o Postgres
nunca acusaria colisão. A aplicação confere antes, com o nome do alvo na frase; o índice é a
rede.

**No passado também.** A entrega com dia passado não fica antes do dia em que o mesmo alvo
devolveu esta licença (422) — senão o histórico mostraria o alvo com ela duas vezes no mesmo
período. O índice só enxerga as abertas; essa conferência é só da aplicação, com o alvo
travado. No próprio dia da devolução a entrega passa, gravada um milissegundo depois dela.

**A chave da entrega** segue a mesma lógica: a mesma chave não fica em duas entregas abertas da
licença. A entrega sem chave (licença de volume) e a devolvida ficam fora do índice. A entrega
e a troca de chave conferem antes, com a licença travada.

> **Provado em** `tests/licencas/invariantes.test.ts` (o `INSERT` cru da segunda aberta é
> recusado; a devolvida não conta), `tests/licencas/operacoes.test.ts` e
> `tests/licencas/chave.test.ts` (os 409 da API).

---

## O que **não** é invariante, e por isso não está aqui

- **"Quem responde" numa coluna do ativo bate com a `Assignment` aberta.** Não
  há coluna: o `Asset.assignedToId`, que era cache do caso pessoa, saiu do schema
  ([Q](../decisoes/escopo.md#q--a-varredura-do-código-morto-o-que-não-tem-leitor-sai)),
  e com ele a pergunta de se ele batia. A defesa é **não ter a coluna**, não ter
  uma checagem (`modelo-de-posse.md`).
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
- **O cargo efetivo de uma sessão bate com a coluna.** Ele é LIDO a cada
  requisição, na mesma consulta que relê o usuário (D136/D148) — não há cópia com
  que divergir. É o D16 aplicado ao acesso: guardar o cargo no token exigiria
  reemitir a sessão a cada troca, e no dia em que a reemissão falhasse alguém
  continuaria alcançando o que já lhe foi tirado.
- **A fila de sugestões não fala de gente.** Desde
  [A](../decisoes/reconciliacao.md#a--a-reconciliação-deixa-de-inferir-pessoa-pela-conta-do-sistema-operacional)
  ela só propõe vínculo entre máquina e ativo (`SuggestionKind` tem só `LINK`):
  não há sugestão sobre pessoa desativada para recusar nem para invalidar. O que
  `invalidate-suggestions.usecase.ts` encerra como `SUPERSEDED` é a pendente cuja
  máquina, ou cujo ativo, ganhou vínculo por outro caminho — e isso é regra de
  PROPOSTA, não fato sobre linhas gravadas: entre duas rodadas do job, a pendente
  obsoleta existe no banco.

---

## Para acrescentar uma

O passo a passo está em
[`../guias/acrescentar-uma-invariante.md`](../guias/acrescentar-uma-invariante.md) — incluindo a
regra de corrigir o número no título desta página, que é o que mantinha a instrução apontando
para um título que não existia mais a cada fase.
