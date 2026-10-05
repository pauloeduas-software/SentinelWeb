import { useMemo, useState } from 'react';
import {
  useCloseMaintenance, useCreateMaintenance, useDeleteMaintenance,
  useMaintenancesQuery, useUpdateMaintenance,
} from '../../../domain/maintenance/maintenance.queries';
import type {
  EncerramentoInput, Manutencao, ManutencaoInput, SituacaoDeManutencao, TipoDeManutencao,
} from '../../../domain/shared/lifecycle.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
export type ModalDeManutencao = 'criar' | 'editar' | 'encerrar' | null;

// Estado da tela de Manutenções: página, busca, filtros e qual linha está aberta.
// Tudo de UMA tela — `useState`, não store (docs/referencia/arquitetura.md).
export function useManutencoes() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [situacao, setSituacao] = useState<SituacaoDeManutencao>('todas');
  const [type, setType] = useState<TipoDeManutencao | ''>('');
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, e não num `useEffect`
  // reagindo a ele: `setState` dentro de efeito encadeia renders e o lint do
  // react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeSituacao = (proxima: SituacaoDeManutencao) => {
    setSituacao(proxima);
    setPage(1);
  };

  const changeType = (proximo: TipoDeManutencao | '') => {
    setType(proximo);
    setPage(1);
  };

  const params = useMemo(
    () => ({
      page,
      perPage: PER_PAGE,
      q: debouncedSearch || undefined,
      situacao,
      ...(type ? { type } : {}),
    }),
    [page, debouncedSearch, situacao, type],
  );

  const { data, isPending } = useMaintenancesQuery(params);

  const criar = useCreateMaintenance();
  const editar = useUpdateMaintenance();
  const encerrar = useCloseMaintenance();
  const excluir = useDeleteMaintenance();

  const [modal, setModal] = useState<ModalDeManutencao>(null);
  // A LINHA INTEIRA, não só o id: a janela precisa do título e da etiqueta para
  // desenhar o cabeçalho no primeiro quadro.
  const [aberta, setAberta] = useState<Manutencao | null>(null);

  const abrir = (proximo: ModalDeManutencao, manutencao: Manutencao | null = null) => {
    setAberta(manutencao);
    setModal(proximo);
  };

  const fechar = () => {
    setModal(null);
    setAberta(null);
  };

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por aqui
  // que aparecem o 422 de encerramento antes da abertura e o 404 de fornecedor.
  const handleCriar = async (assetId: string, dados: ManutencaoInput) => {
    await criar.mutateAsync({ assetId, data: dados });
    fechar();
  };

  const handleEditar = async (dados: Partial<ManutencaoInput>) => {
    if (!aberta) return;
    await editar.mutateAsync({ id: aberta.id, data: dados });
    fechar();
  };

  const handleEncerrar = async (dados: EncerramentoInput) => {
    if (!aberta) return;
    await encerrar.mutateAsync({ id: aberta.id, data: dados });
    fechar();
  };

  /**
   * EXCLUIR precisa de confirmação, e a confirmação diz o que se perde.
   *
   * `maintenances` não tem lixeira: o `DELETE` é físico. "Tem certeza?" não faz
   * ninguém parar; "isto apaga o histórico de serviço e não tem volta" faz.
   *
   * O `try/catch` é obrigatório — o clique é direto na linha e não há campo de
   * erro para a mensagem subir. Sem ele, a rejeição vira *unhandled rejection* e
   * a tela não faz NADA, o que parece travamento.
   */
  const handleExcluir = async (manutencao: Manutencao) => {
    const ok = window.confirm(
      `Apagar "${manutencao.title}" do histórico de ${manutencao.asset.assetTag}?\n\n`
      + 'Manutenção não tem lixeira: isto apaga a linha de verdade, e o custo dela sai '
      + 'dos relatórios.\n\nIsto não tem volta. Continuar?',
    );
    if (!ok) return;

    try {
      await excluir.mutateAsync(manutencao.id);
      // Última linha da página: volta uma, senão a tabela abre vazia com o
      // paginador apontando para uma página que não existe mais.
      if ((data?.rows.length ?? 0) === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      alert((erro as Error).message);
    }
  };

  return {
    manutencoes: data?.rows ?? [],
    resumo: data?.resumo ?? { custoTotal: '0', emAberto: 0, naGarantia: 0 },
    total: data?.total ?? 0,
    carregando: isPending,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    situacao,
    changeSituacao,
    type,
    changeType,
    modal,
    aberta,
    abrir,
    fechar,
    handleCriar,
    handleEditar,
    handleEncerrar,
    handleExcluir,
  };
}
