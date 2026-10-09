import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAssetHistoryQuery, useAssetQuery, useCreateAsset, useDeleteAsset,
  useRetireAsset, useUnretireAsset, useUpdateAsset, type AssetInput,
} from '../../../../domain/asset/asset.queries';
import {
  useAssetAssignmentsQuery, useCheckinAsset, useCheckoutAsset,
  type CheckinInput, type CheckoutInput,
} from '../../../../domain/assignment/assignment.queries';
import { useAssetLicensesQuery } from '../../../../domain/license/license.queries';
import {
  useDesvincularMaquina, useMaquinaDoAtivoQuery,
} from '../../../../domain/reconciliation/reconciliation.queries';
import type { RetireInput } from '../../../../domain/shared/asset.types';
import type { AbaId } from '../helpers/abas.helper';

// Estado da TELA DE DETALHE. Aba, modais e o ativo em edição são de uma tela
// só: ficam aqui, em `useState`, e não em store (docs/referencia/arquitetura.md).
//
// Quem busca dado é a query do domínio; este hook só decide o que a tela faz
// com ela. Nenhum componente da pasta fala HTTP.

/** Qual modal está aberto. UM de cada vez, por construção: são quatro portas para o mesmo ativo. */
type ModalAberto = 'nenhum' | 'editar' | 'clonar' | 'posse' | 'descomissionar';

export function useAssetDetail() {
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

  const criar = useCreateAsset();
  const editar = useUpdateAsset();
  const excluir = useDeleteAsset();
  const descomissionar = useRetireAsset();
  const reverterSaida = useUnretireAsset();
  const entregar = useCheckoutAsset();
  const devolver = useCheckinAsset();

  // A aba Licenças (F6). Só leitura: devolver assento é operação da tela de
  // licenças, onde o aviso de queima tem os números para explicar.
  const { data: licencas, isPending: licencasPendentes } = useAssetLicensesQuery(id ?? null);

  // A MÁQUINA (F7): especificações coletadas, último contato, software instalado
  // e as trocas de peça que o agente percebeu — tudo do endpoint vinculado. E
  // desvincular, que é a correção de um vínculo errado — o pior resultado
  // possível daquela fase, e não pode depender de mexer no banco à mão.
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
      navigate(`/ativos/${novo.id}`);
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

  const handleDescomissionar = async (dados: RetireInput) => {
    if (!asset) return;
    await descomissionar.mutateAsync({ id: asset.id, data: dados });
    fecharModal();
  };

  const handleReverterSaida = async () => {
    if (!asset) return;
    try {
      await reverterSaida.mutateAsync(asset.id);
    } catch (falha) {
      alert((falha as Error).message);
    }
  };

  /**
   * Mandar para a lixeira volta para a LISTAGEM: a tela de detalhe responde 404
   * para ativo apagado, então continuar aqui deixaria a tela sem dado nenhum.
   */
  const handleDelete = async () => {
    if (!asset) return;
    if (!confirm(`Mover ${asset.assetTag} para a lixeira?`)) return;

    try {
      await excluir.mutateAsync(asset.id);
      navigate('/ativos');
    } catch (falha) {
      alert((falha as Error).message);
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

    // COMPONENTES — a aba que saiu de desabilitada na F5.
    licencas: licencas ?? [],
    licencasPendentes,

    // MÁQUINA — a aba que nasceu pronta na F7.
    maquina,
    maquinaPendente,
    desvinculando: desvincular.isPending,
    handleDesvincular: () => {
      if (!maquina?.endpointId) return;
      desvincular.mutate(maquina.endpointId);
    },

    modal,
    abrirEdicao: () => setModal('editar'),
    abrirClone: () => setModal('clonar'),
    abrirPosse: () => setModal('posse'),
    abrirDescomissionar: () => setModal('descomissionar'),
    fecharModal,

    handleSubmit,
    handleEntregar,
    handleDevolver,
    handleDescomissionar,
    handleReverterSaida,
    handleDelete,
  };
}
