import { useState } from 'react';
import {
  useAddWorkstationOccupant, useCorrigirTurno, useEndWorkstationOccupancy, useWorkstationOccupantsQuery,
  type OccupantInput,
} from '../../../domain/occupancy/occupancy.queries';
import type { WorkstationOccupant, OccupantView } from '../../../domain/shared/posse.types';
import { nomeDoOcupante } from '../helpers/ocupantes.helper';

// Os OCUPANTES de um posto — Camada 2 de docs/referencia/modelo-de-posse.md.
//
// Recebe o ID do posto, não o registro, e `null` DESLIGA a query — `enabled`
// resolve isso sem hook condicional, que as regras do React proíbem.
export function useOcupantes(workstationId: string | null) {
  const [view, setView] = useState<OccupantView>('current');

  const { data, isPending, error } = useWorkstationOccupantsQuery(workstationId, view);
  const adicionar = useAddWorkstationOccupant();
  const encerrar = useEndWorkstationOccupancy();
  const corrigirTurno = useCorrigirTurno();

  // Erro SOBE para o painel mostrar a mensagem do servidor — é por aqui que
  // aparece o 409 de "esta pessoa já ocupa este posto" (o índice único parcial).
  const handleAdicionar = async (dados: OccupantInput) => {
    if (!workstationId) return;
    await adicionar.mutateAsync({ workstationId, data: dados });
  };

  // Encerrar não apaga a linha, mas também não se desfaz: recolocar a pessoa
  // abre uma ocupação NOVA, e a continuidade do turno se perde. Por isso o
  // confirm, no mesmo lugar em que o `handleDelete` do catálogo tem o dele.
  const handleEncerrar = async (ocupante: WorkstationOccupant) => {
    if (!workstationId) return;
    if (!confirm(`Encerrar a ocupação de ${nomeDoOcupante(ocupante)} neste posto?`)) return;
    await encerrar.mutateAsync({ workstationId, occupantId: ocupante.id });
  };

  // Corrigir o turno não pede confirmação: não encerra nada e fica no histórico
  // da ocupação com o de/para. Campo vazio apaga o turno. O erro sobe para o
  // painel, como no adicionar.
  const handleCorrigirTurno = async (ocupante: WorkstationOccupant, turno: string) => {
    if (!workstationId) return;
    await corrigirTurno.mutateAsync({ workstationId, occupantId: ocupante.id, shift: turno.trim() || null });
  };

  return {
    ocupantes: data ?? [],
    // `isPending` só vale quando há posto: com a query desligada ele fica
    // pendente para sempre, e a tabela mostraria "carregando" com o painel fechado.
    carregando: workstationId != null && isPending,
    // A consulta FALHOU: sem isto a lista vazia virava "Posto vago" — dizer que
    // ninguém responde pelos ativos de uma mesa porque a rede caiu é exatamente
    // o alarme falso que esta tela não pode dar.
    erro: workstationId != null && error ? error.message : null,
    view,
    changeView: setView,
    handleAdicionar,
    handleEncerrar,
    handleCorrigirTurno,
  };
}
