import type { Assignment } from '../../../../types/posse.types';

// Para QUEM uma posse aponta, em texto — função pura, fora do JSX.
//
// O alvo é polimórfico (pessoa ou posto) e as duas relações embutidas são
// OPCIONAIS no contrato: o histórico pode ser servido enxuto. Por isso a leitura
// cai para a FK quando a relação não veio, em vez de mostrar vazio — um id curto
// ainda identifica a linha; nada nenhum.

const TRACO = '—';

export function rotuloDoAlvo(assignment: Assignment): string {
  if (assignment.targetType === 'PERSON') {
    return assignment.targetPerson?.name ?? curto(assignment.targetPersonId);
  }

  // O posto excluído deixou o nome por escrito: a posse já devolvida perdeu a
  // ligação com o cadastro, e é este campo que diz por onde o ativo passou.
  return assignment.targetWorkstation?.name ?? assignment.targetWorkstationName ?? curto(assignment.targetWorkstationId);
}

/** "no posto Mesa 1" — vazio quando o alvo é a pessoa. */
export function comoChegouAoAlvo(assignment: Assignment): string | null {
  return assignment.targetType === 'WORKSTATION' ? `no posto ${rotuloDoAlvo(assignment)}` : null;
}

/**
 * O POSTO para onde este ativo foi, quando há um — e `null` quando não há.
 *
 * Existe para a aba Posse poder LEVAR até ele: a ficha dizia o nome da mesa e
 * parava ali, e quem precisava ver o resto da mesa (os outros ativos, quem a
 * ocupa, em que turno) tinha que ir a `/postos` e procurar pelo nome.
 *
 * Duas condições, e cada uma recusa um caso diferente:
 *
 *   a posse ABERTA     — o histórico tem mesas antigas, e levar a elas diria
 *                        que o ativo está lá;
 *   alvo WORKSTATION   — pessoa não tem ficha de posto.
 *
 * A relação embutida é opcional no contrato (o histórico pode vir enxuto), então
 * sem ela a resposta é `null`: sem id não há para onde ir, e o nome continua
 * aparecendo como texto.
 */
export function postoDaPosseAberta(assignments: readonly Assignment[]): { id: string; name: string } | null {
  const aberta = assignments.find(estaAberta);
  if (!aberta || aberta.targetType !== 'WORKSTATION') return null;

  const posto = aberta.targetWorkstation;
  return posto ? { id: posto.id, name: posto.name } : null;
}

/** A posse está aberta? É `checkinAt` nulo, e é o que decide o rótulo da linha. */
export function estaAberta(assignment: Assignment): boolean {
  return assignment.checkinAt === null;
}

function curto(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : TRACO;
}
