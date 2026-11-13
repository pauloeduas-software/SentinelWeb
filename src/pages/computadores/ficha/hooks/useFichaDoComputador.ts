import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssetHistoryQuery, useAssetQuery, useCreateAsset, useDeleteAsset,
  useRestoreAsset, useRetireAsset, useUpdateAsset, type AssetInput,
} from '../../../../queries/asset.queries';
import {
  useCheckinAsset, useCheckoutAsset, type CheckinInput, type CheckoutInput,
} from '../../../../queries/assignment.queries';
import { useCatalogOptionsQuery } from '../../../../queries/catalog.queries';
import { useAssetLicensesQuery } from '../../../../queries/license.queries';
import { POR_PAGINA } from '../../../../hooks/useListaNaUrl';
import { useAssetComponentsQuery } from '../../../../queries/stock.queries';
import { useMaquinaDoAtivoQuery } from '../../../../queries/reconciliation.queries';
import type { RetireInput } from '../../../../types/asset.types';
import { IDS_DAS_ABAS, type AbaId } from '../helpers/abas.helper';
import { useAbaNaUrl } from '../../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA } from '../../../../hooks/useBuscaDaFicha';
import { confirmar } from '../../../../hooks/useConfirmacao';
import { useBuscaLocalDaFicha } from '../../../../hooks/usePaginaLocal';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { erroDaFicha, linksDoErro } from '../../../../helpers/erro.helper';
import { caminhoDaPosse, textoDaPosse } from '../../helpers/posse.helper';
import { useReverterBaixa } from '../../hooks/useReverterBaixa';

// Estado da TELA DE DETALHE. Aba, modais e o ativo em edição são de uma tela
// só: ficam aqui, em `useState`, e não em store (docs/referencia/arquitetura.md).
//
// Quem busca dado é a query do domínio; este hook só decide o que a tela faz
// com ela. Nenhum componente da pasta fala HTTP.

/** Qual modal está aberto. UM de cada vez, por construção: são cinco portas para o mesmo ativo. */
type ModalAberto = 'nenhum' | 'editar' | 'clonar' | 'entregar' | 'devolver' | 'baixa';

export function useFichaDoComputador() {
  const notificar = useNotificacao();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [aba, setAba] = useAbaNaUrl<AbaId>(IDS_DAS_ABAS, BUSCA_DA_FICHA);
  const voltar = useVoltaComFiltros('/computadores');
  const [modal, setModal] = useState<ModalAberto>('nenhum');

  const { data: asset, isPending, error } = useAssetQuery(id);

  // A aba Responsáveis, com a busca da de Estoque e Licenças. A posse chega com o
  // ativo: a lista tem uma linha só, ou nenhuma, e se filtra aqui.
  const responsaveis = useBuscaLocalDaFicha(asset?.posse?.assignmentId ? [asset.posse] : [], textoDaPosse);
  const caminhoDoResponsavel = asset ? caminhoDaPosse(asset) : null;

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const {
    data: historico, isPending: historicoPendente, error: erroDoHistorico,
  } = useAssetHistoryQuery(id, { page: paginaDoHistorico, limit: POR_PAGINA });

  // O STATUS DO CLONE: o mesmo "primeiro `DEPLOYABLE`" que a listagem usa para
  // o cadastro novo (`useAssets.ts`). Clonar daqui é criar — e sem isto o clone
  // de um ativo entregue copiaria o "Em uso" e nasceria em uso sem posse.
  const { data: disponiveis } = useCatalogOptionsQuery('status-labels', 'DEPLOYABLE');
  const statusPadraoId = disponiveis?.[0]?.id ?? '';

  const criar = useCreateAsset();
  const editar = useUpdateAsset();
  const excluir = useDeleteAsset();
  const darBaixa = useRetireAsset();
  const reverterBaixa = useReverterBaixa();
  const restaurar = useRestoreAsset();
  const entregar = useCheckoutAsset();
  const devolver = useCheckinAsset();

  // A aba Licenças: o que está entregue a esta máquina. A devolução mora na
  // tela de Licenças, e a aba aponta para lá.
  const {
    data: licencas, isPending: licencasPendentes, error: erroDasLicencas,
  } = useAssetLicensesQuery(id ?? null);

  // A aba Componentes (AI): a memória e o SSD instalados nesta máquina. O
  // Retirar mora na ficha do item, e a aba aponta para lá.
  const {
    data: componentes, isPending: componentesPendentes, error: erroDosComponentes,
  } = useAssetComponentsQuery(id ?? null);

  // A MÁQUINA: qual está vinculada. O resto quem lê é o painel da aba, e o vínculo
  // mora em Descobertas (BZ).
  const { data: maquina, isPending: maquinaPendente, error: erroDaMaquina } = useMaquinaDoAtivoQuery(id ?? null);

  const fecharModal = () => setModal('nenhum');

  /**
   * Salvar o formulário: EDITA o ativo aberto ou CRIA um novo, conforme a porta
   * pela qual o modal foi aberto.
   *
   * Clonar leva à tela do ativo NOVO. Ficar no antigo depois de clonar seria a
   * tela mentindo sobre o que acabou de acontecer — e o clone nasce sem
   * etiqueta e sem série, que são justamente os campos a preencher em seguida.
   */
  const handleSubmit = async (valores: AssetInput) => {
    if (modal === 'clonar') {
      const novo = await criar.mutateAsync(valores);
      fecharModal();
      navigate(`/computadores/${novo.id}`);
      notificar.sucesso('Computador cadastrado.');
      return;
    }

    if (!asset) return;
    await editar.mutateAsync({ id: asset.id, data: valores });
    fecharModal();
    notificar.sucesso('Computador salvo.');
  };

  // O erro SOBE para o modal mostrar a mensagem do servidor: é aqui que aparece
  // o 409 do duplo checkout e o do ativo indisponível.
  const handleEntregar = async (dados: CheckoutInput) => {
    if (!asset) return;
    await entregar.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Computador entregue.');
  };

  const handleDevolver = async (dados: CheckinInput) => {
    if (!asset) return;
    await devolver.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Computador devolvido.');
  };

  const handleDarBaixa = async (dados: RetireInput) => {
    if (!asset) return;
    await darBaixa.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Baixa registrada.');
  };

  const handleReverterSaida = async () => {
    if (asset) await reverterBaixa(asset);
  };

  /**
   * Mandar para a lixeira volta para a LISTAGEM: a ficha de lá é só consulta
   * (BW), e quem excluiu terminou o que vinha fazer.
   */
  // Restaurar fica na ficha: é o que devolve as ações, e ela continua aberta.
  const handleRestaurar = async () => {
    if (!asset) return;
    try {
      await restaurar.mutateAsync(asset.id);
      notificar.sucesso('Computador restaurado.');
    } catch (falha) {
      // É aqui que aparece o 409 de etiqueta reaproveitada, como na lista.
      notificar.erro((falha as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!asset) return;
    if (!(await confirmar({
      titulo: `Excluir "${asset.assetTag}"?`,
      descricao: 'Se não estiver em uso, vai para a lixeira e pode ser restaurado.',
      acao: 'Excluir',
      perigo: true,
    }))) return;

    try {
      await excluir.mutateAsync(asset.id);
      navigate('/computadores');
      notificar.sucesso(`"${asset.assetTag}" foi para a lixeira.`);
    } catch (falha) {
      // O 409 do ativo com licença, componente ou máquina traz cada um em link.
      notificar.erro((falha as Error).message, linksDoErro(falha));
    }
  };

  return {
    voltar,
    asset,
    carregando: isPending,
    // A busca engole o erro na listagem, mas aqui ele é a tela inteira: um
    // 404 de URL colada precisa dizer que o ativo não existe, não ficar
    // carregando para sempre.
    erro: erroDaFicha(error, asset != null, 'o computador'),

    aba,
    setAba,
    responsaveis,
    // A linha do responsável abre a ficha dele, o posto ou o colaborador (CJ).
    caminhoDoResponsavel,
    // Sem resposta, sem número: `undefined`, e a aba fica sem contagem.
    contagens: {
      // Quem responde hoje, como em Estoque e Licenças: o posto conta um, tenha quantos ocupantes tiver.
      responsaveis: asset && (asset.posse?.assignmentId != null ? 1 : 0),
      licencas: licencas?.length,
      componentes: componentes?.length,
      historico: historico?.total,
    },

    eventos: historico?.rows ?? [],
    totalDeEventos: historico?.total ?? 0,
    paginaDoHistorico,
    setPaginaDoHistorico,
    historicoPendente,
    erroDoHistorico: erroDoHistorico?.message ?? null,

    // LICENÇAS — o que está licenciado neste ativo.
    licencas: licencas ?? [],
    licencasPendentes,
    erroDasLicencas: erroDasLicencas ? (erroDasLicencas as Error).message : null,

    // COMPONENTES — o que está instalado neste ativo (AI).
    componentes: componentes ?? [],
    componentesPendentes,
    erroDosComponentes: erroDosComponentes ? (erroDosComponentes as Error).message : null,

    // MÁQUINA — a aba que nasceu pronta.
    maquina,
    maquinaPendente,
    erroDaMaquina: erroDaMaquina?.message ?? null,

    modal,
    statusPadraoId,
    abrirEdicao: () => setModal('editar'),
    abrirClone: () => setModal('clonar'),
    abrirEntrega: () => setModal('entregar'),
    abrirDevolucao: () => setModal('devolver'),
    abrirBaixa: () => setModal('baixa'),
    fecharModal,

    handleSubmit,
    handleEntregar,
    handleDevolver,
    handleDarBaixa,
    handleReverterSaida,
    handleDelete,
    handleRestaurar,
  };
}
