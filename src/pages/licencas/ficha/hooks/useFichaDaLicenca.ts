import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCheckinLicense, useLicenseCheckoutsQuery, useLicenseHistoryQuery, useLicenseQuery, useUpdateCheckoutKey,
} from '../../../../queries/license.queries';
import { erroDaFicha } from '../../../../helpers/erro.helper';
import { useAbaNaUrl } from '../../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA, useBuscaDaFicha } from '../../../../hooks/useBuscaDaFicha';
import { POR_PAGINA, usePaginaQueExiste } from '../../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../../hooks/useNotificacao';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { useAcoesDaLicenca } from '../../hooks/useAcoesDaLicenca';

// Estado da FICHA DA LICENÇA: as duas listas de 15 em 15, a aba, a devolução e a troca
// de chave. A busca é a do `useBuscaDaFicha`.

const ABAS = ['posse', 'chaves', 'historico'] as const;
const ABAS_SEM_CHAVE = ['posse', 'historico'] as const;

export function useFichaDaLicenca(id: string) {
  const notificar = useNotificacao();
  const navigate = useNavigate();
  const voltar = useVoltaComFiltros('/licencas');
  const acoes = useAcoesDaLicenca({ aoExcluir: () => navigate('/licencas') });
  const devolver = useCheckinLicense();
  const trocarChave = useUpdateCheckoutKey();

  const { data: licenca, isPending, error } = useLicenseQuery(id);
  const temChave = (licenca?.keys.length ?? 0) > 0;
  const [aba, setAba] = useAbaNaUrl<(typeof ABAS)[number]>(temChave ? ABAS : ABAS_SEM_CHAVE, BUSCA_DA_FICHA);

  const {
    pagina: paginaDasEntregas, setPagina: setPaginaDasEntregas, busca, buscaAdiada, mudarBusca,
  } = useBuscaDaFicha();
  const entregas = useLicenseCheckoutsQuery(id, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useLicenseHistoryQuery(id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  // A entrega voltou, aqui ou por outra pessoa: a lista não abre vazia dizendo que
  // ninguém está com a licença.
  usePaginaQueExiste(paginaDasEntregas, entregas.data?.total, setPaginaDasEntregas);

  /**
   * A devolução, no dia escolhido: a licença volta a ficar livre. Diz se deu certo,
   * para a linha fechar só então. O clique direto não tem campo de erro: a recusa vai
   * para a notificação.
   */
  const handleDevolver = async (checkoutId: string, checkinAt: string): Promise<boolean> => {
    try {
      await devolver.mutateAsync({ checkoutId, checkinAt });
      notificar.sucesso('Licença devolvida.');
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
      notificar.sucesso('Chave trocada.');
      return true;
    } catch (erro) {
      // O 409 da chave que ficou sem lugar (outra aba tomou o último), e o da
      // entrega que foi devolvida enquanto a tela estava aberta.
      notificar.erro((erro as Error).message);
      return false;
    }
  };

  return {
    ...acoes,
    licenca: licenca ?? null,
    carregando: isPending,
    erro: erroDaFicha(error, licenca != null, 'a licença'),
    // A ficha fica, com o que já estava nela, e a tela diz que pode estar velha.
    erroDaAtualizacao: licenca && error ? error.message : null,
    voltar,
    aba,
    setAba,

    entregas,
    paginaDasEntregas,
    setPaginaDasEntregas,
    busca,
    buscaAdiada,
    mudarBusca,

    historico,
    paginaDoHistorico,
    setPaginaDoHistorico,

    // Enquanto uma ação corre, os botões dela ficam desabilitados.
    ocupado: acoes.ocupado || devolver.isPending || trocarChave.isPending,
    handleDevolver,
    handleTrocarChave,
  };
}
