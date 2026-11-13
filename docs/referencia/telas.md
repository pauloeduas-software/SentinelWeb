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
| `CartaoDaFicha` e `TabelaDaFicha` | a ficha em página: computador, colaborador, posto, item e licença |
| `AcoesDaLinha` | o `⋯` |
| `PessoaNaLinha` | a pessoa na lista: o avatar, o nome e o e-mail embaixo |
| `ComputadoresNaFicha` | o computador numa aba de ficha: no posto e no colaborador |
| `LinhaDoResponsavel` | a linha da aba Responsáveis, que abre a ficha do responsável |
| `AvisoDaLixeira` | a ficha aberta da Lixeira: computador e colaborador |
| `confirmar()` (`hooks/useConfirmacao`) | a pergunta, nunca `confirm()` |
| `useNotificacao` | o cartão da resposta a um clique, nunca `alert()` |
| `useCopiar` | o botão de copiar: quem diz que copiou é ele |

Cadastro novo copia `src/components/catalogo/` (`CatalogTable` + `useCatalog`), não a licença.

## O visual

- **Tema claro e escuro.** Cor só pelos tokens de `src/index.css`.
- **Sem cor por dado** (nome, categoria, tipo de evento). Cor só por token do tema, em botão, aviso e
  no status: ativo, desativado, vencido, online (`Badge`, `PontoDeStatus`; AY). O lint recusa cor
  fixa em `src/`.
- **Texto de 12px para cima (BH).** A escala de `src/index.css` vale para `text-xs` a `text-xl`; tamanho
  fixo em `px` não entra.
- **Cor de texto não é cor de fundo (BH).** Link é `text-link`, e o botão de perigo é `bg-destructive`:
  `text-primary` sobre o card e `bg-status-danger` com texto branco não passam de 4,5:1 no escuro.
- **Fonte normal.** `font-mono` só em código: etiqueta, série, chave, IP, MAC, UUID, HWID e senha
  temporária.
- **Pouco texto na tela.** Página sem subtítulo; a regra mora na ajuda do campo (AZ).
- **Alerta só de prazo, e só na tela do assunto:** o da licença fica em `/licencas`.
- **Botão que o cargo não alcança some** (`usePode`).

## O registro

- **O CRUD é um só.** A linha inteira abre o registro (a ficha ou, no cadastro sem ficha, o Editar). Editar,
  Desativar/Ativar e Excluir, nessa ordem, no `⋯` (AY).
- **Na Lixeira, a linha abre a ficha só para consulta (BW, CF).** O `AvisoDaLixeira` fica entre o card e as abas, e a
  única ação é Restaurar, no card.
- **Excluir sempre clica, e quem recusa é o 409.** A exceção é a própria conta, em Usuários: ali
  Excluir e Desativar ficam desligados, porque ninguém age sobre si mesmo. E o computador baixado
  não tem Excluir, como não tem Entregar: ele não vai para a lixeira ([CL](../decisoes/catalogo-e-ativo.md#cl--o-baixado-não-vai-para-a-lixeira-e-a-máquina-sai-antes-da-baixa-e-da-lixeira)).
- **Desativar existe só em colaborador, conta e item de estoque;** a licença tem Encerrar; catálogo e
  posto só excluem (AF, AN, AO).

## As mensagens

Cada mensagem tem um lugar só (BF):

| A mensagem | Onde |
|---|---|
| resposta a um clique, deu certo ou foi recusado | cartão no canto inferior direito (`useNotificacao`), um por vez, que some sozinho e espera com o mouse ou o foco em cima; com link, fica até alguém fechar. Com o painel aberto, ele sai da frente dos botões |
| recusa de formulário | dentro dele (`FormularioLateral`, login e Minha conta): o cartão cobriria o Salvar |
| falha ao carregar | no lugar do conteúdo (BB) |
| situação que continua valendo (prazo, fora do patrimônio) | `Aviso`, na tela do assunto |
| campo inválido | o balão do navegador (`validacao.helper.ts`) |
| copiar | o próprio botão, por dois segundos (`useCopiar`); a falha vai para o cartão |

Toda ação que grava confirma no cartão. As exceções são a conta nova e a senha temporária, que
mostram a senha no painel aberto, e a troca obrigatória de senha, que já leva ao sistema.

## A ficha

- **O detalhe de um registro é página, nunca janela (BK).** Os campos moram no card, sem aba Detalhes (BR), e cada aba
  é o que está com o registro. Formulário é painel lateral, por cima da ficha.
- **O card é um só (BS).** Grade de até cinco colunas com a coluna das ações fixa, e o que é da mesma família em
  `GrupoDeDados`: status e identificação, catálogo, compra e, por último, Notas na largura toda. Cadastrado em em toda
  ficha. O card é só leitura: quem abre outro registro é a linha da aba, e o único link é o site de suporte.
- **O que já foi mora na aba Histórico, a última (BP).** As outras abas dizem o que está agora, e nenhuma repete o
  passado. Toda ficha tem a sua, em `LinhaDoTempo`.
- **A aba que lista diz quantas linhas tem (`ContagemDaAba`),** o Histórico também: no estoque, as entregas, e não as
  unidades. A Máquina, que não é lista, fica sem número.
- **A ação da ficha fica no card (`CartaoDaFicha`), e nenhuma aba repete botão (BB, CD).** As cinco fichas têm as ações
  da linha da lista, com as mesmas frases.
- **O computador numa aba é uma tabela só (CE):** `ComputadoresNaFicha`, no posto e no colaborador, com as colunas da
  lista de Computadores e as duas datas da entrega.
- **A aba Responsáveis é uma só (BQ):** a `ListToolbar` com a busca (`?quem=`) e o box com uma linha por responsável e a
  ação à direita. Entregue a um posto, a linha é o posto, com quem está nele embaixo (BL), e a busca acha também por
  essas pessoas. A linha abre a ficha do responsável, o colaborador, o posto ou o computador, menos quando o clique é
  num botão ou campo dela ou há um pedido aberto nela (`LinhaDoResponsavel`, [CJ](../decisoes/plataforma.md#cj--a-linha-do-responsável-abre-a-ficha-dele)).
  O botão do card só entrega, e sem poder entregar ele trava com o motivo; o Devolver fica na linha. No
  computador, ele abre o painel, porque a devolução pede o status e as notas.
- **O Devolver mora só na ficha do que foi entregue (BN):** o computador, o item e a licença. A ficha do posto e a do
  colaborador mostram o que está com eles em `TabelaDaFicha`, e a linha abre o registro.
- **A seta volta para onde a ficha foi aberta, como estava (BB, BJ).** `useVoltaComFiltros` lê o caminho no
  `state` da navegação; sem ele, como no link colado, vai para a lista. A ficha que abre outra passa
  `useVoltaParaEstaFicha`, e a `TabelaDaFicha` faz isso em toda linha. O nome na seta vem de `rotuloDaVolta`.
- **A pergunta segue o risco.** Sem volta: pergunta e vermelho. Com volta: pergunta sem vermelho.
  Rotina: sem pergunta.

## A lista

- **Toda lista é igual (BB).** Cartões, vistas (`VistasDaLista`), barra e `Card > Table`, com o vazio
  em `ListaVazia`. O botão fica no fim do `ListToolbar`. Linha de 48px com no máximo duas linhas de
  texto, coluna Status com `PontoDeStatus` e o valor no masculino (BU), 15 por página
  (`POR_PAGINA`, também em aba de ficha e histórico) e tudo na URL (`useListaNaUrl`): status é
  cartão, categoria e tipo são `FiltroDaLista`.
- **Pessoa leva avatar, e coisa leva o ícone do assunto (CC).** Em Usuários e Colaboradores, a primeira coluna é
  `PessoaNaLinha`, com o nome da lista: Usuário, Colaborador. O card da ficha do colaborador leva o mesmo avatar, e as
  outras fichas, o `IconeDaFicha`.
- **O cartão conta linhas da lista, e cada linha cai em um só (BT, CA).** Tipo de status em Computadores, status em Postos
  e Licenças, Ativos e Desativados em Estoque, Colaboradores e Usuários. O número é o total da lista que ele abre, sem a
  busca.
- **As colunas não se mexem.** `Table` é `table-fixed`: filtrar, paginar ou esvaziar a lista não
  desloca nada. A largura vem do `TableHead`, o `⋯` é `TableHeadAcoes` e o aviso de lista vazia é
  `TableVazia`, debaixo do cabeçalho (BA).
- **A barra da lista não anda.** Com uma página só as setas somem, mas guardam o lugar (`invisible` no
  `ListToolbar`): filtrar não desloca a busca nem o botão (AZ).
- **A consulta que falha não diz "nenhum" (BB).** Aba, histórico, cartão e contagem mostram o erro ou
  `—`, nunca vazio nem 0. Query nova passa o `error` para a tela (`EstadoDaLista`, `ListaVazia`,
  `LinhaDoTempo`).

## O formulário

- **Clicar fora fecha (BG),** com Esc e o X. Se a pessoa mexeu em algo, `FormularioLateral` pergunta
  antes; Cancelar fecha direto. O que a tela não mostra de novo pede a sua pergunta (`perguntaAoSair`),
  e controle novo que não seja campo do navegador avisa pelo `MarcarAlteracaoContext`.
- **Todo formulário é igual (BB).** Uma largura só. O título é ação e tipo, e a descrição diz qual
  registro. Salvar no cadastro e o verbo na operação; o campo livre é Notas. Na linha, Cancelar vem
  antes de Confirmar.
- **Editar manda o formulário inteiro** com o `updatedAt` lido ao abrir; se a linha mudou, o servidor
  responde 409 (`server/modules/shared/versao.helper.ts`, AF). Menos Usuários: o login grava na linha
  da conta.
- **O formulário não oferece o que o servidor sempre recusa.** O seletor tira a opção: o status de
  estoque do computador entregue, o posto que já tem computador (`?computador=sem`) e o computador que
  já tem máquina (`?maquina=sem`). O calendário limita a data: nada antes da compra, prazo no passado
  ou dia futuro. E o campo que o servidor não deixa em branco é obrigatório na tela: a etiqueta é
  automática só no cadastro e no clone.
