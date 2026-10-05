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
import { useAssetLicensesQuery } from '../../../../domain/license/license.queries';
import {
  useAssetMaintenancesQuery, useCloseMaintenance, useCreateMaintenance,
} from '../../../../domain/maintenance/maintenance.queries';
import { useAssetAuditsQuery } from '../../../../domain/audit/audit.queries';
import {
  useConjuntoDoModeloQuery, useRevelarCampo,
} from '../../../../domain/custom-field/custom-field.queries';
import {
  useDesvincularMaquina, useMaquinaDoAtivoQuery,
} from '../../../../domain/reconciliation/reconciliation.queries';
import type { RetireInput } from '../../../../domain/shared/asset.types';
import type { ManutencaoInput } from '../../../../domain/shared/lifecycle.types';
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

  // ── OS CAMPOS CUSTOMIZADOS (F9) ─────────────────────────────────────────
  //
  // O conjunto vem do MODELO (D58) e é o que dá RÓTULO e ORDEM aos valores: a
  // resposta do ativo traz `{ slug: valor }`, e `ip_fixo` não é o que se mostra
  // numa ficha. Ele serve também ao formulário de edição, que monta os inputs.
  const { data: conjuntoDeCampos } = useConjuntoDoModeloQuery(asset?.modelId);

  const revelar = useRevelarCampo(id ?? '');

  // ── O VALOR REVELADO NÃO É CACHE, E ISSO É A DECISÃO ────────────────────
  //
  // Ele mora em `useState` desta tela e morre com ela: a rota que o devolve
  // GRAVA `ActivityLog` a cada chamada, porque *quem viu este segredo* é o fato
  // auditável (D62). Guardá-lo no cache do TanStack Query faria o valor
  // reaparecer ao voltar para a tela sem uma linha de auditoria correspondente —
  // e o histórico passaria a contar menos visualizações do que houve.
  //
  // O mesmo desenho da revelação da chave de produto da F6.
  const [camposRevelados, setCamposRevelados] = useState<Record<string, string>>({});
  const [erroAoRevelar, setErroAoRevelar] = useState('');

  const handleRevelarCampo = async (slug: string) => {
    setErroAoRevelar('');
    try {
      const { value } = await revelar.mutateAsync(slug);
      setCamposRevelados((atual) => ({ ...atual, [slug]: value }));
    } catch (falha) {
      // O erro APARECE, e não vira `alert`: aqui ele é informativo (chave de
      // criptografia trocada, valor adulterado) e a tela continua usável.
      setErroAoRevelar((falha as Error).message);
    }
  };
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
  // A aba Licenças (F6). Só leitura: devolver assento é operação da tela de
  // licenças, onde o aviso de queima tem os números para explicar.
  const { data: licencas, isPending: licencasPendentes } = useAssetLicensesQuery(id ?? null);

  // A MÁQUINA (F7): especificações coletadas, último contato, software instalado
  // e as trocas de peça que o agente percebeu — tudo do endpoint vinculado. E
  // desvincular, que é a correção de um vínculo errado — o pior resultado
  // possível daquela fase, e não pode depender de mexer no banco à mão.
  const { data: maquina, isPending: maquinaPendente } = useMaquinaDoAtivoQuery(id ?? null);

  // MANUTENÇÕES (F8) — a aba que a F2 deixou desabilitada dizendo "Fase 8". Abrir
  // e encerrar moram aqui porque é na tela do ativo que alguém está quando o
  // equipamento quebra; a tela global existe para a pergunta do parque inteiro.
  //
  // E as CONFERÊNCIAS, só leitura: registrar auditoria de um ativo isolado é a
  // rota `POST /api/assets/:id/audit`, mas o gesto real é conferir um POSTO (D54)
  // — e é lá que a tela de conferência vive.
  const { data: manutencoes, isPending: manutencoesPendentes } = useAssetMaintenancesQuery(id ?? null);
  const { data: auditorias, isPending: auditoriasPendentes } = useAssetAuditsQuery(id ?? null);
  const abrirManutencao = useCreateMaintenance();
  const encerrarManutencao = useCloseMaintenance();
  const desvincular = useDesvincularMaquina();
  const retirarComponente = useDetachComponent();

  // ARQUIVO. Quatro mutações e uma consulta, todas do domínio `attachment`:
  // esta tela é a única que os usa hoje, mas o transporte fica lá porque
  // página não fala HTTP (docs/referencia/arquitetura.md).
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
    componentes: componentes ?? [],
    componentesPendentes,
    licencas: licencas ?? [],
    licencasPendentes,

    // MANUTENÇÕES e CONFERÊNCIAS — as duas listas da aba que chegou na F8.
    manutencoes: manutencoes ?? [],
    manutencoesPendentes,
    auditorias: auditorias ?? [],
    auditoriasPendentes,
    handleAbrirManutencao: async (dados: ManutencaoInput) => {
      if (!id) return;
      await abrirManutencao.mutateAsync({ assetId: id, data: dados });
    },
    handleEncerrarManutencao: async (manutencaoId: string) => {
      // Sem janela aqui, e sem custo: encerrar da aba do ativo é o caso "acabou
      // agora" — o servidor usa hoje. Quem precisa lançar o valor final usa a tela
      // de Manutenções, que tem o formulário com custo e observações.
      try {
        await encerrarManutencao.mutateAsync({ id: manutencaoId, data: {} });
      } catch (erro) {
        alert((erro as Error).message);
      }
    },

    // MÁQUINA — a aba que nasceu pronta na F7.
    maquina,
    maquinaPendente,
    desvinculando: desvincular.isPending,
    handleDesvincular: () => {
      if (!maquina?.endpointId) return;
      desvincular.mutate(maquina.endpointId);
    },
    handleRetirarComponente,
    conjuntoDeCampos,
    camposRevelados,
    revelandoCampo: revelar.isPending ? revelar.variables ?? null : null,
    erroAoRevelar,
    handleRevelarCampo,

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
