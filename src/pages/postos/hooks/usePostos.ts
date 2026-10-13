import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateWorkstation, useWorkstationQuery, useWorkstationsQuery,
  type NovoPostoInput,
} from '../../../domain/workstation/workstation.queries';
import { useCheckinAsset } from '../../../domain/assignment/assignment.queries';
import { useCheckinStock } from '../../../domain/stock/stock.queries';
import type { AtivoDoPosto, Posto, PostoView } from '../../../domain/shared/workstation.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useOcupantes } from '../../hooks/useOcupantes';

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

  const { data, isPending } = useWorkstationsQuery(params);
  const criar = useCreateWorkstation();
  const devolver = useCheckinAsset();
  const devolverItem = useCheckinStock();

  const [modalAberto, setModalAberto] = useState(false);

  const { id: postoId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const postoAberto = data?.rows.find((linha) => linha.id === postoId) ?? null;

  // As duas consultas do detalhe ficam DESLIGADAS enquanto não houver posto
  // aberto (`enabled`), e não atrás de um `if` — hook condicional é o que as
  // regras do React proíbem.
  const {
    data: detalhe, isPending: detalhePendente, error: detalheErro,
  } = useWorkstationQuery(postoId ?? null);

  // Os ocupantes vêm do hook COMPARTILHADO com a aba Localizações: adicionar e
  // encerrar são a mesma operação nas duas telas, e é ele que também serve o
  // histórico — que o detalhe do posto (`GET /api/workstations/:id`) não traz.
  const ocupantes = useOcupantes(postoId ?? null);

  // O erro sobe para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparece o 409 de nome repetido e o de hierarquia em ciclo.
  const handleCriar = async (dados: NovoPostoInput) => {
    await criar.mutateAsync(dados);
    setModalAberto(false);
  };

  /**
   * DEVOLVER O ATIVO DA MESA, daqui mesmo.
   *
   * Antes a devolução só existia na tela de Ativos — e o ativo entregue a um
   * posto SAIU dela (`asset-filters.helper.ts`). O computador da Mesa 1 ficava
   * visível só nesta ficha, e a única operação possível sobre ele estava na tela
   * que não o mostrava mais: para devolvê-lo era preciso chegar à ficha do ativo
   * por busca ou por URL. Esta é a ponta que faltava do caminho que a etapa
   * passada abriu.
   *
   * SÓ O ESCOPO no corpo, e mais nada: o servidor resolve o status de volta para
   * o primeiro `DEPLOYABLE` (`checkin-asset.usecase.ts`). O formulário completo
   * da devolução — status de volta e observação — continua na tela de Ativos,
   * onde cabe; aqui o que se quer é tirar o equipamento DESTA mesa.
   *
   * E é por isso que o `targetLocationId` vai: a ficha pode estar velha. Entre
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
    if (!confirm(`Devolver ${qual} ao estoque? Ele sai deste posto e volta para a lista de Ativos.`)) return;

    await devolver.mutateAsync({ id: ativo.id, data: { targetLocationId: postoId } });
  };

  /**
   * DEVOLVER UMA UNIDADE DE ESTOQUE da mesa — a mesma operação que a tela de
   * Estoque oferece, pelo id do MOVIMENTO (a unidade), não do item
   * (`checkin-stock.usecase.ts`). Sem o escopo que o ativo precisa: a unidade
   * é identificada pela própria linha, e uma ficha velha devolvendo uma
   * unidade já devolvida leva 409, sem fechar a de outro posto — a mesma razão
   * que o docblock do `checkin-stock.usecase.ts` explica.
   */
  const handleDevolverItem = (movementId: string) => devolverItem.mutateAsync({ movementId });

  return {
    postos: data?.rows ?? [],
    total: data?.total ?? 0,
    carregando: isPending,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,

    modalAberto,
    openCreate: () => setModalAberto(true),
    closeModal: () => setModalAberto(false),
    handleCriar,

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
    devolvendoItem: devolverItem.isPending,
    handleDevolverItem,

    ocupantes,
  };
}
