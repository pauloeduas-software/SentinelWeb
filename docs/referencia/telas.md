# Telas

> O molde de toda tela do painel: as peças, o visual, o registro, a ficha, a lista e o formulário. O
> que é de uma tela só fica na página do assunto. As letras são decisões, e as do visual (AY, AZ, BA
> e BB) estão em [`plataforma.md`](../decisoes/plataforma.md).

---

## As peças

O visual vem da IntraNet (AY). Tela nova usa os primitivos de `src/components/ui/` e estas peças:

| Peça | Para quê |
|---|---|
| `PaginaCabecalho` | só o título e o voltar: nenhum botão no cabeçalho (BB) |
| `CartoesDeContagem` | o número que filtra |
| `FormularioLateral` | todo formulário |
| `JanelaDeDetalhe` | detalhe de item e licença, em abas |
| `CartaoDaFicha` e `TabelaDaFicha` | a ficha em página: computador, colaborador e posto |
| `AcoesDaLinha` | o `⋯` |
| `confirmar()` (`hooks/useConfirmacao`) | a pergunta, nunca `confirm()` |
| `useNotificacao` | o cartão da resposta a um clique, nunca `alert()` |
| `useCopiar` | o botão de copiar: quem diz que copiou é ele |

Cadastro novo copia `src/components/catalogo/` (`CatalogTable` + `useCatalog`), não a licença.

## O visual

- **Tema claro e escuro.** Cor só pelos tokens de `src/index.css`.
- **Sem cor por dado** (nome, categoria, tipo de evento). Cor só por token do tema, em botão, aviso e
  na situação: ativo, desativado, vencida, online (`Badge`, `PontoDeStatus`; AY). O lint recusa cor
  fixa em `src/`.
- **Fonte normal.** `font-mono` só em código: etiqueta, série, chave, IP, MAC, UUID, HWID e senha
  temporária.
- **Pouco texto na tela.** Página sem subtítulo; a regra mora na ajuda do campo (AZ).
- **Alerta só de prazo, e só na tela do assunto:** o da licença fica em `/licencas`.
- **Botão que o cargo não alcança some** (`usePode`).

## O registro

- **O CRUD é um só.** A linha inteira abre o registro (detalhe, ficha ou Editar). Editar,
  Desativar/Ativar e Excluir, nessa ordem, no `⋯` (AY).
- **Excluir sempre clica, e quem recusa é o 409.** A exceção é a própria conta, em Usuários: ali
  Excluir e Desativar ficam desligados, porque ninguém age sobre si mesmo.
- **Desativar existe só em colaborador, conta e item de estoque;** a licença tem Encerrar; catálogo e
  posto só excluem (AF, AN, AO).

## As mensagens

Cada mensagem tem um lugar só (BF):

| A mensagem | Onde |
|---|---|
| resposta a um clique, deu certo ou foi recusado | cartão no canto inferior direito (`useNotificacao`), um por vez, que some sozinho e espera com o mouse ou o foco em cima; com link, fica até alguém fechar. Com o painel aberto, ele sai da frente dos botões |
| recusa de formulário | dentro dele (`FormularioLateral`, login e Minha conta): o cartão cobriria o Salvar |
| falha ao carregar | no lugar do conteúdo (BB) |
| situação que continua valendo (posto vago, prazo, fora do patrimônio) | `Aviso`, na tela do assunto |
| campo inválido | o balão do navegador (`validacao.helper.ts`) |
| copiar | o próprio botão, por dois segundos (`useCopiar`); a falha vai para o cartão |

Toda ação que grava confirma no cartão. As exceções são a conta nova e a senha temporária, que
mostram a senha no painel aberto, e a troca obrigatória de senha, que já leva ao sistema.

## A ficha

- **A ação da ficha fica no card (`CartaoDaFicha`), e nenhuma aba repete botão (BB).**
- **A pergunta segue o risco.** Sem volta: pergunta e vermelho. Com volta: pergunta sem vermelho.
  Rotina: sem pergunta.

## A lista

- **Toda lista é igual (BB).** Cartões, vistas (`VistasDaLista`), barra e `Card > Table`, com o vazio
  em `ListaVazia`. O botão fica no fim do `ListToolbar`. Linha de 48px com no máximo duas linhas de
  texto, coluna Situação (Status em Computadores e Licenças) com `PontoDeStatus`, 15 por página
  (`POR_PAGINA`, também em aba de ficha e histórico) e tudo na URL (`useListaNaUrl`): situação é
  cartão, categoria e tipo são `FiltroDaLista`.
- **As colunas não se mexem.** `Table` é `table-fixed`: filtrar, paginar ou esvaziar a lista não
  desloca nada. A largura vem do `TableHead`, o `⋯` é `TableHeadAcoes` e o aviso de lista vazia é
  `TableVazia`, debaixo do cabeçalho (BA).
- **A barra da lista não anda.** Com uma página só as setas somem, mas guardam o lugar (`invisible` no
  `ListToolbar`): filtrar não desloca a busca nem o botão (AZ).
- **A consulta que falha não diz "nenhum" (BB).** Aba, histórico, cartão e contagem mostram o erro ou
  `—`, nunca vazio nem 0. Query nova passa o `error` para a tela (`EstadoDaLista`, `ListaVazia`,
  `LinhaDoTempo`).

## O formulário

- **Todo formulário é igual (BB).** Uma largura só. O título é ação e tipo, e a descrição diz qual
  registro. Salvar no cadastro e o verbo na operação; o campo livre é Notas. Na linha, Cancelar vem
  antes de Confirmar.
- **Editar manda o formulário inteiro** com o `updatedAt` lido ao abrir; se a linha mudou, o servidor
  responde 409 (`server/modules/shared/versao.helper.ts`, AF). Menos Usuários: o login grava na linha
  da conta.
