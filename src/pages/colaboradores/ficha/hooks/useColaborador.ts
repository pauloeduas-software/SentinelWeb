import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { POR_PAGINA } from '../../../../hooks/useListaNaUrl';
import { usePersonHistoryQuery, usePersonQuery } from '../../../../queries/person.queries';
import { usePersonOccupanciesQuery } from '../../../../queries/occupancy.queries';

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
  const {
    data: ocupacoes, isPending: carregandoOcupacoes, error: erroDasOcupacoes,
  } = usePersonOccupanciesQuery(id);
  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const {
    data: historico, isPending: carregandoHistorico, error: erroDoHistorico,
  } = usePersonHistoryQuery(id, { page: paginaDoHistorico, limit: POR_PAGINA });

  return {
    pessoa,
    // Só as ABERTAS: é o que a rota da pessoa devolve.
    ocupacoes: ocupacoes ?? [],
    totalDeOcupacoes: ocupacoes?.length,
    carregandoOcupacoes,
    erroDasOcupacoes: erroDasOcupacoes?.message ?? null,
    // `total` conta tudo, e as linhas são só a página.
    historico: historico?.rows ?? [],
    paginaDoHistorico,
    setPaginaDoHistorico,
    totalDoHistorico: historico?.total,
    carregandoHistorico,
    erroDoHistorico: erroDoHistorico?.message ?? null,
    carregando: carregandoPessoa,
    erro: error ? (error as Error).message : null,
  };
}
