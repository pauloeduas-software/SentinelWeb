# Estoque

> A tela `/estoque`: o que não é computador — monitor, teclado, mouse, cabo, e os componentes que
> vão para dentro dele, como memória e SSD —, com um total e a quem as unidades foram entregues. O
> que o item é, as contas, o que a entrega e a devolução recusam, e onde o estoque aparece fora da
> própria tela. É a lógica da licença ([`licencas.md`](licencas.md)), com quantidade. As decisões
> estão em [`../decisoes/estoque.md`](../decisoes/estoque.md) (a última é a
> [AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar));
> as regras que viram fato permanente no banco estão em [`invariantes.md`](invariantes.md)
> (a 6, a 21 e a 25).

---

## O que é

**N unidades intercambiáveis de uma mesma coisa**, sem patrimônio individual, entregues a quem
usa. Ativo é computador; o resto entra aqui, por quantidade. **Campos:** nome, categoria (do
tipo Estoque ou Componente, ativa) e quantidade, obrigatórios; localização (onde o que sobra fica guardado — o
Depósito de TI) e notas, opcionais. O cadastro não entra no histórico da tela, que é só entregas
e devoluções; ele fica na auditoria, no banco, com quem fez
([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)).

- **A quantidade é o total, de 1 a 100.000**, no cadastro e depois dele: zero não é item, e o que
  acabou se desativa. O piso tem o CHECK `stock_items_qty_positiva`; o teto é só da aplicação.
- **A categoria decide para onde o item vai**
  ([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar)):
  o de categoria Estoque vai a colaborador ou posto, e o de categoria **Componente** vai só a
  computador — ver [O componente](#o-componente). O formulário oferece as categorias dos dois
  tipos, e diz abaixo do campo quando a escolhida é de componente.
- **A entrega vai para um colaborador OU para um posto**, nunca os dois
  ([D33](../decisoes/estoque.md#d33--o-acessório-entregue-a-um-posto-é-do-posto-os-ocupantes-respondem-solidariamente)).
  Entregar 5 mouses à Mesa 1 vale **5**, qualquer que seja o número de ocupantes: quem responde
  por eles são os ocupantes abertos da mesa, e o posto vazio recebe — é a mesa preparada antes de
  a pessoa chegar.
- **O mesmo alvo recebe quantas vezes for**, e cada vez é uma entrega própria.
- **O nome é único entre todos os itens**, desativados inclusive, e sem diferença de maiúscula,
  como nas Configurações — "mouse usb" é o "Mouse USB" com outra grafia, e o 409 diz a grafia que
  existe: o item que volta a ser usado se reativa, com o histórico junto. `Já existe um item de
  estoque chamado "Mouse USB", desativado. Reative-o em vez de cadastrar outro.`
- **Não tem lixeira.** O item que pode voltar a ser comprado se **desativa**; o que não vai
  voltar se **exclui**, com a regra do posto ([AG](../decisoes/estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)): só o que está em uso
  agora impede.

## As contas

Nenhuma é coluna — saem das linhas de `stock_movements`, uma por unidade entregue, a cada
leitura ([D34](../decisoes/estoque.md#d34--saldo-é-sempre-calculado-nunca-coluna)):

| | |
|---|---|
| **em uso** | unidades entregues e não devolvidas |
| **disponível** | total − em uso |
| **já entregue** | alguma unidade, aberta ou devolvida — o item tem passado |

**Aumentar o total sempre pode. Reduzir não passa do que está em uso** (invariante 25), com a
mesma trava do item que a entrega usa:
`Não dá para reduzir "Mouse USB" para 1: 2 estão em uso. Devolva para liberar.`

**O disponível negativo aparece, em vermelho**, em vez de ser zerado: só acontece com uma linha
criada por fora da trava (o `psql` à mão), e esconder a inconsistência seria pior que mostrá-la.

## A tela

| | |
|---|---|
| **a lista** | **uma só**, pelo nome, com os desativados — sem abas, como nas Configurações. Busca por nome, categoria e localização — o texto ao pé da letra, `%` e `_` não são curinga; filtro de categoria |
| **a linha** | nome (e as notas), categoria, localização e "10 no total · 7 em uso · 3 disponíveis". Sem cor pelo valor. A do desativado fica esmaecida, com a marca "desativado" ao lado do nome |
| **as ações** | as das Configurações, que aparecem ao passar o mouse: Entregar (desabilitado sem disponível, com o motivo no `title`; some no desativado), Editar, Desativar/Ativar e Excluir — com confirmação no Desativar e no Excluir |
| **o detalhe** | no cabeçalho, a conta ("Desativado · 10 no total · 7 em uso · 3 disponíveis") e as ações da lista, com as mesmas regras (Entregar e Editar voltam ao detalhe ao fechar; excluído, a janela fecha). Depois, todos os campos do cadastro. **Com quem está**: as entregas abertas, da mais recente para a mais antiga, 15 por página, com busca pelo nome do colaborador ou do posto — "Mesa 1 · 5 unidades · desde 12/10/2026", com a observação —, e Devolver em cada linha. **Histórico**: só entregas e devoluções, por entrega, 15 por página, do mais recente para o mais antigo — no mesmo instante, a devolução vem antes da entrega |

A edição mostra o **total** e manda **o formulário inteiro**, como em todas as telas
([AF](../decisoes/licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)), com o `updatedAt` que leu ao abrir: se outra pessoa salvou no meio, é 409
`Outra pessoa salvou "Mouse USB" enquanto você editava. Feche e abra de novo para ver o que
mudou.`, e o total dela não volta. O servidor barra também o total abaixo do que está em uso. Com
unidades em uso, o campo diz o mínimo.

**Quando a última linha de uma página sai** — excluída, devolvida, aqui ou por outra pessoa —, a
lista e o "Com quem está" voltam para a última página que existe. **A devolução que o servidor
recusa** deixa a linha aberta, com o que foi escolhido, para tentar de novo — e a tela busca de
novo o que mudou, como na licença: toda ação, recusada ou não, atualiza a lista, o detalhe e as
contas. O cabeçalho do Entregar também lê o detalhe, e acompanha.

## Desativar, ativar e excluir

O cadastro é o das Configurações — os mesmos botões, a mesma ordem e as mesmas frases
([`configuracoes.md`](configuracoes.md)).

- **Desativar** deixa o item na lista, esmaecido e marcado — **mesmo com unidade fora**. A tela
  pergunta antes: `Desativar "Mouse USB"? Continua no histórico, mas some das escolhas e não recebe
  nada novo.` Desativado, ele não recebe entrega nova (409 `O item "Mouse USB" está desativado e
  não recebe entrega. Se ele voltou a ser usado, reative-o antes.`); o que está com alguém continua
  até voltar, e a conta da linha diz quantas. Avisa, não recusa — como o Encerrar da licença.
- **Ativar** é o mesmo botão, sem pergunta.
- **Excluir** é definitivo, com a **regra do posto** ([AG](../decisoes/estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)): só o que
  está **em uso agora** impede. O botão sempre clica, e pergunta `Excluir "Mouse USB"? Esta ação
  não tem lixeira.` Com unidade com alguém, a notificação diz com quem: `"Mouse USB" ainda tem 3
  unidades em uso (Laura Souza ×2 e Mesa 1). Devolva antes de excluir.` O que já foi entregue e
  voltou se exclui: as entregas devolvidas perdem a ligação e guardam o nome por escrito
  (`itemName`), e o histórico do colaborador continua dizendo "Recebeu: Mouse USB". O histórico do
  **próprio item** vai junto com ele — e com ele a única tela que mostrava as entregas devolvidas de
  um posto, que só mostra o que está nele agora. É o preço da exclusão; por isso o que pode voltar a ser
  comprado se desativa. A FK `Restrict` de `stock_movements` é a rede, e o CHECK
  `stock_movements_item_presente` não deixa a entrega em uso sem item. O excluído solta a categoria e
  a localização; o desativado continua segurando.

## A entrega e a devolução

**A entrega** escolhe o colaborador (o seletor mostra nome e e-mail) ou o posto, a quantidade (de
1 a 100), uma observação opcional e o **dia da entrega**: vem com hoje e pode voltar para
registrar a entrega que já aconteceu; futuro é 422. Ao contrário da licença, o dia passado não
tem outra recusa: o item não tem data de compra, e o mesmo alvo pode estar com várias unidades ao
mesmo tempo. A quantidade no passado não é conferida — a conta é sempre a de agora —, e as
recusas de estado olham **hoje**: o item, o colaborador e o posto desativados recusam a entrega
no passado mesmo que, naquele dia, estivessem em ordem.

**Cada unidade é uma linha**, e as N de uma entrega nascem no mesmo `INSERT`, com o mesmo
`createdAt`: é o que faz delas **uma entrega**. As listas mostram a entrega, e a devolução fecha
unidades dela. **A devolução também é uma só** pelo instante em que foi registrada
(`returnRecordedAt`, gravado junto com o dia): duas devoluções da mesma entrega no mesmo dia
passado — as duas ao meio-dia — continuam sendo duas no histórico do item e no da pessoa.
**A devolução parcial fecha as unidades de maior id**: a entrega é identificada pela menor unidade
ainda aberta, e assim ela continua com o mesmo `:id` depois de devolver parte.

**A devolução** pergunta **quantas** — por padrão, todas as que ainda estão fora nesta entrega — e
o **dia**, na própria linha de "Com quem está", no detalhe do item — o único lugar do sistema que
devolve estoque. Com uma unidade só, não pergunta quantas. O dia vem com hoje; pode ser passado,
mas nunca futuro nem antes do dia da entrega (422, com as duas datas). Hoje grava a hora real; um
dia passado grava o meio-dia de Brasília, e por isso as telas mostram a entrega e a devolução
**só pelo dia**. No mesmo dia, a devolução nunca fica antes da hora real da entrega. "Não antes da
entrega" tem também o CHECK.

A entrega confere **na ordem da tabela** e responde a primeira recusa — o colaborador na lixeira
é 404 mesmo com o item desativado. As três últimas linhas são da devolução.

| Tentativa | Resposta |
|---|---|
| entrega ou devolução num dia futuro | 422 `data da entrega não pode ser uma data futura` / `data da devolução não pode ser uma data futura` |
| quantidade zero, ou mais de 100 numa entrega | 422 |
| dois alvos, ou nenhum | 422 `Uma entrega tem UM alvo: preencha só a chave que corresponde ao targetType (PERSON).` / `Entrega do tipo "WORKSTATION" exige um posto (targetWorkstationId).` |
| item, colaborador ou posto que não existe, ou colaborador na lixeira | 404 |
| colaborador ou posto desativado | 409 `Laura Souza está desativado(a) e não pode receber equipamento.` / `"Mesa 1" está desativado e não recebe entrega de estoque.` |
| item desativado | 409 `O item "Mouse USB" está desativado e não recebe entrega. …` |
| sem unidade | 409 `Sem unidade disponível de "Mouse USB": 10 no total, 10 em uso. Devolva uma unidade ou aumente o total.` — ou, com menos do que a entrega pede, `Sem unidade suficiente de "Mouse USB": a entrega pede 3 e há 2 disponíveis (10 no total, 8 em uso).` |
| devolução antes do dia da entrega | 422 `A devolução (09/03/2026) não pode ser antes da entrega (10/03/2026).` |
| devolver mais do que ainda está fora na entrega | 409 `Só 2 unidades desta entrega de "Mouse USB" ainda estão com Mesa 1.` |
| devolver uma entrega já devolvida | 409 `Esta entrega de "Mouse USB" para Mesa 1 já foi devolvida.` |

**A devolução é pela entrega**, não pelo item nem pelo alvo: o `:id` é o de qualquer unidade dela,
e o clique de uma tela velha encontra a entrega antiga já fechada, sem devolver a de quem recebeu
depois. Devolver sempre pode, mesmo com o item desativado, e não pede confirmação.

## O componente

**O item cuja categoria é do tipo Componente** — memória, SSD — vai **só para um computador**,
e fica "em uso" nele ([AI](../decisoes/estoque.md#ai--o-componente-é-uma-categoria-vai-só-para-computador-e-sai-pelo-retirar)).
A "Peça de reposição" do seed é Componente. As contas, o total, o desativar e o excluir são os
mesmos do resto do estoque.

- **O Entregar** do componente não tem a escolha entre colaborador e posto, só o computador (o
  seletor dos computadores sem baixa). A entrega não vem antes da compra do computador.
- **Fica no computador** quando ele é entregue a alguém ou devolvido: a peça está dentro da
  máquina.
- **Sai pelo Retirar**, que é a devolução: quantas e o dia, na linha de **Em quais computadores**
  (o "Com quem está" do componente, com busca pela etiqueta ou pelo nome do computador). Serve à
  troca de peça, à máquina que vai ser descartada e à entrega lançada errado. Se a peça saiu junto
  com a máquina, retire e depois diminua o total do item.
- **O computador com componente instalado não recebe baixa nem vai para a lixeira** — a regra da
  licença por máquina. O 409 diz quais, com cada item em link para o detalhe dele.
- **A compra do computador** editada não vai para depois do primeiro componente instalado.
- **Trocar a categoria** do item entre Estoque e Componente só sem unidade em uso.

| Tentativa | Resposta |
|---|---|
| componente para colaborador ou posto | 422 `"Memória RAM 8 GB" é componente e vai só para um computador.` |
| item de estoque para computador | 422 `"Mouse USB" não é componente: vai para um colaborador ou um posto, não para um computador.` |
| computador inexistente ou na lixeira | 404 `Ativo não encontrado.` |
| computador baixado | 409 `O ativo ATV-00012 teve baixa e não pode receber componente.` |
| entrega antes da compra do computador | 422 `A entrega (09/03/2026) não pode ser antes da compra de ATV-00012 — Dell do financeiro (10/03/2026).` |
| retirar antes do dia da entrega, ou de novo | 422 `A retirada (…) não pode ser antes da entrega (…).` / 409 `Esta entrega de "Memória RAM 8 GB" para ATV-00012 já foi retirada.` |
| baixa ou lixeira do computador com componente | 409 `ATV-00012 ainda tem os componentes Memória RAM 8 GB ×2. Retire pela tela de Estoque antes de dar baixa.` (na lixeira, `Este ativo ainda tem … antes de excluir.`) |
| compra do computador depois do primeiro componente | 422 `A data de compra (…) não pode ser depois do primeiro componente instalado em ATV-00012 (…).` |
| trocar a categoria com unidade em uso | 409 `"Memória RAM 8 GB" tem 2 unidades em uso e não pode passar de componente para estoque. Retire antes de trocar a categoria.` |

## Fora da tela de Estoque

| Onde | O quê |
|---|---|
| **ficha do posto** | o estoque **da mesa**, por entrega, com quantas e desde quando; o nome leva ao detalhe do item com "Com quem está" já filtrado pelo posto (`/estoque?item=<id>&busca=Mesa 1`), onde está o Devolver. O item desativado aparece marcado. Não conta como ativo do posto |
| **ficha do colaborador** | o estoque **no nome dela**, com o mesmo link, filtrado pelo nome dela; o título conta as unidades, como a ficha do posto e o 409 da desativação |
| **histórico do colaborador** | entregas e devoluções de estoque **a ela**, por entrega ("Recebeu: Mouse USB · 2 unidades") |
| **aba Componentes do computador** | os componentes instalados **nele**, por entrega, com categoria, quantas e desde quando; o nome leva ao detalhe do item já filtrado pela etiqueta, onde está o Retirar |
| **histórico do computador** | a instalação e a retirada de cada componente, por entrega ("Componente instalado: Memória RAM 8 GB · 2 unidades") |

**Separado por alvo:** o que foi entregue ao posto é da mesa, e não aparece na pessoa que o ocupa
— quem sai da empresa não leva o mouse da Mesa 1.

**É posse** (invariante 6): o colaborador com unidade no nome não se desativa nem se exclui, e o
posto com unidade não se exclui. **A recusa diz quais itens precisam voltar**, pelo nome e com
quantas — `… está com 3 unidades de estoque (Mouse USB ×2 e Teclado) …`, `Este posto ainda tem 1
ativo, 3 unidades de estoque (Cabo HDMI ×3) e 1 ocupante. Tire o que está nele agora …` — e manda
cada item como `refs` ao lado da frase: a notificação põe um link para o detalhe de cada um. Nada
fecha sozinho.

## Como o código é montado

Fatia vertical inteira (`server/domain/stock/`), e não spec do catálogo: a coluna principal da
lista é derivada
([D35](../decisoes/estoque.md#d35--um-domínio-stock-não-três-fatias-verticais)).

| Rota | O que é |
|---|---|
| `GET /api/stock/items` | a lista, com os desativados (`?categoryId=`, `?q=`; `view` e `emUso` são 422) |
| `GET /api/stock/items/:id` | o item, com a conta |
| `GET /api/stock/items/:id/checkouts` | quem está com ele, por entrega (`?page=`, `?q=` pelo nome; 15 por página) |
| `GET /api/stock/items/:id/history` | o histórico, por entrega (`?page=`; 15 por página, sem busca — `?q=` é 422) |
| `POST`, `PUT /:id`, `DELETE /:id` | o cadastro; a edição muda também o total e o `isActive` (Desativar e Ativar); excluir o que não está em uso (204), soltando as entregas devolvidas com o nome por escrito |
| `POST /api/stock/items/:id/checkout` | entregar (`targetType`, um só de `targetPersonId`, `targetWorkstationId` e `targetAssetId` — este, só no componente —, `qty`, `notes`, `checkoutAt` — o dia) |
| `POST /api/stock/checkouts/:id/checkin` | devolver, ou retirar o componente (`qty` — ausente é todas —, `checkinAt` — o dia; ausente é hoje) — o `:id` é o de uma unidade da **entrega** |
| `GET /api/assets/:id/components` | os componentes instalados num computador — a aba Componentes |

Todas `ADMIN` ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)).

**As travas:** a entrega trava o **colaborador** (no alvo pessoa) ou o **computador** (no
componente) e depois o **item**; o posto é lido `FOR SHARE` depois do item. A baixa e a lixeira do
computador o travam antes de contar os componentes. A edição e a exclusão travam o item. A devolução trava só as
linhas da entrega: ela só diminui o que está em uso. A entrega agrupada mora em
`helpers/stock-lote.helper.ts`; a conta, em `helpers/stock-balance.helper.ts`.

**A busca** é a `contemTexto` (`server/domain/shared/busca.helper.ts`), a mesma de todas as
listagens. As ordens terminam em `id`, para a mesma linha não aparecer em duas páginas.

## O que não existe

- entrada e baixa — o total é um número que se digita na edição;
- lixeira e restaurar;
- vencimento, status, chave e dados de compra — são do contrato da licença;
- alerta de mínimo, e alerta, aba ou filtro de "desativado ainda em uso" — a linha esmaecida mostra a conta;
- entrega para vários alvos de uma vez;
- entregar ou devolver fora da tela de Estoque;
- observação na devolução (só existe na entrega);
- tela de auditoria: quem cadastrou, mudou o total, desativou ou excluiu está só no banco.

## Onde é testado

| Assunto | Arquivo |
|---|---|
| a lista (conta, busca, o desativado na mesma lista), "Com quem está" por entrega, a devolução parcial, o histórico por entrega (duas devoluções no mesmo dia são duas), os dias, as fichas e o histórico do colaborador | `tests/estoque/operacoes.test.ts` |
| o saldo calculado, as frases sem unidade, o posto que não multiplica, os CHECKs, o total na edição e na auditoria, a quantidade que é número de verdade, o nome único sem diferença de maiúscula, a categoria, desativar e excluir (a regra do posto, com o nome por escrito), a invariante 6 e o 409 do posto com os itens, as rotas | `tests/estoque/invariantes.test.ts` |
| o componente: a categoria que decide o alvo, o computador baixado e na lixeira, as datas contra a compra, o componente que fica quando o computador muda de mãos, o Retirar, os dois históricos, a busca pela etiqueta, a baixa e a lixeira recusadas, a troca de categoria, o seletor com os dois tipos e o CHECK | `tests/estoque/componente.test.ts` |
| as corridas: entregas simultâneas, total × entrega, devoluções da mesma entrega, a troca do tipo da categoria × cadastro, exclusão × entrega e o item e o posto excluídos ao mesmo tempo | `tests/estoque/corridas.test.ts` |
