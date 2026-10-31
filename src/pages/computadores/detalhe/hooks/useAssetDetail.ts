import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssetHistoryQuery, useAssetQuery, useCreateAsset, useDeleteAsset,
  useRetireAsset, useUnretireAsset, useUpdateAsset, type AssetInput,
} from '../../../../queries/asset.queries';
import {
  useAssetAssignmentsQuery, useCheckinAsset, useCheckoutAsset,
  type CheckinInput, type CheckoutInput,
} from '../../../../queries/assignment.queries';
import { useCatalogOptionsQuery } from '../../../../queries/catalog.queries';
import { useAssetLicensesQuery } from '../../../../queries/license.queries';
import { useAssetComponentsQuery } from '../../../../queries/stock.queries';
import {
  useDesvincularMaquina, useMaquinaDoAtivoQuery,
} from '../../../../queries/reconciliation.queries';
import type { RetireInput } from '../../../../types/asset.types';
import type { AbaId } from '../helpers/abas.helper';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { linksDoErro } from '../../../../helpers/erro.helper';

// Estado da TELA DE DETALHE. Aba, modais e o ativo em edição são de uma tela
// só: ficam aqui, em `useState`, e não em store (docs/referencia/arquitetura.md).
//
// Quem busca dado é a query do domínio; este hook só decide o que a tela faz
// com ela. Nenhum componente da pasta fala HTTP.

/** Qual modal está aberto. UM de cada vez, por construção: são quatro portas para o mesmo ativo. */
type ModalAberto = 'nenhum' | 'editar' | 'clonar' | 'posse' | 'baixa';

export function useAssetDetail() {
  const notificar = useNotificacao();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [aba, setAba] = useState<AbaId>('detalhes');
  const [modal, setModal] = useState<ModalAberto>('nenhum');

  const { data: asset, isPending, error } = useAssetQuery(id);

  // A aba Posse lê o histórico de posse pela query do domínio de posse — a
  // mesma rota que a F4 escreve. Esta tela LÊ, não recalcula nada.
  const { data: historico, isPending: historicoPendente } = useAssetHistoryQuery(id);
  // A aba Posse lê o histórico de posse pela query do domínio de posse — a
  // mesma rota que a F4 escreve. Esta tela LÊ, não recalcula nada.
  const { data: assignments, isPending: possePendente } = useAssetAssignmentsQuery(id ?? null);

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
  // Retirar mora no detalhe do item, e a aba aponta para lá.
  const {
    data: componentes, isPending: componentesPendentes, error: erroDosComponentes,
  } = useAssetComponentsQuery(id ?? null);

  // A MÁQUINA (F7): especificações coletadas, último contato e as trocas de peça
  // que o agente percebeu — tudo do endpoint vinculado. E desvincular, que é a
  // correção de um vínculo errado — o pior resultado possível daquela fase, e
  // não pode depender de mexer no banco à mão.
  const { data: maquina, isPending: maquinaPendente } = useMaquinaDoAtivoQuery(id ?? null);
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
      return;
    }

    if (!asset) return;
    await editar.mutateAsync({ id: asset.id, data: valores });
    fecharModal();
  };

  // O erro SOBE para o modal mostrar a mensagem do servidor: é aqui que aparece
  // o 409 do duplo checkout e o do ativo indisponível.
  const handleEntregar = async (dados: CheckoutInput) => {
    if (!asset) return;
    await entregar.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
  };

  const handleDevolver = async (dados: CheckinInput) => {
    if (!asset) return;
    await devolver.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
  };

  const handleDarBaixa = async (dados: RetireInput) => {
    if (!asset) return;
    await darBaixa.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
  };

  // Reverter apaga a data, o motivo e a observação da saída num clique só, e o
  // botão fica ao lado do selo, onde se clica por engano — por isso o `confirm`,
  // como na lixeira. O que se perde é o registro no ativo; a auditoria, no
  // banco, guarda a baixa e a reversão (AB).
  const handleReverterSaida = async () => {
    if (!asset) return;
    if (!confirm(
      `Reverter a baixa de ${asset.assetTag}? A data, o motivo e a observação da saída são apagados.`,
    )) return;
    try {
      await reverterSaida.mutateAsync(asset.id);
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
    if (!confirm(`Excluir "${asset.assetTag}"? Vai para a lixeira e pode ser restaurado.`)) return;

    try {
      await excluir.mutateAsync(asset.id);
      navigate('/computadores');
    } catch (falha) {
      // O 409 do ativo com licença ou componente traz cada um em link.
      notificar.erro((falha as Error).message, linksDoErro(falha));
    }
  };

  return {
    asset,
    carregando: isPending,
    // A busca engole o erro na listagem, mas aqui ele é a tela inteira: um
    // 404 de URL colada precisa dizer que o ativo não existe, não ficar
    // carregando para sempre.
    erro: error ? (error as Error).message : null,

    aba,
    setAba,

    eventos: historico?.rows ?? [],
    totalDeEventos: historico?.total ?? 0,
    historicoPendente,

    assignments: assignments ?? [],
    possePendente,

    // LICENÇAS — o que está licenciado neste ativo.
    licencas: licencas ?? [],
    licencasPendentes,
    erroDasLicencas: erroDasLicencas ? (erroDasLicencas as Error).message : null,

    // COMPONENTES — o que está instalado neste ativo (AI).
    componentes: componentes ?? [],
    componentesPendentes,
    erroDosComponentes: erroDosComponentes ? (erroDosComponentes as Error).message : null,

    // MÁQUINA — a aba que nasceu pronta na F7.
    maquina,
    maquinaPendente,
    desvinculando: desvincular.isPending,
    handleDesvincular: () => {
      if (!maquina?.endpointId) return;
      // A recusa do servidor (vínculo já desfeito, máquina sumiu) vai para a
      // notificação, como nas outras ações da ficha — sem ela o clique falhava
      // em silêncio.
      desvincular.mutate(maquina.endpointId, {
        onError: (falha) => notificar.erro((falha as Error).message),
      });
    },

    modal,
    statusPadraoId,
    abrirEdicao: () => setModal('editar'),
    abrirClone: () => setModal('clonar'),
    abrirPosse: () => setModal('posse'),
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
