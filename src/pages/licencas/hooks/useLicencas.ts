import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useCheckinLicense, useCheckoutLicense, useCreateLicense, useDeleteLicense,
  useLicenseAlertsQuery, useLicenseQuery, useLicensesQuery, useTerminateLicense, useUpdateCheckoutKey,
  useUpdateLicense,
} from '../../../domain/license/license.queries';
import type {
  AlvoDaEntrega, Licenca, LicencaInput, MotivoDoAlerta, RecorteDaLicenca, StatusDoFiltro,
} from '../../../domain/shared/license.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
type ModalDeLicenca = 'criar' | 'editar' | 'detalhe' | 'entregar' | null;

// Estado da tela de Licenças: página, busca, aba e qual licença está aberta.
// Tudo de UMA tela — `useState`, não store (docs/referencia/arquitetura.md).
export function useLicencas() {
  const notificar = useNotificacao();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<RecorteDaLicenca>('atuais');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusDoFiltro | undefined>();
  // Só as que alguém ainda usa — o filtro da aba Encerradas, para onde o alerta
  // "encerradas em uso" leva.
  const [soEmUso, setSoEmUso] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, e não num `useEffect`
  // reagindo a ele: `setState` dentro de efeito encadeia renders e o lint do
  // react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  // O status é filtro da aba Atuais: trocar de aba o desliga, senão a volta
  // para Atuais mostraria um recorte que ninguém escolheu de novo — e em
  // Encerradas o servidor responde 422.
  const changeView = (proxima: RecorteDaLicenca) => {
    setView(proxima);
    setStatus(undefined);
    setSoEmUso(false);
    setPage(1);
  };

  const changeSoEmUso = (ligado: boolean) => {
    setSoEmUso(ligado);
    setPage(1);
  };

  /**
   * Os links do alerta: cada contagem leva à aba e ao filtro que mostram
   * exatamente aquelas. A busca e a categoria saem, para a lista bater com o
   * número que foi clicado.
   */
  const irParaAlerta = (motivo: MotivoDoAlerta) => {
    setSearch('');
    setCategoryId(undefined);
    setPage(1);
    if (motivo === 'ENCERRADA_EM_USO') {
      setView('encerradas');
      setStatus(undefined);
      setSoEmUso(true);
      return;
    }
    setView('atuais');
    setSoEmUso(false);
    setStatus(motivo === 'VENCIDA' ? 'EXPIRADA' : 'VENCENDO');
  };

  const changeStatus = (proximo: StatusDoFiltro | undefined) => {
    setStatus(proximo);
    setPage(1);
  };

  const changeCategoria = (id: string | undefined) => {
    setCategoryId(id);
    setPage(1);
  };

  const params = useMemo(
    () => ({
      page, perPage: PER_PAGE, view, q: debouncedSearch || undefined, categoryId, status,
      emUso: soEmUso ? 'sim' as const : undefined,
    }),
    [page, view, debouncedSearch, categoryId, status, soEmUso],
  );

  const { data, isPending, error } = useLicensesQuery(params);
  const licencas = data?.rows ?? [];

  // A página que deixou de existir volta para a última — a linha saiu da aba ou
  // do filtro por edição, devolução, encerramento, exclusão, ou por outra
  // pessoa. Ajuste DURANTE o render, guardado pela condição (o padrão do React
  // para estado derivado do anterior), e não num `useEffect`: `setState` em
  // efeito encadeia renders e o lint do react-hooks recusa.
  const ultimaPagina = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : page;
  if (page > ultimaPagina) setPage(ultimaPagina);
  const { data: alertas } = useLicenseAlertsQuery();

  const criar = useCreateLicense();
  const editar = useUpdateLicense();
  const excluir = useDeleteLicense();
  const encerrar = useTerminateLicense();
  const entregar = useCheckoutLicense();
  const devolver = useCheckinLicense();
  const trocarChave = useUpdateCheckoutKey();

  const [modal, setModal] = useState<ModalDeLicenca>(null);
  // A LICENÇA ABERTA é guardada como a LINHA inteira, não só o id: a janela
  // precisa do nome e das contagens para desenhar o cabeçalho no primeiro
  // quadro, e a consulta do detalhe chega depois.
  const [licencaAberta, setLicencaAberta] = useState<Licenca | null>(null);
  // Entregar e Editar abertos DE DENTRO do detalhe voltam para ele ao fechar —
  // salvando ou cancelando: quem estava olhando a licença continua nela.
  const [voltarAoDetalhe, setVoltarAoDetalhe] = useState(false);

  // O LINK DE OUTRA TELA — `?licenca=<id>`, que a aba Licenças do ativo e a
  // ficha do colaborador usam (`caminhoDaLicenca`) para levar à devolução. Abre
  // o detalhe daquela licença assim que ela chega, sem efeito: enquanto nenhuma
  // janela foi aberta aqui, a janela aberta é a do link. Fechar tira o link.
  const [parametros, setParametros] = useSearchParams();
  const idDoLink = parametros.get('licenca');
  const doLink = useLicenseQuery(idDoLink);
  const pelaUrl = modal === null && doLink.data ? doLink.data : null;
  const modalAtual: ModalDeLicenca = pelaUrl ? 'detalhe' : modal;
  const licencaAtual = pelaUrl ?? licencaAberta;

  const abrir = (proximo: ModalDeLicenca, licenca: Licenca | null = null) => {
    setVoltarAoDetalhe(modalAtual === 'detalhe' && (proximo === 'entregar' || proximo === 'editar'));
    setLicencaAberta(licenca);
    setModal(proximo);
  };

  const fechar = () => {
    if (voltarAoDetalhe) {
      setVoltarAoDetalhe(false);
      setModal('detalhe');
      return;
    }
    setModal(null);
    setLicencaAberta(null);
    if (idDoLink) {
      setParametros((atuais) => {
        atuais.delete('licenca');
        return atuais;
      }, { replace: true });
    }
  };

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por
  // aqui que aparecem o 422 de categoria do tipo errado e o 409 de reduzir a
  // quantidade abaixo do que está em uso.
  const handleCriar = async (dados: LicencaInput) => {
    await criar.mutateAsync(dados);
    fechar();
  };

  const handleEditar = async (dados: Partial<LicencaInput>) => {
    if (!licencaAberta) return;
    // Nada mudou: fechar é a resposta inteira, sem ida ao servidor.
    if (Object.keys(dados).length > 0) await editar.mutateAsync({ id: licencaAberta.id, data: dados });
    fechar();
  };

  const handleEntregar = async (alvo: AlvoDaEntrega) => {
    if (!licencaAberta) return;
    await entregar.mutateAsync({ licenseId: licencaAberta.id, alvo });
    fechar();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // OS CLIQUES DIRETOS — devolver, encerrar, excluir — não
  // têm campo de erro para a mensagem subir, e por isso cada um tem o seu
  // `try/catch` com notificação (`useNotificacao`). Sem ele a rejeição vira
  // *unhandled rejection* e a tela não faz NADA: o 409 daqui é escrito para
  // ensinar, e engoli-lo transforma uma recusa explicada numa tela que parece
  // travada.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * A devolução, no dia escolhido: a licença volta a ficar livre. Diz se deu
   * certo, para o detalhe voltar uma página quando a última linha dela saiu.
   */
  const handleDevolver = async (checkoutId: string, checkinAt: string): Promise<boolean> => {
    try {
      await devolver.mutateAsync({ checkoutId, checkinAt });
      return true;
    } catch (erro) {
      // O 409 de entrega já devolvida (duas abas abertas na mesma licença) e o
      // 422 da data — futura, ou antes da entrega.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  /**
   * A troca da chave de uma entrega aberta. Diz se deu certo, para a linha só
   * sair da edição quando a chave foi gravada.
   */
  const handleTrocarChave = async (checkoutId: string, productKey: string | null): Promise<boolean> => {
    try {
      await trocarChave.mutateAsync({ checkoutId, productKey });
      return true;
    } catch (erro) {
      // O 409 da chave que já está em outra entrega aberta, e o da entrega que
      // foi devolvida enquanto a tela estava aberta.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  // ENCERRA MESMO COM ALGUÉM USANDO, e por isso a pergunta diz quantos: a
  // licença vai para Encerradas e fica no alerta até tudo voltar.
  const handleEncerrar = async (licenca: Licenca) => {
    const pergunta = licenca.emUso > 0
      ? `"${licenca.name}" ainda está com ${licenca.emUso}. Encerrar mesmo assim? `
        + 'Ela vai para Encerradas e fica no alerta até tudo ser devolvido.'
      : `Encerrar "${licenca.name}" hoje? Ela sai da lista e vai para Encerradas.`;
    if (!window.confirm(pergunta)) return;
    try {
      await encerrar.mutateAsync(licenca.id);
    } catch (erro) {
      // O 409 da licença que já estava encerrada (duas abas).
      notificar.erro((erro as Error).message);
    }
  };

  const handleExcluir = async (licenca: Licenca) => {
    if (!window.confirm(
      `Excluir "${licenca.name}" de vez? É para o cadastro errado: a licença que já foi entregue não se exclui, se encerra.`,
    )) return;
    try {
      await excluir.mutateAsync(licenca.id);
      // Excluída do detalhe: a janela não tem mais o que mostrar.
      if (licencaAtual?.id === licenca.id) fechar();
    } catch (erro) {
      notificar.erro((erro as Error).message);
    }
  };

  return {
    licencas,
    total: data?.total ?? 0,
    carregando: isPending,
    // Para a tabela não dizer "nenhuma cadastrada" quando a consulta falhou.
    erro: error ? error.message : null,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,
    categoryId,
    changeCategoria,
    status,
    changeStatus,
    soEmUso,
    changeSoEmUso,
    irParaAlerta,

    alertas: alertas ?? { total: 0, contagem: { ENCERRADA_EM_USO: 0, VENCIDA: 0, VENCENDO: 0 }, rows: [] },

    modal: modalAtual,
    licencaAberta: licencaAtual,
    // O link apontava para uma licença que não existe mais (excluída).
    erroDoLink: idDoLink && modal === null && doLink.error ? doLink.error.message : null,
    abrir,
    fechar,

    // Enquanto uma ação corre, os botões dela ficam desabilitados: o duplo
    // clique dava "já foi devolvida" DEPOIS de a devolução ter dado certo.
    ocupado: excluir.isPending || encerrar.isPending || devolver.isPending || trocarChave.isPending,

    handleCriar,
    handleEditar,
    handleEntregar,
    handleDevolver,
    handleTrocarChave,
    handleEncerrar,
    handleExcluir,
  };
}
