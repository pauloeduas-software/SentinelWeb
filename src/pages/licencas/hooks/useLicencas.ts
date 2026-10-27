import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useCheckinLicense, useCheckoutLicense, useCreateLicense, useDeleteLicense,
  useLicenseAlertsQuery, useLicenseQuery, useLicensesQuery, useTerminateLicense, useUpdateCheckoutKey,
  useUpdateLicense,
} from '../../../domain/license/license.queries';
import type {
  AlvoDaEntrega, Licenca, LicencaInput, MotivoDoAlerta, StatusDoFiltro,
} from '../../../domain/shared/license.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
type ModalDeLicenca = 'criar' | 'editar' | 'detalhe' | 'entregar' | null;

// Estado da tela de Licenças: página, busca, filtros e qual licença está aberta.
// É o cadastro das Configurações (`useCatalog`, AF): uma lista só, com a
// encerrada junto, e Encerrar/Reabrir no lugar do Desativar/Ativar. Tudo de
// UMA tela — `useState`, não store (docs/referencia/arquitetura.md).
export function useLicencas() {
  const notificar = useNotificacao();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusDoFiltro | undefined>();
  // Só as que alguém ainda usa — o filtro do status Encerradas, para onde o
  // alerta "encerradas em uso" leva.
  const [soEmUso, setSoEmUso] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, e não num `useEffect`
  // reagindo a ele: `setState` dentro de efeito encadeia renders e o lint do
  // react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeSoEmUso = (ligado: boolean) => {
    setSoEmUso(ligado);
    setPage(1);
  };

  /**
   * Os links do alerta: cada contagem leva ao filtro que mostra exatamente
   * aquelas. A busca e a categoria saem, para a lista bater com o
   * número que foi clicado.
   */
  const irParaAlerta = (motivo: MotivoDoAlerta) => {
    setSearch('');
    setCategoryId(undefined);
    setPage(1);
    if (motivo === 'ENCERRADA_EM_USO') {
      setStatus('ENCERRADA');
      setSoEmUso(true);
      return;
    }
    setSoEmUso(false);
    setStatus(motivo === 'VENCIDA' ? 'EXPIRADA' : 'VENCENDO');
  };

  // O "em uso" é filtro das encerradas: sair delas o desliga, senão a lista
  // ficaria num recorte que o seletor nem mostra mais.
  const changeStatus = (proximo: StatusDoFiltro | undefined) => {
    setStatus(proximo);
    if (proximo !== 'ENCERRADA') setSoEmUso(false);
    setPage(1);
  };

  const changeCategoria = (id: string | undefined) => {
    setCategoryId(id);
    setPage(1);
  };

  const params = useMemo(
    () => ({
      page, perPage: PER_PAGE, q: debouncedSearch || undefined, categoryId, status,
      emUso: soEmUso ? 'sim' as const : undefined,
    }),
    [page, debouncedSearch, categoryId, status, soEmUso],
  );

  const { data, isPending, error } = useLicensesQuery(params);
  const licencas = data?.rows ?? [];

  // A página que deixou de existir volta para a última — a linha saiu do
  // filtro por edição, devolução, encerramento, exclusão, ou por outra pessoa. Ajuste DURANTE o render, guardado pela condição (o padrão do React
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
  // `?busca=<nome>`: quem veio da ficha do colaborador ou da aba do computador
  // já abre "Com quem está" filtrado por ele.
  const buscaDoLink = parametros.get('busca') ?? '';
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
        atuais.delete('busca');
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

  // O formulário inteiro vai, como nas Configurações (AF).
  const handleEditar = async (dados: LicencaInput) => {
    if (!licencaAberta) return;
    await editar.mutateAsync({ id: licencaAberta.id, data: dados });
    fechar();
  };

  const handleEntregar = async (alvo: AlvoDaEntrega) => {
    if (!licencaAberta) return;
    await entregar.mutateAsync({ licenseId: licencaAberta.id, alvo });
    fechar();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // OS CLIQUES DIRETOS — devolver, encerrar, reabrir, excluir — não
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
   * A troca da chave de uma entrega aberta, por outra da lista. Diz se deu
   * certo, para a linha só sair da edição quando a chave foi gravada.
   */
  const handleTrocarChave = async (checkoutId: string, licenseKeyId: string): Promise<boolean> => {
    try {
      await trocarChave.mutateAsync({ checkoutId, licenseKeyId });
      return true;
    } catch (erro) {
      // O 409 da chave que ficou sem lugar (outra aba tomou o último), e o da
      // entrega que foi devolvida enquanto a tela estava aberta.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  // ENCERRAR/REABRIR é o Desativar/Ativar das Configurações (AF), com data: o
  // encerramento grava hoje em `terminationDate`, e reabrir apaga a data — a
  // mesma edição do formulário. Confirma só na ida, com a frase do padrão.
  // Encerra MESMO COM ALGUÉM USANDO, e por isso a pergunta diz quantos: a
  // licença fica no alerta até tudo voltar.
  const handleAlternarEncerrada = async (licenca: Licenca) => {
    const encerrada = licenca.status === 'ENCERRADA';
    if (!encerrada && !window.confirm(
      `Encerrar "${licenca.name}" hoje? Continua no histórico, mas some das escolhas e não recebe nada novo.`
        + (licenca.emUso > 0 ? ` Ainda está com ${licenca.emUso}: fica no alerta até tudo voltar.` : ''),
    )) return;
    try {
      if (encerrada) await editar.mutateAsync({ id: licenca.id, data: { terminationDate: null } });
      else await encerrar.mutateAsync(licenca.id);
    } catch (erro) {
      // O 409 da licença que já estava encerrada (duas abas), e o 422 do
      // encerramento antes da data da compra.
      notificar.erro((erro as Error).message);
    }
  };

  // EXCLUIR, com a frase de Configurações (`useCatalog`). O botão sempre clica:
  // a licença em uso recebe o 409 do servidor, que diz com quem e manda
  // devolver (AG).
  const handleExcluir = async (licenca: Licenca) => {
    if (!window.confirm(`Excluir "${licenca.name}"? Esta ação não tem lixeira.`)) return;
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
    // Só para a licença do link: a outra, aberta pela lista, abre sem busca.
    buscaDoLink: licencaAtual && licencaAtual.id === idDoLink ? buscaDoLink : '',
    // O link apontava para uma licença que não existe mais (excluída).
    erroDoLink: idDoLink && modal === null && doLink.error ? doLink.error.message : null,
    abrir,
    fechar,

    // Enquanto uma ação corre, os botões dela ficam desabilitados: o duplo
    // clique dava "já foi devolvida" DEPOIS de a devolução ter dado certo.
    ocupado: excluir.isPending || encerrar.isPending || editar.isPending || devolver.isPending || trocarChave.isPending,

    handleCriar,
    handleEditar,
    handleEntregar,
    handleDevolver,
    handleTrocarChave,
    handleAlternarEncerrada,
    handleExcluir,
  };
}
