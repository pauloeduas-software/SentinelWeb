# Decisões do estoque

> O que tem QUANTIDADE em vez de patrimônio individual — hoje um tipo só, `StockItem`, com o
> saldo sempre calculado. As seis primeiras decisões (D33–D38) são de uma forma anterior, de
> três modelos; a J conta por que ela voltou diferente.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D33–D38, e J da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)).
> A execução que as aplicou está em [`../historico/`](../historico/).

---

## D33 — O acessório entregue a um posto é **do posto**; os ocupantes respondem solidariamente

**Decidido:** uma unidade entregue à Mesa 1 é **uma** unidade entregue, qualquer que seja
o número de ocupantes; `resolverResponsaveis()` devolve Laura **e** Ana e o saldo cai 1.
**Descartado:** "entregue a posto de N ocupantes conta como N entregas".

**Por quê:** o saldo do estoque passaria a depender do RH. O posto ganha uma terceira
ocupante e, sem ninguém tocar em uma unidade física, o disponível cairia de 2 para 0.
Quantidade é fato do almoxarifado; número de ocupantes é fato da escala — ligar os dois
inventa movimentação que não aconteceu. É também a única leitura coerente com a Camada 3:
o ativo entregue à Mesa 1 continua sendo **um** ativo com **dois** responsáveis, e o mouse
que está na mesma mesa não tem motivo para se comportar diferente.

**O que a tela carrega por causa disso:** "quantos mouses a Laura tem?" ganha duas
respostas honestas — *diretos* e *por posto, compartilhados* — que **nunca** são somadas
num número só: somar produz "Laura tem 6 mouses" a partir de 5 compartilhados, frase falsa
sobre o patrimônio. **E o posto vazio cai de graça:** unidade entregue a posto sem ocupante
aberto resolve para `[]` — não é bug, é o *posto vago* do `../referencia/modelo-de-posse.md` aplicado ao
estoque, candidato a voltar, listado em `/api/stock/alerts`.

---

## D34 — Saldo é sempre **calculado**, nunca coluna

**Decidido:** `qty` (quanto entrou) é coluna; `disponivel` é `COUNT`/`SUM` sobre as linhas
de saída, num helper só. **Descartado:** uma coluna `qtyAvailable` mantida por decremento.

**Por quê — qual corrida a coluna cria.** A óbvia é a do *ler-e-depois-escrever*, a mesma
que o `nextAssetTag()` da F1 documenta: duas requisições leem `qtyAvailable = 1`, as duas
calculam `0`, as duas gravam — duas unidades entregues de um estoque de uma. Em
`READ COMMITTED` nada impede, e um `UPDATE … SET x = x − 1` resolve só **esse** caso.

A segunda é pior porque é silenciosa e permanente: **a coluna pode divergir das linhas.**
Basta um `INSERT` de checkout que não passe pelo decremento — falha no meio de uma
operação sem transação, correção à mão no `psql`, importador de CSV da F10. A partir daí a
coluna mente **para sempre** e nada detecta, porque a coluna *é* a resposta: não existe
ninguém para discordar dela. Com `COUNT` a resposta não pode divergir das linhas — ela
**são** as linhas. É o D16 uma camada abaixo.

**O que o `COUNT` sozinho não resolve.** Duas requisições podem contar "4 de 5 ocupados" e
as duas inserirem: 6 de 5. Contar não é travar. Então **toda saída tranca a linha-pai**:

```ts
await prisma.$transaction(async (tx) => {
  // A linha do acessório é o mutex. Precisa ser DENTRO da transação: um lock em
  // autocommit é um lock que dura zero milissegundo.
  await tx.$queryRaw`SELECT id FROM accessories WHERE id = ${id}::uuid FOR UPDATE`;
  const ocupados = await tx.accessoryCheckout.count({ where: { accessoryId: id, checkedInAt: null } });
  if (ocupados >= qty) throw new AppError('Sem unidade disponível.', 409, { qty, ocupados });
  await tx.accessoryCheckout.create({ /* … */ });
});
```

Serializa só os checkouts **do mesmo item**. Se o SQL cru incomodar, o equivalente pela
API tipada é um `tx.accessory.update({ where: { id }, data: { updatedAt: new Date() } })`
como primeira operação — tranca a mesma linha, mas esconde a intenção, e por isso não é a
primeira escolha.

---

## D35 — Um domínio `stock`, não três fatias verticais

**Decidido:** `server/domain/stock/` com os três dentro, esqueleto padrão.
**Descartado:** `accessory/`, `consumable/` e `component/` separados (o default 1:1 do
`../referencia/arquitetura.md`), e enfiar os três no motor de specs do catálogo.

**Por quê:** os três compartilham **uma** invariante (saldo derivado + trava na linha-pai)
e **uma** tela; três fatias copiariam a invariante três vezes, e invariante copiada é
invariante que um dia diverge — o argumento do D9 num caso menor. O que difere são as
*operações*, e operação já é um arquivo por vez em `use-cases/`. O motor do catálogo não
serve porque a coluna principal da listagem é **derivada** e o `select` da `CatalogSpec` é
allowlist estática: ensiná-lo a calcular saldo seria dobrar um genérico para atender três
clientes — abstração que passa a custar mais do que economiza.

---

## D36 — Os três têm lixeira; aqui o D8 não se aplica

**Decidido:** `deletedAt` nos três, `name` único por índice parcial, `DELETE` respondendo
**409 enquanto houver saída aberta**.

**Por quê o catálogo não tem e estes têm:** o vazamento que o D8 evitou é o de um registro
apagado aparecendo como valor **atual** de outra linha (a categoria na lixeira ainda sendo
a categoria do ativo). Aqui a leitura aninhada é de **histórico** — o nome do acessório na
linha de consumo de março — e mostrar o item apagado ali é **certo**. E o delete real
levaria junto o histórico de consumo, a única coisa da fase que não se reconstrói.

---

## D37 — `Consumable` não tem devolução; não é validação, é ausência

**Decidido:** `ConsumableCheckout` sem coluna de fechamento e sem rota de checkin. Um
`POST .../checkin` responde **404 do roteador**.

**Por quê:** a alternativa — aceitar a rota e responder 409 "consumível não volta" — põe a
regra na memória de quem escreve o próximo use-case. Sem coluna e sem rota, implementar a
devolução exige uma migração, que é o tipo de mudança que alguém revisa. Mesmo princípio
do D13: a segurança vem da **ausência** do nome, não de uma checagem. `userNameSnapshot` é
copiado no ato — o consumo precisa continuar legível depois que a pessoa sai.

---

## D38 — Devolução parcial de componente **divide a linha**

**Decidido:** devolver 2 de 4 pentes fecha a linha de 4 (`detachedAt = now()`) e abre uma
com `assignedQty = 2`. **Descartado:** decrementar `assignedQty` na linha aberta.

**Por quê:** decrementar apaga a resposta de *"quantos pentes estavam nessa máquina em
março?"*. A soma das linhas abertas continua sendo o estado atual (o que a tela mostra) e
a sequência continua sendo o histórico (o que a auditoria pede). **O preço, declarado:**
lido cru, o histórico parece dizer "instalou 4, retirou 4, instalou 2" — a aba rotula o
par como *devolução parcial: 2 de 4* comparando a linha fechada com a sucessora, que é
trabalho de apresentação, não de schema.

---

## J — O estoque volta como `StockItem` + `StockMovement`

**Decidido:** `Accessory`, `Consumable`, `Component` e os três `Checkout` — removidos inteiros
pelo segundo de-escopo (ver [`escopo.md`](./escopo.md#o--o-segundo-de-escopo-o-que-a-primeira-rodada-manteve-ou-não-enxergou-sai))
— dão lugar a **dois** modelos: `StockItem` (nome, categoria, `qty` total, notas, lixeira) e
`StockMovement` (`ENTRADA`, `BAIXA` ou `SAIDA` de **uma** unidade, a pessoa ou a posto, com
devolução por linha). Um tipo de item, não três. Sem piso de alerta (`minQty`) — o item não tem
coluna de mínimo.
**Supera:** [D36](#d36--os-três-têm-lixeira-aqui-o-d8-não-se-aplica) (fala de três modelos; só há
um), [D37](#d37--consumable-não-tem-devolução-não-é-validação-é-ausência) (não existe mais um
tipo sem devolução — toda `SAIDA` pode ser devolvida) e
[D38](#d38--devolução-parcial-de-componente-divide-a-linha) (não existe mais devolução parcial de
uma linha — cada unidade é a sua própria linha, e devolver é fechar UMA), além de
[D153](./escopo.md#d153--estoque-vira-item-e-movimento) (que previu a forma, sem definir a saída
por unidade nem o alvo em posto) e [D160](./escopo.md#d160--o-estoque-não-foi-achatado) (que
registrou que a troca não tinha sido feita — agora foi).
**Mantém:** [D33](#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente)
(entrega a posto é **uma** unidade, os ocupantes respondem solidariamente — a mesma razão,
aplicada ao `StockMovement`), [D34](#d34--saldo-é-sempre-calculado-nunca-coluna) (saldo é sempre
`qty − COUNT(SAIDA aberta)`, nunca coluna — é o que torna a troca de baixo barata, exatamente como
o D160 previu) e [D35](#d35--um-domínio-stock-não-três-fatias-verticais) (um domínio `stock`, mais
verdadeiro ainda com um tipo só).

**Por quê a forma é diferente da que o D153 previu:** o D153 falava em "item + movimento" sem
decidir dois pontos que só apareceram ao implementar — **cada unidade de `SAIDA` é uma linha**
(`qty: 1` por linha; pedir 5 grava cinco linhas, não uma linha com `qty: 5`), porque a devolução é
de uma unidade identificada, sem quantidade parcial para dividir; e o alvo da saída pode ser
**posto**, não só pessoa — herdando o D33 que os sete modelos antigos já tinham. `BAIXA` é a
única porta para reduzir o total, e é recusada se deixaria `qty` abaixo do que está fora
(devolva antes de dar baixa) — a frase do 409 carrega os números para a tela não recontar.

**O que fica fora, por decisão:** `minQty`/alerta de estoque baixo não entrou — nenhuma leitura
depende dele, e o D34 (saldo sempre calculado) não precisa de piso para ser verdade. Se a
necessidade aparecer, é uma coluna nova e uma leitura nova, não uma reabertura desta decisão.

**Onde mora a invariante do saldo negativo "de propósito":** `disponivel` pode ficar negativo —
acontece quando uma linha de `SAIDA` é criada por fora da trava (psql à mão), e o helper
devolve o número sem zerar: esconder a inconsistência que a tela existe para mostrar seria pior
que mostrá-la. A cor do saldo na tela usa `<= 0`, não `=== 0`, por este motivo exato
(`src/pages/estoque/helpers/estoque.helper.ts`).
