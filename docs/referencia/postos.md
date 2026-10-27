# Postos

> A tela `/postos`: o posto de trabalho — a MesaEscritório, a bancada, o guichê.
> O que ele é, onde se cadastra, o que segura a exclusão e o que a desativação
> fecha. Quem responde pelo que está nele é a Camada 3 de
> [`modelo-de-posse.md`](modelo-de-posse.md); as regras que viram fato
> permanente no banco estão em [`invariantes.md`](invariantes.md) (a 2, a 5, a 19
> e a 21).

---

## O que é

**Quem RECEBE equipamento sem ser pessoa.** Ao posto se entrega o computador da
mesa (`Assignment` de alvo `WORKSTATION`), o estoque que fica nela (`StockMovement`
de saída para o posto) e é ele que as pessoas ocupam, por turno
(`WorkstationOccupant`). **Campos:** nome, localização e notas.

- **Fica numa localização** — a Matriz, a Filial —, obrigatória. A localização
  só diz onde as coisas estão guardadas e não recebe nada; o posto não é uma
  localização, é cadastro próprio
  ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).
- **O nome é único no sistema**, sem diferença de maiúscula: os seletores da
  entrega, da saída de estoque e do vínculo de máquina mostram só o nome.
- **No máximo um ativo por posto** — ativo é computador (invariante 19). O
  estoque na mesa entra sem limite, e os ocupantes são vários por desenho.
- **Não tem lixeira.** Excluir apaga de verdade, como o status.

## A tela

| | |
|---|---|
| **a lista** | Posto, Localização, Quem está (por turno), Ativos e Situação — *Posto vago* (tem ativo e ninguém responde), *Ocupado* ou *Sem uso*. Recortes Todos, Vagos e Ocupados; busca por nome e nota |
| **a ficha** (`/postos/:id`) | os ocupantes — colocar alguém, corrigir o turno, encerrar —, os ativos entregues com **Devolver**, o computador da mesa ao vivo e o estoque da mesa, por saída, com o link para o detalhe do item, onde está o Devolver ([`estoque.md`](estoque.md)) |
| **o cadastro** | **Novo posto** e, em cada linha, ✏️ Editar, ⏻ Desativar / Ativar e 🗑️ Excluir — `ADMIN`, como tudo hoje ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)) |

Desativar e excluir pedem confirmação, com as mesmas frases de Configurações, e a
recusa aparece numa notificação do sistema.

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
| `GET /api/workstations/options` | `ADMIN` | o seletor: só postos ativos |
| `POST`, `PUT /:id`, `DELETE /:id` | `ADMIN` | o cadastro |
| `/api/workstations/:id/occupants` | `ADMIN` | os ocupantes — domínio `occupancy` |

## Uso e desativação

A regra do **status**: só o que está nele **agora** impede a exclusão. É 409
com a dica `Tire o que está nele agora — devolva o que foi entregue e encerre as
ocupações — ou desative-o: …`

**Uso**, aqui, é: **entrega** de ativo aberta para ele, **saída de estoque**
aberta para ele e **ocupante** atual.

**O passado não segura, e não se perde.** Entrega devolvida, saída de estoque
devolvida e ocupação encerrada perdem a ligação com o posto na exclusão e
guardam o nome dele por escrito (`targetWorkstationName`, `workstationName`): o
histórico do ativo continua dizendo "Entregue: Mesa 7", o do item "para a Mesa
7", e a ficha da pessoa "Entrou no posto: Mesa 7". É o `beforeDelete` da spec,
dentro da mesma transação. As FKs continuam `Restrict`: o que ninguém desligou
— uma entrega que nasceu no meio — segura o `DELETE` e desfaz tudo.

**Desativado** (`isActive = false`), ele:

| | |
|---|---|
| continua | na lista (esmaecido, com a marca "desativado" das Configurações), no histórico, com tudo o que já estava nele |
| **some** | dos seletores da entrega, da saída de estoque e do vínculo de máquina |
| **recusa** (409) | entrega de ativo, saída de estoque e ocupante novo — `"Mesa 1" está desativado e não recebe entrega nova.` |
| **deixa passar** | devolver e encerrar ocupação — desativar não esvazia a mesa |

**Ativar** desfaz tudo. É a invariante 21. E a **localização** desativada não
recebe posto novo, nem posto que se muda para ela.

## Onde é testado

| Assunto | Arquivo |
|---|---|
| cadastro, exclusão pelo presente com o nome no histórico, desativação | `tests/invariantes/posto.test.ts` |
| um ativo por posto, nas duas portas | `tests/invariantes/ativo-por-posto.test.ts`, `tests/corridas/ativo-por-posto.test.ts` |
| ocupantes e turno | `tests/invariantes/posse.test.ts`, `tests/invariantes/turno-da-ocupacao.test.ts` |
| a ficha e a lista de ativos | `tests/listagens/ficha-do-posto.test.ts`, `tests/listagens/ativo-em-posto.test.ts` |
