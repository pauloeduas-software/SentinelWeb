import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateLicense, useLicenseAlertsQuery, useLicenseStatsQuery, useLicensesQuery,
} from '../../../queries/license.queries';
import type { Licenca, LicencaInput, StatusDoFiltro } from '../../../types/license.types';
import { caminhoDaLicenca } from '../../../helpers/licenca.helper';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';
import { contagensDasLicencas } from '../helpers/contagens.helper';
import { statusDaUrl } from '../helpers/licenca.helper';
import { useAcoesDaLicenca } from './useAcoesDaLicenca';

// Estado da tela de Licenças: página, busca e filtros, na URL (`useListaNaUrl`). Uma
// lista só, com a encerrada junto, como no cadastro das Configurações (AF). A linha
// abre a ficha, e as ações do `⋯` são as dela (`useAcoesDaLicenca`).
export function useLicencas() {
  const notificar = useNotificacao();
  const navigate = useNavigate();
  const lista = useListaNaUrl();
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = lista;
  const categoryId = parametros.get('categoria') ?? undefined;
  const status = statusDaUrl(parametros.get('status'));

  const params = useMemo(
    () => ({
      page, perPage, q: debouncedSearch || undefined, categoryId, status,
    }),
    [page, perPage, debouncedSearch, categoryId, status],
  );

  const { data, isPending, error } = useLicensesQuery(params);
  const licencas = data?.rows ?? [];

  usePaginaQueExiste(page, data?.total, setPage);
  const { data: stats } = useLicenseStatsQuery();
  const { data: alertas, error: erroDosAlertas } = useLicenseAlertsQuery();

  const criar = useCreateLicense();
  const acoes = useAcoesDaLicenca();
  const [criando, setCriando] = useState(false);

  // O erro sobe para o formulário mostrar a mensagem do servidor: é por aqui que
  // aparece o 422 de categoria do tipo errado.
  const handleCriar = async (dados: LicencaInput) => {
    await criar.mutateAsync(dados);
    setCriando(false);
    notificar.sucesso('Licença cadastrada.');
  };

  return {
    ...acoes,

    licencas,
    total: data?.total ?? 0,
    carregando: isPending,
    // Para a tabela não dizer "nenhuma cadastrada" quando a consulta falhou.
    erro: error ? error.message : null,
    page,
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    changeSearch,
    categoryId,
    changeCategoria: (id: string | undefined) => filtrar('categoria', id),
    status,
    // Clicar no cartão escolhido, ou no Total, volta para todas.
    changeStatus: (proximo: StatusDoFiltro | undefined) => filtrar('status', proximo === status ? undefined : proximo),
    contagens: contagensDasLicencas(stats),

    alertas: alertas ?? { total: 0, contagem: { VENCIDA: 0, VENCENDO: 0 }, rows: [] },
    // Sem resposta, nenhum alerta na tela não quer dizer nada vencendo.
    erroDosAlertas: alertas ? null : erroDosAlertas?.message ?? null,

    abrirFicha: (licenca: Licenca) => navigate(caminhoDaLicenca(licenca.id), comFiltros(parametros)),

    criando,
    abrirCriacao: () => setCriando(true),
    fecharCriacao: () => setCriando(false),
    handleCriar,
  };
}
