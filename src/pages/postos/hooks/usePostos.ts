import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateWorkstation, useDeleteWorkstation, useUpdateWorkstation,
  useWorkstationStatsQuery, useWorkstationsQuery, type PostoInput,
} from '../../../queries/workstation.queries';
import type { Posto, PostoView } from '../../../types/workstation.types';
import { linksDoErro } from '../../../helpers/erro.helper';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { contagensDosPostos, recorteDaUrl } from '../helpers/postos.helper';

// Estado da lista de Postos: que recorte, que página e o que está na busca, na URL
// (`useListaNaUrl`). A ficha do posto é outra página, e a seta dela volta com eles.
export function usePostos() {
  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = lista;
  const view = recorteDaUrl(parametros.get('status'));

  // Clicar no cartão escolhido volta para `todos`, como em Computadores.
  const escolherView = (proxima: PostoView) => {
    filtrar('status', proxima === view || proxima === 'todos' ? undefined : proxima);
  };

  const params = useMemo(
    () => ({ page, perPage, view, q: debouncedSearch || undefined }),
    [page, perPage, view, debouncedSearch],
  );

  const { data, isPending, error } = useWorkstationsQuery(params);
  const { data: stats } = useWorkstationStatsQuery();
  const criar = useCreateWorkstation();
  const editar = useUpdateWorkstation();
  const excluir = useDeleteWorkstation();
  const notificar = useNotificacao();
  usePaginaQueExiste(page, data?.total, setPage);

  // O formulário serve às duas operações: `emEdicao` nulo é criar.
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Posto | null>(null);

  const navigate = useNavigate();

  const fecharFormulario = () => {
    setModalAberto(false);
    setEmEdicao(null);
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparece o 409 de nome repetido.
  const handleSalvar = async (dados: PostoInput) => {
    if (emEdicao) await editar.mutateAsync({ id: emEdicao.id, data: dados });
    else await criar.mutateAsync(dados);
    fecharFormulario();
    notificar.sucesso(emEdicao ? 'Posto salvo.' : 'Posto cadastrado.');
  };

  // EXCLUIR é o item do `⋯` da linha, com a frase de Configurações
  // (`components/catalogo/useCatalog.ts`). Sem Desativar (AN): o posto com algo
  // nele recebe o 409 do servidor, que diz o que tirar.
  const handleExcluir = async (posto: Posto) => {
    if (!(await confirmar({
      titulo: `Excluir "${posto.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;

    try {
      await excluir.mutateAsync(posto.id);
      notificar.sucesso('Posto excluído.');
    } catch (erro) {
      // É aqui que aparece o 409 do posto com algo nele agora — com um link
      // para o computador e cada item de estoque, onde mora o Devolver.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  return {
    postos: data?.rows ?? [],
    total: data?.total ?? 0,
    carregando: isPending,
    // Para a lista não dizer "nenhum posto cadastrado" quando a consulta falhou.
    erro: error ? error.message : null,
    page,
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    changeSearch,
    view,
    escolherView,
    contagens: contagensDosPostos(stats),

    modalAberto,
    emEdicao,
    openCreate: () => setModalAberto(true),
    openEdit: (posto: Posto) => {
      setEmEdicao(posto);
      setModalAberto(true);
    },
    closeModal: fecharFormulario,
    handleSalvar,
    handleExcluir,

    openDetalhe: (posto: Posto) => navigate(`/postos/${posto.id}`, comFiltros(parametros)),
  };
}
