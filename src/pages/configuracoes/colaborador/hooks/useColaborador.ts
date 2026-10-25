import { useParams } from 'react-router-dom';
import { usePersonHistoryQuery, usePersonQuery } from '../../../../domain/person/person.queries';
import { usePersonOccupanciesQuery } from '../../../../domain/occupancy/occupancy.queries';
import { useCheckinStock } from '../../../../domain/stock/stock.queries';

// Estado de TELA da ficha do colaborador. O dado vem das queries de domínio.
//
// TRÊS consultas, e nenhuma delas é redundante:
//
//   `usePersonQuery`            quem é a pessoa, o estoque e as licenças no nome dela;
//   `usePersonOccupanciesQuery` os POSTOS que ela ocupa, com o turno;
//   `usePersonHistoryQuery`     o que JÁ aconteceu — as duas primeiras são o
//                               estado de hoje, esta é a linha do tempo.
//
// A última parece contida nas outras e é o oposto delas: as abertas mostram o
// que ESTÁ, o histórico mostra o que FOI. Um ativo devolvido mês passado não
// aparece em nenhuma das duas — e é ele que responde "a Laura já teve um
// notebook?".

export function useColaborador() {
  // O id vem da URL, não de quem navegou até aqui: a ficha aberta direto,
  // colada de um chamado ou recarregada com F5 tem que funcionar igual.
  const { id = null } = useParams<{ id: string }>();

  const { data: pessoa, isPending: carregandoPessoa, error } = usePersonQuery(id);
  const { data: ocupacoes } = usePersonOccupanciesQuery(id);
  const { data: historico, isPending: carregandoHistorico } = usePersonHistoryQuery(id);

  // A DEVOLUÇÃO DO ITEM DE ESTOQUE, da ficha da pessoa — a mesma operação que
  // a tela de Estoque e a ficha do posto já oferecem, pelo id do MOVIMENTO
  // (a unidade), não do item (`checkin-stock.usecase.ts`). A rejeição sobe
  // para quem chama mostrar a mensagem do servidor — o 409 de unidade já
  // devolvida, duas abas na mesma ficha.
  const devolverItem = useCheckinStock();
  const handleDevolverItem = (movementId: string) => devolverItem.mutateAsync({ movementId });

  return {
    pessoa,
    // Só as ABERTAS: é o que a rota da pessoa devolve.
    ocupacoes: ocupacoes ?? [],
    // `total` vem separado das linhas de propósito: ele conta o universo, e as
    // linhas vêm cortadas no teto — é o que deixa a tela dizer "100 de 340" em
    // vez de mentir que são 100.
    historico: historico?.rows ?? [],
    totalDoHistorico: historico?.total ?? 0,
    carregandoHistorico,
    carregando: carregandoPessoa,
    erro: error ? (error as Error).message : null,

    handleDevolverItem,
    devolvendoItem: devolverItem.isPending,
  };
}
