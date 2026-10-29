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

- **Fica numa localização** — a Matriz, a Filial —, obrigatória. A localização
  só diz onde as coisas estão guardadas e não recebe nada; o posto não é uma
  localização, é cadastro próprio
  ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).
- **O nome é único no sistema**, sem diferença de maiúscula: os seletores da
  entrega de ativo, da de estoque e do vínculo de máquina mostram só o nome.
- **No máximo um ativo por posto** — ativo é computador (invariante 19). O
  estoque na mesa entra sem limite, e os ocupantes são vários por desenho.
- **Não tem lixeira.** Excluir apaga de verdade, como o status.

## A tela

| | |
|---|---|
| **a lista** | Posto, Localização, Quem está (por turno), Ativos e Situação — *Posto vago* (tem ativo e ninguém responde), *Ocupado* ou *Sem uso*. Recortes Todos, Vagos e Ocupados; busca por nome e nota |
| **a ficha** (`/postos/:id`) | os ocupantes — colocar alguém, corrigir o turno, encerrar com o dia em que saiu —, os ativos entregues com **Devolver** (com o dia em que voltou: hoje, ou um dia passado desde a entrega), o computador da mesa ao vivo e o estoque da mesa, por entrega, com o link para o detalhe do item, onde está o Devolver ([`estoque.md`](estoque.md)) |
| **o cadastro** | **Novo posto** e, em cada linha, ✏️ Editar e 🗑️ Excluir, sem Desativar ([AN](../decisoes/licencas.md#an--o-que-está-em-uso-bloqueia-e-nenhuma-data-é-futura)) — `ADMIN`, como tudo hoje ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)) |

Excluir pede confirmação, com a frase de Configurações, e a recusa aparece numa
notificação do sistema.

## Como o código é montado

O cadastro passa pelo **mesmo CRUD das tabelas de catálogo**, com a
`workstationSpec` (`server/domain/workstation/specs/workstation.spec.ts`) — nome
único, 409 por uso e auditoria vêm de lá. Ela fica **fora** de
`CATALOG_SPECS`, então não vira aba de Configurações; as rotas são do
`workstation.maestro.ts`.

| Rota | Quem | O que é |
|---|---|---|
| `GET /api/workstations` | `ADMIN` | a lista, com ocupantes e ativos por linha (`?view=todos\|vagos\|ocupados`) |
| `GET /api/workstations/:id` | `ADMIN` | a ficha |
| `GET /api/workstations/options` | `ADMIN` | o seletor |
| `POST`, `PUT /:id`, `DELETE /:id` | `ADMIN` | o cadastro |
| `/api/workstations/:id/occupants` | `ADMIN` | os ocupantes — domínio `occupancy` |

## Uso e exclusão

A regra do **status**: só o que está nele **agora** impede a exclusão. É 409
com a dica `Tire o que está nele agora: devolva o que foi entregue e encerre as
ocupações.`

**Uso**, aqui, é: **entrega** de ativo aberta para ele, **entrega de estoque**
aberta para ele e **ocupante** atual.

**O passado não segura, e não se perde.** Entrega de ativo ou de estoque
devolvida e ocupação encerrada perdem a ligação com o posto na exclusão e
guardam o nome dele por escrito (`targetWorkstationName`, `workstationName`): o
histórico do ativo continua dizendo "Entregue: Mesa 7", o do item "para a Mesa
7", e a ficha da pessoa "Entrou no posto: Mesa 7". É o `beforeDelete` da spec,
dentro da mesma transação. As FKs continuam `Restrict`: o que ninguém desligou
— uma entrega que nasceu no meio — segura o `DELETE` e desfaz tudo.

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
