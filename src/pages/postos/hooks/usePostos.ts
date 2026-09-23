import { useMemo, useState } from 'react';
import {
  useCreateWorkstation, useWorkstationQuery, useWorkstationsQuery,
  type NovoPostoInput,
} from '../../../domain/workstation/workstation.queries';
import type { Posto, PostoView } from '../../../domain/shared/workstation.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useOcupantes } from '../../hooks/useOcupantes';

const PER_PAGE = 10;

// Estado da tela de Postos: que recorte, que página, o que está na busca e qual
// posto está aberto. Tudo de UMA tela — fica aqui, em useState, e não em store
// (docs/ARQUITETURA.md).
//
// O POSTO ABERTO é guardado como a LINHA inteira, não só o id: o modal precisa
// do nome e do caminho para desenhar o cabeçalho no primeiro quadro, e a
// consulta do detalhe (que traz os ativos) chega depois. Guardar só o id faria
// a janela abrir sem título.
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

  const [modalAberto, setModalAberto] = useState(false);
  const [postoAberto, setPostoAberto] = useState<Posto | null>(null);

  // As duas consultas do detalhe ficam DESLIGADAS enquanto não houver posto
  // aberto (`enabled`), e não atrás de um `if` — hook condicional é o que as
  // regras do React proíbem.
  const { data: detalhe, isPending: detalhePendente } = useWorkstationQuery(postoAberto?.id ?? null);

  // Os ocupantes vêm do hook COMPARTILHADO com a aba Localizações: adicionar e
  // encerrar são a mesma operação nas duas telas, e é ele que também serve o
  // histórico — que o detalhe do posto (`GET /api/workstations/:id`) não traz.
  const ocupantes = useOcupantes(postoAberto?.id ?? null);

  // O erro sobe para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparece o 409 de nome repetido e o de hierarquia em ciclo.
  const handleCriar = async (dados: NovoPostoInput) => {
    await criar.mutateAsync(dados);
    setModalAberto(false);
  };

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

    postoAberto,
    openDetalhe: setPostoAberto,
    closeDetalhe: () => setPostoAberto(null),
    detalhe: detalhe ?? null,
    detalhePendente: postoAberto != null && detalhePendente,

    ocupantes,
  };
}
