import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEndpointQuery } from '../../../../queries/endpoint.queries';
import { erroDaFicha } from '../../../../helpers/erro.helper';
import { useVoltaComFiltros } from '../../../../hooks/useVoltaComFiltros';
import { useAcoesDaMaquina } from '../../hooks/useAcoesDaMaquina';

// Estado da FICHA DA MÁQUINA (DF): o painel de vincular aberto e o caminho de volta.
// Quem busca dado é a query do domínio; nenhum componente da pasta fala HTTP.

export function useFichaDaMaquina() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const voltar = useVoltaComFiltros('/agentes');
  const acoes = useAcoesDaMaquina();
  const [vinculando, setVinculando] = useState(false);

  // A mesma consulta da aba Máquina, que revalida sozinha: o status e o último
  // contato do card andam com ela.
  const { data: maquina, isPending, error } = useEndpointQuery(id ?? null);

  return {
    maquina: maquina ?? null,
    carregando: isPending,
    // O 404 de `/agentes/<id>`: a máquina excluída, ou o link morto.
    erro: erroDaFicha(error, maquina != null, 'a máquina'),
    voltar,

    ocupado: acoes.ocupado,
    handleAtualizar: () => (maquina ? acoes.handleAtualizar(maquina) : Promise.resolve()),
    handleVincular: acoes.handleVincular,
    vinculando,
    abrirVinculo: () => setVinculando(true),
    fecharVinculo: () => setVinculando(false),
    handleDesvincular: () => (maquina ? acoes.handleDesvincular(maquina) : Promise.resolve()),
    handleExcluir: async () => {
      // Para a lista sem filtros, como a ficha de todo registro que se exclui.
      if (maquina && await acoes.handleExcluir(maquina)) navigate('/agentes');
    },
  };
}
