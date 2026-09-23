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

## As oito

| # | Invariante | Onde | O que o usuário vê |
|---|---|---|---|
| 1 | Uma posse aberta por ativo | **banco** — índice único parcial | 409 `Registro já existe` |
| 2 | Uma ocupação aberta por (posto, pessoa) | **banco** — índice único parcial | 409 `Registro já existe` |
| 3 | O tipo de um status em uso não muda | **aplicação** — `status-label.spec.ts` | 409 `Não é possível mudar o tipo: status em uso por 200 registros.` |
| 4 | Estado × posse: ativo entregue não fica `DEPLOYABLE` nem `ARCHIVED` | **aplicação** — `assert-status-posse.usecase.ts` | 409 `"Pronto p/ Uso" é um status de estoque, e este ativo está entregue. Faça a devolução antes de mudar o status.` |
| 5 | A forma da posse: um alvo coerente, nunca a si mesmo, devolução depois da entrega | **banco** — três `CHECK` | 409 `Registro já existe` (a API recusa antes, com frase própria) |
| 6 | Colaborador desligado ou na lixeira não tem posse direta, unidade de acessório direta nem ocupação aberta | **aplicação** — 409 no `DELETE` + trava de linha no `offboard`/`checkout` | 409 `Este colaborador ainda responde por 2 ativos, está com 1 acessório e ocupa 1 posto. Faça o desligamento antes de excluir.` |
| 7 | O alvo de uma entrega de acessório é UM, e é o que casa com o `targetType` | **banco** — CHECK `accessory_checkout_alvo_xor` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 8 | Nenhuma saída de estoque passa do disponível | **aplicação** — `COUNT` + `SELECT … FOR UPDATE` na linha-pai, dentro da transação | 409 `Sem unidade suficiente deste acessório: 0 disponível(is) de 5.` |

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
- **Só `DEPLOYABLE` libera checkout.** É regra de fluxo do checkout (F4), não
  fato sobre linhas já gravadas.
- **Validação de formato** (uuid, tamanho, enum) — é do `zod`, na borda.

## Acrescentar uma invariante

1. Decida a coluna da tabela lá em cima. Na dúvida entre as duas: **banco**.
2. Se for de aplicação, ela mora no use-case **dentro da transação** de quem
   grava, nunca no controller — o controller não é o único caminho até o dado.
3. Escreva a mensagem antes do código. Se a mensagem não ensina o que fazer em
   seguida, a regra ainda não está entendida.
4. Acrescente a linha na tabela "As oito".
