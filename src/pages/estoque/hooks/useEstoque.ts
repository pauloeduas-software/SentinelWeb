import { useMemo, useState } from 'react';
import {
  useCheckinStock, useCheckoutStock, useCreateStockItem, useDeleteStockItem, useStockItemQuery,
  useStockQuery, useUpdateStockItem,
} from '../../../queries/stock.queries';
import type { AlvoDaEntregaDeEstoque, ItemDeEstoque, ItemDeEstoqueInput } from '../../../types/stock.types';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { useRecusaDoLink } from '../../../hooks/useRecusaDoLink';
import { linksDoErro } from '../../../helpers/erro.helper';

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
type ModalDeEstoque = 'criar' | 'editar' | 'entregar' | 'detalhe' | null;

// Estado da tela de Estoque: página, busca e categoria, na URL (`useListaNaUrl`), e
// qual item está aberto.
// É o `useLicencas` com quantidade (AE), e o cadastro das Configurações
// (`useCatalog`): uma lista só, Desativar/Ativar e Excluir com as mesmas frases.
export function useEstoque() {
  const notificar = useNotificacao();
  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = lista;
  const categoryId = parametros.get('categoria') ?? undefined;

  const params = useMemo(
    () => ({ page, perPage, q: debouncedSearch || undefined, categoryId }),
    [page, perPage, debouncedSearch, categoryId],
  );

  const { data, isPending, error } = useStockQuery(params);
  const itens = data?.rows ?? [];

  usePaginaQueExiste(page, data?.total, setPage);

  const criar = useCreateStockItem();
  const editar = useUpdateStockItem();
  const excluir = useDeleteStockItem();
  const entregar = useCheckoutStock();
  const devolver = useCheckinStock();

  const [modal, setModal] = useState<ModalDeEstoque>(null);
  // O ITEM ABERTO é a LINHA inteira, não só o id: a janela desenha nome e
  // conta no primeiro quadro, e a consulta do detalhe chega depois.
  const [itemAberto, setItemAberto] = useState<ItemDeEstoque | null>(null);
  // Entregar e Editar abertos DE DENTRO do detalhe voltam para ele ao fechar —
  // salvando ou cancelando: quem estava olhando o item continua nele.
  const [voltarAoDetalhe, setVoltarAoDetalhe] = useState(false);

  // O LINK DE OUTRA TELA — `?item=<id>`, que as fichas do posto e do
  // colaborador e os links de uma recusa usam (`caminhoDoItem`) para levar à
  // devolução. Abre o detalhe daquele item assim que ele chega, sem efeito:
  // enquanto nenhuma janela foi aberta aqui, a janela aberta é a do link.
  // Fechar tira o link.
  const idDoLink = parametros.get('item');
  // `?quem=<nome>`: quem veio da ficha do colaborador ou da do posto já abre
  // "Com quem está" filtrado por ele.
  const buscaDoLink = parametros.get('quem') ?? '';
  const doLink = useStockItemQuery(idDoLink);
  const pelaUrl = modal === null && doLink.data ? doLink.data : null;
  const modalAtual: ModalDeEstoque = pelaUrl ? 'detalhe' : modal;
  const itemAtual = pelaUrl ?? itemAberto;

  const abrir = (proximo: ModalDeEstoque, item: ItemDeEstoque | null = null) => {
    setVoltarAoDetalhe(modalAtual === 'detalhe' && (proximo === 'entregar' || proximo === 'editar'));
    setItemAberto(item);
    setModal(proximo);
  };

  const fechar = () => {
    if (voltarAoDetalhe) {
      setVoltarAoDetalhe(false);
      setModal('detalhe');
      return;
    }
    setModal(null);
    setItemAberto(null);
    if (idDoLink) lista.trocar({ item: undefined, quem: undefined });
  };

  useRecusaDoLink({
    consulta: doLink,
    id: modal === null ? idDoLink : null,
    frase: 'Não foi possível abrir o item do link',
    fechar,
  });

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por
  // aqui que aparecem o 422 de categoria do tipo errado, o 409 do nome
  // repetido e o de reduzir o total abaixo do que está em uso.
  const handleCriar = async (dados: ItemDeEstoqueInput) => {
    await criar.mutateAsync(dados);
    fechar();
    notificar.sucesso('Item cadastrado.');
  };

  // O formulário inteiro vai, como nas Configurações (AF).
  const handleEditar = async (dados: ItemDeEstoqueInput) => {
    if (!itemAberto) return;
    await editar.mutateAsync({ id: itemAberto.id, data: dados });
    fechar();
    notificar.sucesso('Item salvo.');
  };

  const handleEntregar = async (alvo: AlvoDaEntregaDeEstoque) => {
    if (!itemAberto) return;
    await entregar.mutateAsync({ itemId: itemAberto.id, alvo });
    fechar();
    notificar.sucesso('Item entregue.');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // OS CLIQUES DIRETOS — devolver, desativar, excluir — não têm campo de erro
  // para a mensagem subir, e por isso cada um tem o seu `try/catch` com
  // notificação (`useNotificacao`). Sem ele a rejeição vira *unhandled
  // rejection* e a tela não faz NADA: o 409 daqui é escrito para ensinar.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * A devolução de N unidades de uma entrega, no dia escolhido. Diz se deu certo,
   * para a linha fechar só então, e para o detalhe voltar uma página quando a
   * última linha dela saiu.
   */
  const handleDevolver = async (entregaId: string, qty: number, checkinAt: string): Promise<boolean> => {
    try {
      await devolver.mutateAsync({ entregaId, qty, checkinAt });
      notificar.sucesso('Devolução registrada.');
      return true;
    } catch (erro) {
      // O 409 da entrega já devolvida (duas abas abertas no mesmo item), o de
      // menos unidades do que se pediu, e o 422 da data — futura, ou antes da
      // entrega.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  // DESATIVAR/ATIVAR, com a frase de Configurações (`useCatalog`): grava só
  // `isActive`, e confirma só na ida — ativar não tem o que perder. O botão
  // sempre clica: com unidade em uso, o 409 do servidor manda devolver antes.
  const handleAlternarAtivo = async (item: ItemDeEstoque) => {
    if (item.isActive && !(await confirmar({
      titulo: `Desativar "${item.name}"?`,
      descricao: 'Continua no histórico, mas some das escolhas e não recebe nada novo.',
      acao: 'Desativar',
    }))) return;
    try {
      await editar.mutateAsync({ id: item.id, data: { isActive: !item.isActive } });
      notificar.sucesso(item.isActive ? 'Item desativado.' : 'Item ativado.');
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  // EXCLUIR, com a frase de Configurações. O botão sempre clica: o item com
  // unidade em uso recebe o 409 do servidor, que diz com quem e manda devolver.
  const handleExcluir = async (item: ItemDeEstoque) => {
    if (!(await confirmar({
      titulo: `Excluir "${item.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;
    try {
      await excluir.mutateAsync(item.id);
      notificar.sucesso('Item excluído.');
      // Excluído do detalhe: a janela não tem mais o que mostrar.
      if (itemAtual?.id === item.id) fechar();
    } catch (erro) {
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  return {
    itens,
    total: data?.total ?? 0,
    carregando: isPending,
    // Para a tabela não dizer "nenhum cadastrado" quando a consulta falhou.
    erro: error ? error.message : null,
    page,
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    changeSearch,
    categoryId,
    changeCategoria: (id: string | undefined) => filtrar('categoria', id),

    modal: modalAtual,
    itemAberto: itemAtual,
    // Só para o item do link: o outro, aberto pela lista, abre sem busca.
    buscaDoLink: itemAtual && itemAtual.id === idDoLink ? buscaDoLink : '',
    // Todo link leva à devolução: a ficha e a recusa 409, que vem sem busca. Por
    // isso a janela abre em "Com quem está", com busca ou sem.
    veioDoLink: itemAtual?.id === idDoLink,
    abrir,
    fechar,

    // Enquanto uma ação corre, os botões dela ficam desabilitados: o duplo
    // clique dava "já foi devolvida" DEPOIS de a devolução ter dado certo.
    ocupado: excluir.isPending || editar.isPending || devolver.isPending,

    handleCriar,
    handleEditar,
    handleEntregar,
    handleDevolver,
    handleAlternarAtivo,
    handleExcluir,
  };
}
