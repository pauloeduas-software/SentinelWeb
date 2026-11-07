import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateStockItem, useStockQuery, useStockStatsQuery } from '../../../queries/stock.queries';
import type { ItemDeEstoque, ItemDeEstoqueInput } from '../../../types/stock.types';
import { caminhoDoItem } from '../../../helpers/estoque.helper';
import { ativoDoStatus, contagensDoStatusAtivo, statusAtivoDaUrl, type StatusAtivo } from '../../../helpers/status.helper';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import { useAcoesDoItem } from './useAcoesDoItem';

// Estado da tela de Estoque: página, busca, categoria e status, na URL (`useListaNaUrl`). É o
// `useLicencas` com quantidade (AE). A linha abre a ficha, e as ações do `⋯` são as
// dela (`useAcoesDoItem`).
export function useEstoque() {
  const notificar = useNotificacao();
  const navigate = useNavigate();
  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = lista;
  const categoryId = parametros.get('categoria') ?? undefined;
  const status = statusAtivoDaUrl(parametros.get('status'));

  const params = useMemo(
    () => ({ page, perPage, q: debouncedSearch || undefined, categoryId, isActive: ativoDoStatus(status) }),
    [page, perPage, debouncedSearch, categoryId, status],
  );

  const { data, isPending, error } = useStockQuery(params);
  const { data: stats } = useStockStatsQuery();
  const itens = data?.rows ?? [];

  usePaginaQueExiste(page, data?.total, setPage);

  const criar = useCreateStockItem();
  const acoes = useAcoesDoItem();
  const [criando, setCriando] = useState(false);

  // O erro sobe para o formulário mostrar a mensagem do servidor: o 422 de categoria
  // do tipo errado e o 409 do nome repetido.
  const handleCriar = async (dados: ItemDeEstoqueInput) => {
    await criar.mutateAsync(dados);
    setCriando(false);
    notificar.sucesso('Item cadastrado.');
  };

  return {
    ...acoes,

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
    status,
    // Clicar liga o recorte, clicar de novo desliga, e o Total limpa.
    escolherStatus: (proximo: StatusAtivo | undefined) => filtrar('status', proximo === status ? undefined : proximo),
    contagens: contagensDoStatusAtivo(stats),

    abrirFicha: (item: ItemDeEstoque) => navigate(caminhoDoItem(item.id), comFiltros(parametros)),

    criando,
    abrirCriacao: () => setCriando(true),
    fecharCriacao: () => setCriando(false),
    handleCriar,
  };
}
