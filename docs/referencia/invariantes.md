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

## As dezoito

> **A numeração salta de propósito.** Invariante que saiu não volta, e as que ficaram não se
> renumeram: o código cita os números, e um número que muda de significado é pior que um número
> que falta.

| # | Invariante | Onde | O que o usuário vê |
|---|---|---|---|
| 1 | Uma posse aberta por ativo | **banco** — índice único parcial | 409 `Este computador já está entregue. Faça a devolução antes.` (a API confere antes; o `P2002` da corrida vira a mesma frase) |
| 2 | Uma ocupação aberta por (posto, pessoa), e as passadas da mesma pessoa no mesmo posto não se sobrepõem | **banco** — índice único parcial; o passado, **aplicação** — o início não antecede o último fim (`add-workstation-occupant`, com a pessoa travada) | 409 `Este colaborador já é responsável por este posto.` (idem); 422 `A entrada (10/02/2026) não pode ser antes da última saída de Laura deste posto (10/03/2026).` |
| 3 | O tipo de um status ou de uma categoria em uso não muda | **aplicação** — `status-label.spec.ts`, `category.spec.ts`, com a linha travada | 409 `Não é possível mudar o tipo: status em uso por 200 registros.` |
| 4 | Estado × posse: ativo entregue não fica `DEPLOYABLE` | **aplicação** — `assert-status-posse.usecase.ts` | 409 `"Disponível" é um status de estoque, e este computador está entregue. Faça a devolução antes de mudar o status.` |
| 5 | A forma da posse: um alvo coerente, devolução depois da entrega — e só a posse **devolvida** de um posto excluído fica sem FK, com o nome por escrito | **banco** — dois `CHECK` | 422 com frase própria, porque a API recusa antes; quem escreve direto no banco (seed, `psql`) recebe o erro do `CHECK` |
| 6 | Colaborador desativado ou na lixeira não tem posse direta, **licença**, **unidade de estoque** nem ocupação aberta | **aplicação** — 409 na desativação (`personSpec.beforeWrite`), na exclusão (`personSpec.motivoParaNaoExcluir`), no `checkout` e no cadastro de ocupante + trava de linha | 409 `Este colaborador ainda responde por 2 computadores (ATV-00012 e ATV-00013), 1 licença (Office), 3 unidades de estoque (Mouse USB ×2 e Teclado) e 1 posto (Mesa 1). Devolva o que foi entregue a ele e registre a saída dele do posto antes de excluir.` (ou *antes de desativar*), com os computadores, as licenças, os itens e os postos como `refs` — a tela põe um link em cada um |
| 9 | A forma da entrega de licença: o alvo é UM (pessoa **ou** ativo), a devolução vem depois da entrega, e toda entrega em uso aponta para a licença | **banco** — três `CHECK` em `license_checkouts`, com a FK `Restrict` | 422 com o campo que falta (a API recusa antes, com frase própria) |
| 12 | Uma máquina é no máximo um ativo, e um ativo no máximo uma máquina | **banco** — `@unique` em `Endpoint.assetId` | 409 `Este computador já está vinculado a outra máquina. Desfaça aquele vínculo antes, em Descobertas.` |
| 13 | A mesma sugestão não empilha na fila | **banco** — índice único parcial `sugestao_pendente_por_alvo` | nada: o job trata o `P2002` como "outro já criou" |
| 17 | Sempre existe alguém ativo que é `ADMIN` | **aplicação** — `assertSobraAdministrador()`, DEPOIS da escrita e dentro da transação, na edição e na exclusão de usuário | 409 `Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. Mantenha outra conta de Administrador ativa antes de seguir.` |
| 19 | No máximo um ativo por posto de trabalho, também no passado | **aplicação** — a porta da entrega (`ativoDoPosto()`, com `FOR UPDATE` na linha do posto), que também não começa antes da última devolução no posto; **banco** — índice único parcial `assignments_um_aberto_por_posto` | 409 `Este posto de trabalho já tem um computador: ATV-00042 (Dell OptiPlex). Faça a devolução dele antes.`; 422 `A entrega (01/03/2026) não pode ser antes da última devolução no posto Mesa 1: ATV-00042 saiu dele em 10/06/2026, e o posto tem um computador por vez.` |
| 20 | Ativo baixado ou na lixeira não tem posse aberta, licença, componente nem máquina | **aplicação** — quatro portas: a baixa e a lixeira (`assertSemPosse`, as contagens de licenças e de componentes e `assertSemMaquina`), a entrega (`checkout-asset`, `checkout-license`, `checkout-stock`) e o vínculo (`link-endpoint-asset`), todas com o ativo travado | 409 `ATV-00042 teve baixa em 15/10/2026 e não pode ser entregue. Reverta a baixa antes.` |
| 22 | O que está em uso nunca passa da quantidade comprada | **aplicação** — a entrega e a edição contam com a linha da licença travada (`lock-license.usecase.ts`) | 409 `Sem licença livre em "Office 2024": 5 compradas, 5 em uso. Devolva uma entrega ou aumente a quantidade comprada.` |
| 23 | Uma entrega aberta por alvo e licença | **banco** — dois índices únicos parciais, um por alvo. No passado, a entrega que se sobrepõe à última devolução do mesmo alvo é só da **aplicação** (422) | 409 `"Office 2024" já está entregue a Laura Souza.` (a API confere antes) |
| 24 | A chave da entrega é uma das chaves da licença; nenhuma chave vai para mais entregas abertas do que cobre; e as chaves cobrem no máximo o que foi comprado | **banco** — a FK composta (chave, licença) e os `CHECK`s da chave. A conta de cada chave e a soma contra o comprado são da **aplicação**, com a licença travada | 409 `Esta chave já está em outra entrega aberta de "Office 2024". Escolha outra.` / 422 `As chaves cobrem 12, mais do que 10 compradas em "Office 2024". …` |
| 25 | A forma da entrega de estoque, e o que está em uso nunca passa do total | **banco** — o CHECK do total (`stock_items_qty_nao_negativa`), os cinco `CHECK` da linha e a FK `Restrict` para o item. A conta contra o total é da **aplicação**, com a linha do item travada | 409 `Sem unidade disponível de "Mouse USB": 10 no total, 10 em uso. Devolva uma unidade ou aumente o total.` / `Não é possível reduzir "Mouse USB" para 1: 2 estão em uso. Devolva para liberar.` |
| 26 | O baixado não vai para a lixeira | **banco** — o `CHECK` `assets_baixado_fora_da_lixeira`; a **aplicação** confere antes, com o ativo travado (`delete-asset`) | 409 `ATV-00042 teve baixa e não vai para a lixeira. Reverta a baixa antes.` |
| 27 | A etiqueta e a série são únicas fora da lixeira, sem diferença de maiúscula | **banco** — dois índices únicos parciais sobre `lower()`; a **aplicação** confere antes, para a frase (`assert-unique-asset.usecase.ts`) | 409 `O número de série 5CD1234XYZ já está em uso por ATV-00042.` |

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

**E no passado** ([AX](../decisoes/posse.md#ax--o-posto-tem-um-computador-por-vez-também-no-passado)):
o índice só vê a ocupação aberta, e a data passada voltava no tempo. A Laura
que saiu da Mesa 1 em março não volta a ela com data de fevereiro: a ocupação
nova não começa antes do dia em que a última dela no posto terminou. No mesmo
dia passa. A regra é da aplicação, porque o banco só a diria com um `EXCLUDE`
por intervalo, e o dia de Brasília não é o instante gravado.

**Note o que ele NÃO proíbe:** a mesma pessoa em **postos diferentes** (a chave
é o par), e **pessoas diferentes** no mesmo posto — que é justamente o que a
Camada 2 existe para permitir (Laura + Ana na Mesa 1).

### 3 — O tipo de um status em uso não muda

`server/modules/catalog/specs/status-label.spec.ts` → `beforeWrite`

Trocar o `type` de um `StatusLabel` que 200 ativos usam muda o significado dos
200 de uma vez, **sem escrever uma linha em `assets`** — e portanto sem
linha de auditoria para nenhum deles. Um status disponível virando `UNDEPLOYABLE` inutiliza a
frota em silêncio.

**Por que na aplicação:** a regra é *"mudou de X para Y **e** há quem aponte"* —
precisa do valor anterior e de um `COUNT` em outra tabela. Nem índice nem CHECK
fazem isso. E o 409 genérico do banco não diria **quantos**.

A mesma guarda existe em `category.spec.ts` — contando modelos, ativos (lixeira
inclusive), itens de estoque (desativados inclusive) **e licenças** — e **aqui é mais grave**: o tipo da
categoria diz a que módulo o registro pertence; o tipo do status decide se o
equipamento pode ser entregue a alguém.

**Com a linha travada.** A troca de tipo trava a linha `FOR UPDATE` antes de
contar, e todo leitor do tipo (cadastro de licença, de item de estoque, de
modelo, de ativo, entrega, devolução) a lê `FOR SHARE`
(`catalog/helpers/catalog-lock.helper.ts`). Sem isso, um cadastro que já tinha
lido o tipo velho gravava depois da contagem e a guarda era contornada por uma
corrida.

> **A guarda vale o que a contagem enxerga:** toda tabela que aponta para categoria ou localização
> precisa estar no `countUsages` ([`configuracoes.md`](configuracoes.md)).

**A saída correta** é a mesma do delete: criar o status novo e mover os ativos —
operação visível, uma por ativo, auditada.

### 4 — Estado × posse

`server/modules/asset/use-cases/assert-status-posse.usecase.ts`, chamada pelo
`updateAsset` dentro da transação que já existe.

Ativo com `Assignment` aberta não pode receber status de tipo `DEPLOYABLE`
("está no estoque, pode ser entregue"). A frase é falsa sobre um equipamento que
está na mão de alguém.

| Tipo do status | Sem posse aberta — *estoque* | Com posse aberta — *entregue* |
|---|---|---|
| `DEPLOYABLE` | ✅ o caso normal do estoque | ❌ **proibido** — não está no estoque |
| `IN_USE` | ✅ posto vago: sinal operacional, candidato à devolução | ✅ o caso normal |
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

`assignments_alvo_coerente` e `assignments_devolucao_nao_antecede_entrega`, no
bloco escrito à mão de `prisma/migrations/0_init/migration.sql`.

Duas afirmações sobre a mesma linha: o alvo polimórfico é **coerente** (uma FK
preenchida, e é a que casa com o `targetType`), e a posse **não fecha antes de
abrir**.

**A exceção é o posto excluído** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira),
[Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)): o posto segue a regra do status e
sai quando nada está nele agora. A posse JÁ DEVOLVIDA para ele perde a FK e
guarda o nome por escrito em `targetWorkstationName` — e só a devolvida: a aberta
aponta sempre para o posto. A entrega de estoque (`stock_movements_forma`) e a
ocupação (`workstation_occupants_posto_presente`) têm a mesma exceção, com a mesma
condição.

**E a ocupação não termina antes de começar**
(`workstation_occupants_fim_nao_antecede_inicio`), como a posse e a entrega de
estoque. A API já não deixa (o encerramento iguala o fim ao início no mesmo
dia); o `CHECK` é para quem escreve por fora.

**Por que no banco, se o `assertAlvoCoerente` já valida:** porque a validação da
aplicação defende quem passa pela API, e esta tabela tem outros escritores — o
seed, um `psql` à mão, uma migração futura. Uma linha com `targetType: 'PERSON'` e
`targetWorkstationId` preenchido é aceita pelo Postgres sem CHECK, e a Camada 3 a resolve como *"sem responsável"* — em
silêncio, que é o pior jeito de um equipamento sumir de vista.

**`>=` e não `>`** na data: entrega e devolução no mesmo instante é real — é a
devolução no mesmo dia da entrega, com dois relógios que podem coincidir no
milissegundo.

A aplicação recusa antes, com a frase que ensina o modelo; o CHECK é a rede de baixo.

### 6 — Desativado não fica com posse aberta

`server/modules/person/use-cases/lock-person.usecase.ts`, chamada como **primeira**
trava da transação na edição do colaborador (`personSpec.beforeWrite`),
`checkoutAsset` (alvo `PERSON`), `checkoutLicense` (alvo `PERSON`), `checkoutStock`
(alvo `PERSON`) e `addWorkstationOccupant`.

**QUATRO PONTAS, e são as quatro que fazem alguém responder por equipamento:**
ativo no nome (`Assignment` alvo `PERSON`), licença no nome
(`LicenseCheckout.assignedPersonId`), unidade de estoque no nome
(`StockMovement` aberto, alvo `PERSON`) e ocupação de posto (`WorkstationOccupant`)
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

Resultado: **desativado com posse aberta**, sem erro nenhum. Em `READ COMMITTED`, o padrão do Postgres e o
nosso, nenhum `if` pega isso: nenhuma das transações enxerga o que a outra ainda não confirmou.

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

`license_checkouts_alvo_xor`, `license_checkouts_devolucao_nao_antecede`, `license_checkouts_licenca_presente` e
a FK `Restrict` de `licenseId`, na `0_init`.

Duas colunas de alvo nuláveis admitem quatro estados, e **dois são mentira**: as duas
preenchidas ("esta licença está com a Laura E com o notebook") e nenhuma preenchida
("está em uso por ninguém"). Nenhum dos dois dá erro sozinho — a licença sai da conta de
livres sem aparecer em lista nenhuma: paga, indisponível e invisível.

É o irmão da forma da posse (#5), com uma diferença: aqui **não há discriminante** para
conferir, porque com dois alvos possíveis a FK preenchida já diz qual é.

O outro é a forma no tempo: a devolução não antecede a entrega (`>=`, como na posse). E
**toda entrega em uso aponta para a licença**: a licença com entrega aberta não se exclui, e a
FK `Restrict` é o que impede excluir por fora. A devolvida de uma licença excluída fica sem
ligação, com o nome por escrito em `licenseName` e sem a chave — as chaves vão junto com a
licença, e a FK composta da chave, com `licenseId` nulo, não conferiria mais nada
([AG](../decisoes/estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)).

A aplicação recusa antes, com 422 e a frase que ensina o modelo (*"Posto de trabalho não é
alvo de licença — entregue ao computador que está no posto"*, D39); os CHECKs são a rede para quem
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
"Desvincular" da lista Vinculadas, em Descobertas.

> `onDelete: SetNull` é o outro lado: apagar um ativo de verdade **não** leva
> junto a telemetria da máquina. O preço é que o vínculo se desfaz em silêncio, e
> é por isso que existe linha de auditoria para `UNLINK`.

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

**Um alvo só, `assetId`:** `SuggestionKind` só tem `LINK`.

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

---

### 17 — Nunca sem administrador

`assertSobraAdministrador()` (`access/helpers/ultimo-administrador.ts`), no fim da transação.

**A checagem roda DEPOIS da escrita, dentro da transação** — e é isso que a torna
completa. Prever se uma operação vai deixar o sistema sem administrador exigiria
simular cada caminho (mudar o cargo, desativar a pessoa, apagar a pessoa), e o
terceiro seria o esquecido. Aplicando e **contando depois**, há uma pergunta só:
*ainda existe alguém?* Se não, o `throw` desfaz tudo e nada aconteceu.

Um caminho novo que mexa em cargo herda a proteção só por chamar isto no fim: a checagem roda em TODO
`update` de usuário, não só quando `role` vem no corpo.

**Desativar e excluir a si mesmo são recusados antes** ([W](../decisoes/acesso.md#w--excluir-usuário-apaga-a-linha-e-ninguém-rebaixa-desativa-ou-exclui-a-si-mesmo)). A checagem cobre a corrida — dois
administradores tirando um ao outro no mesmo instante, cada um contando "sobra eu" —, que
`travarAdministracao` põe em fila. Provado em `tests/invariantes/permissao.test.ts`.

**Quem conta como administrador precisa poder ENTRAR**: `isActive`,
`role = ADMIN` e a linha existir — excluir apaga (W). A senha não entra na conta: todo usuário tem uma.

> **O que esta invariante NÃO cobre, e por isso existe a linha de escape:** o
> caminho da tela. Um restore parcial deixa o sistema de pé e **trancado**, e a
> saída é `bun run acesso:administrador`, que exige acesso ao servidor e cria
> outro administrador ([AP](../decisoes/acesso.md#ap--o-administrador-nasce-por-comando-como-no-snipe-it)) —
> e **não** uma rota de emergência, que seria uma rota criando `ADMIN` sem ser
> `ADMIN`. Se a única conta `ADMIN` perdeu a senha, o administrador novo entra e
> gera a senha temporária dela em Usuários.

---

### 19 — No máximo um ativo por posto de trabalho

Um posto de trabalho é uma mesa, uma bancada, um guichê: uma pessoa por turno,
um computador. Duas máquinas entregues à mesma mesa não são um cenário de
inventário — são um cadastro errado que ninguém percebe, porque a tela do posto
mostraria duas e a telemetria somaria o uso das duas como se fosse daquele posto.

**Ativo é computador.** Nada que não seja máquina é cadastrado em `/computadores`:
monitor, teclado, mouse e cabo são estoque, por quantidade, sem patrimônio
individual. É isso que faz a regra ser sobre o **ativo**, e não sobre "ativo com
máquina vinculada": o agente instalado ou não instalado não muda o que o
equipamento é, só o que a ficha dele consegue mostrar. Um desktop cujo agente
ainda não chegou já é o computador da mesa, e o segundo é recusado na entrega.

**Na aplicação, com rede no banco.** A porta é a entrega, porque é ela que
diz qual computador devolver. Embaixo, o índice único parcial
`assignments_um_aberto_por_posto`, em `("targetWorkstationId") WHERE "checkinAt"
IS NULL`, para quem escreve por fora.

**E no passado** ([AX](../decisoes/posse.md#ax--o-posto-tem-um-computador-por-vez-também-no-passado)):
a entrega a um posto não começa antes do dia da última devolução de outro
computador nele. O índice e a porta só olham o presente, e a data passada da
entrega voltava no tempo por cima de um período que já tinha computador.

**E por isso ela trava a linha do posto.** Estar dentro da transação não basta:
em READ COMMITTED duas entregas simultâneas de dois ativos ao mesmo posto leem
as duas um estado de antes, nenhuma enxerga a posse que a outra não confirmou, e
as duas passam. É o mesmo furo que a invariante 6 fecha com `travarPessoa`, e
nenhum `if` o pega. Para a perdedora receber a frase da porta, e não a do
índice, a serialização é explícita:
`SELECT id FROM workstations WHERE id = $1 FOR UPDATE` antes da leitura, na linha
que as duas transações disputam — depois de travar o ativo, que é a ordem do
grafo de travas (`lock-asset.usecase.ts`).

**É uma porta só, a da entrega** (`checkout-asset.usecase.ts`): ela recusa
entregar ao posto um segundo ativo, agora ou num período passado.

**O vínculo de máquina NÃO é porta:** a vaga é decidida na entrega, e o vínculo só muda o que a ficha mostra.

**Note o que ela NÃO proíbe:** vários ocupantes no posto, que são o desenho da
Camada 2; dois ativos **guardados** numa localização — a sala de reunião e o
depósito não recebem entrega, e o que fica guardado neles não tem limite; e o
estoque na mesa, que não é ativo. **Posto sem ativo continua válido**: a regra
é "no máximo um", não "exatamente um". (O `postoVago` é outra coisa, e não tem
relação com esta invariante: ele é posto **sem ocupante** — gente, não máquina.)

> **A regra é testada, não argumentada.** `tests/invariantes/ativo-por-posto.test.ts`
> cobre a porta da entrega sem agente, o que libera a vaga e a lixeira que
> recusa o ativo entregue; `tests/descoberta/vincular-e-entregar.test.ts` cobre a entrega com
> agente e prova que desvincular a máquina NÃO libera a vaga. **A corrida
> também:** `tests/corridas/ativo-por-posto.test.ts` dispara duas entregas
> simultâneas ao mesmo posto e exige que exatamente uma entre.

---

### 20 — Ativo baixado ou na lixeira não tem posse aberta

"Vendido" e "na mão da Laura" não podem ser verdade ao mesmo tempo. Se fossem, o
equipamento sumiria do inventário continuando com ela, e a devolução — que
registra em que estado ele voltou e quem recebeu — não aconteceria.

Na lixeira é o mesmo: restaurá-lo o devolveria a quem talvez não possa mais ter posse (invariante 6).

**São quatro portas:**

| porta | o que ela impede |
| --- | --- |
| `delete-asset.usecase.ts` | mandar para a lixeira o ativo **entregue** — `Este computador está entregue e não pode ir para a lixeira. Faça a devolução antes.` —, com **licença**, com **componente** ([AL](../decisoes/posse.md#al--o-computador-entregue-não-vai-para-a-lixeira)) ou com **máquina** vinculada ([CL](../decisoes/catalogo-e-ativo.md#cl--o-baixado-não-vai-para-a-lixeira-e-a-máquina-sai-antes-da-baixa-e-da-lixeira)) |
| `retire-asset.usecase.ts` | dar baixa em ativo **entregue** — `Faça a devolução antes.` —, que **tem licença** — `Devolva pela tela de Licenças antes de dar baixa.` —, que **tem componente** instalado — `Retire pela tela de Estoque antes de dar baixa.` ([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar)) — ou que **tem máquina** vinculada — `Desvincule pela tela de Descobertas antes de dar baixa.` (CL) |
| `checkout-asset.usecase.ts` | **entregar** ativo baixado — e isso vale com **qualquer** status, porque a baixa não mexe no status: um vendido pode estar "Disponível" |
| `link-endpoint-asset.usecase.ts` | **vincular máquina** a ativo baixado (409) ou na lixeira (404) |

A entrega de **licença** a ativo (`checkout-license.usecase.ts`) e a de
**componente** (`checkout-stock.usecase.ts`) recusam o baixado pelo mesmo motivo:
a licença ou a peça ficaria presa a uma máquina que não existe mais.

**A máquina** seguiria na cobertura de quem saiu, com a telemetria e os comandos de
reiniciar e desligar. A recusa da baixa e da lixeira leva a Descobertas, onde mora o
Desvincular (`assertSemMaquina`, em `get-asset-machine.usecase.ts`).

**Bloqueia, nunca fecha a posse sozinha** — o mesmo argumento da invariante 4.

**Por que na aplicação:** cruza `assets.retiredAt` com `assignments`, e o valor
está na mensagem. **E por isso trava:** a baixa e a entrega travam a linha do
ativo antes de ler (`lock-asset.usecase.ts`); sem a trava, as duas liam "sem
posse" e "sem baixa" e o ativo terminava baixado e entregue.

**Desfazer a baixa** (`unretire-asset.usecase.ts`) não tem guarda: um ativo que
volta ao patrimônio não contradiz nada. O que é a baixa e como ela aparece na
tela está em [`baixa.md`](baixa.md).

> **Testado:** `tests/invariantes/posse.test.ts` (o baixado não é entregue;
> desfeita a baixa, volta a poder), `tests/corridas/posse.test.ts` (baixa ×
> entrega do mesmo ativo, várias rodadas, nunca os dois) e
> `tests/invariantes/baixa-e-lixeira.test.ts` (a máquina vinculada segura a baixa e
> a lixeira, com o link; desvinculada, passa).

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

**A frase diz quantas estão em uso**, e que devolver libera: `Não é possível reduzir "Office
2021" para 6: 7 estão em uso. Devolva para liberar.`

> **Provado em** `tests/licencas/corridas.test.ts` (oito entregas a oito pessoas diferentes
> numa licença de três: passam três, e o banco tem três abertas; a redução contra a entrega
> nunca deixa a conta passar do contrato) e `tests/licencas/operacoes.test.ts` (o piso e a
> frase).

### 23 — Uma entrega aberta por alvo e licença

```sql
CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_pessoa"
  ON "license_checkouts"("licenseId", "assignedPersonId")
  WHERE "checkinAt" IS NULL AND "assignedPersonId" IS NOT NULL;
CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_ativo"
  ON "license_checkouts"("licenseId", "assignedAssetId")
  WHERE "checkinAt" IS NULL AND "assignedAssetId" IS NOT NULL;
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

> **Provado em** `tests/licencas/invariantes.test.ts` (o `INSERT` cru da segunda aberta é
> recusado; a devolvida não conta) e `tests/licencas/operacoes.test.ts` (os 409 da API).

### 24 — A chave da entrega é da licença, e não passa do que cobre

A FK composta `license_checkouts_licenseKeyId_licenseId_fkey`, `license_keys_seats_positivo` e
`license_keys_chave_preenchida`, na `0_init`.

Cada chave da licença cobre `seats` licenças: 1 na individual, mais na de volume
([AC](../decisoes/licencas.md#ac--a-chave-vira-lista-cada-uma-cobre-uma-quantidade-e-a-entrega-escolhe-uma)).
A invariante tem uma metade no banco e outra na aplicação.

**No banco, a forma.** A FK é **composta**: a entrega aponta para a chave **e** para a licença, e
o par tem de existir em `license_keys` (o `@@unique([id, licenseId])` é o alvo dela). Nem o `psql`
põe a chave de uma licença na entrega de outra. Com `licenseKeyId` nulo, o Postgres não confere
(MATCH SIMPLE): é a entrega sem chave, a da licença que não tem nenhuma. A chave cobre ao menos
uma, não é vazia, e não repete na licença (`license_keys_licenseId_productKey_key`).

**Na aplicação, as duas contas** — elas cruzam tabelas, e um CHECK não enxerga a outra:

- **nenhuma chave vai para mais entregas abertas do que cobre.** A entrega e a troca de chave
  (`chaveDaEntrega`, em `license-keys.usecase.ts`) contam com a linha da licença travada, como a
  invariante 22. Sem a trava, duas entregas viam "1 lugar" na mesma chave e as duas gravavam;
- **as chaves somam no máximo o que foi comprado.** O cadastro e a edição (`gravarChaves`)
  conferem a lista contra a quantidade, e a edição que reduz a quantidade sem mandar a lista
  confere contra as chaves gravadas.

**A frase diz o que fazer**: `Esta chave de "Office 2024" cobre 2, e as 2 estão em uso. Escolha
outra.`; `Todas as chaves de "Office 2024" estão em uso. Cadastre a chave da próxima licença, em
Editar, antes de entregar.`; `Não é possível reduzir "Office 2024" para 3: as chaves cobrem 4. Tire
uma chave ou diminua o que ela cobre antes.`

> **Provado em** `tests/licencas/invariantes.test.ts` (a chave de outra licença é recusada pela
> FK; a segunda aberta na mesma chave de 1 passa no `INSERT` cru, porque a conta não é do banco;
> os dois CHECKs e a chave repetida), `tests/licencas/corridas.test.ts` (oito entregas
> simultâneas na mesma chave de volume que cobre duas: passam duas) e
> `tests/licencas/chave.test.ts` (as frases da API).

### 25 — A entrega de estoque, e o total que não fica abaixo do que está em uso

`stock_items_qty_nao_negativa` e os cinco `CHECK` de `stock_movements` (`_forma`,
`_devolucao_nao_antecede_entrega`, `_devolucao_registrada`, `_fechamento_com_devolucao` e `_item_presente`), na
`0_init`.

O estoque segue a conta da licença
([AE](../decisoes/estoque.md#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira)):
`disponível = qty − unidades abertas`, e cada linha de `stock_movements` é **uma unidade
entregue**. A invariante tem, como a 24, uma metade no banco e outra na aplicação.

**No banco, a forma.** O total é o que existe, e nunca negativo: chega a 0 quando acaba, pela
entrega do consumível ou pela edição ([AJ](../decisoes/estoque.md#aj--o-consumível-é-uma-categoria-e-o-total-é-o-que-existe));
o cadastro com ao menos 1 é da aplicação. A unidade que saiu diz sempre como — devolvida ou
consumida —, e a em uso, nada. A linha tem UM alvo,
o que o `targetType` diz — o computador (`ASSET`) é só do componente, e quem confere a categoria
é a aplicação ([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar)) —, e a devolução não fica antes da entrega e tem o dia e o instante do
registro juntos — o instante é o que separa duas devoluções no mesmo dia; a entrega devolvida de um posto
excluído fica sem FK, com o nome por escrito, como a `Assignment` (5). E a do **item** excluído
também (AG): toda entrega em uso aponta para o item (CHECK `stock_movements_item_presente`), e a FK
`Restrict` não deixa apagar o item com unidade em uso; a devolvida é desligada antes, com o nome em
`itemName`.

**Na aplicação, a conta** — ela cruza o item com as entregas, e um CHECK não enxerga a outra
tabela. Mora em quem conta e grava: a **entrega** (`checkout-stock.usecase.ts`) e a **edição**
que reduz o total (`update-stock-item.usecase.ts`), as duas com a linha do item travada
(`travarItemOuFalhar`). Sem a trava, duas entregas liam "1 disponível" e as duas gravavam. A
ordem é colaborador ou computador → item → posto; a devolução trava só as linhas da
entrega, porque só diminui o que está em uso. A entrega do consumível tira do total
também — uma unidade de cada lado, e a conta não muda.

**O disponível negativo se mostra.** Só nasce de uma linha criada por fora da trava, e a tela o
mostra em vermelho em vez de zerá-lo: esconder seria apagar o sintoma.

> **Provado em** `tests/estoque/invariantes.test.ts` (o `INSERT` cru da linha incoerente é
> recusado, as constraints existem, o total nunca é negativo e o "como saiu" anda com a devolução, a FK não deixa apagar item com entrega) e
> `tests/estoque/corridas.test.ts` (cinco entregas simultâneas num estoque de três: passam três; a
> redução do total contra a entrega nunca deixa a conta passar dele).

---

### 26 — `assets_baixado_fora_da_lixeira`

```sql
ALTER TABLE "assets" ADD CONSTRAINT "assets_baixado_fora_da_lixeira" CHECK (
  "retiredAt" IS NULL OR "deletedAt" IS NULL
);
```

A baixa e a lixeira respondem perguntas diferentes ([`baixa.md`](baixa.md)): *ainda é da
empresa?* e *foi cadastrado de verdade?*. As duas juntas não descrevem computador nenhum: um
que saiu do patrimônio e que nunca devia ter existido.

**O que ele protege de verdade é a série.** A etiqueta e a série só são únicas fora da lixeira
(`assets_serial_unique_undeleted`), e o baixado na lixeira soltava as duas: a mesma máquina
vendida podia voltar como cadastro novo, e a venda saía de Baixados.

**No banco, com a frase na aplicação:** é a forma de uma tabela só. A exclusão confere antes,
com o ativo travado, para dar o caminho — reverter a baixa e então excluir ([CL](../decisoes/catalogo-e-ativo.md#cl--o-baixado-não-vai-para-a-lixeira-e-a-máquina-sai-antes-da-baixa-e-da-lixeira)) —, e a
tela nem mostra o Excluir no `⋯` do baixado.

> **Provado em** `tests/invariantes/baixa-e-lixeira.test.ts`: o 409 da API, os dois caminhos
> que continuam (reverter e excluir; restaurar e dar baixa) e o `UPDATE` cru que leva o erro do
> `CHECK`.

---

### 27 — `assets_assetTag_unique_undeleted` e `assets_serial_unique_undeleted`

```sql
CREATE UNIQUE INDEX "assets_assetTag_unique_undeleted"
  ON "assets"(lower("assetTag")) WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_serial_unique_undeleted"
  ON "assets"(lower("serial")) WHERE "deletedAt" IS NULL;
```

A etiqueta é como a empresa acha o computador, e a série é como o agente o acha. Repetidas,
as duas apontam para dois cadastros: a busca traz os dois, e o vínculo com a máquina fica sem
dono.

**Sem diferença de maiúscula** ([CN](../decisoes/catalogo-e-ativo.md#cn--a-etiqueta-e-a-série-não-se-repetem-com-outra-caixa)): "ABC123" e "abc123" são a mesma máquina, e
o vínculo compara a série em minúsculas (`normalizeSerial`). Com a comparação exata, os dois
cadastros passavam, casavam com a mesma máquina e o vínculo travava por ambiguidade.

**Fora da lixeira, e o baixado conta:** a lixeira é cadastro errado e solta as duas, e restaurar
confere de novo. O baixado continua com elas, porque não vai para a lixeira (26).

**No banco, com a frase na aplicação:** é unicidade de uma tabela só, e precisa valer contra a
corrida de dois cadastros. A aplicação confere antes, no cadastro, na edição e ao restaurar,
para dizer qual campo e com quem está; o `equals` sem caixa do Prisma é `ILIKE`, e os curingas
vão escapados.

> **Provado em** `tests/invariantes/etiqueta-e-serie.test.ts`: a repetida no cadastro, na edição
> e ao restaurar, com a mesma e com outra caixa; o baixado que segura a série; a lixeira que a
> solta; o curinga que não colide; e o `UPDATE` cru que leva o erro do índice.

---

## O que **não** é invariante, e por isso não está aqui

- **"Quem responde" numa coluna do ativo bate com a `Assignment` aberta.** Não
  há coluna: a defesa é **não ter a coluna**, não ter uma checagem (`modelo-de-posse.md`).
- **O status da licença.** `ATIVA/VENCENDO/EXPIRADA/ENCERRADA` sai de um helper
  puro sobre duas datas e o dia de hoje (D44). Não há linha gravada com que
  divergir — que é justamente por que ele não é coluna: uma coluna exigiria um
  job diário para continuar verdadeira, e no dia em que o job falhasse o
  inventário mentiria sem sintoma.
- **Só `DEPLOYABLE` libera checkout.** É regra de fluxo do checkout, não
  fato sobre linhas já gravadas.
- **Validação de formato** (uuid, tamanho, enum) — é do `zod`, na borda.
- **Toda rota declara a permissão que exige.** É garantia de **BOOT**, não
  invariante de dado: `infra/http/permission-guard.ts` confere o mapa contra a
  tabela de rotas do Fastify e **derruba o processo** com a lista das que faltam
  (D137). Não cabe nesta lista porque não há linha gravada que possa violá-la — o
  que ela protege é uma rota existir alcançável sem ninguém ter decidido isso. E o
  lugar certo para ela é o boot, não uma checagem por requisição: `bun run test` fica
  vermelho antes de qualquer deploy.
- **O cargo efetivo de uma sessão bate com a coluna.** Ele é LIDO a cada
  requisição, na mesma consulta que relê o usuário (D136/D148) — não há cópia com
  que divergir. É o D16 aplicado ao acesso: guardar o cargo no token exigiria
  reemitir a sessão a cada troca, e no dia em que a reemissão falhasse alguém
  continuaria alcançando o que já lhe foi tirado.
- **A fila de sugestões não fala de gente.** Ela só propõe vínculo entre máquina e ativo (`SuggestionKind` tem só `LINK`):
  não há sugestão sobre pessoa desativada para recusar nem para invalidar. O que
  `invalidate-suggestions.usecase.ts` encerra como `SUPERSEDED` é a pendente cuja
  máquina, ou cujo ativo, ganhou vínculo por outro caminho, e a do ativo que teve baixa
  ou foi para a lixeira — que já encerram as suas na mesma transação (CL) — e isso é regra de
  PROPOSTA, não fato sobre linhas gravadas: entre duas rodadas do job, a pendente
  obsoleta existe no banco.

---

## Para acrescentar uma

O passo a passo está em
[`../guias/acrescentar-uma-invariante.md`](../guias/acrescentar-uma-invariante.md).
