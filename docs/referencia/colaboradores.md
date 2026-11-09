# Colaboradores

> A tela `/colaboradores`: quem recebe equipamento — o computador, o posto que
> ocupa, a licença e o estoque no nome dele. O que ele é, a ficha, e o que a exclusão,
> a lixeira e a desativação recusam. O cadastro é o do catálogo, com as regras
> de [`configuracoes.md`](configuracoes.md) (*O que vale para as sete*); quem
> responde pelo quê é a Camada 2 de [`modelo-de-posse.md`](modelo-de-posse.md),
> e a regra que vira fato permanente no banco é a 6 de
> [`invariantes.md`](invariantes.md).

---

## A tela

Página própria no menu, sozinha na seção **Pessoas**, abaixo de Convergência
([AH](../decisoes/acesso.md#ah--o-menu-por-assunto-o-colaborador-ganha-página-própria-e-ativos-vira-computadores)). Até ali era uma aba de Configurações; saiu de lá porque é
operação de toda semana — contratação, entrega, desligamento —, tem lixeira e
ficha, e as outras abas são referência que se monta uma vez.

O cadastro **é o mesmo componente** das abas de Configurações
(`src/components/catalogo/CadastroDoCatalogo.tsx`), com a spec do
colaborador (`src/pages/colaboradores/specs/index.ts`): a busca por nome ou
e-mail, a paginação, Editar, Desativar/Ativar e Excluir na ordem e
com as frases do sistema inteiro, e a aba Lixeira. A linha lê a pessoa como
Usuários: a coluna Colaborador com o avatar, o nome e o e-mail embaixo, e o
Status ([CC](../decisoes/plataforma.md#cc--colaboradores-lista-a-pessoa-como-usuários)). Em cima, os cartões Total, Ativos
e Desativados, sem contar a lixeira: clicar filtra
([BT](../decisoes/plataforma.md#bt--estoque-e-colaboradores-têm-cartões-e-computadores-conta-o-tipo)). A API é o CRUD do catálogo em
`/api/people`, com `?isActive=` na lista e `GET /api/people/stats` nos cartões.

Os endereços antigos da ficha — `/configuracoes/colaboradores/:id` e, antes,
`/users/:id` — redirecionam para `/colaboradores/:id`, com o mesmo id.

## O que é

**Quem RECEBE equipamento** — ativo, posto, licença, unidade
de estoque. Não entra no sistema: quem opera o painel é **usuário**, na tela
Usuários, e é outra tabela
([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)).
Um não vira o outro: quem opera o sistema e também tem um notebook é cadastrado
aqui à parte, à mão — nada cria colaborador a partir de usuário.
**Campos:** nome completo, e-mail e notas.

- **O e-mail é opcional** — o colaborador não faz login — e único quando
  preenchido entre os que não estão na lixeira, gravado em minúsculas:
  `E-mail já está em uso por outro colaborador.`
  O nome **não** é único: dois "João Silva" existem, e é o e-mail que os separa.
- **As notas** são texto livre, como as dos outros cadastros — "afastada até
  março", "terceirizado da empresa X" — e aparecem na ficha, abaixo do nome. Não
  entram na lista nem na busca, que é por nome e e-mail.
- **A lista de escolha** (`/api/people/options`) é o seletor de pessoa da
  entrega de ativo, do posto, da licença e da entrega de estoque.

## A ficha

A linha abre `/colaboradores/:id`: o nome, o e-mail e as notas; os
**computadores** entregues a ela, na mesma tabela da aba Computador do posto
(a etiqueta com a série, o modelo com o fabricante, a categoria, o status, a
devolução prevista e desde quando,
[CE](../decisoes/plataforma.md#ce--o-computador-numa-aba-de-ficha-tem-um-molde-só)),
os **postos** que ela ocupa (com o turno), os **itens de estoque** e as
**licenças** no nome dela — e o **histórico**, que é só movimentação: entregas e
devoluções de computador, licença e estoque, entradas e saídas de posto.

O card tem as ações da linha da lista, com as mesmas perguntas e frases: Editar
e, no `⋯`, Desativar ou Ativar e Excluir, que são do Supervisor. Excluir volta
para a lista
([CD](../decisoes/plataforma.md#cd--a-ficha-do-colaborador-tem-as-ações-no-card)).

São as quatro coisas que a desativação e a exclusão cobram, e cada linha leva
para onde ela se resolve: o computador, à ficha dele, onde está o Devolver; o
posto, à ficha do posto, onde está o Encerrar; o item e a licença, à ficha
deles, já filtrada pelo nome dela, onde está o Devolver.

Só o que foi entregue a ELA: o computador do posto que ela ocupa e o estoque da
mesa ficam na ficha do posto, e as licenças do computador que ela usa, na aba
Licenças do computador. As abas só mostram: o Devolver e o Encerrar moram no
registro que a linha abre.

## Exclusão, lixeira e desativação

**Excluir manda para a lixeira** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)). O colaborador tem histórico de posse
**próprio** — "o que já esteve com a Laura" —, e recadastrá-lo depois de excluir
o partiria em dois: os equipamentos antigos ficariam presos a um cadastro que
ninguém abre. Na lixeira a linha fica: o histórico dos ativos, do estoque e das
licenças continua com o nome dele, e ele some das listas e dos seletores. A
ficha dele abre só para o Supervisor, pela linha da Lixeira, e só para consulta:
o aviso Na lixeira, com o dia da exclusão, e o Restaurar no card. Para o Técnico
ela é 404
([CF](../decisoes/catalogo-e-ativo.md#cf--a-linha-da-lixeira-de-colaboradores-também-abre-a-ficha)).

Só não se exclui quem responde por algo **agora** (invariante 6) — 409 com a
conta, a mesma da desativação, e cada coisa pelo nome:
`Este colaborador ainda responde por 1 ativo (ATV-00012) e 1 posto (Mesa 1). Devolva o que foi entregue a ele e encerre a responsabilidade pelo posto antes de excluir.`
O pedido cita só o que existe: sem posto, ele não fala em ocupação; sem entrega, não fala em devolver.
O computador, a licença, o item e o posto citados vão também como `refs`, e o
aviso põe um link em cada um, na ordem da frase.

**A aba Lixeira** fica na própria página, ao lado da lista. **Restaurar** devolve a mesma
pessoa, com o histórico inteiro; se o e-mail dela foi reaproveitado por outro
cadastro enquanto ela estava lá, é 409 `O e-mail deste colaborador já está em uso por outro cadastro.`
Não há "apagar de vez": seria apagar o histórico que a lixeira existe para
guardar.

**Desativar** é para quem continua na lista — o afastado que volta —, e tem a
mesma regra: só desativa quem não responde por nada agora. Desativado, ele some
das escolhas e é recusado (409) em entrega nova e ocupação nova. **Ativar**
desfaz.

---

## Corridas

| As duas operações | O que dava errado | A trava |
|---|---|---|
| desativar o colaborador × entregar a ele ou pô-lo num posto | desativado com posse aberta | `FOR UPDATE` na linha da pessoa nos dois lados (`lock-person.usecase.ts`) |

## Onde é testado

| Assunto | Arquivo |
|---|---|
| lixeira, restaurar, a recusa que diz o quê (com os links), desativação, `/options` | `tests/invariantes/colaborador.test.ts`, `tests/invariantes/posse.test.ts` |
| a ficha: o computador dela e não o do posto, as notas, e a ficha da lixeira só para o Supervisor | `tests/invariantes/colaborador.test.ts` |
| as ações do card, a ficha aberta da Lixeira e o Restaurar | `tests/e2e/ficha-do-colaborador.spec.ts`, `tests/e2e/cargos.spec.ts` |
| o corpo literal do formulário (e-mail e notas em branco viram nulo; e-mail único e em minúsculas) | `tests/formularios/corpo-literal.test.ts` |
| o histórico da ficha, com as quatro fontes | `tests/listagens/historico-da-pessoa.test.ts`, `tests/licencas/historico.test.ts`, `tests/estoque/operacoes.test.ts` |
