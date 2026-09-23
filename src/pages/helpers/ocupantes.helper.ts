import { formatarData } from './format.helper';
import type { OccupantInput } from '../../domain/occupancy/occupancy.queries';
import type { LocationOccupant } from '../../domain/shared/posse.types';

// Leitura das ocupações de um posto para a tela — funções puras, fora do JSX
// (docs/ARQUITETURA.md). Camada 2 de docs/MODELO-POSSE.md.
//
// Mora em `pages/helpers/`, e não na pasta de uma página, porque a MESMA
// ocupação é lida em dois lugares: o painel de ocupantes da aba Localizações e
// o detalhe do posto em /postos. Uma cópia por tela faria "desde 03/03/2026"
// virar dois formatos no primeiro ajuste.

/** O nome da pessoa. Sem a relação embutida, o id é o que sobra de honesto. */
export function nomeDoOcupante(ocupante: LocationOccupant): string {
  return ocupante.user?.name ?? ocupante.userId;
}

/** Turno como foi digitado ("Manhã", "12x36 A"), ou um traço. */
export function turnoDoOcupante(ocupante: LocationOccupant): string {
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
export function periodoDaOcupacao(ocupante: LocationOccupant): string {
  const inicio = formatarData(ocupante.startedAt);
  return ocupante.endedAt ? `${inicio} › ${formatarData(ocupante.endedAt)}` : `desde ${inicio}`;
}

/** Ocupação ABERTA — `endedAt` nulo. É quem responde pelo posto agora. */
export function estaAberta(ocupante: LocationOccupant): boolean {
  return ocupante.endedAt == null;
}

/**
 * Formulário → corpo de `POST /locations/:id/occupants`.
 *
 * Campo vazio vira AUSENTE, não `''`: um `startedAt` em branco precisa dizer
 * "use agora", e uma string vazia diria "esta data aqui", que é inválida.
 */
export function montarOcupante(valores: {
  userId: string;
  shift: string;
  startedAt: string;
  notes: string;
}): OccupantInput {
  const corpo: OccupantInput = { userId: valores.userId };

  if (valores.shift.trim()) corpo.shift = valores.shift.trim();
  if (valores.startedAt) corpo.startedAt = valores.startedAt;
  if (valores.notes.trim()) corpo.notes = valores.notes.trim();

  return corpo;
}
