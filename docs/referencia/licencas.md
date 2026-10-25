# Licenças

> A tela `/licencas`: o contrato de software, a quantidade comprada e a quem ela foi
> entregue. O que a licença é, as contas, o que a entrega e a devolução recusam, a chave de
> produto, e onde a licença aparece fora da própria tela. As decisões estão em
> [`../decisoes/licencas.md`](../decisoes/licencas.md) (a última é a
> [AA](../decisoes/licencas.md#aa--a-licença-vira-quantidade-e-entregas-sem-vaga-numerada-sem-lixeira-com-encerradas));
> as regras que viram fato permanente no banco estão em [`invariantes.md`](invariantes.md)
> (a 6, a 9, a 20, a 22 e a 23).

---

## O que é

**Um contrato com uma quantidade comprada**, entregue um a um a quem usa. **Campos:** nome,
categoria (do tipo Licença, ativa) e quantidade comprada, obrigatórios; vencimento,
encerramento, licenciado para (nome e e-mail), fabricante, pedido, data e valor da compra,
notas e chave do produto, opcionais. O cadastro não entra no histórico da tela, que é só
entregas e devoluções; ele fica na auditoria, no banco, com quem fez ([AB](../decisoes/acesso.md#ab--a-auditoria-volta-quem-fez-só-no-banco)) — e a chave só
como "informada", "alterada" ou "removida", nunca o valor.

- **A quantidade vai de 1 a 100.000**: zero não é contrato, e a licença que acabou se encerra. O
  piso tem o CHECK `licenses_seats_positivo`; o teto é só da aplicação.
- **O vencimento e o encerramento não antecedem a data da compra.** Cada um só é comparado
  quando os dois lados estão preenchidos, e o encerramento não é comparado com o vencimento — dá
  para encerrar antes do fim do período pago. A recusa é 422 com as duas datas
  (`O vencimento (05/03/2026) não pode ser antes da data da compra (10/03/2026).`); na edição, a
  data que não veio no corpo é a que está gravada. Os CHECKs `licenses_*_nao_antecede_compra`
  são a rede.
- **A entrega vai para um colaborador OU para um computador**, nunca os dois e nunca para um
  posto ([D39](../decisoes/licencas.md#d39--assento-de-licença-não-vai-para-um-posto)). Licença
  por máquina (Windows, Office avulso, OEM) vai para o ativo; por assinatura de pessoa
  (Microsoft 365, Adobe), para o colaborador. O computador da mesa recebe a licença, não a mesa.
- **O mesmo alvo não recebe a mesma licença duas vezes** enquanto a primeira está aberta
  (invariante 23).
- **Devolvida, a licença volta a ficar livre.** Não existe licença que "queima" na devolução.
- **O nome pode repetir**: a renovação convive com o contrato encerrado de mesmo nome.
- **Não tem lixeira.** A licença que acabou se **encerra**; só a que nunca foi entregue se
  **exclui**.

## As contas

Nenhuma é coluna — saem das linhas de entrega (`license_checkouts`) a cada leitura:

| | |
|---|---|
| **em uso** | entregas abertas |
| **livres** | compradas − em uso |
| **já entregue** | alguma entrega, aberta ou devolvida — é o que desabilita o Excluir |

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

O **vencimento** é até quando o contrato foi pago, e se renova editando a data. O
**encerramento** é o fim do contrato. Numa listagem, o filtro e o status de cada linha usam o
mesmo hoje: a requisição que cruza a meia-noite não devolve, no filtro Vencendo, uma linha já
vencida.

## A tela

| | |
|---|---|
| **as abas** | **Atuais** (ativas, vencendo e vencidas — a vencida ainda pede decisão) e **Encerradas** (pela mais recente). Busca por nome, licenciado, e-mail, pedido, categoria e fabricante — o texto ao pé da letra, `%` e `_` não são curinga; filtro de categoria; na aba Atuais, filtro de status (Todos, Ativas, Vencendo, Vencidas); na aba Encerradas, "Ainda em uso". Trocar de aba desliga os dois |
| **a linha** | nome, fabricante, status, "10 compradas · 7 em uso · 3 livres", prazo (ou a data do encerramento, na aba Encerradas), custo. Sem cor por status |
| **as ações** | Entregar (desabilitado sem livre, vencida ou encerrada, com o motivo no `title`), Editar, Encerrar, Excluir (desabilitado na que já foi entregue: "Já foi entregue: use Encerrar") — com confirmação no Encerrar e no Excluir |
| **o detalhe** | no cabeçalho, o status com a conta ("Vencida · 10 compradas · 7 em uso · 3 livres") e as ações da lista, com as mesmas regras (Entregar e Editar voltam ao detalhe ao fechar; excluída, a janela fecha). Depois, a **chave do produto** e todos os campos do cadastro — o valor da compra é o total, com o preço de cada licença ao lado: "R$ 5.000,00 (R$ 500,00 por licença)". **Com quem está**: as entregas abertas, da mais recente para a mais antiga, 15 por página, com busca pelo nome do colaborador ou do computador, a chave de cada uma, e Chave e Devolver em cada linha. **Histórico**: só entregas e devoluções, 15 por página, do mais recente para o mais antigo — no mesmo instante, a devolução vem antes da entrega |
| **o alerta** | só nesta tela, numa caixa só, do mais urgente para o menos: encerrada ainda em uso, vencida (a mais recente primeiro), vencendo em 30 dias (a mais próxima primeiro). Embaixo, a contagem de cada motivo com link — "2 encerradas em uso · 5 vencidas · 3 vencendo" —, que leva à aba e ao filtro que mostram todas aquelas. Não existe alerta de mínimo |

A edição manda **só o que mudou**: um formulário aberto há tempo não desfaz a edição que outra
pessoa salvou no meio. "O que mudou" é contra a licença **como estava quando o formulário
abriu** — a nova busca que chega com ele aberto (voltar para a aba do navegador) não muda a
base. Ela abre com o **detalhe** da licença, e não com a linha da listagem: é o detalhe que
traz a chave.

**O valor da compra** tem máscara de dinheiro: o campo mostra `R$ 1.234,56` e manda `1234.56`.
Os dígitos entram pelos centavos — apagar o último de `R$ 1.234,50` deixa `R$ 123,45` —, e
param nos 10 dígitos e 2 casas que o servidor aceita. O servidor aceita ponto ou vírgula nos
centavos e nenhum ponto de milhar: `1.234,56` é 422 com o nome do campo,
`valor de compra: use um valor como 1234.50`. As datas vêm do seletor.

**Quando a última linha de uma página sai** — excluída, encerrada, devolvida —, a lista e o "Com
quem está" voltam para a última página que existe. **A devolução que o servidor recusa** deixa a
linha aberta, com o dia escolhido, para tentar de novo.

## Encerrar, reabrir e excluir

- **Encerrar** grava hoje na data de encerramento e leva a licença para Encerradas — **mesmo com
  alguém usando**. A tela pergunta antes: `"AutoCAD" ainda está com 3. Encerrar mesmo assim?`
  Encerrada, ela não recebe entrega nova, e fica no alerta *encerrada, ainda em uso* até tudo
  ser devolvido. O formulário segue a mesma regra. É o padrão do sistema para o que tem data e
  para o que se desativa: avisa, não recusa — recusar não impediria nada, porque a data futura
  chega sozinha. A licença com a data da compra no futuro não se encerra hoje: é o mesmo 422 do
  formulário, `O encerramento (…) não pode ser antes da data da compra (…).`
- **Reabrir** é apagar a data de encerramento na edição.
- **Excluir** é definitivo, e só para a licença que **nunca foi entregue** — o cadastro errado.
  A que já foi entregue alguma vez, mesmo toda devolvida, tem o histórico de quem a usou, e não
  se exclui: `"Office 2021" já foi entregue e não pode ser excluída: o histórico de quem a usou
  depende dela. Encerre-a em vez de excluir.` A FK `Restrict` de `license_checkouts` é a rede. A
  excluída solta a categoria e o fabricante; a encerrada continua segurando.

## A entrega e a devolução

**A entrega** escolhe o colaborador (o seletor mostra nome e e-mail — é o que separa dois "João
Silva"; o cadastro de colaborador não tem setor) ou o computador, a **chave** desta entrega
(opcional, uma linha), uma observação opcional e o **dia da entrega**: vem com hoje e pode
voltar para registrar a entrega que já aconteceu; futuro é 422. O dia passado não antecede a
data da compra, nem o dia em que o **mesmo alvo** devolveu esta licença — ele não fica com ela
duas vezes no mesmo período (422). No próprio dia da devolução passa, gravada um milissegundo
depois dela, e o histórico fica na ordem. A quantidade no passado (quantas estavam em uso
naquele dia) não é conferida: a conta de livres é sempre a de agora.

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
| entrega ou devolução num dia futuro | 422 `data da entrega não pode ser uma data futura` |
| dois alvos, nenhum, ou posto | 422 — com dois: `Uma entrega tem UM alvo: informe o colaborador OU o ativo, nunca os dois.`; o posto nem é campo |
| ativo ou colaborador que não existe, ou na lixeira | 404 `Ativo não encontrado.` / `Colaborador não encontrado.` |
| ativo baixado / colaborador desativado | 409 `O ativo ATV-00042 teve baixa e não pode receber licença.` / `Laura Souza está desativado(a) e não pode receber licença.` |
| licença encerrada ou vencida | 409 `A licença "Office 2021" venceu há 3 dias e não recebe entrega: renove o contrato e atualize a data de vencimento antes.` — a vencendo entrega normalmente |
| o mesmo alvo de novo | 409 `Laura Souza já está com "Office 2021". Uma licença vai uma vez para cada computador ou colaborador.` |
| entrega antes da data da compra | 422 `A entrega (05/03/2026) não pode ser antes da data da compra (10/03/2026).` |
| entrega antes do dia em que o mesmo alvo devolveu | 422 `A entrega (05/03/2026) não pode ser antes de 10/03/2026: até esse dia Laura Souza estava com "Office 2021".` |
| a chave já está em outra entrega aberta da licença | 409 `Esta chave já está em outra entrega aberta de "Office 2021".` |
| sem licença livre | 409 `Sem licença livre em "Office 2021": 10 compradas, 10 em uso. Devolva uma entrega ou aumente a quantidade comprada.` |
| devolução antes do dia da entrega | 422 `A devolução (09/03/2026) não pode ser antes da entrega (10/03/2026).` |
| devolver uma entrega já devolvida | 409 `Esta entrega de "Office 2021" já foi devolvida.` |

**A devolução é pela entrega**, não pela licença nem pelo alvo: o clique de uma tela velha
encontra a entrega antiga já fechada, e não devolve quem recebeu depois. Devolver sempre pode,
mesmo com a licença vencida ou encerrada, e não pede confirmação: a licença só volta a ficar
livre.

## A chave de produto

| | |
|---|---|
| **da licença** | texto de várias linhas: a chave de volume, ou a lista das chaves compradas, uma por linha. Vazio ou só espaço vira nulo |
| **da entrega** | uma linha, informada ao entregar; vazia na licença de volume. A mesma chave não fica em duas entregas **abertas** da licença — índice único parcial `license_checkouts_chave_aberta_unica`, 409 —; a devolvida e a sem chave não contam |
| **trocar** | só a chave de uma entrega **aberta**, na linha de "Com quem está" (`PATCH`). O corpo traz `productKey` sempre — `null` ou vazio limpa; sem ela é 422, e não apaga. Devolvida é 409; a repetida, 409 |
| **onde aparece** | **só no detalhe da licença**: a da licença, no topo; a de cada entrega, em "Com quem está". Sempre escondida — `ABCDE-FGHIJ-•••••-•••••-•••••` —, com **Mostrar** e **Copiar**. Trocar de licença com a janela aberta desliga o Mostrar |
| **como se esconde** | linha a linha: com três grupos ou mais, ficam os dois primeiros; com dois, o primeiro. Sem hífen, com um grupo vazio, ou quando o que ficaria à mostra é quase a chave inteira (`…XY-Z`), ficam só os primeiros caracteres — um terço, até quatro. Linha vazia fica vazia |
| **onde não** | a lista, a busca (que também não procura por ela), o alerta, o histórico, a aba Licenças do ativo e a ficha do colaborador. As rotas delas não devolvem a chave |

A chave fica **em texto** no banco: a cifra saiu inteira na
[G](../decisoes/licencas.md#g--software-instalado-e-conformidade-de-licença-saem-licença-vira-cadastro-simples),
e o que a protege é a tela escondê-la e só o detalhe devolvê-la.

## Fora da tela de Licenças

| Onde | O quê |
|---|---|
| **aba Licenças do ativo** | as entregas abertas **àquele computador**, com status, prazo e observação; o nome leva ao detalhe da licença (`/licencas?licenca=<id>`), onde está o Devolver |
| **ficha do colaborador** | as entregas abertas **a ela**, com o mesmo link |
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
| `GET /api/licenses` | a lista (`?view=atuais\|encerradas`, `?status=ATIVA\|VENCENDO\|EXPIRADA` só com `atuais`, `?emUso=sim`, `?categoryId=`, `?q=`) — sem a chave |
| `GET /api/licenses/alerts` | o alerta: `{ total, contagem, rows }` — a contagem por motivo, e em `rows` só as seis primeiras na ordem de urgência, as que a caixa lista, cada uma com o seu `motivo` |
| `GET /api/licenses/:id` | o detalhe — a única leitura da licença com a chave |
| `GET /api/licenses/:id/checkouts` | quem está com ela, com a chave de cada entrega (`?page=`, `?q=` pelo nome; 15 por página) |
| `GET /api/licenses/:id/history` | o histórico (`?page=`; 15 por página, sem busca — `?q=` é 422) |
| `POST`, `PUT /:id`, `DELETE /:id` | o cadastro; excluir só a que nunca foi entregue |
| `POST /api/licenses/:id/terminate` | Encerrar |
| `POST /api/licenses/:id/checkout` | entregar (`assignedPersonId` XOR `assignedAssetId`, `notes`, `checkoutAt` — o dia —, `productKey`) |
| `POST /api/licenses/checkouts/:id/checkin` | devolver (`checkinAt` — o dia; ausente é hoje) — o `:id` é o da **entrega** |
| `PATCH /api/licenses/checkouts/:id` | trocar só a chave (`productKey`) de uma entrega aberta |
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
- "com manutenção" — o que for de suporte vai nas notas;
- mínimo de livres, e alerta de mínimo;
- lixeira e restaurar;
- tipo de licença (por dispositivo ou por pessoa);
- a mesma licença duas vezes no mesmo alvo;
- entrega para várias pessoas ou computadores de uma vez;
- entregar ou devolver fora da tela de Licenças;
- anexo, conferência com o software instalado, exportação;
- observação na devolução (só existe na entrega);
- tela de auditoria: quem cadastrou, editou ou excluiu está só no banco.

## Onde é testado

| Assunto | Arquivo |
|---|---|
| a conta, a quantidade e o teto, as datas e o valor do contrato (e a máscara do campo), a entrega, a devolução, os dias de cada uma e a ordem das recusas | `tests/licencas/operacoes.test.ts` |
| o status, o dia de Brasília, o filtro de status, a busca da lista e a ordem das Encerradas | `tests/licencas/status.test.ts` |
| as duas listas do detalhe, de 15 em 15, a busca e a página além do fim | `tests/licencas/detalhe.test.ts` |
| Encerrar com alguém usando, o filtro "ainda em uso", excluir só a nunca entregue e o alerta | `tests/licencas/ciclo.test.ts` |
| a chave da licença e da entrega, a troca, onde ela não aparece e como a tela a esconde | `tests/licencas/chave.test.ts` |
| o histórico por alvo, a paginação e o desempate no mesmo instante | `tests/licencas/historico.test.ts` |
| o 409 da pessoa e do ativo com as licenças e as `refs`, a ficha e a aba | `tests/licencas/posse.test.ts` |
| o e-mail no seletor de colaborador | `tests/listagens/opcoes-com-busca.test.ts` |
| os CHECKs e os índices | `tests/licencas/invariantes.test.ts` |
| as corridas | `tests/licencas/corridas.test.ts` |
