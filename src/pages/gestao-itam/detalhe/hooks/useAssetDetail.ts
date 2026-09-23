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
import {
  useAssetAttachmentsQuery, useClearImage, useDeleteAttachment, useSetImage, useUploadAttachment,
} from '../../../../domain/attachment/attachment.queries';
import {
  useAssetComponentsQuery, useDetachComponent,
} from '../../../../domain/stock/stock.queries';
import type { RetireInput } from '../../../../domain/shared/asset.types';
import type { AbaId } from '../helpers/abas.helper';

// Estado da TELA DE DETALHE. Aba, modais e o ativo em edição são de uma tela
// só: ficam aqui, em `useState`, e não em store (docs/ARQUITETURA.md).
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

  // COMPONENTES (F5) — "o que está dentro deste ativo". A consulta e a
  // retirada moram no domínio `stock`, que é quem conhece as tabelas: esta tela
  // só LÊ e manda retirar, como faz com a posse.
  const { data: componentes, isPending: componentesPendentes } = useAssetComponentsQuery(id ?? null);
  const retirarComponente = useDetachComponent();

  // ARQUIVO. Quatro mutações e uma consulta, todas do domínio `attachment`:
  // esta tela é a única que os usa hoje, mas o transporte fica lá porque
  // página não fala HTTP (docs/ARQUITETURA.md).
  const { data: anexos, isPending: anexosPendentes } = useAssetAttachmentsQuery(id);
  const anexar = useUploadAttachment();
  const excluirAnexo = useDeleteAttachment();
  const trocarImagem = useSetImage();
  const removerImagem = useClearImage();

  /**
   * Retirar uma peça — total ou PARCIAL.
   *
   * O `prompt` é feio e é deliberado: a retirada parcial é rara (o caso comum é
   * tirar tudo) e um modal próprio para ela seria uma janela a mais para
   * manter, usada uma vez a cada cem. Quando a operação ganhar volume, vira
   * modal — e o servidor não muda, porque a divisão da linha (D38) já está lá.
   */
  const handleRetirarComponente = async (instalacaoId: string, assignedQty: number) => {
    let qty: number | undefined;

    if (assignedQty > 1) {
      const resposta = window.prompt(
        `Retirar quantas das ${assignedQty} unidades? (o total é ${assignedQty})`,
        String(assignedQty),
      );
      if (resposta === null) return;

      const pedido = Number(resposta);
      if (!Number.isInteger(pedido) || pedido < 1 || pedido > assignedQty) return;

      // Retirada TOTAL manda o corpo vazio: `qty` igual ao total daria na mesma
      // no servidor, mas o corpo vazio é o que diz "tudo" sem depender de a
      // tela ter lido a quantidade certa.
      if (pedido !== assignedQty) qty = pedido;
    }

    // O `try/catch` é obrigatório aqui, e a falta dele era um bug — o mesmo que
    // o `useEstoque` documenta: esta ação não passa por formulário nenhum (o
    // clique é direto na linha da aba), então não há campo de erro para a
    // mensagem subir. Sem o `catch`, o 409 "Esta instalação já foi retirada" —
    // duas abas abertas na mesma peça — virava *unhandled rejection* no console
    // e a tela não fazia NADA. O operador clica de novo no mesmo botão.
    try {
      await retirarComponente.mutateAsync({ instalacaoId, ...(qty === undefined ? {} : { qty }) });
    } catch (falha) {
      alert((falha as Error).message);
    }
  };

  // O erro do upload SOBE para a aba, e não vira `alert`: o 422 do MIME e o 413
  // do tamanho são recusas que ensinam, e a mensagem vem do servidor.
  const erroDeArquivo =
    [anexar.error, excluirAnexo.error, trocarImagem.error, removerImagem.error]
      .find(Boolean) ?? null;

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
      navigate(`/itam/assets/${novo.id}`);
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
      navigate('/itam');
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
    componentes: componentes ?? [],
    componentesPendentes,
    handleRetirarComponente,

    // ARQUIVO — a aba Arquivos.
    anexos: anexos ?? [],
    anexosPendentes,
    enviandoArquivo:
      anexar.isPending || excluirAnexo.isPending || trocarImagem.isPending || removerImagem.isPending,
    erroDeArquivo: erroDeArquivo ? (erroDeArquivo as Error).message : null,
    // `imagePath` vem no `ASSET_SELECT` e a tela o usa SÓ como "tem foto ou
    // não": a URL que ela monta é por id (`/api/images/asset/:id`), nunca o
    // caminho no disco.
    temImagem: Boolean(asset?.imagePath),
    handleAnexar: (file: File) => { if (id) anexar.mutate({ assetId: id, file }); },
    handleExcluirAnexo: (anexoId: string) => { if (id) excluirAnexo.mutate({ id: anexoId, assetId: id }); },
    handleTrocarImagem: (file: File) => { if (id) trocarImagem.mutate({ alvo: 'asset', id, file }); },
    handleRemoverImagem: () => { if (id) removerImagem.mutate({ alvo: 'asset', id }); },

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
