import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssetHistoryQuery, useAssetQuery, useCreateAsset, useDeleteAsset,
  useRetireAsset, useUnretireAsset, useUpdateAsset, type AssetInput,
} from '../../../../queries/asset.queries';
import {
  useCheckinAsset, useCheckoutAsset, type CheckinInput, type CheckoutInput,
} from '../../../../queries/assignment.queries';
import { useCatalogOptionsQuery } from '../../../../queries/catalog.queries';
import { useAssetLicensesQuery } from '../../../../queries/license.queries';
import { POR_PAGINA } from '../../../../hooks/useListaNaUrl';
import { useAssetComponentsQuery } from '../../../../queries/stock.queries';
import {
  useDesvincularMaquina, useMaquinaDoAtivoQuery,
} from '../../../../queries/reconciliation.queries';
import type { RetireInput } from '../../../../types/asset.types';
import { IDS_DAS_ABAS, type AbaId } from '../helpers/abas.helper';
import { useAbaNaUrl } from '../../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA } from '../../../../hooks/useBuscaDaFicha';
import { confirmar } from '../../../../hooks/useConfirmacao';
import { useBuscaLocalDaFicha } from '../../../../hooks/usePaginaLocal';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { erroDaFicha, linksDoErro } from '../../../../helpers/erro.helper';
import { textoDaPosse } from '../../helpers/posse.helper';

// Estado da TELA DE DETALHE. Aba, modais e o ativo em edição são de uma tela
// só: ficam aqui, em `useState`, e não em store (docs/referencia/arquitetura.md).
//
// Quem busca dado é a query do domínio; este hook só decide o que a tela faz
// com ela. Nenhum componente da pasta fala HTTP.

/** Qual modal está aberto. UM de cada vez, por construção: são cinco portas para o mesmo ativo. */
type ModalAberto = 'nenhum' | 'editar' | 'clonar' | 'entregar' | 'devolver' | 'baixa';

export function useAssetDetail() {
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
  const reverterSaida = useUnretireAsset();
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

  // A MÁQUINA: especificações coletadas, último contato e as trocas de peça
  // que o agente percebeu — tudo do endpoint vinculado. E desvincular, que é a
  // correção de um vínculo errado — o pior resultado possível, e
  // não pode depender de mexer no banco à mão.
  const { data: maquina, isPending: maquinaPendente, error: erroDaMaquina } = useMaquinaDoAtivoQuery(id ?? null);
  const desvincular = useDesvincularMaquina();

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
      notificar.sucesso('Ativo cadastrado.');
      return;
    }

    if (!asset) return;
    await editar.mutateAsync({ id: asset.id, data: valores });
    fecharModal();
    notificar.sucesso('Ativo salvo.');
  };

  // O erro SOBE para o modal mostrar a mensagem do servidor: é aqui que aparece
  // o 409 do duplo checkout e o do ativo indisponível.
  const handleEntregar = async (dados: CheckoutInput) => {
    if (!asset) return;
    await entregar.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Ativo entregue.');
  };

  const handleDevolver = async (dados: CheckinInput) => {
    if (!asset) return;
    await devolver.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Ativo devolvido.');
  };

  const handleDarBaixa = async (dados: RetireInput) => {
    if (!asset) return;
    await darBaixa.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
    notificar.sucesso('Baixa registrada.');
  };

  // Reverter apaga a data, o motivo e a observação da saída num clique só, e o
  // botão fica ao lado do selo, onde se clica por engano — por isso a confirmação,
  // como na lixeira. O que se perde é o registro no ativo; a auditoria, no
  // banco, guarda a baixa e a reversão (AB).
  const handleReverterSaida = async () => {
    if (!asset) return;
    if (!(await confirmar({
      titulo: `Reverter a baixa de "${asset.assetTag}"?`,
      descricao: 'A data, o motivo e as notas da saída são apagados.',
      acao: 'Reverter',
      perigo: true,
    }))) return;
    try {
      await reverterSaida.mutateAsync(asset.id);
      notificar.sucesso('Baixa revertida.');
    } catch (falha) {
      notificar.erro((falha as Error).message);
    }
  };

  /**
   * Mandar para a lixeira volta para a LISTAGEM: a tela de detalhe responde 404
   * para ativo apagado, então continuar aqui deixaria a tela sem dado nenhum.
   */
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
      // O 409 do ativo com licença ou componente traz cada um em link.
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
    erro: erroDaFicha(error, asset != null, 'o ativo'),

    aba,
    setAba,
    responsaveis,
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
    desvinculando: desvincular.isPending,
    handleDesvincular: async () => {
      if (!maquina?.endpointId) return;
      if (!(await confirmar({
        titulo: `Desvincular esta máquina de "${asset?.assetTag}"?`,
        descricao: 'O ativo deixa de mostrar esta máquina, que volta para Descobertas e pode ser vinculada de novo.',
        acao: 'Desvincular',
      }))) return;
      // A recusa do servidor (vínculo já desfeito, máquina sumiu) vai para a
      // notificação, como nas outras ações da ficha — sem ela o clique falhava
      // em silêncio.
      try {
        await desvincular.mutateAsync(maquina.endpointId);
        notificar.sucesso('Máquina desvinculada.');
      } catch (falha) {
        notificar.erro((falha as Error).message);
      }
    },

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
  };
}
