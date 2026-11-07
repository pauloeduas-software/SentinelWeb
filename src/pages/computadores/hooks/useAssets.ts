import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAssetStatsQuery, useAssetsQuery, useCreateAsset, useDeleteAsset,
  useRestoreAsset, useRetireAsset, useUpdateAsset, type AssetInput,
} from '../../../queries/asset.queries';
import { useCheckoutAsset, type CheckoutInput } from '../../../queries/assignment.queries';
import { useCatalogOptionsQuery } from '../../../queries/catalog.queries';
import type { Asset, AssetView, RetireInput } from '../../../types/asset.types';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { linksDoErro } from '../../../helpers/erro.helper';
import type { TipoDeStatus } from '../../../helpers/status.helper';
import { contagensDosBaixados, contagensDosComputadores, tipoDaUrl } from '../helpers/contagens.helper';
import { useReverterBaixa } from './useReverterBaixa';

const VISTAS: readonly AssetView[] = ['active', 'retired', 'trashed'];

// Estado da tela de ativos: página, busca, vista e filtros, na URL (`useListaNaUrl`),
// e o modal, aqui.

export function useAssets() {
  const notificar = useNotificacao();
  const navigate = useNavigate();

  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar, trocar } = lista;
  const view = VISTAS.find((vista) => vista === parametros.get('vista')) ?? 'active';
  // Cada vista lê o filtro dos cartões dela: o que sobrar na URL não recorta a lista às escondidas.
  const statusType = view === 'retired' ? undefined : tipoDaUrl(parametros.get('status'));
  const retiredReasonId = view === 'retired' ? parametros.get('motivo') ?? undefined : undefined;
  const categoryId = parametros.get('categoria') ?? undefined;

  const params = useMemo(
    () => ({ page, perPage, q: debouncedSearch || undefined, view, statusType, retiredReasonId, categoryId }),
    [page, perPage, debouncedSearch, view, statusType, retiredReasonId, categoryId],
  );

  const { data, isPending, error } = useAssetsQuery(params);
  const { data: stats } = useAssetStatsQuery();
  const criar = useCreateAsset();
  const editar = useUpdateAsset();
  const excluir = useDeleteAsset();
  const restaurar = useRestoreAsset();
  const entregar = useCheckoutAsset();
  const darBaixa = useRetireAsset();
  const handleReverterSaida = useReverterBaixa();

  const assets = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  usePaginaQueExiste(page, data?.total, setPage);

  // O STATUS COM QUE UM ATIVO NOVO NASCE: o primeiro do TIPO `DEPLOYABLE` — o
  // tipo que a tela de Configurações rotula "Disponível" —, e não o primeiro da
  // lista alfabética, que pode ser de qualquer tipo.
  // Só `DEPLOYABLE` pode ser entregue, e o ativo recém-cadastrado está no
  // estoque, pronto. Pelo TIPO e não pelo nome: nome é cadastro de texto livre,
  // e é a mesma regra que o servidor aplica na devolução
  // (`escolherStatusPorTipo`: o primeiro do tipo, por nome).
  const { data: disponiveis } = useCatalogOptionsQuery('status-labels', 'DEPLOYABLE');
  const statusPadraoId = disponiveis?.[0]?.id ?? '';

  // O status conta a vista Ativos e o motivo, a Baixados: fora delas, o filtro não
  // teria o que mostrar.
  const changeView = (proxima: AssetView) => trocar({
    vista: proxima === 'active' ? undefined : proxima, status: undefined, motivo: undefined, pagina: undefined,
  });
  const changeCategoria = (id: string | undefined) => filtrar('categoria', id);

  /**
   * Clicar no contador filtra por aquele tipo de status; clicar de novo limpa, e o Total
   * (`undefined`) também. Volta para a vista Ativos, que é a que ele conta.
   */
  const escolherStatus = (tipo: TipoDeStatus | undefined) => trocar({
    vista: undefined, status: tipo === statusType ? undefined : tipo, pagina: undefined,
  });

  /** O cartão da vista Baixados filtra por motivo, e continua nela (BV). */
  const escolherMotivo = (id: string | undefined) => trocar({
    motivo: id === retiredReasonId ? undefined : id, pagina: undefined,
  });

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

  // O ativo que está recebendo baixa: o mesmo formulário da ficha.
  const [emBaixa, setEmBaixa] = useState<Asset | null>(null);
  const openBaixa = (asset: Asset) => setEmBaixa(asset);
  const closeBaixa = () => setEmBaixa(null);

  /** A linha inteira abre a tela do ativo — a URL que se cola no chamado. */
  const abrirDetalhe = (asset: Asset) => navigate(`/computadores/${asset.id}`, comFiltros(parametros));

  // Como no handleSubmit: o erro SOBE para o modal mostrar a mensagem do
  // servidor — é aqui que aparecem o duplo checkout e o ativo indisponível.
  const handleEntregar = async (dados: CheckoutInput) => {
    if (!emPosse) return;
    await entregar.mutateAsync({ id: emPosse.id, data: dados });
    closePosse();
    notificar.sucesso('Ativo entregue.');
  };

  // O erro sobe para o formulário: é lá que aparece o ativo entregue, que não sai do patrimônio.
  const handleDarBaixa = async (dados: RetireInput) => {
    if (!emBaixa) return;
    await darBaixa.mutateAsync({ id: emBaixa.id, data: dados });
    closeBaixa();
    notificar.sucesso('Baixa registrada.');
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor.
  const handleSubmit = async (valores: AssetInput) => {
    const editando = emEdicao && !clonando;
    if (editando) await editar.mutateAsync({ id: emEdicao.id, data: valores });
    else await criar.mutateAsync(valores);
    closeModal();
    notificar.sucesso(editando ? 'Ativo salvo.' : 'Ativo cadastrado.');
  };

  const handleDelete = async (asset: Asset) => {
    if (!(await confirmar({
      titulo: `Excluir "${asset.assetTag}"?`,
      descricao: 'Se não estiver em uso, vai para a lixeira e pode ser restaurado.',
      acao: 'Excluir',
      perigo: true,
    }))) return;
    try {
      await excluir.mutateAsync(asset.id);
      if (assets.length === 1 && page > 1) setPage(page - 1);
      notificar.sucesso(`"${asset.assetTag}" foi para a lixeira.`);
    } catch (erro) {
      // O 409 do ativo com licença ou componente traz cada um em link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  const handleRestore = async (asset: Asset) => {
    try {
      await restaurar.mutateAsync(asset.id);
      if (assets.length === 1 && page > 1) setPage(page - 1);
      notificar.sucesso('Ativo restaurado.');
    } catch (erro) {
      // É aqui que aparece o 409 de etiqueta reaproveitada enquanto o ativo
      // estava na lixeira — o índice único é parcial, só entre os vivos.
      notificar.erro((erro as Error).message);
    }
  };

  return {
    assets,
    total,
    // O contador vem do /stats: com paginação, o tamanho da página não é o tamanho
    // do inventário.
    contagens: contagensDosComputadores(stats),
    contagensDosMotivos: contagensDosBaixados(stats),
    baixados: stats?.retired,
    page,
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    changeSearch,
    view,
    changeView,
    statusType,
    escolherStatus,
    retiredReasonId,
    escolherMotivo,
    categoryId,
    changeCategoria,
    loading: isPending,
    // Sem isto, servidor fora do ar virava "Nenhum ativo cadastrado" com a dica
    // de cadastrar o primeiro (`EstadoDaLista`).
    erro: error ? error.message : null,
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
    emBaixa,
    openBaixa,
    closeBaixa,
    handleDarBaixa,
    handleReverterSaida,
  };
}
