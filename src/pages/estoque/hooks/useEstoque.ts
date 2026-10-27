import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useCheckinStock, useCheckoutStock, useCreateStockItem, useDeleteStockItem, useStockItemQuery,
  useStockQuery, useUpdateStockItem,
} from '../../../domain/stock/stock.queries';
import type { AlvoDaEntregaDeEstoque, ItemDeEstoque, ItemDeEstoqueInput } from '../../../domain/shared/stock.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';
import { linksDoErro } from '../../helpers/erro.helper';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
type ModalDeEstoque = 'criar' | 'editar' | 'entregar' | 'detalhe' | null;

// Estado da tela de Estoque: página, busca, categoria e qual item está aberto.
// É o `useLicencas` com quantidade (AE), e o cadastro das Configurações
// (`useCatalog`): uma lista só, Desativar/Ativar e Excluir com as mesmas frases. Tudo de UMA tela — `useState`, não store
// (docs/referencia/arquitetura.md).
export function useEstoque() {
  const notificar = useNotificacao();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, e não num `useEffect`
  // reagindo a ele: `setState` dentro de efeito encadeia renders e o lint do
  // react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeCategoria = (id: string | undefined) => {
    setCategoryId(id);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: debouncedSearch || undefined, categoryId }),
    [page, debouncedSearch, categoryId],
  );

  const { data, isPending, error } = useStockQuery(params);
  const itens = data?.rows ?? [];

  // A página que deixou de existir volta para a última — a linha saiu da lista
  // ou do filtro por exclusão, aqui ou por outra pessoa. Ajuste
  // DURANTE o render, guardado pela condição, como no `useLicencas`.
  const ultimaPagina = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : page;
  if (page > ultimaPagina) setPage(ultimaPagina);

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
  const [parametros, setParametros] = useSearchParams();
  const idDoLink = parametros.get('item');
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
    if (idDoLink) {
      setParametros((atuais) => {
        atuais.delete('item');
        return atuais;
      }, { replace: true });
    }
  };

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por
  // aqui que aparecem o 422 de categoria do tipo errado, o 409 do nome
  // repetido e o de reduzir o total abaixo do que está em uso.
  const handleCriar = async (dados: ItemDeEstoqueInput) => {
    await criar.mutateAsync(dados);
    fechar();
  };

  // O formulário inteiro vai, como nas Configurações (AF).
  const handleEditar = async (dados: ItemDeEstoqueInput) => {
    if (!itemAberto) return;
    await editar.mutateAsync({ id: itemAberto.id, data: dados });
    fechar();
  };

  const handleEntregar = async (alvo: AlvoDaEntregaDeEstoque) => {
    if (!itemAberto) return;
    await entregar.mutateAsync({ itemId: itemAberto.id, alvo });
    fechar();
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
  // `isActive`, e confirma só na ida — ativar não tem o que perder. Desativa
  // mesmo com unidade fora: o que está com alguém continua até voltar, e a
  // linha fica na lista, esmaecida, com a conta à mostra.
  const handleAlternarAtivo = async (item: ItemDeEstoque) => {
    if (item.isActive && !window.confirm(
      `Desativar "${item.name}"? Continua no histórico, mas some das escolhas e não recebe nada novo.`,
    )) return;
    try {
      await editar.mutateAsync({ id: item.id, data: { isActive: !item.isActive } });
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  // EXCLUIR, com a frase de Configurações. O botão sempre clica: o item com
  // unidade em uso recebe o 409 do servidor, que diz com quem e manda devolver.
  const handleExcluir = async (item: ItemDeEstoque) => {
    if (!window.confirm(`Excluir "${item.name}"? Esta ação não tem lixeira.`)) return;
    try {
      await excluir.mutateAsync(item.id);
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
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    categoryId,
    changeCategoria,

    modal: modalAtual,
    itemAberto: itemAtual,
    // O link apontava para um item que não existe mais (excluído).
    erroDoLink: idDoLink && modal === null && doLink.error ? doLink.error.message : null,
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
