import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateWorkstation, useDeleteWorkstation, useUpdateWorkstation, useWorkstationQuery,
  useWorkstationsQuery, type PostoInput,
} from '../../../domain/workstation/workstation.queries';
import { useCheckinAsset } from '../../../domain/assignment/assignment.queries';
import type { AtivoDoPosto, Posto, PostoView } from '../../../domain/shared/workstation.types';
import { linksDoErro } from '../../helpers/erro.helper';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';
import { useOcupantes } from './useOcupantes';

const PER_PAGE = 10;

// Estado da tela de Postos: que recorte, que página, o que está na busca e qual
// posto está aberto. Tudo de UMA tela — fica aqui, em useState, e não em store
// (docs/referencia/arquitetura.md).
//
// O POSTO ABERTO MORA NA URL (`/postos/:id`), e não em `useState`: a ficha do
// posto virou destino de link — é onde a busca por etiqueta larga quem bipou o
// computador de uma mesa. Com estado, esse link não existiria, e recarregar a
// página fecharia a ficha.
//
// A LINHA da listagem continua sendo usada quando ela está carregada: ela dá
// nome e caminho ao cabeçalho sem esperar o detalhe, que é a razão de ela existir
// aqui. Quem entra pela URL não a tem — nem quem abre um posto que está em outra
// página da listagem —, e aí o cabeçalho espera o detalhe chegar: uma ida e
// volta de rede, não um quadro. Durante ela o nome é `…` e o caminho não aparece.
export function usePostos() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<PostoView>('todos');
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página acontece no mesmo handler que muda o recorte ou a busca, e
  // não num `useEffect` reagindo a eles: `setState` dentro de efeito encadeia
  // renders e o lint do react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeView = (proxima: PostoView) => {
    setView(proxima);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, view, q: debouncedSearch || undefined }),
    [page, view, debouncedSearch],
  );

  const { data, isPending, error } = useWorkstationsQuery(params);
  const criar = useCreateWorkstation();
  const editar = useUpdateWorkstation();
  const excluir = useDeleteWorkstation();
  const devolver = useCheckinAsset();
  const notificar = useNotificacao();

  // O formulário serve às duas operações: `emEdicao` nulo é criar.
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Posto | null>(null);

  const { id: postoId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const postoAberto = data?.rows.find((linha) => linha.id === postoId) ?? null;

  // As duas consultas do detalhe ficam DESLIGADAS enquanto não houver posto
  // aberto (`enabled`), e não atrás de um `if` — hook condicional é o que as
  // regras do React proíbem.
  const {
    data: detalhe, isPending: detalhePendente, error: detalheErro,
  } = useWorkstationQuery(postoId ?? null);

  // Os ocupantes vêm de hook próprio, que também serve o histórico — que o
  // detalhe do posto (`GET /api/workstations/:id`) não traz.
  const ocupantes = useOcupantes(postoId ?? null);

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
  };

  // DESATIVAR/ATIVAR e EXCLUIR são os botões da linha, com as mesmas frases de
  // Configurações (`components/catalogo/useCatalog.ts`): o posto segue a regra
  // do status. Confirma só na ida — reativar não tem o que perder.
  const handleAlternar = async (posto: Posto) => {
    if (posto.isActive && !confirm(
      `Desativar "${posto.name}"? Continua no histórico, mas some das escolhas e não recebe nada novo.`,
    )) return;

    try {
      await editar.mutateAsync({ id: posto.id, data: { isActive: !posto.isActive } });
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  const handleExcluir = async (posto: Posto) => {
    if (!confirm(`Excluir "${posto.name}"? Esta ação não tem lixeira.`)) return;

    try {
      await excluir.mutateAsync(posto.id);
      // Apagar o último posto da última página deixaria a tela vazia numa
      // página que não existe mais.
      if (data?.rows.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // É aqui que aparece o 409 do posto com algo nele agora — com um link
      // para cada item de estoque, onde mora o Devolver.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  /**
   * DEVOLVER O ATIVO DA MESA, daqui mesmo.
   *
   * Antes a devolução só existia na tela Computadores — e o ativo entregue a um
   * posto SAIU dela (`asset-filters.helper.ts`). O computador da Mesa 1 ficava
   * visível só nesta ficha, e a única operação possível sobre ele estava na tela
   * que não o mostrava mais: para devolvê-lo era preciso chegar à ficha do ativo
   * por busca ou por URL. Esta é a ponta que faltava do caminho que a etapa
   * passada abriu.
   *
   * SÓ O ESCOPO no corpo, e mais nada: o servidor resolve o status de volta para
   * o primeiro `DEPLOYABLE` (`checkin-asset.usecase.ts`). O formulário completo
   * da devolução — status de volta e observação — continua na tela Computadores,
   * onde cabe; aqui o que se quer é tirar o equipamento DESTA mesa.
   *
   * E é por isso que o `targetWorkstationId` vai: a ficha pode estar velha. Entre
   * ela carregar e o clique, o ativo pode ter sido devolvido e entregue à Laura,
   * e um corpo vazio fecharia a posse dela. Com o posto no corpo, o servidor
   * recusa com 409 e diz com quem o ativo está — a mensagem sobe para a ficha.
   *
   * `confirm` com o NÚMERO e o NOME, não "tem certeza?": o que faz alguém parar é
   * ler a etiqueta do que vai sair da mesa.
   */
  const handleDevolver = async (ativo: AtivoDoPosto) => {
    if (!postoId) return;
    const qual = ativo.name ? `${ativo.assetTag} (${ativo.name})` : ativo.assetTag;
    if (!confirm(`Devolver ${qual}? Ele sai deste posto e volta para a lista de Computadores.`)) return;

    await devolver.mutateAsync({ id: ativo.id, data: { targetWorkstationId: postoId } });
  };

  return {
    postos: data?.rows ?? [],
    total: data?.total ?? 0,
    carregando: isPending,
    // Para a lista não dizer "nenhum posto cadastrado" quando a consulta falhou.
    erro: error ? error.message : null,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,

    modalAberto,
    emEdicao,
    openCreate: () => setModalAberto(true),
    openEdit: (posto: Posto) => {
      setEmEdicao(posto);
      setModalAberto(true);
    },
    closeModal: fecharFormulario,
    handleSalvar,
    handleAlternar,
    handleExcluir,

    postoId: postoId ?? null,
    postoAberto,
    openDetalhe: (posto: Posto) => navigate(`/postos/${posto.id}`),
    closeDetalhe: () => navigate('/postos'),
    detalhe: detalhe ?? null,
    detalhePendente: postoId != null && detalhePendente,
    // O 404 de `/postos/<id-que-não-existe>`. Sem isto a janela abriria com
    // zero ativos e zero ocupantes, que é indistinguível de um posto novo e
    // vazio — a tela mentiria em vez de dizer que o link está morto.
    detalheErro: detalheErro ? detalheErro.message : null,
    devolvendo: devolver.isPending,
    handleDevolver,

    ocupantes,
  };
}
