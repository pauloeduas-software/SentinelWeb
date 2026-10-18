import { useParams } from 'react-router-dom';
import {
  useUserHistoryQuery,
  useUserQuery,
} from '../../../../domain/user/user.queries';
import { useUserOccupanciesQuery } from '../../../../domain/occupancy/occupancy.queries';
import { useCheckinStock } from '../../../../domain/stock/stock.queries';

// Estado de TELA do perfil do colaborador. O dado vem das queries de domínio.
//
// TRÊS consultas, e nenhuma delas é redundante:
//
//   `useUserQuery`            quem é a pessoa e o estoque no nome dela;
//   `useUserOccupanciesQuery` os POSTOS que ela ocupa, com o turno;
//   `useUserHistoryQuery`     o que JÁ aconteceu — as duas primeiras são o
//                             estado de hoje, esta é a linha do tempo.
//
// A última parece contida nas outras e é o oposto delas: as abertas mostram o
// que ESTÁ, o histórico mostra o que FOI. Um ativo devolvido mês passado não
// aparece em nenhuma das duas — e é ele que responde "a Laura já teve um
// notebook?".

export function useUserDetail() {
  // O id vem da URL, não de quem navegou até aqui: `/users/:id` aberto direto,
  // colado de um chamado ou recarregado com F5 tem que funcionar igual.
  const { id = null } = useParams<{ id: string }>();

  const { data: user, isPending: carregandoUsuario, error } = useUserQuery(id);
  const { data: ocupacoes } = useUserOccupanciesQuery(id);
  const { data: historico, isPending: carregandoHistorico } = useUserHistoryQuery(id);

  // A DEVOLUÇÃO DO ITEM DE ESTOQUE, da ficha da pessoa — a mesma operação que
  // a tela de Estoque e a ficha do posto já oferecem, pelo id do MOVIMENTO
  // (a unidade), não do item (`checkin-stock.usecase.ts`). A rejeição sobe
  // para quem chama mostrar a mensagem do servidor — o 409 de unidade já
  // devolvida, duas abas na mesma ficha.
  const devolverItem = useCheckinStock();
  const handleDevolverItem = (movementId: string) => devolverItem.mutateAsync({ movementId });

  return {
    user,
    // Só as ABERTAS: é o que a rota da pessoa devolve.
    ocupacoes: ocupacoes ?? [],
    // `total` vem separado das linhas de propósito: ele conta o universo, e as
    // linhas vêm cortadas no teto — é o que deixa a tela dizer "100 de 340" em
    // vez de mentir que são 100.
    historico: historico?.rows ?? [],
    totalDoHistorico: historico?.total ?? 0,
    carregandoHistorico,
    carregando: carregandoUsuario,
    erro: error ? (error as Error).message : null,

    handleDevolverItem,
    devolvendoItem: devolverItem.isPending,
  };
}
