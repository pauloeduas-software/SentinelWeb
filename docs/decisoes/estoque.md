# Decisões do estoque

> O que tem QUANTIDADE em vez de patrimônio individual — hoje um tipo só, `StockItem`, com o
> saldo sempre calculado. As seis primeiras decisões (D33–D38) são de uma forma anterior, de
> três modelos; a J conta por que ela voltou diferente, e a AE, por que ela passou a seguir a
> lógica da licença.
>
> **A regra desta pasta:** decisão escrita aqui **não se reescreve**. Se a realidade mudou, a
> decisão é **superada** por outra, com link entre as duas — é o log que diz por quanto tempo
> cada regra governou. O índice das 164 está em [`README.md`](./README.md).
>
> Decisões neste arquivo: D33–D38, J da segunda rodada (ver
> [`README.md`](./README.md#a-segunda-rodada-ap)), AE, AG, AI e AJ.
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
de entrega, num helper só. **Descartado:** uma coluna `qtyAvailable` mantida por decremento.

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
as duas inserirem: 6 de 5. Contar não é travar. Então **toda entrega tranca a linha-pai**:

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
**409 enquanto houver entrega aberta**.

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

> **Superada em parte por [AE](#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira):**
> `ENTRADA` e `BAIXA` saem — o total vira campo da edição, como a quantidade comprada da licença —,
> e com elas o `kind` e o `qty` da linha. A lixeira do item sai: o item que acabou se desativa, e
> só o que nunca foi entregue se exclui. A devolução deixa de ser de uma unidade por vez: é de N
> unidades de uma entrega. Ficam a unidade por linha, o alvo em posto e o saldo calculado.
>
> **Superada em parte por [AI](#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar):**
> o alvo deixa de ser só pessoa ou posto — o item de categoria Componente vai só para
> computador.
>
> **Superada em parte por [AJ](#aj--o-consumível-é-uma-categoria-e-o-total-é-o-que-existe):**
> volta a existir o que não se devolve — o item de categoria Consumível, cuja entrega já nasce
> fechada.

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
[D153](./escopo.md#d153--estoque-vira-item-e-movimento) (que previu a forma, sem definir a entrega
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
de uma unidade identificada, sem quantidade parcial para dividir; e o alvo da entrega pode ser
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

---

## AE — O estoque segue a lógica da licença: total na edição, entrega com dia, desativar em vez de lixeira

> **Superada em parte por [AN](./licencas.md#an--o-que-está-em-uso-bloqueia-e-nenhuma-data-é-futura):**
> o item com unidade em uso não se desativa — 409 que manda devolver, ou retirar no componente.
> O Desativar continua, para o item que já voltou todo.
>
> **Superada em parte por [AJ](#aj--o-consumível-é-uma-categoria-e-o-total-é-o-que-existe):**
> o total é o que existe e chega a 0 quando acaba — pela entrega do consumível ou pela edição; só
> o cadastro continua pedindo ao menos 1.
>
> **Superada em parte por [AG](#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão):**
> o item que já foi entregue também se exclui, se nada está em uso agora — as entregas devolvidas
> perdem a ligação e guardam o nome por escrito. Só o item com unidade em uso recusa, e o 409 diz
> com quem. O Desativar continua, para o que se quer guardar.

**Decidido** (na padronização do Estoque com a Licença, em 2026-10-26 — o usuário pediu que o
estoque funcionasse como a licença, item a item, e respondeu cada ponto em que os dois
divergiam; e, no mesmo dia, que o ativar, o desativar e o excluir seguissem o padrão das
Configurações, como o sistema inteiro):

- **O total é campo da edição**, como a quantidade comprada da licença. `ENTRADA` e `BAIXA`
  saem, e com elas o enum `StockMovementKind` e as colunas `kind` e `qty` da linha: toda linha de
  `stock_movements` é uma unidade entregue. Aumentar sempre pode; reduzir não passa do que está em
  uso (`Não dá para reduzir "Mouse USB" para 1: 2 estão em uso. Devolva para liberar.`), com a
  linha do item travada; e o total é ao menos 1 — no cadastro e depois dele (CHECK
  `stock_items_qty_positiva`). O item que acabou se desativa; o disponível chega a zero pela
  entrega, o total nunca. A mudança do total vai só para a auditoria
  ([AB](./acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)); o histórico do item é só
  entregas e devoluções.
- **A entrega e a devolução têm dia.** Vêm com hoje e podem voltar para registrar o que já
  aconteceu; futuro é 422, e a devolução nunca fica antes da entrega (CHECK
  `stock_movements_devolucao_nao_antecede_entrega`, contra a coluna nova `checkoutAt`). O dia
  passado é gravado ao meio-dia de Brasília, e as telas mostram só o dia. **Sem as duas recusas
  de passado da licença:** o item não tem data de compra, e o mesmo alvo fica com várias unidades
  ao mesmo tempo, então não há sobreposição a conferir.
- **A entrega é uma só, com N unidades.** Cada unidade continua uma linha, e as N de uma entrega nascem
  no mesmo `INSERT`: o mesmo `createdAt` com o mesmo alvo faz delas **uma entrega**. "Com quem
  está", as fichas e os históricos mostram a entrega — "Mesa 1 · 5 unidades · desde 12/10/2026" —,
  e o mesmo alvo que recebe de novo ganha outra entrega, não a mesma somada.
- **A devolução é pela entrega**, e pergunta quantas — por padrão, todas — e o dia, na própria
  linha. O `:id` é o de qualquer unidade da entrega. A tela velha não devolve a entrega de outra
  pessoa: a que já voltou responde 409. E mora **só no detalhe do item**: a ficha do posto e a do
  colaborador mostram o que está com eles e levam até lá por link (`/estoque?item=<id>`).
- **Sem lixeira, e o cadastro das Configurações.** O item que saiu de uso se **desativa**
  (`isActive`) — **mesmo com unidade fora** — e fica **na mesma lista**, esmaecido e marcado, sem
  aba à parte: Editar, Desativar/Ativar e Excluir têm os botões e as frases das Configurações.
  Desativado, não recebe entrega; o que está com alguém continua até voltar, e a conta da linha
  diz quantas. Ativa pelo mesmo botão. Só o item que **nunca foi entregue** se **exclui de vez** —
  o cadastro errado. O Excluir sempre clica, e o que já saiu recebe o 409 que manda desativar: tem
  o histórico de quem o usou. Toda entrega aponta para o item (FK `Restrict`). Sem restaurar.
- **O nome é único entre todos os itens**, desativados inclusive (índice único simples): o item
  que volta a ser comprado se reativa, e o histórico continua junto. O 409 do nome repetido diz
  isso.
- **A recusa diz quais itens voltam.** Desativar ou excluir o colaborador, e excluir o posto: o
  409 escreve os itens pelo nome, com quantas unidades de cada — `está com 3 unidades de estoque
  (Mouse USB ×2 e Teclado)` —, e manda cada um como `refs` (tipo `estoque`), e a tela põe um link
  para o detalhe de cada item. A do posto passa a dizer também os ativos e os ocupantes, pelo
  número.
- **O histórico do colaborador ganha o estoque** no nome dele, por entrega ("Recebeu: Mouse USB · 2
  unidades"). O da mesa que ele ocupa é do posto, e não entra.
- **A tela é a da licença**: a conta escrita ("10 no total · 7 em uso · 3 disponíveis"), a busca
  por nome, categoria e localização, o detalhe com as ações no cabeçalho, "Com quem está" e o
  histórico de 15 em 15 e o seletor de colaborador com o e-mail. A edição manda o formulário
  inteiro, como em todas as telas ([AF](./licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)). A ação "Saída" vira **Entregar**.

**Fica diferente da licença, por natureza:** o alvo (colaborador ou **posto**,
[D33](#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente);
a licença vai a colaborador ou computador); a quantidade por entrega (até 100, e várias entregas
para o mesmo alvo); o nome único; e o que é só do contrato — vencimento, encerramento, status,
chaves e dados de compra. E o fim: a licença se **encerra** numa data, que entra no status e no
alerta, e o Encerrar fica no lugar do Desativar ([AF](./licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)); o item se **desativa**, como o
cadastro das Configurações.
Sem alerta nem filtro de "desativado ainda em uso": a linha esmaecida mostra a conta. Sem alerta
de mínimo, como no sistema inteiro.

**Supera:** em parte [J](#j--o-estoque-volta-como-stockitem--stockmovement) (a entrada e a baixa, a
lixeira que ela manteve e a devolução de uma unidade por vez).
**Mantém:** [D33](#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente)
(a entrega ao posto é uma unidade), [D34](#d34--saldo-é-sempre-calculado-nunca-coluna) (o saldo é
`qty − COUNT(abertas)`, nunca coluna, com a linha do item travada), [D35](#d35--um-domínio-stock-não-três-fatias-verticais)
e, da J, a unidade por linha e o saldo negativo mostrado em vez de escondido.

**Por quê:** os dois módulos respondem a mesma pergunta — "quantos há e com quem estão os
outros" —, e a licença tinha acabado de ser revista linha a linha
([AA](./licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)).
Duas lógicas para a mesma pergunta são duas coisas para aprender e dois lugares para errar. A
entrada e a baixa só existiam para mexer no total, e o total é um número que se digita; a
linha do tempo de entradas não tinha quem a lesse. A lixeira não se pagava pelo mesmo motivo da
licença: o item que acabou fica na lista, desativado, e o cadastrado errado não tem passado que
valha guardar. E o cadastro é um só no sistema: quem aprendeu a desativar uma categoria sabe
desativar um item.

## AG — A regra do posto vale para o estoque e a licença: só o que está em uso impede a exclusão

**Decidido** (na conversa sobre a exclusão do cadastro, em 2026-10-26 — o usuário perguntou por
que o item devolvido não se excluía e como os sistemas do mercado tratam isso; dada a
comparação, aceitou a recomendação: "o que você sugere é o melhor, se for pode aplicar"):

- **O item de estoque e a licença excluem como o posto** ([Y](./posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)): o 409 conta só o que
  está em uso **agora**, e diz com quem — `"Mouse USB" ainda tem 3 unidades em uso (Laura Souza ×2
  e Mesa 1). Devolva antes de excluir.`, `"Office 2021" ainda tem 2 entregas em uso (ATV-00012 —
  Dell Latitude e Laura Souza). Devolva antes de excluir.` A linha do item ou da licença é travada
  antes da conta.
- **O que já voltou se exclui de verdade.** As entregas devolvidas, de estoque e de licença, perdem a ligação
  (`itemId` e `licenseId` nulos) e guardam o nome por escrito (`itemName`, `licenseName`): o
  histórico do colaborador e o do computador continuam dizendo "Recebeu: Mouse USB" e "Office
  2021". O histórico **do próprio** item ou licença vai junto com ele — é o preço, e por isso
  Desativar e Encerrar continuam: são para o que se quer guardar. O nome do item fica livre, e o
  cadastro novo nasce sem passado.
- **A entrega para um posto vai junto com o item, na tela.** O posto mostra só o que está nele
  agora, e o passado dele ficava no histórico do item; excluído o item, a linha continua no
  banco, com os dois nomes por escrito, e na auditoria, mas nenhuma tela a mostra. É o mesmo
  preço do histórico do item, e fica aceito: o posto não ganha histórico de estoque por isso.
- **O item e o posto excluídos ao mesmo tempo** desligam as mesmas entregas devolvidas. Os dois
  travam as linhas na ordem do id antes de desligar, e um espera o outro.
- **As chaves da licença vão junto**, e a entrega devolvida perde também a dela: a chave só
  aparecia no detalhe da própria licença, e é dado sensível, que não se copia para o histórico.
- **No banco, a rede:** a FK `Restrict` fica, e um CHECK em cada tabela não deixa a linha em uso
  sem o dono — `stock_movements_item_presente` (sem item, só a entrega devolvida, com o nome) e
  `license_checkouts_licenca_presente` (sem licença, só a entrega devolvida, com o nome e sem a
  chave: com `licenseId` nulo, a FK composta da chave não conferiria mais nada).
- **A tela velha** que tenta devolver, ou trocar a chave, de uma entrega cujo dono foi excluído
  recebe o 409 de "já devolvida", com o nome por escrito.

**Supera:** em parte [AE](#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira) (só o item que nunca foi entregue se exclui; toda entrega aponta
para o item) e em parte [AA](./licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas) (a licença que já foi entregue não se exclui; toda entrega
aponta para a licença).
**Mantém:** sem lixeira nos dois ([AE](#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira), [AA](./licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas)), o Desativar do item e o Encerrar da
licença, o Excluir que sempre clica ([AF](./licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)) e o 409 que diz o que fazer.

**Por quê:** a recusa pelo passado mandava desativar o que a pessoa queria apagar, para guardar
um histórico que só a tela do próprio cadastro lia. O que importa é o histórico do colaborador e
do computador, e esse fica com o nome. Os sistemas do mercado se dividem: os ERPs (Odoo, SAP,
TOTVS) não excluem o que teve movimento — arquivam ou bloqueiam —; o Snipe-IT recusa enquanto há
algo entregue e depois esconde, com o histórico mostrando o nome; o GLPI tem lixeira e purga,
com o nome por escrito. O arquivar o sistema já tinha (Desativar e Encerrar), e a regra do
presente com o nome por escrito também, no posto. A AA dizia que o passado da pessoa "fica com
o nome por escrito", mas a entrega não guardava nome nenhum; a AG é o que faz isso ser verdade.

**O que a migração faz:** `itemId` e `licenseId` passam a nuláveis, `itemName` e `licenseName`
nascem nulos, e os dois CHECKs entram. Nenhuma linha existente fica sem dono, então é só DDL.

---

## AI — O componente é uma categoria: vai só para computador, e sai pelo Retirar

**Decidido** (na conversa sobre a memória e o SSD, em 2026-10-27 — primeiro o usuário disse que
estoque não vai para computador, só para colaborador e posto; depois, que um item "não volta"
poderia ir para o computador; e propôs ele mesmo chamar de **componente** e mandar só para o
computador. Da proposta de pôr o tipo na categoria, e não um campo no item, disse: "mtt boa essa
sacada de fazer um novo tipo de categoria"; e "pode fazer tudo de uma vez"):

- **A categoria ganha o tipo Componente**, ao lado de Ativo, Licença e Estoque. É ela que decide
  para onde o item vai: o item de categoria **Estoque** (mouse, monitor, cabo) vai a colaborador
  ou posto, **nunca** a computador; o de categoria **Componente** (memória, SSD) vai **só** a
  computador. O pedido ao contrário é 422, com o nome do item. O item não tem campo próprio
  para isso: não há como ele contradizer a categoria em que está.
- **A "Peça de reposição" do seed passa a ser Componente**, com a memória e o SSD do seed demo.
- **O componente fica "em uso" no computador**, como a licença por máquina: o total continua
  sendo quantas existem, e o disponível é o que sobra na prateleira — "10 no total · 3 em uso
  · 7 disponíveis". Fica no computador quando ele muda de mãos: a peça está dentro da máquina.
- **Sai pelo Retirar**, a devolução do componente — N unidades da entrega, num dia, no detalhe
  do item. Serve à troca de peça, à máquina que vai ser descartada (a peça volta ao disponível)
  e à entrega lançada errado. Se a peça saiu junto com a máquina, retirar e depois diminuir o
  total do item é o registro honesto.
- **O computador baixado não recebe** componente (409), e o da lixeira é 404, como na licença.
  A entrega não vem antes da compra do computador, e a compra editada não vai para depois do
  primeiro componente instalado — a mesma regra da licença por máquina.
- **O computador com componente instalado não recebe baixa nem vai para a lixeira** (409, com
  cada item em link para o detalhe dele, onde está o Retirar) — a regra da licença por máquina.
- **Trocar a categoria do item entre Estoque e Componente** só sem unidade em uso: a que está com
  a Laura viraria componente fora de um computador.
- **Nas telas:** o Entregar do componente só oferece computador; no detalhe do item, "Com quem
  está" vira "Em quais computadores", com busca pela etiqueta, e o Devolver vira Retirar; o
  computador ganha a aba **Componentes**, e o histórico dele e o do item mostram a instalação e
  a retirada.
- **No banco:** `StockTarget` ganha `ASSET`, a entrega ganha `targetAssetId` (FK `Restrict`, sem
  nome por escrito: o computador não se exclui de verdade, vai para a lixeira), e o CHECK
  `stock_movements_forma` passa a exigir, no alvo `ASSET`, o computador e só ele.

**Supera:** em parte [J](#j--o-estoque-volta-como-stockitem--stockmovement) (o alvo em pessoa ou
posto: o componente vai a computador).
**Mantém:** [AE](#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira)
(o total na edição, a entrega e a devolução com dia, o desativar), [AG](#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)
(só o que está em uso impede excluir o item — o componente instalado é "em uso") e o saldo
calculado ([D34](#d34--saldo-é-sempre-calculado-nunca-coluna)).

**Por quê:** a memória entregue a um colaborador ficava "em uso" com uma pessoa, quando ela está
dentro de uma máquina. Um item "que não volta" resolveria o computador, mas mudaria o sentido do
total ("quantas já entraram") e deixaria o lançamento errado sem saída. O Snipe-IT separa o que
vai para uma pessoa (acessório) do que vai para dentro de um ativo (componente), e o tipo mora
na categoria; o GLPI também tem o componente como peça de um computador. Como componente, a peça
continua contada no lugar certo, e o Retirar resolve a troca, o descarte e o erro com uma
operação só, que já existia.

**O que a migração faz:** `CategoryType` ganha `COMPONENT`, `StockTarget` ganha `ASSET`,
`stock_movements` ganha `targetAssetId` (com índice e FK) e o CHECK `stock_movements_forma` é
reescrito. No banco de desenvolvimento, a categoria "Peça de reposição" mudou de tipo, sem
entrega nenhuma nos itens dela.

---

## AJ — O consumível é uma categoria, e o total é o que existe

**Decidido** (na validação de ITAM das telas de Licenças e Estoque, em 2026-10-28 — o usuário,
que está aprendendo ITAM, pediu para conferir se a lógica estava certa. A resposta apontou que o
cabo ou o toner dado de vez virava "em uso" para sempre. Ele respondeu "sobre os consumíveis é
interessante fazermos do mesmo formato que foi feito com componentes", e, entre o total como "o
que entrou" e como "o que existe", escolheu o segundo):

- **A categoria ganha o tipo Consumível**, ao lado de Estoque e Componente: o que se gasta e não
  volta, como toner e pilha. Vai a colaborador ou posto, como o estoque. A entrega tira do total na
  hora, não fica "em uso" com ninguém, não tem Devolver (409) e não prende o colaborador nem o
  posto. O detalhe do item não tem "Com quem está", e a linha mostra só "3 disponíveis". O
  histórico do item e o do colaborador mostram a entrega, e só ela.
- **O total é o que existe** e chega a 0 quando acaba: pelo consumo ou pela edição. O cadastro
  continua pedindo ao menos 1. O item com 0 continua ativo — "sem unidade disponível" — até alguém
  somar a compra nova. Reduzir à mão continua não passando do que está em uso.
- **Trocar a categoria** entre Estoque, Componente e Consumível só sem unidade em uso, como na AI.
  O consumível nunca tem unidade em uso, e passa a estoque sempre.
- **O seed** ganha a categoria "Material de consumo" (Consumível), e o seed demo, a "Pilha AA" e o
  "Toner para impressora".

**Supera:** em parte [AE](#ae--o-estoque-segue-a-lógica-da-licença-total-na-edição-entrega-com-dia-desativar-em-vez-de-lixeira)
(o total ao menos 1 sempre, e o item que acabou se desativa) e [J](#j--o-estoque-volta-como-stockitem--stockmovement)
(toda entrega pode ser devolvida).
**Mantém:** o saldo calculado ([D34](#d34--saldo-é-sempre-calculado-nunca-coluna)) — o
disponível continua `qty − em uso` —, a regra do posto ([AG](#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)),
a categoria que decide o alvo (AI) e o estoque sem baixa (AE): a unidade que quebrou ou se perdeu
volta pelo Devolver e sai do total pelo Editar.

**Por quê:** o cabo dado de vez ficava "em uso" com a pessoa até alguém registrar uma devolução
falsa — e impedia desativá-la quando saísse. O Snipe-IT separa o consumível (não volta) do
acessório (volta) e do componente (vai para dentro do ativo), com o tipo na categoria; aqui o
consumível segue o mesmo formato do componente. O total como "o que entrou" deixaria o mínimo 1 de
pé, mas a linha do item cresceria para sempre com o que já saiu.

**O que fica de fora, declarado:** a entrega de consumível lançada errado não se desfaz (some de
volta no total, pelo Editar). E o motivo da redução: chegou a ser feito — primeiro uma lista fixa
no Devolver, depois um "Dar baixa" com motivos num cadastro das Configurações — e saiu na mesma
conversa, porque só cobria a unidade entregue (a parada, que nunca saiu, continuava saindo pelo
Editar, sem motivo) e porque nem o GLPI nem o Snipe-IT têm baixa no estoque: lá também se devolve e
se edita a quantidade.

**O que a migração faz:** `CategoryType` ganha `CONSUMABLE`; o enum `StockReturnKind`
(`RETURNED`, `CONSUMED`) e a coluna `stock_movements.returnKind`, nula junto com `returnedAt`
(CHECK `stock_movements_fechamento_com_devolucao`); o CHECK `stock_items_qty_positiva` (`>= 1`)
vira `stock_items_qty_nao_negativa` (`>= 0`). A entrega do consumível grava as linhas já fechadas
— `returnedAt` igual ao `checkoutAt`, `CONSUMED` —, e por isso nenhuma conta de "em uso" e de
posse muda.
