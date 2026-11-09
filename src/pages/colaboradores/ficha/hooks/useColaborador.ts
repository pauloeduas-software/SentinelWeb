import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { colaborador } from '../../specs';
import { useAcoesDoCatalogo } from '../../../../components/catalogo/useAcoesDoCatalogo';
import { erroDaFicha } from '../../../../helpers/erro.helper';
import { POR_PAGINA } from '../../../../hooks/useListaNaUrl';
import { usePersonHistoryQuery, usePersonQuery, useRecarregarColaborador } from '../../../../queries/person.queries';
import { usePersonOccupanciesQuery } from '../../../../queries/occupancy.queries';
import type { CatalogRow } from '../../../../types/catalog.types';

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

  // AS AÇÕES DO CARD (CD) são as da linha da lista, com as mesmas perguntas e frases:
  // a ficha passa a pessoa como a linha do catálogo, e relê depois de gravar.
  const recarregar = useRecarregarColaborador();
  const acoes = useAcoesDoCatalogo(colaborador, recarregar);
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const registro: CatalogRow | null = pessoa ? {
    id: pessoa.id,
    name: pessoa.name,
    email: pessoa.email,
    notes: pessoa.notes,
    isActive: pessoa.isActive,
    updatedAt: pessoa.updatedAt,
  } : null;

  return {
    pessoa,
    registro,
    editando,
    abrirEdicao: () => setEditando(true),
    fecharEdicao: () => setEditando(false),
    handleSalvar: (valores: Record<string, unknown>) => acoes.salvar(registro, valores, () => setEditando(false)),
    handleAlternarAtivo: () => { if (registro) void acoes.alternar(registro, 'isActive'); },
    // Excluído, ele vai para a lixeira, e a ficha volta para a lista, como a do computador.
    handleExcluir: async () => {
      if (registro && await acoes.excluir(registro)) navigate('/colaboradores');
    },
    // Restaurar fica na ficha aberta da Lixeira (CF): ela continua aberta, com as ações de volta.
    handleRestaurar: () => { if (registro) void acoes.restaurar(registro); },
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
    erro: erroDaFicha(error, pessoa != null, 'o colaborador'),
  };
}
