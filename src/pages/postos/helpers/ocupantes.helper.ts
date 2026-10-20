import { formatarData } from '../../helpers/format.helper';
import type { OccupantInput } from '../../../domain/occupancy/occupancy.queries';
import type { WorkstationOccupant } from '../../../domain/shared/posse.types';

// Leitura das ocupações de um posto para a tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md). Camada 2 de docs/referencia/modelo-de-posse.md.

/** O nome da pessoa. Sem a relação embutida, o id é o que sobra de honesto. */
export function nomeDoOcupante(ocupante: WorkstationOccupant): string {
  return ocupante.person?.name ?? ocupante.personId;
}

/** Turno como foi digitado ("Manhã", "12x36 A"), ou um traço. */
export function turnoDoOcupante(ocupante: WorkstationOccupant): string {
  return ocupante.shift?.trim() ? ocupante.shift : '—';
}

/**
 * "desde 03/03/2026" enquanto aberta; "03/03/2026 › 15/04/2026" quando
 * encerrada.
 *
 * As duas formas são diferentes de propósito: uma ocupação aberta tem só um
 * lado, e escrever "03/03/2026 – " deixaria um traço pendurado que se lê como
 * dado faltando.
 */
export function periodoDaOcupacao(ocupante: WorkstationOccupant): string {
  const inicio = formatarData(ocupante.startedAt);
  return ocupante.endedAt ? `${inicio} › ${formatarData(ocupante.endedAt)}` : `desde ${inicio}`;
}

/** Ocupação ABERTA — `endedAt` nulo. É quem responde pelo posto agora. */
export function estaAberta(ocupante: WorkstationOccupant): boolean {
  return ocupante.endedAt == null;
}

/**
 * Formulário → corpo de `POST /workstations/:id/occupants`.
 *
 * Campo vazio vira AUSENTE, não `''`: um `startedAt` em branco precisa dizer
 * "use agora", e uma string vazia diria "esta data aqui", que é inválida.
 */
export function montarOcupante(valores: {
  personId: string;
  shift: string;
  startedAt: string;
  notes: string;
}): OccupantInput {
  const corpo: OccupantInput = { personId: valores.personId };

  if (valores.shift.trim()) corpo.shift = valores.shift.trim();
  if (valores.startedAt) corpo.startedAt = valores.startedAt;
  if (valores.notes.trim()) corpo.notes = valores.notes.trim();

  return corpo;
}
