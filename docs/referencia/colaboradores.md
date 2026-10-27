# Colaboradores

> A tela `/colaboradores`: quem recebe equipamento — o ativo, o posto que ocupa,
> a licença e o estoque no nome dele. O que ele é, a ficha, e o que a exclusão,
> a lixeira e a desativação recusam. O cadastro é o do catálogo, com as regras
> de [`configuracoes.md`](configuracoes.md) (*O que vale para as seis*); quem
> responde pelo quê é a Camada 2 de [`modelo-de-posse.md`](modelo-de-posse.md),
> e a regra que vira fato permanente no banco é a 6 de
> [`invariantes.md`](invariantes.md).

---

## A tela

Página própria no menu, sozinha na seção **Pessoas**, abaixo de Convergência
([AH](../decisoes/acesso.md#ah--o-menu-por-assunto-o-colaborador-ganha-página-própria-e-ativos-vira-computadores)). Até ali era a sexta aba de Configurações; saiu de lá porque é
operação de toda semana — contratação, entrega, desligamento —, tem lixeira e
ficha, e as outras cinco abas são referência que se monta uma vez.

O cadastro **é o mesmo componente** das abas de Configurações
(`src/pages/components/catalogo/CadastroDoCatalogo.tsx`), com a spec do
colaborador (`src/pages/colaboradores/specs/index.ts`): a busca por nome ou
e-mail, a paginação, Editar, Desativar/Ativar, a Ficha e Excluir na ordem e
com as frases do sistema inteiro, e a aba Lixeira. A API não mudou: é o CRUD do
catálogo em `/api/people`.

Os endereços antigos da ficha — `/configuracoes/colaboradores/:id` e, antes,
`/users/:id` — redirecionam para `/colaboradores/:id`, com o mesmo id.

## O que é

**Quem RECEBE equipamento** — ativo, posto, licença, unidade
de estoque. Não entra no sistema: quem opera o painel é **usuário**, na tela
Usuários, e é outra tabela
([U](../decisoes/acesso.md#u--quem-recebe-equipamento-sai-de-user-colaborador-vira-catálogo-e-sobram-dois-cargos)).
Um não vira o outro: quem opera o sistema e também tem um notebook é cadastrado
aqui à parte, à mão — nada cria colaborador a partir de usuário.
**Campos:** nome completo e e-mail.

- **O e-mail é opcional** — o colaborador não faz login — e único quando
  preenchido entre os que não estão na lixeira, gravado em minúsculas:
  `E-mail já está em uso por outro colaborador.`
  O nome **não** é único: dois "João Silva" existem, e é o e-mail que os separa.
- **A lista de escolha** (`/api/people/options`) é o seletor de pessoa da
  entrega de ativo, do posto, da licença e da entrega de estoque.

## A ficha

O botão 📄 abre `/colaboradores/:id`: os **postos** que a pessoa
ocupa (com o turno), os **itens de estoque** e as **licenças** no nome dela — cada
um com o link para o detalhe do item ou da licença, onde está o Devolver — e o
**histórico**, que é só movimentação: entregas e devoluções de ativo, entradas e
saídas de posto, licenças e estoque recebidos e devolvidos. Só o que foi entregue a
ELA: as licenças do computador que ela usa ficam na aba Licenças do ativo, e o
estoque da mesa que ela ocupa, na ficha do posto. Só leitura.

## Exclusão, lixeira e desativação

**Excluir manda para a lixeira** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)). O colaborador tem histórico de posse
**próprio** — "o que já esteve com a Laura" —, e recadastrá-lo depois de excluir
o partiria em dois: os equipamentos antigos ficariam presos a um cadastro que
ninguém abre. Na lixeira a linha fica: o histórico dos ativos, do estoque e das
licenças continua com o nome dele, e ele some das listas, dos seletores e da
ficha (404).

Só não se exclui quem responde por algo **agora** (invariante 6) — 409 com a
conta, a mesma da desativação:
`Este colaborador ainda responde por 1 ativo e ocupa 1 posto. Devolva o que está com ele e encerre as ocupações antes de excluir.`

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
| lixeira, restaurar, a recusa que diz o quê, desativação, `/options` | `tests/invariantes/colaborador.test.ts`, `tests/invariantes/posse.test.ts` |
| o corpo literal do formulário (e-mail em branco vira nulo, único e em minúsculas) | `tests/formularios/corpo-literal.test.ts` |
| o histórico da ficha, com as quatro fontes | `tests/listagens/historico-da-pessoa.test.ts`, `tests/licencas/historico.test.ts`, `tests/estoque/operacoes.test.ts` |
