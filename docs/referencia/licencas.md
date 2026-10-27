# Licenças

> A tela `/licencas`: o contrato de software, a quantidade comprada e a quem ela foi
> entregue. O que a licença é, as contas, o que a entrega e a devolução recusam, as chaves de
> produto, e onde a licença aparece fora da própria tela. As decisões estão em
> [`../decisoes/licencas.md`](../decisoes/licencas.md) (a última é a
> [AD](../decisoes/licencas.md#ad--renovar-é-editar-o-vencimento-o-suporte-a-oem-e-o-comprovante-não-viram-campo));
> as regras que viram fato permanente no banco estão em [`invariantes.md`](invariantes.md)
> (a 6, a 9, a 20, a 22, a 23 e a 24).

---

## O que é

**Um contrato com uma quantidade comprada**, entregue um a um a quem usa. **Campos:** nome,
categoria (do tipo Licença, ativa) e quantidade comprada, obrigatórios; vencimento,
encerramento, licenciado para (nome e e-mail), fabricante, pedido, data e valor da compra,
notas e as chaves do produto, opcionais. O cadastro não entra no histórico da tela, que é só
entregas e devoluções; ele fica na auditoria, no banco, com quem fez ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)) — e as chaves só
como quantas entraram, mudaram e saíram, nunca o texto.

- **A quantidade vai de 1 a 100.000**: zero não é contrato, e a licença que acabou se encerra. O
  piso tem o CHECK `licenses_seats_positivo`; o teto é só da aplicação.
- **O vencimento e o encerramento não antecedem a data da compra.** Cada um só é comparado
  quando os dois lados estão preenchidos, e o encerramento não é comparado com o vencimento — dá
  para encerrar antes do fim do período pago. A recusa é 422 com as duas datas
  (`O vencimento (05/03/2026) não pode ser antes da data da compra (10/03/2026).`); na edição, a
  data que não veio no corpo é a que está gravada. Os CHECKs `licenses_*_nao_antecede_compra`
  são a rede.
- **As datas da licença cobrem as entregas que ela já tem.** Na edição, a compra não fica depois
  da primeira entrega (`A data da compra (06/03/2026) não pode ser depois da primeira entrega
  (05/03/2026).`) e o encerramento não fica antes da última (`O encerramento (01/10/2026) não pode
  ser antes da última entrega (10/10/2026).`) — no mesmo dia passa. Só a data que **muda** é
  conferida: o formulário reenvia todas, e a licença antiga com a ordem trocada continua editável
  nos outros campos. O Encerrar do botão grava hoje, que nunca vem antes de entrega nenhuma.
- **A entrega vai para um colaborador OU para um computador**, nunca os dois e nunca para um
  posto ([D39](../decisoes/licencas.md#d39--assento-de-licença-não-vai-para-um-posto)). Licença
  por máquina (Windows de volume, Office avulso) vai para o ativo; por assinatura de pessoa
  (Microsoft 365, Adobe), para o colaborador. O computador da mesa recebe a licença, não a mesa.
- **A licença OEM não entra aqui** ([AD](../decisoes/licencas.md#ad--renovar-é-editar-o-vencimento-o-suporte-a-oem-e-o-comprovante-não-viram-campo)): o Windows ou o Office que veio de fábrica no
  computador é dele, não passa para outro e acaba com ele. O formulário da licença nova avisa.
- **O mesmo alvo não recebe a mesma licença duas vezes** enquanto a primeira está aberta
  (invariante 23).
- **Devolvida, a licença volta a ficar livre.** Não existe licença que "queima" na devolução.
- **O nome pode repetir**: o contrato novo (outra versão, outro fornecedor) convive com o antigo
  encerrado. A renovação do mesmo contrato não é licença nova: edita-se o vencimento ([AD](../decisoes/licencas.md#ad--renovar-é-editar-o-vencimento-o-suporte-a-oem-e-o-comprovante-não-viram-campo)).
- **Não tem lixeira.** O contrato que se quer guardar se **encerra**; o que não se quer mais ver
  se **exclui**, com a regra do posto ([AG](../decisoes/estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)): só o que está em uso agora
  impede.

## As contas

Nenhuma é coluna — saem das linhas de entrega (`license_checkouts`) a cada leitura:

| | |
|---|---|
| **em uso** | entregas abertas |
| **livres** | compradas − em uso |
| **já entregue** | alguma entrega, aberta ou devolvida — a licença tem passado |

**Aumentar a quantidade sempre pode. Reduzir não passa do que está em uso** (invariante 22),
com a mesma trava da licença que a entrega usa:
`Não dá para reduzir "Office 2021" para 6: 7 estão em uso. Devolva para liberar.`

## O status

Calculado das datas e do dia de hoje **em Brasília** (`hojeNoBrasil`), nunca gravado
([D44](../decisoes/licencas.md#d44--status-da-licença-é-derivado-nunca-coluna)):

| Status | Quando |
|---|---|
| **Encerrada** | o dia do encerramento chegou (hoje ou antes). Ganha de tudo |
| **Vencida** (`EXPIRADA`) | o vencimento já passou — o dia do vencimento ainda vale |
| **Vencendo** | vence nos próximos 30 dias, hoje incluído |
| **Ativa** | o resto, inclusive sem vencimento |

O **vencimento** é até quando a licença pode ser usada, e se renova editando a data: quem está
com ela continua, e o pedido, a data e o valor da compra podem passar a ser os da renovação — o
de antes fica na auditoria. A perpétua fica sem vencimento. O formulário diz isso embaixo do
campo, e diz embaixo do pedido que ali vai o pedido ou a nota fiscal, o comprovante. O
**encerramento** é o fim do contrato. Numa listagem, o filtro e o status de cada linha usam o
mesmo hoje: a requisição que cruza a meia-noite não devolve, no filtro Vencendo, uma linha já
vencida.

## A tela

| | |
|---|---|
| **a lista** | **uma só**, por nome, como nas Configurações ([AF](../decisoes/licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)): a encerrada fica junto, esmaecida e com a marca "encerrada". Busca por nome, licenciado, e-mail, pedido, categoria e fabricante — o texto ao pé da letra, `%` e `_` não são curinga; filtro de categoria; filtro de status (Todos, Ativas, Vencendo, Vencidas, Encerradas — esta pela mais recente); com Encerradas, "Ainda em uso". Sair de Encerradas desliga o "Ainda em uso" |
| **a linha** | nome, categoria, status, "10 compradas · 7 em uso · 3 livres" e prazo (ou "encerrada em" e a data). Fabricante e custo ficam só no detalhe. Sem cor por status |
| **as ações** | aparecem ao passar o mouse, como nas Configurações: Entregar (some na encerrada; desabilitado sem livre ou vencida, com o motivo no `title`), Editar, Encerrar/Reabrir (os ícones do Desativar/Ativar) e Excluir. O Excluir é o das Configurações: sempre clica, e a que está em uso recebe o 409, que diz com quem está |
| **o detalhe** | no cabeçalho, o status com a conta ("Vencida · 10 compradas · 7 em uso · 3 livres") e as ações da lista, com as mesmas regras (Entregar e Editar voltam ao detalhe ao fechar; excluída, a janela fecha). Depois, as **chaves do produto**, numeradas, cada uma com quanto está tomado ("livre", "em uso", "cobre 10 · 3 livres"), e todos os campos do cadastro — o valor da compra é o total, com o preço de cada licença ao lado: "R$ 5.000,00 (R$ 500,00 por licença)". **Com quem está**: as entregas abertas, da mais recente para a mais antiga, 15 por página, com busca pelo nome do colaborador ou do computador, a chave de cada uma (com o número dela na lista, ou "sem chave" na entrega feita antes de a licença ter chaves), e Chave — quando a licença tem chaves — e Devolver em cada linha. **Histórico**: só entregas e devoluções, 15 por página, do mais recente para o mais antigo — no mesmo instante, a devolução vem antes da entrega |
| **o alerta** | só nesta tela, numa caixa só, do mais urgente para o menos: encerrada ainda em uso, vencida (a mais recente primeiro; fica até alguém renovar ou encerrar, mesmo sem ninguém usando — é decisão pendente), vencendo em 30 dias (a mais próxima primeiro). Cada linha diz quantas estão em uso, na mesma frase nos três motivos — "venceu há 3 dias, ainda em uso (7)"; sem ninguém usando, só o prazo. Embaixo, a contagem de cada motivo com link — "2 encerradas em uso · 5 vencidas · 3 vencendo" —, que leva ao filtro que mostra todas aquelas (encerradas em uso: o status Encerradas com "Ainda em uso"). Não existe alerta de mínimo |

A edição manda **o formulário inteiro**, a lista de chaves junto, como em todas as telas
([AF](../decisoes/licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)), com o `updatedAt` que leu ao abrir: se outra pessoa salvou, encerrou ou
reabriu no meio, é 409 `Outra pessoa salvou "Office 2021" enquanto você editava. Feche e abra de
novo para ver o que mudou.`, e nada se grava. A entrega não esbarra nisso: grava em outra tabela.
Ela abre com o **detalhe** da
licença, e não com a linha da listagem: é o detalhe que traz as chaves. E com o detalhe **buscado
na hora**, nunca o que sobrou no cache de uma visita anterior: o guardado podia ser de antes de um
Encerrar, e salvar só as notas reabria a licença.

**O valor da compra** tem máscara de dinheiro: o campo mostra `R$ 1.234,56` e manda `1234.56`.
Os dígitos entram pelos centavos — apagar o último de `R$ 1.234,50` deixa `R$ 123,45` —, e
param nos 10 dígitos e 2 casas que o servidor aceita. O servidor aceita ponto ou vírgula nos
centavos e nenhum ponto de milhar: `1.234,56` é 422 com o nome do campo,
`valor de compra: use um valor como 1234.50`. As datas vêm do seletor.

**Quando a última linha de uma página sai** — excluída, encerrada, devolvida, aqui ou por outra
pessoa —, a lista e o "Com quem está" voltam para a última página que existe. **A devolução que o
servidor recusa** deixa a linha aberta, com o dia escolhido, para tentar de novo — e a tela busca
de novo o que mudou: toda ação, recusada ou não, atualiza a lista, o detalhe e as contas, porque o
409 quase sempre quer dizer que outra pessoa mexeu no meio. O cabeçalho do Entregar também lê o
detalhe, e acompanha.

## Encerrar, reabrir e excluir

- **Encerrar** é o Desativar da licença ([AF](../decisoes/licencas.md#af--a-licença-entra-no-cadastro-das-configurações-e-o-editar-manda-o-formulário-inteiro)): grava hoje na data de encerramento, e a
  licença fica na lista, esmaecida — **mesmo com alguém usando**. A tela pergunta antes, com a
  frase do padrão: `Encerrar "AutoCAD" hoje? Continua no histórico, mas some das escolhas e não
  recebe nada novo. Ainda está com 3: fica no alerta até tudo voltar.` (a última frase só com
  alguém usando). Encerrada, ela não recebe entrega nova, e fica no alerta *encerrada, ainda em uso* até tudo
  ser devolvido. O formulário segue a mesma regra. É o padrão do sistema para o que tem data e
  para o que se desativa: avisa, não recusa — recusar não impediria nada, porque a data futura
  chega sozinha. A licença com a data da compra no futuro não se encerra hoje: é o mesmo 422 do
  formulário, `O encerramento (…) não pode ser antes da data da compra (…).`
- **Reabrir** é o Ativar: o mesmo botão, na encerrada, apaga a data de encerramento sem perguntar
  — a mesma edição que o formulário faz ao apagar a data.
- **Excluir** é definitivo, com a **regra do posto** ([AG](../decisoes/estoque.md#ag--a-regra-do-posto-vale-para-o-estoque-e-a-licença-só-o-que-está-em-uso-impede-a-exclusão)): só o que está
  **em uso agora** impede. O botão sempre clica, e pergunta, como nas Configurações, `Excluir
  "Office 2021"? Esta ação não tem lixeira.` Com entrega aberta, a notificação diz com quem:
  `"Office 2021" ainda tem 2 entregas em uso (ATV-00012 — Dell Latitude e Laura Souza). Devolva
  antes de excluir.` A que já foi entregue e voltou se exclui: as entregas devolvidas perdem a
  ligação e guardam o nome por escrito (`licenseName`), e o histórico do computador e o do
  colaborador continuam dizendo "Office 2021". **As chaves vão junto** — a entrega devolvida perde
  também a dela, que só aparecia no detalhe da licença. O histórico **da própria licença** vai
  junto com ela — o preço da exclusão; por isso o contrato que se quer guardar se encerra. A FK
  `Restrict` de `license_checkouts` é a rede, e o CHECK `license_checkouts_licenca_presente` não
  deixa a entrega em uso sem licença. A excluída solta a categoria e o fabricante; a encerrada
  continua segurando.

## A entrega e a devolução

**A entrega** escolhe o colaborador (o seletor mostra nome e e-mail — é o que separa dois "João
Silva"; o cadastro de colaborador não tem setor) ou o computador, a **chave** desta entrega —
uma das chaves da licença, obrigatória quando ela tem chaves (ver [*As chaves de
produto*](#as-chaves-de-produto)) —, uma observação opcional e o **dia da entrega**: vem com hoje e pode
voltar para registrar a entrega que já aconteceu; futuro é 422. O dia passado não antecede a
data da compra, nem o dia em que o **mesmo alvo** devolveu esta licença — ele não fica com ela
duas vezes no mesmo período (422). No próprio dia da devolução passa, gravada um milissegundo
depois dela, e o histórico fica na ordem. A quantidade no passado (quantas estavam em uso
naquele dia) não é conferida: a conta de livres é sempre a de agora. As recusas de estado também
olham **hoje**, e não o dia informado: a licença vencida ou encerrada, o colaborador desativado e
o computador baixado recusam a entrega no passado mesmo que, naquele dia, estivessem em ordem.

**A devolução** pede só o **dia**, na própria linha de "Com quem está", no detalhe da licença —
o único lugar do sistema que devolve licença. Vem com hoje; pode ser passado, mas nunca futuro
nem antes do dia da entrega (422, com as duas datas). Os dois dias são o calendário de
Brasília: hoje grava a hora real; um dia passado grava o meio-dia de Brasília, e por isso as
telas mostram a entrega e a devolução **só pelo dia**. No mesmo dia, a devolução nunca fica
antes da hora real da entrega. "Não futuro" é conferido pela aplicação — o banco não sabe bem
que dia é hoje; "não antes da entrega" tem também o CHECK.

A entrega confere **na ordem da tabela** e responde a primeira recusa — o colaborador na
lixeira é 404 mesmo com a licença vencida. As duas últimas linhas são da devolução.

| Tentativa | Resposta |
|---|---|
| entrega ou devolução num dia futuro | 422 `data da entrega não pode ser uma data futura` / `data da devolução não pode ser uma data futura` |
| dois alvos, nenhum, ou posto | 422 — com dois: `Uma entrega tem UM alvo: informe o colaborador OU o ativo, nunca os dois.`; o posto nem é campo |
| ativo ou colaborador que não existe, ou na lixeira | 404 `Ativo não encontrado.` / `Colaborador não encontrado.` |
| ativo baixado / colaborador desativado | 409 `O ativo ATV-00042 teve baixa e não pode receber licença.` / `Laura Souza está desativado(a) e não pode receber licença.` |
| licença encerrada ou vencida | 409 `A licença "Office 2021" está encerrada e não recebe entrega. Se o contrato voltou, reabra-a antes.` / `A licença "Office 2021" venceu há 3 dias e não recebe entrega: renove o contrato e atualize a data de vencimento antes.` — a vencendo entrega normalmente |
| o mesmo alvo de novo | 409 `Laura Souza já está com "Office 2021". Uma licença vai uma vez para cada computador ou colaborador.` |
| entrega antes da data da compra | 422 `A entrega (05/03/2026) não pode ser antes da data da compra (10/03/2026).` — e, para um computador, antes da compra dele: `A entrega (05/03/2026) não pode ser antes da compra de ATV-00042 (10/03/2026).` O outro lado também: a data de compra do computador não muda para depois da primeira licença entregue a ele (422) |
| entrega antes do dia em que o mesmo alvo devolveu | 422 `A entrega (05/03/2026) não pode ser antes de 10/03/2026: até esse dia Laura Souza estava com "Office 2021".` |
| sem licença livre | 409 `Sem licença livre em "Office 2021": 10 compradas, 10 em uso. Devolva uma entrega ou aumente a quantidade comprada.` |
| licença com chaves, e nenhuma escolhida | 422 `Escolha a chave desta entrega: "Office 2021" tem chaves cadastradas.` — ou, com todas as chaves tomadas, 409 `Todas as chaves de "Office 2021" estão em uso. Cadastre a chave da próxima licença, em Editar, antes de entregar.` |
| a chave não é desta licença (ou a licença não tem chave) | 404 `Chave não encontrada nesta licença.` |
| a chave já está em tantas entregas abertas quanto cobre | 409 `Esta chave já está em outra entrega aberta de "Office 2021". Escolha outra.` — na de volume, `Esta chave de "Office 2021" cobre 10, e as 10 estão em uso. Escolha outra.` |
| devolução antes do dia da entrega | 422 `A devolução (09/03/2026) não pode ser antes da entrega (10/03/2026).` |
| devolver uma entrega já devolvida | 409 `Esta entrega de "Office 2021" para Laura Souza já foi devolvida.` — e trocar a chave dela, o mesmo 409 terminado em `: a chave não muda mais.` |

**A devolução é pela entrega**, não pela licença nem pelo alvo: o clique de uma tela velha
encontra a entrega antiga já fechada, e não devolve quem recebeu depois. Devolver sempre pode,
mesmo com a licença vencida ou encerrada, e não pede confirmação: a licença só volta a ficar
livre.

## As chaves de produto

**Uma lista**, em `license_keys`
([AC](../decisoes/licencas.md#ac--a-chave-vira-lista-cada-uma-cobre-uma-quantidade-e-a-entrega-escolhe-uma)):
cada chave numa linha, com quantas licenças ela **cobre** — 1 na individual, mais na de volume.

| | |
|---|---|
| **no formulário** | uma embaixo da outra, com "Adicionar chave", o "cobre" de cada uma e o ✕. Colar uma lista com várias linhas cria uma chave para cada linha. Acima da lista, a conta: "8 de 10 licenças com chave". A linha nova deixada em branco não vai; a chave que já existia não se tira apagando o texto — é o ✕ |
| **as regras** | uma linha, não vazia, sem repetir na licença (422 `A mesma chave aparece duas vezes na lista.`) — sem diferença de maiúscula: `abcd-1234` e `ABCD-1234` são a mesma chave, e a gravada fica como foi digitada. Juntas, cobrem no máximo o comprado: o "Adicionar" para quando chegam lá, e o servidor responde 422 `As chaves cobrem 12, mais do que 10 compradas em "Office 2021". …`; reduzir a quantidade abaixo do que elas cobrem é o mesmo 422 pelo formulário, que manda a lista junto, e 409 `Não dá para reduzir "Office 2021" para 3: as chaves cobrem 4. Tire uma chave ou diminua o que ela cobre antes.` num `PUT` sem a lista |
| **a já entregue** | não sai da lista (409 `Uma chave que já foi entregue não sai da lista: o histórico de quem a usou depende dela.`), e não cobre menos do que as entregas abertas com ela (409 `Uma chave não cobre menos do que as entregas abertas com ela: 2 estão com ela. Devolva para liberar.`). O texto dela pode mudar: é a correção de digitação, e vale para as entregas dela. É também a renovação que trouxe chave nova (AD): a chave só aparece nas entregas abertas, e o histórico não a mostra |
| **na entrega** | com chaves cadastradas, a entrega **escolhe uma** — é o que diz qual chave está com cada um. O seletor mostra só as que têm lugar, pelo número e pelo começo ("3. ABCDE-FGHIJ-•••••-•••••-••••• — cobre 10 · 3 livres"), e com uma só ela já vem escolhida. A licença sem chave nenhuma — a assinatura por conta, como o Microsoft 365 — entrega sem chave. As chaves podem cobrir menos do que o comprado (as outras chegam depois), mas a licença que tem chaves não entrega sem chave: a entrega além do que elas cobrem espera a próxima, cadastrada em Editar |
| **trocar** | a chave de uma entrega **aberta**, por outra com lugar, na linha de "Com quem está" (`PATCH` com `licenseKeyId`). Não existe "limpar". É também como a entrega feita antes de a licença ter chaves ganha a sua. Devolvida é 409; sem lugar, 409 |
| **onde aparece** | **só no detalhe da licença**: a lista, no topo, e a de cada entrega, em "Com quem está", com o mesmo número; e no seletor da entrega. Sempre escondida — `ABCDE-FGHIJ-•••••-•••••-•••••` —, com **Mostrar** e **Copiar** em cada uma |
| **como se esconde** | com três grupos ou mais, ficam os dois primeiros; com dois, o primeiro. Sem hífen, com um grupo vazio, ou quando o que ficaria à mostra é quase a chave inteira (`…XY-Z`), ficam só os primeiros caracteres — um terço, até quatro |
| **onde não** | a lista, a busca (que também não procura por ela), o alerta, o histórico, a aba Licenças do ativo e a ficha do colaborador. As rotas delas não devolvem a chave |
| **na auditoria** | só quantas chaves entraram, mudaram e saíram (`chaves: { incluidas, alteradas, removidas }`), e, na entrega e na troca, qual chave pelo `licenseKeyId` — nunca o texto |

**No banco**, a chave da entrega é da própria licença pela FK composta (`licenseKeyId`,
`licenseId`) → `license_keys(id, licenseId)`, e cada chave cobre ao menos uma e não é vazia
(invariante 24). Quantas entregas abertas cada chave tem, e quanto as chaves somam, são contas da
aplicação, com a licença travada. Excluir a licença leva as chaves junto, e a entrega devolvida
perde a dela (AG).

As chaves ficam **em texto** no banco: a cifra saiu inteira na
[G](../decisoes/licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples),
e o que as protege é a tela escondê-las e só o detalhe devolvê-las.

## Fora da tela de Licenças

| Onde | O quê |
|---|---|
| **aba Licenças do ativo** | as entregas abertas **àquele computador**: licença, categoria, situação ("Ativa · vence em 20 dias") e desde quando, com a observação embaixo do nome; o nome leva ao detalhe da licença com "Com quem está" já filtrado pela etiqueta (`/licencas?licenca=<id>&busca=ATV-00012`), onde está o Devolver |
| **ficha do colaborador** | as entregas abertas **a ela**, com as mesmas colunas e o mesmo link, filtrado pelo nome dela |
| **histórico do ativo** | entregas e devoluções de licença **ao ativo** |
| **histórico do colaborador** | entregas e devoluções de licença **a ela** |

**Separadas por alvo:** a licença entregue ao computador é dele, e não aparece na pessoa que
responde por ele; a entregue à pessoa é dela, e não aparece no computador que ela usa.

**É posse** ([D93](../decisoes/licencas.md#d93--assento-é-posse-e-a-posse-do-projeto-já-tem-três-lugares)):
o colaborador com licença aberta não se desativa nem se exclui, e o ativo com licença aberta não
dá baixa nem vai para a lixeira. **A recusa diz quais licenças precisam voltar**, pelo nome —
`Este colaborador ainda tem 3 licenças (AutoCAD, Office e VPN). Devolva o que está com ele …`,
`ATV-00042 ainda tem a licença SolidWorks. Devolva pela tela de Licenças …` — e manda cada uma
como `refs` ao lado da frase: a notificação (e o modal de baixa) põe um link para o detalhe de
cada licença. É o caminho rápido do funcionário que sai, já que o Devolver só existe no detalhe
da licença. Nada fecha sozinho. A licença do computador não prende a pessoa.

## Como o código é montado

Fatia vertical inteira (`server/domain/license/`), e não spec do catálogo: a coluna principal
da lista é derivada.

| Rota | O que é |
|---|---|
| `GET /api/licenses` | a lista, uma só (`?status=ATIVA\|VENCENDO\|EXPIRADA\|ENCERRADA`, `?emUso=sim`, `?categoryId=`, `?q=`; `?view=` é 422) — sem a chave |
| `GET /api/licenses/alerts` | o alerta: `{ total, contagem, rows }` — a contagem por motivo, e em `rows` só as seis primeiras na ordem de urgência, as que a caixa lista, cada uma com o seu `motivo` |
| `GET /api/licenses/:id` | o detalhe — a única leitura da licença com as chaves (`keys`, cada uma com `seats`, `emUso` e `jaEntregue`) |
| `GET /api/licenses/:id/checkouts` | quem está com ela, com a chave de cada entrega (`?page=`, `?q=` pelo nome; 15 por página) |
| `GET /api/licenses/:id/history` | o histórico (`?page=`; 15 por página, sem busca — `?q=` é 422) |
| `POST`, `PUT /:id`, `DELETE /:id` | o cadastro, com `keys` — a lista das chaves como ficará; na edição, ausente mantém as que estão —; excluir a que não está em uso, soltando as entregas devolvidas com o nome por escrito |
| `POST /api/licenses/:id/terminate` | Encerrar |
| `POST /api/licenses/:id/checkout` | entregar (`assignedPersonId` XOR `assignedAssetId`, `notes`, `checkoutAt` — o dia —, `licenseKeyId`) |
| `POST /api/licenses/checkouts/:id/checkin` | devolver (`checkinAt` — o dia; ausente é hoje) — o `:id` é o da **entrega** |
| `PATCH /api/licenses/checkouts/:id` | trocar só a chave (`licenseKeyId`) de uma entrega aberta |
| `GET /api/assets/:id/licenses` | a aba Licenças do ativo |

Todas `ADMIN` ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)).

**As travas:** a entrega trava o **alvo** e depois a **licença**
(`lock-license.usecase.ts`); a edição, o Encerrar, a exclusão e a troca de chave travam a
licença (a troca, depois a linha da entrega); a devolução trava só a linha da entrega. A ordem
alvo → licença → entrega é o que mantém o grafo sem ciclo.

**A busca** das listas é a `contemTexto` (`server/domain/shared/busca.helper.ts`), a mesma de
todas as listagens do sistema: sem diferença de maiúscula e com `%` e `_` escapados. As ordens
terminam em `id`, para a mesma linha não aparecer em duas páginas.

## O que não existe

- reatribuível e queima — devolvida, toda licença volta a ficar livre;
- "com manutenção" e fim do suporte à parte — o suporte vai nas notas, e a perpétua fica sem
  vencimento;
- licença OEM — é do computador;
- botão Renovar e lista de renovações — renovar é editar o vencimento;
- mínimo de livres, e alerta de mínimo;
- lixeira e restaurar;
- tipo de licença (por dispositivo ou por pessoa);
- a mesma licença duas vezes no mesmo alvo;
- entrega para várias pessoas ou computadores de uma vez;
- entregar ou devolver fora da tela de Licenças;
- a chave digitada na entrega — ela é escolhida da lista da licença —, e a entrega sem chave numa
  licença que tem chaves;
- anexo ou link do comprovante (a referência é o número do pedido), conferência com o software
  instalado, exportação;
- observação na devolução (só existe na entrega);
- tela de auditoria: quem cadastrou, editou ou excluiu está só no banco.

## Onde é testado

| Assunto | Arquivo |
|---|---|
| a conta, a quantidade e o teto, as datas e o valor do contrato (e a máscara do campo), a entrega, a devolução, os dias de cada uma e a ordem das recusas | `tests/licencas/operacoes.test.ts` |
| o status, o dia de Brasília, o filtro de status (e a encerrada na lista sem filtro), o `view` que é 422, a busca da lista e a ordem das encerradas | `tests/licencas/status.test.ts` |
| as duas listas do detalhe, de 15 em 15, a busca e a página além do fim | `tests/licencas/detalhe.test.ts` |
| Encerrar com alguém usando, o filtro "ainda em uso", excluir pela regra do posto e o alerta | `tests/licencas/ciclo.test.ts` |
| a lista de chaves (ordem, cobre, soma, edição), a chave na entrega e a troca, onde ela não aparece e como a tela a esconde | `tests/licencas/chave.test.ts` |
| o histórico por alvo, a paginação e o desempate no mesmo instante | `tests/licencas/historico.test.ts` |
| o 409 da pessoa e do ativo com as licenças e as `refs`, a ficha e a aba | `tests/licencas/posse.test.ts` |
| o e-mail no seletor de colaborador | `tests/listagens/opcoes-com-busca.test.ts` |
| os CHECKs e os índices | `tests/licencas/invariantes.test.ts` |
| as corridas | `tests/licencas/corridas.test.ts` |
