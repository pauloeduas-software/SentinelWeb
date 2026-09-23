import { useState } from 'react';
import {
  useAddLocationOccupant, useEndLocationOccupancy, useLocationOccupantsQuery,
  type OccupantInput,
} from '../../domain/occupancy/occupancy.queries';
import type { LocationOccupant, OccupantView } from '../../domain/shared/posse.types';
import { nomeDoOcupante } from '../helpers/ocupantes.helper';

// Os OCUPANTES de um posto — Camada 2 de docs/MODELO-POSSE.md.
//
// Hook COMPARTILHADO entre duas telas: o painel da aba Localizações e o detalhe
// do posto em /postos. É a mesma operação — colocar alguém na mesa e tirar —, e
// uma cópia por tela significaria dois lugares para lembrar que encerrar não é
// apagar e que a responsabilidade derivada precisa ser invalidada depois.
//
// Recebe o ID do posto, não o registro: quem chama tem o dado numa forma
// diferente em cada tela (uma linha de catálogo lá, um posto aqui), e o hook
// não precisa conhecer nenhuma das duas. `null` DESLIGA a query — `enabled`
// resolve isso sem hook condicional, que as regras do React proíbem.
export function useOcupantes(locationId: string | null) {
  const [view, setView] = useState<OccupantView>('current');

  const { data, isPending } = useLocationOccupantsQuery(locationId, view);
  const adicionar = useAddLocationOccupant();
  const encerrar = useEndLocationOccupancy();

  // Erro SOBE para o painel mostrar a mensagem do servidor — é por aqui que
  // aparece o 409 de "esta pessoa já ocupa este posto" (o índice único parcial).
  const handleAdicionar = async (dados: OccupantInput) => {
    if (!locationId) return;
    await adicionar.mutateAsync({ locationId, data: dados });
  };

  // Encerrar não apaga a linha, mas também não se desfaz: recolocar a pessoa
  // abre uma ocupação NOVA, e a continuidade do turno se perde. Por isso o
  // confirm, no mesmo lugar em que o `handleDelete` do catálogo tem o dele.
  const handleEncerrar = async (ocupante: LocationOccupant) => {
    if (!locationId) return;
    if (!confirm(`Encerrar a ocupação de ${nomeDoOcupante(ocupante)} neste posto?`)) return;
    await encerrar.mutateAsync({ locationId, occupantId: ocupante.id });
  };

  return {
    ocupantes: data ?? [],
    // `isPending` só vale quando há posto: com a query desligada ele fica
    // pendente para sempre, e a tabela mostraria "carregando" com o painel fechado.
    carregando: locationId != null && isPending,
    view,
    changeView: setView,
    handleAdicionar,
    handleEncerrar,
  };
}
