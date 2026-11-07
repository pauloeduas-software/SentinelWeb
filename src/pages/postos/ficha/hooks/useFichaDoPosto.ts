import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useDeleteWorkstation, useUpdateWorkstation, useWorkstationHistoryQuery, useWorkstationQuery, type PostoInput,
} from '../../../../queries/workstation.queries';
import { confirmar } from '../../../../hooks/useConfirmacao';
import { POR_PAGINA } from '../../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { useBuscaLocalDaFicha } from '../../../../hooks/usePaginaLocal';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { erroDaFicha, linksDoErro } from '../../../../helpers/erro.helper';
import { textoDoOcupante } from '../../helpers/ocupantes.helper';
import { useOcupantes } from '../../hooks/useOcupantes';

// Estado da FICHA DO POSTO: o formulário aberto e o caminho de volta.
// Quem busca dado é a query do domínio; nenhum componente da pasta fala HTTP.

export function useFichaDoPosto() {
  const notificar = useNotificacao();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voltar = useVoltaComFiltros('/postos');

  const [editando, setEditando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const { data: posto, isPending, error } = useWorkstationQuery(id ?? null);
  // Os ocupantes vêm de hook próprio, com as ações da aba Responsáveis.
  const ocupantes = useOcupantes(id ?? null);
  // A busca da aba, como em Estoque e Licenças. Os ocupantes chegam inteiros: filtra aqui.
  const responsaveis = useBuscaLocalDaFicha(ocupantes.ocupantes, textoDoOcupante);
  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const {
    data: historico, isPending: carregandoHistorico, error: erroDoHistorico,
  } = useWorkstationHistoryQuery(id ?? null, { page: paginaDoHistorico, limit: POR_PAGINA });
  const editar = useUpdateWorkstation();
  const excluir = useDeleteWorkstation();

  // O erro sobe para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparece o 409 de nome repetido e o da edição de outra pessoa (AF).
  const handleSalvar = async (dados: PostoInput) => {
    if (!id) return;
    await editar.mutateAsync({ id, data: dados });
    setEditando(false);
    notificar.sucesso('Posto salvo.');
  };

  // A mesma frase da linha da lista (`usePostos`). Sem Desativar (AN): o posto com
  // algo nele recebe o 409 do servidor, que diz o que tirar.
  const handleExcluir = async () => {
    if (!posto) return;
    if (!(await confirmar({
      titulo: `Excluir "${posto.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;

    try {
      await excluir.mutateAsync(posto.id);
      // Sem os filtros: o posto excluído podia ser o último da página guardada neles.
      navigate('/postos');
      notificar.sucesso('Posto excluído.');
    } catch (falha) {
      notificar.erro((falha as Error).message, linksDoErro(falha));
    }
  };

  return {
    posto: posto ?? null,
    carregando: isPending,
    // O 404 de `/postos/<id-que-não-existe>`. Sem isto a ficha abriria com zero
    // ativos e zero ocupantes, que é indistinguível de um posto novo e vazio — a
    // tela mentiria em vez de dizer que o link está morto.
    erro: erroDaFicha(error, posto != null, 'o posto'),
    voltar,
    ocupantes,
    responsaveis,
    // `total` conta tudo, e as linhas são só a página.
    historico: historico?.rows ?? [],
    totalDoHistorico: historico?.total,
    paginaDoHistorico,
    setPaginaDoHistorico,
    carregandoHistorico,
    erroDoHistorico: erroDoHistorico?.message ?? null,

    editando,
    abrirEdicao: () => setEditando(true),
    fecharEdicao: () => setEditando(false),
    adicionando,
    abrirAdicao: () => setAdicionando(true),
    fecharAdicao: () => setAdicionando(false),
    handleSalvar,
    handleExcluir,
  };
}
