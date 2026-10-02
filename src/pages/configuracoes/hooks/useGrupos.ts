import { useMemo, useState } from 'react';
import {
  useApagarGrupo, useCriarGrupo, useEditarGrupo, useGruposQuery, usePermissoesDoCatalogo,
} from '../../../domain/access/access.queries';
import type { Grupo, GrupoInput } from '../../../domain/shared/access.types';

const POR_PAGINA = 20;

/**
 * O estado da aba Grupos.
 *
 * Mesmo desenho do `useCatalog`: a página cuida do que DESENHAR, o hook cuida de
 * QUAL registro e QUAL formulário. A diferença é que grupo não é spec de
 * catálogo — ele tem a coluna `permissions`, e o CRUD genérico não sabe
 * convertê-la nem validá-la contra o catálogo.
 */
export function useGrupos() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Grupo | null>(null);

  const params = useMemo(
    () => ({ page, perPage: POR_PAGINA, sort: 'name', order: 'asc' as const, q: search || undefined }),
    [page, search],
  );

  const lista = useGruposQuery(params);
  const catalogo = usePermissoesDoCatalogo();
  const criar = useCriarGrupo();
  const editar = useEditarGrupo();
  const apagar = useApagarGrupo();

  /**
   * As chaves do catálogo agrupadas por módulo, para a tela desenhar as seções.
   *
   * `Map` e não objeto: a ORDEM importa (o catálogo vem na ordem em que foi
   * declarado, que é a ordem de importância), e as chaves de um objeto literal
   * em JS são ordenadas por inserção mas um `Object.entries` sobre ele perderia
   * essa intenção na primeira refatoração.
   */
  const porModulo = useMemo(() => {
    const mapa = new Map<string, { chave: string; rotulo: string }[]>();
    for (const permissao of catalogo.data ?? []) {
      const lista = mapa.get(permissao.modulo);
      if (lista) lista.push(permissao);
      else mapa.set(permissao.modulo, [permissao]);
    }
    return mapa;
  }, [catalogo.data]);

  function openCreate() {
    setEmEdicao(null);
    setModalAberto(true);
  }

  function openEdit(grupo: Grupo) {
    setEmEdicao(grupo);
    setModalAberto(true);
  }

  function closeModal() {
    setModalAberto(false);
    setEmEdicao(null);
  }

  async function handleSubmit(data: GrupoInput) {
    // O erro PROPAGA: é mutação, e o 409 do grupo de sistema e o 422 da chave
    // desconhecida são frases que a pessoa precisa ler (docs/ARQUITETURA.md —
    // busca engole erro, mutação propaga).
    if (emEdicao) await editar.mutateAsync({ id: emEdicao.id, data });
    else await criar.mutateAsync(data);
    closeModal();
  }

  return {
    grupos: lista.data?.rows ?? [],
    total: lista.data?.total ?? 0,
    carregando: lista.isPending,
    page, perPage: POR_PAGINA, setPage,
    search, changeSearch: (valor: string) => { setSearch(valor); setPage(1); },
    porModulo,
    carregandoCatalogo: catalogo.isPending,
    modalAberto, emEdicao, openCreate, openEdit, closeModal, handleSubmit,
    salvando: criar.isPending || editar.isPending,
    handleDelete: (id: string) => apagar.mutateAsync(id),
  };
}
