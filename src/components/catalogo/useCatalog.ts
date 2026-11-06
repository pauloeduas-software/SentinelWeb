import { useMemo, useState } from 'react';
import {
  useCatalogQuery, useCreateCatalogRow, useDeleteCatalogRow, useRestoreCatalogRow, useUpdateCatalogRow,
} from '../../queries/catalog.queries';
import type { ListView } from '../../types/list.types';
import type { CatalogRow } from '../../types/catalog.types';
import { useListaNaUrl, usePaginaQueExiste } from '../../hooks/useListaNaUrl';
import { confirmar } from '../../hooks/useConfirmacao';
import { useNotificacao } from '../../hooks/useNotificacao';
import type { AcaoLinhaId, CatalogUiSpec } from './catalog-ui.types';
import { linksDoErro } from '../../helpers/erro.helper';

// Estado de uma tela de catálogo — Configurações, com as cinco abas, ou
// Colaboradores, com uma só: qual aba, que página, o que está no campo de busca, na
// URL (`useListaNaUrl`), e qual registro está no modal. `?aba=modelos`: o F5 não volta
// para a primeira, e um link leva direto a ela (AZ).
export function useCatalog(specs: readonly CatalogUiSpec[]) {
  const notificar = useNotificacao();
  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = lista;
  const chave = parametros.get('aba');
  // O valor do `filtroPorTipo` da aba. `undefined` é "todos".
  const tipo = parametros.get('tipo') ?? undefined;
  // A lixeira, só na aba que a tem (`spec.lixeira`).
  const view: ListView = parametros.get('vista') === 'trashed' ? 'trashed' : 'active';

  const spec = useMemo(
    () => specs.find((item) => item.chave === chave) ?? specs[0],
    [specs, chave],
  );

  // A primeira aba é o endereço limpo. O que era da aba anterior fica para trás: "Ativo"
  // nas categorias não quer dizer nada nos status.
  const changeTab = (proximo: string) => {
    const proxima = specs.find((item) => item.slug === proximo) ?? specs[0];
    lista.recomecar(proxima === specs[0] ? {} : { aba: proxima.chave });
  };

  const changeTipo = (valor: string | undefined) => filtrar('tipo', valor);
  const changeView = (proxima: ListView) => filtrar('vista', proxima === 'active' ? undefined : proxima);

  const campoDoFiltro = spec.filtroPorTipo?.campo;
  const params = useMemo(
    () => ({
      page,
      perPage,
      q: debouncedSearch || undefined,
      ...(campoDoFiltro && tipo ? { [campoDoFiltro]: tipo } : {}),
      // Só a aba com lixeira manda `view`: nas outras o servidor recusa a chave.
      ...(spec.lixeira ? { view } : {}),
    }),
    [page, perPage, debouncedSearch, campoDoFiltro, tipo, spec.lixeira, view],
  );

  const { data, isPending, error } = useCatalogQuery(spec.slug, params);
  const criar = useCreateCatalogRow(spec.slug);
  const editar = useUpdateCatalogRow(spec.slug);
  const excluir = useDeleteCatalogRow(spec.slug);
  const restaurar = useRestoreCatalogRow(spec.slug);

  const registros = data?.rows ?? [];
  const total = data?.total ?? 0;
  usePaginaQueExiste(page, data?.total, setPage);

  // O REGISTRO NOVO NASCE NO RECORTE QUE ESTÁ NA TELA. Quem filtrou as
  // categorias por "Licença" e clicou em "Nova categoria" quer uma categoria de
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

  // DESATIVAR É UMA AÇÃO DA LINHA, não uma caixa no formulário — o mesmo
  // padrão de Usuários. Grava só o campo alternado. Confirma só na ida:
  // desativar tira o registro das escolhas; reativar não tem o que perder.
  const handleAlternar = async (registro: CatalogRow, campo: string) => {
    const ligado = registro[campo] !== false;
    if (ligado && !(await confirmar({
      titulo: `Desativar "${registro.name}"?`,
      descricao: 'Continua no histórico, mas some das escolhas e não recebe nada novo.',
      acao: 'Desativar',
    }))) return;

    try {
      await editar.mutateAsync({ id: registro.id, data: { [campo]: !ligado } });
    } catch (erro) {
      // A desativação do colaborador recusada traz as licenças dele, com link.
      notificar.erro((erro as Error).message, linksDoErro(erro));
    }
  };

  const handleDelete = async (registro: CatalogRow) => {
    if (!(await confirmar({
      titulo: `Excluir "${registro.name}"?`,
      descricao: spec.lixeira ? 'Vai para a lixeira e pode ser restaurado.' : 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;

    try {
      await excluir.mutateAsync(registro.id);
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
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    parametros,
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
