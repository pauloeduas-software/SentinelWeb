import { useMemo, useState } from 'react';
import {
  useCatalogQuery, useCreateCatalogRow, useDeleteCatalogRow, useUpdateCatalogRow,
} from '../../../domain/catalog/catalog.queries';
import type { CatalogRow } from '../../../domain/shared/catalog.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { CATALOG_UI_SPECS } from '../specs';
import type { AcaoLinhaId } from '../specs/catalog-ui.types';

/**
 * A ação de linha que está aberta, com o registro que a disparou.
 *
 * Genérico de propósito: o hook guarda QUAL ação e SOBRE QUEM, e não sabe o que
 * cada uma faz. Quem sabe é quem trata o `id` — hoje, o `useOcupantes`. Assim
 * uma ação nova não mexe neste arquivo.
 */
export interface AcaoLinhaAberta {
  id: AcaoLinhaId;
  registro: CatalogRow;
}

const PER_PAGE = 10;

// Estado da tela de Configurações: qual aba, que página, o que está no campo de
// busca e qual registro está no modal. Tudo de UMA tela — fica aqui, em
// useState, e não em store (docs/ARQUITETURA.md).
export function useCatalog() {
  const [slug, setSlug] = useState(CATALOG_UI_SPECS[0].slug);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const spec = useMemo(
    () => CATALOG_UI_SPECS.find((item) => item.slug === slug) ?? CATALOG_UI_SPECS[0],
    [slug],
  );

  // Zerar a página acontece no mesmo handler que muda a aba ou a busca, e não
  // num `useEffect` reagindo a eles: `setState` dentro de efeito encadeia
  // renders e o lint do react-hooks recusa.
  const changeTab = (proximo: string) => {
    setSlug(proximo);
    setPage(1);
    setSearch('');
    // Trocar de aba fecha a ação aberta: o registro dela é da aba anterior.
    setAcaoAberta(null);
  };

  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: debouncedSearch || undefined }),
    [page, debouncedSearch],
  );

  const { data, isPending } = useCatalogQuery(spec.slug, params);
  const criar = useCreateCatalogRow(spec.slug);
  const editar = useUpdateCatalogRow(spec.slug);
  const excluir = useDeleteCatalogRow(spec.slug);

  const registros = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CatalogRow | null>(null);
  const [acaoAberta, setAcaoAberta] = useState<AcaoLinhaAberta | null>(null);

  const openCreate = () => {
    setEmEdicao(null);
    setModalAberto(true);
  };

  const openEdit = (registro: CatalogRow) => {
    setEmEdicao(registro);
    setModalAberto(true);
  };

  const closeModal = () => {
    setModalAberto(false);
    setEmEdicao(null);
  };

  const openAcao = (id: AcaoLinhaId, registro: CatalogRow) => setAcaoAberta({ id, registro });
  const closeAcao = () => setAcaoAberta(null);

  // O erro sobe para o formulário mostrar a mensagem do servidor.
  const handleSubmit = async (valores: Record<string, unknown>) => {
    if (emEdicao) await editar.mutateAsync({ id: emEdicao.id, data: valores });
    else await criar.mutateAsync(valores);
    closeModal();
  };

  const handleDelete = async (registro: CatalogRow) => {
    if (!confirm(`Excluir "${registro.name}"? Esta ação não tem lixeira.`)) return;

    try {
      await excluir.mutateAsync(registro.id);
      // Apagar o último item da última página deixaria a tela vazia com o
      // usuário numa página que não existe mais.
      if (registros.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // É aqui que aparece o 409 de "em uso por N registros" — a regra que
      // impede apagar uma categoria que alguém está usando.
      alert((erro as Error).message);
    }
  };

  return {
    specs: CATALOG_UI_SPECS,
    spec,
    changeTab,
    registros,
    total,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    loading: isPending,
    modalAberto,
    emEdicao,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    acaoAberta,
    openAcao,
    closeAcao,
  };
}
