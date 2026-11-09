import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCheckinStock, useStockCheckoutsQuery, useStockHistoryQuery, useStockItemQuery,
} from '../../../../queries/stock.queries';
import { erroDaFicha } from '../../../../helpers/erro.helper';
import { useAbaNaUrl } from '../../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA, useBuscaDaFicha } from '../../../../hooks/useBuscaDaFicha';
import { POR_PAGINA, usePaginaQueExiste } from '../../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { ehComponente, ehConsumivel } from '../../helpers/estoque.helper';
import { useAcoesDoItem } from '../../hooks/useAcoesDoItem';

// Estado da FICHA DO ITEM: as duas listas de 15 em 15, a aba e a devolução. A busca é
// a do `useBuscaDaFicha`, e o número da aba vem do item (`entregasAbertas`), que a busca
// não filtra.

const ABAS = ['responsaveis', 'historico'] as const;
// O consumível (AJ) não fica com ninguém: a entrega tira do total, e o histórico é o
// único lugar onde ela aparece.
const ABAS_DO_CONSUMIVEL = ['historico'] as const;

export function useFichaDoItem(id: string) {
  const notificar = useNotificacao();
  const navigate = useNavigate();
  const voltar = useVoltaComFiltros('/estoque');
  const acoes = useAcoesDoItem({ aoExcluir: () => navigate('/estoque') });
  const devolver = useCheckinStock();

  const { data: item, isPending, error } = useStockItemQuery(id);
  const consumivel = item ? ehConsumivel(item) : false;
  const [aba, setAba] = useAbaNaUrl<(typeof ABAS)[number]>(consumivel ? ABAS_DO_CONSUMIVEL : ABAS, BUSCA_DA_FICHA);

  const {
    pagina: paginaDasEntregas, setPagina: setPaginaDasEntregas, busca, buscaAdiada, mudarBusca,
  } = useBuscaDaFicha();
  const entregas = useStockCheckoutsQuery(item && !consumivel ? id : null, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useStockHistoryQuery(id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  // A entrega voltou inteira, aqui ou por outra pessoa: a lista não abre vazia dizendo
  // que ninguém está com o item.
  usePaginaQueExiste(paginaDasEntregas, entregas.data?.total, setPaginaDasEntregas);

  /**
   * A devolução de N unidades de uma entrega, no dia escolhido. Diz se deu certo,
   * para a linha fechar só então. O clique direto não tem campo de erro: a recusa
   * vai para a notificação.
   */
  const handleDevolver = async (entregaId: string, qty: number, checkinAt: string): Promise<boolean> => {
    try {
      await devolver.mutateAsync({ entregaId, qty, checkinAt });
      // No componente a devolução é o Retirar (AI), e a frase acompanha o botão.
      notificar.sucesso(item && ehComponente(item) ? 'Item retirado.' : 'Item devolvido.');
      return true;
    } catch (erro) {
      // O 409 da entrega já devolvida (duas abas abertas no mesmo item), o de
      // menos unidades do que se pediu, e o 422 da data — futura, ou antes da
      // entrega.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  return {
    ...acoes,
    item: item ?? null,
    carregando: isPending,
    erro: erroDaFicha(error, item != null, 'o item'),
    // A ficha fica, com o que já estava nela, e a tela diz que pode estar velha.
    erroDaAtualizacao: item && error ? error.message : null,
    voltar,
    aba,
    setAba,

    entregas,
    paginaDasEntregas,
    setPaginaDasEntregas,
    busca,
    buscaAdiada,
    mudarBusca,

    historico,
    paginaDoHistorico,
    setPaginaDoHistorico,

    // Enquanto uma ação corre, os botões dela ficam desabilitados.
    ocupado: acoes.ocupado || devolver.isPending,
    handleDevolver,
  };
}
