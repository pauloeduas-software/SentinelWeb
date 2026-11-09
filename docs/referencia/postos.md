# Postos

> A tela `/postos`: o posto de trabalho — a MesaEscritório, a bancada, o guichê.
> O que ele é, onde se cadastra e o que segura a exclusão. Quem responde pelo que está nele é a Camada 3 de
> [`modelo-de-posse.md`](modelo-de-posse.md); as regras que viram fato
> permanente no banco estão em [`invariantes.md`](invariantes.md) (a 2, a 5 e a
> 19).

---

## O que é

**Quem RECEBE equipamento sem ser pessoa.** Ao posto se entrega o computador da
mesa (`Assignment` de alvo `WORKSTATION`), o estoque que fica nela (`StockMovement`
de alvo `WORKSTATION`) e é ele que as pessoas ocupam, por turno
(`WorkstationOccupant`). **Campos:** nome, localização e notas.

- **Um computador por posto** (invariante 19, B), também no passado. Laboratório é um posto por
  computador.
- **Fica numa localização** — a Matriz, a Filial —, obrigatória. A localização
  só diz onde as coisas estão guardadas e não recebe nada; o posto não é uma
  localização, é cadastro próprio
  ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).
- **O nome é único no sistema**, sem diferença de maiúscula: os seletores da
  entrega de ativo, da de estoque e do vínculo de máquina mostram só o nome.
- **No máximo um ativo por posto** — ativo é computador (invariante 19). O
  estoque na mesa entra sem limite, e os ocupantes são vários por desenho.
- **Um por vez também no passado**
  ([AX](../decisoes/posse.md#ax--o-posto-tem-um-computador-por-vez-também-no-passado)):
  a entrega com data passada não começa antes da última devolução de outro
  computador no posto, e a ocupação da mesma pessoa não começa antes do fim da
  anterior dela no mesmo posto. No mesmo dia passa.
- **Não tem lixeira.** Excluir apaga de verdade, como o status.

## A tela

| | |
|---|---|
| **a lista** | Posto, Localização, Responsáveis (só os nomes, sem turno: os dois primeiros e quantos faltam, "Ana Souza, Bruno Lima +2", com todos ao passar o mouse; sem ninguém, o traço), Etiqueta (a do computador do posto, com a série embaixo ([CI](../decisoes/plataforma.md#ci--a-série-vai-embaixo-da-etiqueta-em-toda-tela)); sem computador, o traço) e Status — *Posto vago* (tem ativo e ninguém responde), *Ocupado* ou *Sem uso*. Em cima, os cartões Total, Ocupados, Vagos e Sem uso: os três status somam o total, e clicar filtra; busca por nome, nota e pela etiqueta ou série do computador entregue ao posto ([BI](../decisoes/posse.md#bi--a-busca-de-postos-acha-o-computador-pela-etiqueta-e-pela-série)). O `⋯` começa pelo **Adicionar ao posto**, o mesmo painel da ficha, sem sair da lista |
| **a ficha** (`/postos/:id`) | página própria, no molde da do computador: o card com status, localização, computador e notas, com o **Adicionar ao posto**, e as abas com quem está nele agora — a linha com o nome, o turno, desde quando e as notas, sem o e-mail ([CG](../decisoes/posse.md#cg--postos-no-molde-das-outras-telas)), a linha que abre a ficha do colaborador ([CJ](../decisoes/plataforma.md#cj--a-linha-do-responsável-abre-a-ficha-dele)), a busca por nome ou turno, e na linha de cada um corrigir o turno e registrar a saída, com o dia em que saiu ([BQ](../decisoes/posse.md#bq--entregar-e-devolver-são-dois-botões-e-a-aba-responsáveis-é-uma-só)) —, o computador da mesa, na mesma tabela da aba Computadores do colaborador ([CE](../decisoes/plataforma.md#ce--o-computador-numa-aba-de-ficha-tem-um-molde-só)), a **Máquina**, a mesma do computador: a linha que abre a máquina em Descobertas, a telemetria e os comandos ao vivo ([BX](../decisoes/posse.md#bx--a-máquina-do-posto-tem-aba-própria)), o estoque da mesa, por entrega, com o número de entregas na aba, e o **Histórico** ([BP](../decisoes/posse.md#bp--o-que-já-foi-mora-na-aba-histórico)): quem entrou e saiu, com o turno, o computador entregue e devolvido e o estoque entregue à mesa, 15 por página, do mais recente para o mais antigo. **A ficha não devolve nada** ([BN](../decisoes/posse.md#bn--o-devolver-mora-só-na-ficha-do-que-foi-entregue)): a linha abre a ficha do computador ou a do item, onde está o Devolver ([`estoque.md`](estoque.md)) |
| **o cadastro** | **Novo posto** e, em cada linha e na ficha, ✏️ Editar e 🗑️ Excluir, sem Desativar ([AN](../decisoes/licencas.md#an--o-que-está-em-uso-bloqueia-e-nenhuma-data-é-futura)) — `SUPERVISOR`; ver o posto e colocar ou tirar ocupante é `TECNICO` ([AV](../decisoes/acesso.md#av--três-cargos-técnico-supervisor-e-administrador)). O Editar leva a versão lida: se outra pessoa salvou no meio, é 409 (AF) |
| **a volta** | status, página e busca moram na URL da lista (`?status=vagos&pagina=2&busca=mesa`): o voltar do navegador e a seta da ficha trazem a lista como estava |

Excluir pede confirmação, com a frase de Configurações, e a recusa aparece numa
notificação do sistema.

**Fora da tela de Postos**, o posto aparece no computador entregue a ele
([AW](../decisoes/posse.md#aw--o-computador-está-onde-o-posto-fica-e-o-histórico-diz-quem-ocupou-o-posto)):

- **a localização** da ficha do computador é a do posto, com o nome dele
  ("Filial · Mesa 1", com link), e a do computador vira **Volta para** — onde ele
  fica guardado e para onde volta na devolução. Lida da entrega em aberto, na
  hora: mudar o posto de localização leva o computador junto;
- **a lista de Computadores** mostra o computador do posto como qualquer outro
  ([BJ](../decisoes/catalogo-e-ativo.md#bj--o-computador-entregue-a-um-posto-continua-na-lista-de-computadores)):
  a Localização é a do posto, e Responsáveis traz só "Posto Mesa 1", sem quem o ocupa
  ([BO](../decisoes/posse.md#bo--em-responsáveis-vai-só-o-nome)): que o posto está vago é o
  Status dele, aqui em Postos. O cartão da ficha, a janela de devolução e os Ociosos de
  Descobertas dizem o mesmo
  ([BL](../decisoes/catalogo-e-ativo.md#bl--o-computador-no-posto-mostra-o-posto-antes-de-quem-o-ocupa)).
  Quem abre o computador pelo posto volta ao posto pela seta, na aba em que estava;
- **a aba Responsáveis do computador** é um item só: o posto, com quem está nele, um
  nome embaixo do outro, desde quando, a devolução prevista e a observação da entrega, e a linha abre o posto ([CJ](../decisoes/plataforma.md#cj--a-linha-do-responsável-abre-a-ficha-dele)). O Devolver
  mora nessa linha, e o Entregar do card trava enquanto o computador está entregue
  ([BP](../decisoes/posse.md#bp--o-que-já-foi-mora-na-aba-histórico)).

## Como o código é montado

O cadastro passa pelo **mesmo CRUD das tabelas de catálogo**, com a
`workstationSpec` (`server/modules/workstation/specs/workstation.spec.ts`) — nome
único, 409 por uso e auditoria vêm de lá. Ela fica **fora** de
`CATALOG_SPECS`, então não vira aba de Configurações; as rotas são do
`workstation.maestro.ts`.

| Rota | Quem | O que é |
|---|---|---|
| `GET /api/workstations` | `TECNICO` | a lista, com os ocupantes e o número de ativos por linha (`?view=todos\|vagos\|ocupados\|sem-uso`) |
| `GET /api/workstations/stats` | `TECNICO` | os números dos cartões |
| `GET /api/workstations/:id` | `TECNICO` | a ficha (o custo dos ativos só para `SUPERVISOR`) |
| `GET /api/workstations/:id/history` | `TECNICO` | o histórico (`?page=`, `?limit=`) |
| `GET /api/workstations/options` | `TECNICO` | o seletor |
| `POST`, `PUT /:id`, `DELETE /:id` | `SUPERVISOR` | o cadastro |
| `/api/workstations/:id/occupants` | `TECNICO` | quem está no posto agora — domínio `occupancy` |

## Uso e exclusão

A regra do **status**: só o que está nele **agora** impede a exclusão. É 409
com a dica `Tire o que está nele agora: devolva o que foi entregue e registre a saída de quem está nele.`, que cita só o que existe no posto,
e um link para o computador e para cada item, onde está o Devolver.

**Uso**, aqui, é: **entrega** de ativo aberta para ele, **entrega de estoque**
aberta para ele e **ocupante** atual.

**O passado não segura, e não se perde.** Entrega de ativo ou de estoque
devolvida e ocupação encerrada perdem a ligação com o posto na exclusão e
guardam o nome dele por escrito (`targetWorkstationName`, `workstationName`): o
histórico do ativo continua dizendo "Entregue: Mesa 7", o do item "para a Mesa
7", e a ficha da pessoa "Entrou no posto: Mesa 7". É o `beforeDelete` da spec, dentro
da mesma transação, que trava o posto antes de contar o uso: a entrega ou a
ocupação que chega no meio espera e depois recebe 404, e a troca de nome também
espera, então o nome escrito é mesmo o último. As FKs continuam `Restrict`,
como rede de baixo.

**Sem Desativar** ([AN](../decisoes/licencas.md#an--o-que-está-em-uso-bloqueia-e-nenhuma-data-é-futura)): o posto vazio se exclui, como a
localização, e o que tem algo nele recebe o 409 acima. A localização também
não se desativa ([AO](../decisoes/catalogo-e-ativo.md#ao--categoria-status-fabricante-modelo-e-localização-não-se-desativam)): a que existe recebe o posto.

## Onde é testado

| Assunto | Arquivo |
|---|---|
| cadastro, exclusão pelo presente com o nome no histórico, sem desativar | `tests/invariantes/posto.test.ts` |
| um ativo por posto, na entrega, e a lixeira que recusa o entregue | `tests/invariantes/ativo-por-posto.test.ts`, `tests/corridas/ativo-por-posto.test.ts` |
| ocupantes e turno | `tests/invariantes/posse.test.ts`, `tests/invariantes/turno-da-ocupacao.test.ts` |
| a ficha e a lista de ativos | `tests/listagens/ficha-do-posto.test.ts`, `tests/listagens/ativo-em-posto.test.ts` |
| o lugar do posto na ficha e na lista de Computadores, com a linha em posto vago | `tests/listagens/ativo-em-posto.test.ts`, `tests/e2e/ficha-do-posto.spec.ts` |
| o Histórico, com as três fontes, a página e a aba Responsáveis só com quem está agora | `tests/listagens/historico-do-posto.test.ts`, `tests/e2e/ficha-do-posto.spec.ts` |
| a aba Responsáveis: a busca, o turno e o Registrar saída na linha, o Entregar que trava e o Devolver | `tests/e2e/ficha-do-posto.spec.ts` |
| o Adicionar ao posto no `⋯` da lista, também para o Técnico | `tests/e2e/ficha-do-posto.spec.ts`, `tests/e2e/cargos.spec.ts` |
| a aba Computador só com a linha, e a Máquina igual no posto e no computador, com o link para Descobertas | `tests/e2e/ficha-do-posto.spec.ts` |
| o Editar com a versão da linha | `tests/invariantes/versao.test.ts` |
| um computador por vez e a mesma pessoa sem sobreposição, no passado; o índice do posto | `tests/invariantes/passado-do-posto.test.ts` |
| excluir o posto e entregar a ele ao mesmo tempo | `tests/corridas/ativo-por-posto.test.ts` |
