import { useMemo, useState } from 'react';
import {
  useCatalogQuery, useCreateCatalogRow, useDeleteCatalogRow, useRestoreCatalogRow, useUpdateCatalogRow,
} from '../../queries/catalog.queries';
import type { ListView } from '../../types/list.types';
import type { CatalogRow } from '../../types/catalog.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';
import type { AcaoLinhaId, CatalogUiSpec } from './catalog-ui.types';
import { linksDoErro } from '../../helpers/erro.helper';

// Catálogo é lista curta: com 10, onze categorias já viravam duas páginas. A
// tabela rola por dentro, então 25 não estoura a tela.
const PER_PAGE = 25;

// Estado de uma tela de catálogo — Configurações, com as cinco abas, ou
// Colaboradores, com uma só: qual aba, que página, o que está no campo de busca
// e qual registro está no modal. Tudo de UMA tela — fica aqui, em useState, e
// não em store (docs/referencia/arquitetura.md).
export function useCatalog(specs: readonly CatalogUiSpec[]) {
  const notificar = useNotificacao();
  const [slug, setSlug] = useState(specs[0].slug);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  // O valor do `filtroPorTipo` da aba. `undefined` é "todos".
  const [tipo, setTipo] = useState<string | undefined>();
  // A lixeira, só na aba que a tem (`spec.lixeira`).
  const [view, setView] = useState<ListView>('active');

  const spec = useMemo(
    () => specs.find((item) => item.slug === slug) ?? specs[0],
    [specs, slug],
  );

  // Zerar a página acontece no mesmo handler que muda a aba ou a busca, e não
  // num `useEffect` reagindo a eles: `setState` dentro de efeito encadeia
  // renders e o lint do react-hooks recusa.
  const changeTab = (proximo: string) => {
    setSlug(proximo);
    setPage(1);
    setSearch('');
    // O tipo é da aba: "Ativo" nas categorias não quer dizer nada nos status.
    setTipo(undefined);
    // E a lixeira também: a próxima aba começa no cadastro, não na lixeira.
    setView('active');
  };

  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeTipo = (valor: string | undefined) => {
    setTipo(valor);
    setPage(1);
  };

  const changeView = (proxima: ListView) => {
    setView(proxima);
    setPage(1);
  };

  const campoDoFiltro = spec.filtroPorTipo?.campo;
  const params = useMemo(
    () => ({
      page,
      perPage: PER_PAGE,
      q: debouncedSearch || undefined,
      ...(campoDoFiltro && tipo ? { [campoDoFiltro]: tipo } : {}),
      // Só a aba com lixeira manda `view`: nas outras o servidor recusa a chave.
      ...(spec.lixeira ? { view } : {}),
    }),
    [page, debouncedSearch, campoDoFiltro, tipo, spec.lixeira, view],
  );

  const { data, isPending, error } = useCatalogQuery(spec.slug, params);
  const criar = useCreateCatalogRow(spec.slug);
  const editar = useUpdateCatalogRow(spec.slug);
  const excluir = useDeleteCatalogRow(spec.slug);
  const restaurar = useRestoreCatalogRow(spec.slug);

  const registros = data?.rows ?? [];
  const total = data?.total ?? 0;

  // O REGISTRO NOVO NASCE NO RECORTE QUE ESTÁ NA TELA. Quem filtrou as
  // categorias por "Licença" e clicou em "Categoria" quer uma categoria de
  // licença: abrir o formulário em "Ativo" (a primeira opção) fazia a pessoa
  // trocar o campo à mão — ou, não reparando, gravar no tipo errado e ver a
  // linha sumir do filtro que ela mesma tinha ligado.
  const padroesDoNovo = useMemo(
    () => (campoDoFiltro && tipo ? { [campoDoFiltro]: tipo } : undefined),
    [campoDoFiltro, tipo],
  );

  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<CatalogRow | null>(null);

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

  // A ação de ALTERNAR (Desativar/Ativar) não abre modal: grava na hora. A
  // Ficha é navegação, e quem a trata é a tela.
  const openAcao = (id: AcaoLinhaId, registro: CatalogRow) => {
    const alterna = spec.acoes?.find((acao) => acao.id === id)?.alterna;
    if (alterna) void handleAlternar(registro, alterna.campo);
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor.
  const handleSubmit = async (valores: Record<string, unknown>) => {
    if (emEdicao) await editar.mutateAsync({ id: emEdicao.id, data: valores });
    else await criar.mutateAsync(valores);
    closeModal();
  };

  // DESATIVAR É UM BOTÃO DA LINHA, não uma caixa no formulário — o mesmo
  // padrão de Usuários. Grava só o campo alternado. Confirma só na ida:
  // desativar tira o registro das escolhas; reativar não tem o que perder.
  const handleAlternar = async (registro: CatalogRow, campo: string) => {
    const ligado = registro[campo] !== false;
    if (ligado && !confirm(
      `Desativar "${registro.name}"? Continua no histórico, mas some das escolhas e não recebe nada novo.`,
    )) return;

    try {
      await editar.mutateAsync({ id: registro.id, data: { [campo]: !ligado } });
    } catch (erro) {
      // A desativação do colaborador recusada traz as licenças dele, com link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  const handleDelete = async (registro: CatalogRow) => {
    const aviso = spec.lixeira
      ? `Excluir "${registro.name}"? Vai para a lixeira e pode ser restaurado.`
      : `Excluir "${registro.name}"? Esta ação não tem lixeira.`;
    if (!confirm(aviso)) return;

    try {
      await excluir.mutateAsync(registro.id);
      // Apagar o último item da última página deixaria a tela vazia com o
      // usuário numa página que não existe mais.
      if (registros.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // É aqui que aparece o 409 de "em uso por N registros" — a regra que
      // impede apagar uma categoria que alguém está usando — e o do
      // colaborador, com as licenças dele em link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  const handleRestore = async (registro: CatalogRow) => {
    try {
      await restaurar.mutateAsync(registro.id);
      // Restaurar o último da página da lixeira deixaria a tela vazia.
      if (registros.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // O 409 do e-mail que foi reaproveitado enquanto ele estava na lixeira.
      notificar.erro((erro as Error).message);
    }
  };

  return {
    specs,
    spec,
    changeTab,
    registros,
    total,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    tipo,
    changeTipo,
    view,
    changeView,
    loading: isPending,
    // A mensagem do erro da listagem, para a tabela não dizer "nenhum registro"
    // quando o que houve foi uma recusa (`EstadoDaLista`).
    erro: error ? error.message : null,
    padroesDoNovo,
    modalAberto,
    emEdicao,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    handleRestore,
    openAcao,
  };
}
