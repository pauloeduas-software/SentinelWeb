import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAssetStatsQuery, useAssetsQuery, useCreateAsset, useDeleteAsset,
  useRestoreAsset, useUpdateAsset, type AssetInput,
} from '../../../domain/asset/asset.queries';
import {
  useCheckinAsset, useCheckoutAsset,
  type CheckinInput, type CheckoutInput,
} from '../../../domain/assignment/assignment.queries';
import { useCatalogOptionsQuery } from '../../../domain/catalog/catalog.queries';
import type { Asset, AssetView } from '../../../domain/shared/asset.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 10;

// Estado da tela de ativos. Página, busca, vista, filtros, seleção e modal são
// de UMA tela: ficam aqui, em useState, e não em store (docs/referencia/arquitetura.md).

export function useAssets() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [view, setView] = useState<AssetView>('active');
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | undefined>();
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o filtro, e não num `useEffect`
  // reagindo a ele: filtrar com o usuário na página 5 deixaria a tela vazia.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: debouncedSearch || undefined, view, statusId }),
    [page, debouncedSearch, view, statusId],
  );

  const { data, isPending } = useAssetsQuery(params);
  const { data: stats } = useAssetStatsQuery();
  const criar = useCreateAsset();
  const editar = useUpdateAsset();
  const excluir = useDeleteAsset();
  const restaurar = useRestoreAsset();
  const entregar = useCheckoutAsset();
  const devolver = useCheckinAsset();

  const assets = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;

  // O STATUS COM QUE UM ATIVO NOVO NASCE: o primeiro do TIPO `DEPLOYABLE` — o
  // tipo que a tela de Configurações rotula "Disponível" e que o seed chama de
  // "Pronto p/ Uso" —, e não o primeiro da lista alfabética ("Aguardando").
  // Só `DEPLOYABLE` pode ser entregue, e o ativo recém-cadastrado está no
  // estoque, pronto. Pelo TIPO e não pelo nome: nome é cadastro de texto livre,
  // e é a mesma regra que o servidor aplica na devolução sem preferência
  // configurada (`escolherStatusPorTipo`: o primeiro do tipo, por nome).
  const { data: disponiveis } = useCatalogOptionsQuery('status-labels', 'DEPLOYABLE');
  const statusPadraoId = disponiveis?.[0]?.id ?? '';

  const trocarFiltro = (aplicar: () => void) => {
    aplicar();
    setPage(1);
  };

  const changeView = (proxima: AssetView) => trocarFiltro(() => setView(proxima));

  /**
   * Clicar no contador do cabeçalho filtra por aquele status; clicar de novo
   * limpa. É o atalho que faltava — o número existia e não levava a lugar
   * nenhum, porque a API não aceitava filtro por status.
   */
  const toggleStatus = (id: string) =>
    trocarFiltro(() => setStatusId((atual) => (atual === id ? undefined : id)));

  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Asset | null>(null);
  /** Clonar reaproveita o formulário de edição, mas GRAVA UM NOVO ativo. */
  const [clonando, setClonando] = useState(false);

  // O ativo cuja POSSE está sendo mexida. Modal próprio, e não uma aba do
  // formulário, porque entregar não é editar: é uma operação, com regra e
  // histórico próprios (docs/referencia/modelo-de-posse.md).
  const [emPosse, setEmPosse] = useState<Asset | null>(null);

  const openCreate = () => {
    setEmEdicao(null);
    setClonando(false);
    setModalAberto(true);
  };

  const openEdit = (asset: Asset) => {
    setEmEdicao(asset);
    setClonando(false);
    setModalAberto(true);
  };

  const openClone = (asset: Asset) => {
    setEmEdicao(asset);
    setClonando(true);
    setModalAberto(true);
  };

  const closeModal = () => {
    setModalAberto(false);
    setEmEdicao(null);
    setClonando(false);
  };

  const openPosse = (asset: Asset) => setEmPosse(asset);
  const closePosse = () => setEmPosse(null);

  /** A linha inteira abre a tela do ativo — a URL que se cola no chamado. */
  const abrirDetalhe = (asset: Asset) => navigate(`/ativos/${asset.id}`);

  // Como no handleSubmit: o erro SOBE para o modal mostrar a mensagem do
  // servidor — é aqui que aparecem o duplo checkout e o ativo indisponível.
  const handleEntregar = async (dados: CheckoutInput) => {
    if (!emPosse) return;
    await entregar.mutateAsync({ id: emPosse.id, data: dados });
    closePosse();
  };

  const handleDevolver = async (dados: CheckinInput) => {
    if (!emPosse) return;
    await devolver.mutateAsync({ id: emPosse.id, data: dados });
    closePosse();
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor.
  const handleSubmit = async (valores: AssetInput) => {
    if (emEdicao && !clonando) await editar.mutateAsync({ id: emEdicao.id, data: valores });
    else await criar.mutateAsync(valores);
    closeModal();
  };

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Mover ${asset.assetTag} para a lixeira?`)) return;
    try {
      await excluir.mutateAsync(asset.id);
      if (assets.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      alert((erro as Error).message);
    }
  };

  const handleRestore = async (asset: Asset) => {
    try {
      await restaurar.mutateAsync(asset.id);
      if (assets.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // É aqui que aparece o 409 de etiqueta reaproveitada enquanto o ativo
      // estava na lixeira — o índice único é parcial, só entre os vivos.
      alert((erro as Error).message);
    }
  };

  // Cálculo fora do JSX: o nome do status filtrado sai da lista de contadores.
  const porStatus = stats?.byStatus ?? [];
  const statusFiltrado = porStatus.find((status) => status.id === statusId)?.name ?? null;

  return {
    assets,
    total,
    // O contador do cabeçalho vem do /stats: com paginação, o tamanho da página
    // não é o tamanho do inventário.
    totalCadastrado: stats?.total ?? total,
    porStatus,
    // As colunas que o cliente criou. Vazio é o caso NORMAL — a maioria das
    // instalações não tem campo marcado como coluna —, e a tabela segue
    // idêntica ao que era.
    descomissionados: stats?.retired ?? 0,
    arquivados: stats?.archived ?? 0,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,
    statusId,
    statusFiltrado,
    toggleStatus,
    limparStatus: () => trocarFiltro(() => setStatusId(undefined)),
    loading: isPending,
    modalAberto,
    emEdicao,
    clonando,
    statusPadraoId,
    openCreate,
    openEdit,
    openClone,
    closeModal,
    abrirDetalhe,
    handleSubmit,
    handleDelete,
    handleRestore,
    emPosse,
    openPosse,
    closePosse,
    handleEntregar,
    handleDevolver,
  };
}
