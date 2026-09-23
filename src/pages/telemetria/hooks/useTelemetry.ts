import { useState } from 'react';
import { useEndpointsQuery, useSendCommand } from '../../../domain/endpoint/endpoint.queries';
import type { AgentAction, Endpoint } from '../../../domain/shared/endpoint.types';

// Giro mínimo do ícone de atualizar: sem isso a resposta chega rápido demais
// para o usuário perceber que a ação aconteceu.
const SPIN_MS = 500;

export function useTelemetry() {
  // O polling de 5s, a deduplicação e a limpeza do timer são da query
  // (domain/endpoint/endpoint.queries.ts). Aqui fica só estado de tela.
  const { data: endpoints = [], isPending, refetch } = useEndpointsQuery();
  const sendCommand = useSendCommand();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedHwid, setSelectedHwid] = useState<string | null>(null);

  // Só a atualização manual acende o ícone — o ciclo automático é silencioso
  const refresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), SPIN_MS);
  };

  // O detalhe acompanha o ativo pelo HWID, não por uma cópia do objeto: assim a
  // janela aberta mostra a telemetria de cada ciclo em vez de congelar no
  // instante do clique.
  const selectedEndpoint = endpoints.find(endpoint => endpoint.hwid === selectedHwid) ?? null;

  const openDetail = (endpoint: Endpoint) => setSelectedHwid(endpoint.hwid);
  const closeDetail = () => setSelectedHwid(null);

  const handleCommand = async (hwid: string, action: AgentAction) => {
    const label = action.toUpperCase();
    if (!confirm(`CUIDADO: Tem certeza que deseja enviar o comando de ${label} para a máquina?`)) return;

    try {
      await sendCommand.mutateAsync({ hwid, action });
      alert('Comando disparado com sucesso!');
    } catch (error) {
      alert(`Erro: ${(error as Error).message}`);
    }
  };

  return {
    endpoints,
    isRefreshing,
    // `isPending` é "ainda não houve primeira resposta": evita a tela de
    // "nenhum sinal detectado" piscar antes da primeira consulta terminar.
    hasLoaded: !isPending,
    selectedEndpoint,
    refresh,
    openDetail,
    closeDetail,
    handleCommand,
  };
}
