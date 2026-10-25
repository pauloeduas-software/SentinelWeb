# Configurações

> As seis tabelas de catálogo — Categorias, Status, Fabricantes, Modelos,
> Localizações e Colaboradores: o que cada uma é, quem aponta para ela e o que o
> sistema recusa.
>
> As regras que viram fato permanente no banco estão também em
> [`invariantes.md`](invariantes.md) (a 3 e a 21); aqui está o funcionamento da
> tela inteira. A baixa do ativo, que **não** é um status, está em
> [`baixa.md`](baixa.md).

---

## O que são

São as listas de referência que o resto do sistema **escolhe** num `<select>`.
Ninguém cadastra um equipamento aqui: cadastra-se a opção — "Dell", "Notebook",
"Disponível", "Filial SP" — que o formulário de ativo, licença e estoque oferece.
É o que impede "Dell", "DELL" e "Del" de virarem três fabricantes num relatório.

```
Fabricante (Dell)
   └── Modelo (Latitude 5450, nº P173G) ── Categoria (Notebook, tipo Ativo)
          └── Ativo (ATV-00042, série 5CG…) ── Status (Disponível)
                                            └─ Localização (Filial SP)
```

A ordem prática de cadastro é essa: **categorias e fabricantes**, depois
**modelos** (que pedem os dois), depois **localizações**, e só então ativos. Os
**colaboradores** — quem recebe o equipamento — entram quando houver o que
entregar.

### Como o código é montado

Uma tela e um CRUD para as seis, dirigidos por **spec** — acrescentar uma tabela
é escrever a spec, não copiar uma fatia.

| | Servidor | Tela |
|---|---|---|
| a spec de cada tabela | `server/domain/catalog/specs/*.spec.ts` | `src/pages/configuracoes/specs/index.ts` |
| o contrato da spec | `catalog-spec.types.ts` | `catalog-ui.types.ts` |
| o CRUD | `use-cases/{list,create,update,delete}-catalog.usecase.ts` | `hooks/useCatalog.ts`, `components/Catalog*.tsx` |
| as rotas | `catalog.maestro.ts`, cinco por tabela, em laço | — |
| a ficha do colaborador | `server/domain/person/` (só leitura) | `colaborador/` — `/configuracoes/colaboradores/:id` |

As duas listas (`CATALOG_SPECS` e `CATALOG_UI_SPECS`) estão **na mesma ordem**:
a tela e o maestro as percorrem em paralelo.

---

## O que vale para as seis

| Regra | Como funciona | Onde |
|---|---|---|
| **Quem lê e quem escreve** | `ADMIN`, o único cargo ([Z](../decisoes/acesso.md#z--sobra-um-cargo-só-administrador-e-a-separação-de-cargos-fica-para-decidir)) — `GET`, `POST`, `PUT`, `DELETE` e o `restore` do colaborador. A exclusão é guardada pelo uso (o 409 abaixo), não pelo cargo | `access/helpers/route-permissions.ts` |
| **Campo desconhecido é recusado** | `strictObject` em todo schema: 422, nunca ignorado em silêncio | `schemas/catalog-entities.schema.ts` |
| **Nome único, sem diferença de maiúscula** | "dell" é recusado quando há "Dell": 409 `Já existe fabricante com o nome "Dell".` `%` e `_` contam como letras, não como curingas. Categoria é única **por tipo**; modelo não tem nome único (ver abaixo) | `helpers/nome-unico.helper.ts`, campo `nomeUnicoPor` da spec |
| **Exclusão só sem uso** | `DELETE` de linha que alguém usa **agora** é 409 com a contagem e a saída: `Não é possível excluir: fabricante em uso por 3 registros. Desative-o em vez de excluir: …` A tela mostra isso numa **notificação do sistema**. O colaborador diz *o quê* em vez de quantos (`motivoParaNaoExcluir`) | `countUsages` e `dicaEmUso` de cada spec, `delete-catalog.usecase.ts` |
| **Desativar em vez de excluir** | o desativado some das listas de escolha e é **recusado** (409) quando escolhido de novo; continua no histórico e em tudo que já o usa. Detalhes abaixo | `isActive` nas seis, `optionsWhere`, `assertEscolhaAtiva` |
| **A contagem inclui a lixeira** | ativo e item de estoque na lixeira continuam apontando — e podem voltar. A licença não tem lixeira: a encerrada conta, a excluída não existe mais | `INCLUINDO_LIXEIRA` nos `countUsages` |
| **Lixeira só em Colaboradores** | nas outras cinco, exclusão é definitiva (D8) e o que protege é o 409 por uso. O colaborador vai para a lixeira, com Restaurar ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)) | `lixeira` da spec, `restore-catalog.usecase.ts` |
| **Tudo vai para o histórico** | criar, editar e excluir gravam `ActivityLog` na **mesma transação**; a edição grava só o que mudou | `recordActivity` nos use-cases |
| **Listas de escolha** | `GET /api/<tabela>/options` devolve `{ id, name }` dos **ativos**, até 200, com busca `?q=` — e o colaborador vem também com `detalhe`, o e-mail (`optionDetail` da spec), que o seletor da entrega de licença mostra ao lado do nome. É ele que alimenta todo `<select>`. Um **filtro** de listagem pede `?inativos=incluir`, porque o desativado ainda tem registros | `list-catalog-options.usecase.ts` |

> **A contagem de uso é a regra inteira.** Se uma tabela nova passar a apontar
> para uma destas e o `countUsages` não a conhecer, a exclusão cai no erro cru do
> banco (`P2003`) e a troca de tipo da categoria passa sem guarda. Toda FK nova
> para o catálogo pede uma linha no `countUsages` correspondente.

### Botões da linha (coluna Ações)

Nesta ordem — o destrutivo na ponta:

| Botão | Abas | O que faz |
|---|---|---|
| ✏️ Editar | todas | abre o formulário preenchido |
| ⏻ Desativar / Ativar | todas | grava só `isActive`; pede confirmação ao desativar, não ao ativar |
| 📄 Ficha do colaborador | Colaboradores | abre a ficha da pessoa — ver Colaboradores |
| 🗑️ Excluir | todas | confirma e apaga; com uso, a notificação diz por quê |

Desativar é **botão da linha**, nunca caixa no formulário — o mesmo padrão de
Usuários (Editar, Desativar, Excluir). A linha desativada aparece esmaecida,
com a marca "desativado"/"desativada" ao lado do nome.

Erros de ação (exclusão recusada, desativação recusada) aparecem numa
**notificação do sistema**, no canto inferior direito, e somem sozinhos
(`src/pages/components/Notificacoes.tsx`, `src/pages/hooks/useNotificacao.ts`). A recusa do
colaborador que ainda tem licença diz quais, e a notificação traz um link para cada uma — o
Devolver mora no detalhe da licença; com link, ela fica até alguém fechar.

### Desativar e ativar

| | |
|---|---|
| **continua** | na lista de Configurações (esmaecido), no histórico, nos relatórios e em todo registro que já aponta para ele |
| **some** | das listas de escolha dos formulários; o vínculo que já aponta para ele aparece como "fora desta lista" e não se perde |
| **recusa** (409) | ser **escolhido** de novo: `O fabricante "Dell" está desativado e não pode ser escolhido. Reative em Configurações ou escolha outro.` |
| **deixa passar** | editar o registro que **já** o usa sem trocar o vínculo — o formulário reenvia todo campo |

Onde a escolha é recusada:

| Desativado | Recusado em |
|---|---|
| categoria | modelo novo ou trocado, licença, item de estoque |
| status | ativo novo, troca de status do ativo, status escolhido na entrega ou na devolução. A escolha **automática** só considera status ativos, e o último ativo de Disponível e de Em uso não pode sair (ver Status) |
| fabricante | modelo novo ou trocado, licença |
| modelo | ativo novo, troca de modelo do ativo |
| localização | ativo, item de estoque ou posto novo guardado nela — ver Localizações |
| colaborador | entrega de ativo, de licença e de estoque, ocupante novo — ver Colaboradores |

**O que a desativação não alcança, de propósito:**
- **o que já existe por baixo.** Desativar a categoria "Servidor" ou o fabricante
  "Dell" tira os dois das escolhas de **modelo**, mas os modelos ativos deles
  continuam escolhíveis para ativo novo. Quem quer parar de cadastrar aquele
  equipamento desativa o **modelo**.
- **a lixeira.** Restaurar um ativo devolve o modelo, o status e o local que ele
  tinha, desativados ou não — o vínculo não muda, ele só volta.

---

## Categorias

**O que é:** o agrupamento do registro — "Notebook", "Monitor", "Office".
**Campos:** nome e **tipo**.

O tipo diz a que **módulo** a categoria pertence, e é fechado:

| Tipo | Quem usa | Observação |
|---|---|---|
| `ASSET` — Ativo | o **modelo** de equipamento | o ativo não tem categoria própria: herda a do modelo |
| `LICENSE` — Licença | a licença | |
| `STOCK` — Estoque | o item de estoque (monitor, mouse, cabo) | o que não é computador é estoque |

- **Única por (nome, tipo):** "Notebook" de Ativo e "Notebook" de Licença são duas
  categorias; "notebook" de Ativo, ao lado de "Notebook" de Ativo, é recusada.
- **Em uso:** modelos, ativos (pelo modelo), itens de estoque e licenças — os da
  lixeira inclusive.
- **O tipo não muda com a categoria em uso** — 409. Trocar o tipo por baixo dos
  registros mudaria o significado deles sem tocar em nenhum (invariante 3).
- **Cada módulo confere o tipo ao gravar:** modelo exige `ASSET`, licença exige
  `LICENSE`, item de estoque exige `STOCK` — 422 em qualquer outro. A tela só
  oferece as do tipo certo, mas a regra é do servidor.
- **Filtro por tipo** na listagem (`?type=`), validado contra a lista fechada. O
  filtro de categoria das listas de Ativos, Licenças e Estoque mostra também as
  desativadas.

## Status

**O que é:** o estado do equipamento **agora** — o que dá para fazer com ele.
**Campos:** nome (livre), **tipo** e notas.

O nome é seu; o tipo é uma de quatro caixas que o sistema entende:

| Tipo | Significa | Pode ser entregue? |
|---|---|---|
| `DEPLOYABLE` — Disponível | no estoque, pronto | **sim — o único** |
| `IN_USE` — Em uso | com alguém, cumprindo a função | não (já está) |
| `PENDING` — Pendente | fora por um impedimento, e volta: conserto, trânsito, preparo | não |
| `UNDEPLOYABLE` — Inutilizável | ainda é da empresa, mas não serve e não volta | não |

- O seed cria um status de cada tipo: **Disponível, Em uso, Pendente,
  Inutilizável**. Pode renomear e criar quantos quiser; nenhum código procura
  status pelo nome.
- **O tipo não muda com o status em uso** — 409 (invariante 3). A saída é criar
  o status novo e mover os ativos.
- **Ativo entregue não fica `Disponível`** — invariante 4.
- **A entrega** aplica o primeiro status `IN_USE` **ativo**, por nome, ou o
  escolhido à mão (que não pode ser `Disponível`: 422). **A devolução** aplica o
  primeiro `DEPLOYABLE` ativo, ou o escolhido — e pode manter o status atual do
  ativo mesmo que ele tenha sido desativado.
- **O último ativo de `Disponível` ou de `Em uso` não sai** — nem desativado,
  nem trocado de tipo, nem excluído: 409 `"Disponível" é o único status ativo do tipo
  Disponível, e é ele que a devolução aplica sozinha. Crie ou reative outro do
  mesmo tipo antes.` Sem isso, toda entrega ou devolução automática quebraria.
- **Não existe tipo "baixado" ou "arquivado".** O ativo que deixa de ser da
  empresa recebe **baixa**, que é outra coisa — [`baixa.md`](baixa.md).

## Fabricantes

**O que é:** quem fabrica o equipamento ou o software.
**Campos:** nome, site, telefone de suporte, e-mail de suporte.

- **Site:** só endereço completo com `http://` ou `https://` — `dell.com` e
  `javascript:…` são 422 com a mensagem que nomeia o campo. O cadastro pede, de
  preferência, a página de suporte (onde se abre chamado de garantia).
- **Os canais aparecem na ficha do ativo** (aba Detalhes, seção "Suporte ·
  fabricante"): site como link, telefone como `tel:`, e-mail como `mailto:`.
  Campo vazio não aparece; sem nenhum, a seção some.
- **Em uso:** modelos e licenças (a encerrada inclusive). A licença tem
  fabricante **opcional**; o modelo, obrigatório.

## Modelos

**O que é:** o tipo de equipamento do catálogo — "Latitude 5450 da Dell". O
**ativo** é um exemplar dele: 50 notebooks iguais são 1 modelo e 50 ativos.
**Campos:** nome, número do modelo, fabricante, categoria, notas.

- **Fabricante e categoria são obrigatórios** e conferidos ao gravar: inexistente
  é 404 (`Fabricante não encontrado.`), categoria que não é de Ativo é 422.
- **O ativo herda a categoria do modelo.** Trocar a categoria do modelo move
  todos os ativos dele de uma vez — por isso só categoria de Ativo é aceita.
- **O número é único por fabricante, sem diferença de maiúscula:** 409
  `O número "P173G" já é do modelo "Latitude 5450" deste fabricante.` Modelos
  **sem** número convivem à vontade.
- **Em uso:** os ativos do modelo, os da lixeira inclusive.

### O computador montado

PC montado não tem fabricante nem modelo comercial. Em vez de abrir exceção na
regra "todo modelo tem fabricante", ele usa um fabricante explícito,
**Montado**, com um modelo por **tipo** de máquina — **Desktop montado** e
**Servidor montado** —, nunca um por configuração.

O que distingue um montado do outro fica no **ativo**: as notas dele
("i5-7400, GTX 980, 1 TB") e, quando o agente está instalado, o processador, a
memória e o disco que chegam sozinhos na aba **Máquina**. Não se cadastra
Intel, AMD ou Nvidia como fabricante para montar um modelo.

## Localizações

**O que é:** onde o ativo fica — a filial, a sala, o depósito, a mesa.
**Campos:** nome, telefone, CEP, endereço, cidade, estado, notas.

- **Lista plana.** Não há "dentro de" nem gestor: o nome, único no sistema
  inteiro, é quem diz onde o lugar fica ("Mesa 1 — Filial SP").
- **O estoque também tem lugar.** O item de estoque tem uma localização
  opcional — onde fica guardado o que sobra, normalmente o Depósito de TI. A
  unidade entregue a alguém está com quem a recebeu (a saída), não ali.
- **O posto de trabalho fica numa localização**, mas não é uma: é cadastro
  próprio, criado e editado na tela **Postos** ([`postos.md`](postos.md)). A
  localização **não recebe** — nem entrega, nem saída de estoque, nem ocupante;
  quem recebe é o posto
  ([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)).

### Uso e desativação

Localização tem a regra do **status**: só o que aponta para ela **agora**
impede a exclusão
([Y](../decisoes/posse.md#y--o-posto-sai-de-location-localização-guarda-posto-recebe)). É 409 com a dica
`Mova o que está guardado nela e os postos que ficam nela, ou desative-a: …`

**Uso**, aqui, é: **ativo** guardado nela (lixeira inclusive), **item de
estoque** guardado nela (lixeira inclusive) e **posto** que fica nela. O ativo e
o item da lixeira entram porque continuam apontando e podem voltar. Como ela não
recebe nada, não há passado preso a ela: sem nada disso, ela sai de verdade, sem
nome por escrito para guardar.

**Desativada** (`isActive = false`), ela:

| | |
|---|---|
| continua | na lista de Configurações (esmaecida), no histórico, nos relatórios, com tudo o que já estava nela |
| **some** | das listas de escolha (`/options` só devolve as ativas); o vínculo que já aponta para ela aparece como "fora desta lista" e não se perde |
| **recusa** (409) | ativo, item de estoque ou posto novo guardado nela — `"Filial SP" está desativada e não recebe ativo novo.` |
| **deixa passar** | editar o ativo, o item ou o posto que **já** está nela sem trocar o local — desativar não esvazia nada |

**Ativar** desfaz tudo. É a invariante 21.

## Colaboradores

**O que é:** quem RECEBE equipamento — ativo, posto, licença, unidade
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
  entrega de ativo, do posto, da licença e da saída de estoque.

### A ficha

O botão 📄 abre `/configuracoes/colaboradores/:id`: os **postos** que a pessoa
ocupa (com o turno), os **itens de estoque** e as **licenças** no nome dela — com
o botão **Devolver** em cada um — e o **histórico**: cadastro e edições, entregas e
devoluções de ativo, entradas e saídas de posto, licenças recebidas e devolvidas. Só
as licenças entregues a ELA: as do computador que ela usa ficam na aba Licenças do
ativo. Só leitura, fora o Devolver.

### Exclusão, lixeira e desativação

**Excluir manda para a lixeira** ([V](../decisoes/posse.md#v--excluir-não-apaga-o-passado-localização-por-referência-colaborador-pela-lixeira)). O colaborador tem histórico de posse
**próprio** — "o que já esteve com a Laura" —, e recadastrá-lo depois de excluir
o partiria em dois: os equipamentos antigos ficariam presos a um cadastro que
ninguém abre. Na lixeira a linha fica: o histórico dos ativos, do estoque e das
licenças continua com o nome dele, e ele some das listas, dos seletores e da
ficha (404).

Só não se exclui quem responde por algo **agora** (invariante 6) — 409 com a
conta, a mesma da desativação:
`Este colaborador ainda responde por 1 ativo e ocupa 1 posto. Devolva o que está com ele e encerre as ocupações antes de excluir.`

**A aba Lixeira** fica dentro de Colaboradores. **Restaurar** devolve a mesma
pessoa, com o histórico inteiro; se o e-mail dela foi reaproveitado por outro
cadastro enquanto ela estava lá, é 409 `O e-mail deste colaborador já está em uso por outro cadastro.`
Não há "apagar de vez": seria apagar o histórico que a lixeira existe para
guardar.

**Desativar** é para quem continua na lista — o afastado que volta —, e tem a
mesma regra: só desativa quem não responde por nada agora. Desativado, ele some
das escolhas e é recusado (409) em entrega nova e ocupação nova. **Ativar**
desfaz.

---

## Corridas que o catálogo fecha

Quando um lado muda o que o outro acabou de ler, as duas transações travam a
mesma linha — o helper é `catalog/helpers/catalog-lock.helper.ts`, e a ordem
segue o grafo de `asset/use-cases/lock-asset.usecase.ts`.

| As duas operações | O que dava errado | A trava |
|---|---|---|
| trocar o tipo da categoria × cadastrar licença, item ou modelo nela | item de estoque numa categoria de Ativo | `FOR UPDATE` na troca, `FOR SHARE` na leitura do tipo |
| trocar o tipo do status × editar/entregar/devolver ativo com ele | ativo entregue com status de estoque | idem, na linha do status |
| devolver o mesmo ativo duas vezes, ou devolver atrasado depois de uma entrega nova | posse errada fechada, ativo entregue marcado "Disponível" | a devolução trava o ativo e só fecha a posse ABERTA |
| desativar, trocar o tipo ou excluir dois status do mesmo tipo automático | nenhum "Disponível" ou "Em uso" ativo sobrando | `FOR UPDATE` em todos os status do tipo, na mesma ordem |
| desativar a localização × guardar algo nela | ativo, item ou posto num local que acabou de fechar | `FOR NO KEY UPDATE` na escrita do local × `FOR SHARE` de quem confere o `isActive` |
| desativar categoria, status, fabricante ou modelo × escolhê-lo | escolha aprovada com o valor velho | o `UPDATE` da desativação × `FOR SHARE` da leitura (`lerCategoriaTravada`, `lerStatusTravado`, `lerFabricanteTravado`, `lerModeloTravado`) |
| desativar o colaborador × entregar a ele ou pô-lo num posto | desativado com posse aberta | `FOR UPDATE` na linha da pessoa nos dois lados (`lock-person.usecase.ts`) |

A exceção aceita: dois cadastros **simultâneos** de "Dell" e "dell" passam os dois
(a checagem é da aplicação; o `@unique` do banco só pega a grafia idêntica).

---

## O que vem semeado

Dois seeds, com regras diferentes:

| | `npm run db:seed` — o principal | `npm run db:seed:demo` — demonstração |
|---|---|---|
| onde roda | todo banco, produção incluída, e antes de cada arquivo de teste | só quando alguém pede: ambiente de desenvolvimento e demonstração |
| o que cria | o que é do SOFTWARE: as 11 categorias, os 4 status (Disponível, Em uso, Pendente, Inutilizável) e a configuração — nenhuma conta ([T](../decisoes/acesso.md#t--não-há-conta-semeada)) | o que é da EMPRESA, como exemplo: fabricantes, modelos e localizações (abaixo). Roda o principal antes |
| arquivos | `prisma/seeds/*.seed.ts`, ordem em `prisma/seeds/index.ts` | `prisma/seeds/demo/*.seed.ts`, ordem em `prisma/seeds/demo/index.ts` |

Fabricante, modelo e localização ficam **fora** do principal de propósito:
semear "Dell" no banco de um cliente é adivinhar o parque dele, e os testes
cadastram os próprios.

**A demonstração cria:**

| Fabricantes | Dell, Lenovo, Asus, Acer, Apple, Samsung, Microsoft (com o site de suporte) e Montado |
|---|---|
| **Modelos** | um por fabricante, a linha mais popular — Inspiron 15, IdeaPad 3, Vivobook 15, Aspire 5, MacBook Air, Galaxy Book —, a Microsoft sem modelo, e Desktop montado e Servidor montado. Sem número de modelo: cada linha tem dezenas de variações, e um número inventado seria dado errado |
| **Localizações** | Matriz, Filial (exemplo), Depósito de TI (onde fica o estoque) e Home office (uma só para todo mundo de casa, sem endereço) |

Os dois são **idempotentes**: rodar de novo não duplica nem desfaz o que foi
editado pela tela. O de demonstração confere o nome **sem diferença de
maiúscula** (quem já cadastrou "DELL" não ganha uma segunda Dell) e pula, com
aviso, o modelo cujo fabricante ou categoria foi renomeado ou excluído.

---

## Onde é testado

| Assunto | Arquivo |
|---|---|
| contagem de uso, troca de tipo, modelo, nome único, URL, desativar | `tests/invariantes/catalogo.test.ts` |
| localização: exclusão pelo presente, não recebe entrega, desativação, lista plana, estoque guardado nela | `tests/invariantes/localizacao.test.ts` |
| colaborador: lixeira, restaurar, a recusa que diz o quê, desativação, `/options` | `tests/invariantes/colaborador.test.ts`, `tests/invariantes/posse.test.ts` |
| filtro por tipo e `/options` | `tests/listagens/filtro-por-categoria.test.ts`, `opcoes-com-busca.test.ts` |
| as corridas | `tests/corridas/posse.test.ts`, `tests/corridas/ativo-por-posto.test.ts`, `tests/estoque/corridas.test.ts` |
