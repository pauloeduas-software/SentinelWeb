import type { Assignment } from '../../../../domain/shared/posse.types';

// Para QUEM uma posse aponta, em texto — função pura, fora do JSX.
//
// O alvo é polimórfico (pessoa, posto ou outro ativo) e as três relações
// embutidas são OPCIONAIS no contrato: o histórico pode ser servido enxuto. Por
// isso a leitura cai para a FK quando a relação não veio, em vez de mostrar
// vazio — um id curto ainda identifica a linha; nada nenhum.

const TRACO = '—';

export function rotuloDoAlvo(assignment: Assignment): string {
  if (assignment.targetType === 'USER') {
    return assignment.targetUser?.name ?? curto(assignment.targetUserId);
  }

  if (assignment.targetType === 'LOCATION') {
    return assignment.targetLocation?.name ?? curto(assignment.targetLocationId);
  }

  const ativo = assignment.targetAsset;
  if (!ativo) return curto(assignment.targetAssetId);
  return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
}

/** "no posto Mesa 1", "preso a ETI-0004" — vazio quando o alvo é a pessoa. */
export function comoChegouAoAlvo(assignment: Assignment): string | null {
  if (assignment.targetType === 'LOCATION') return `no posto ${rotuloDoAlvo(assignment)}`;
  if (assignment.targetType === 'ASSET') return `preso a ${rotuloDoAlvo(assignment)}`;
  return null;
}

/** A posse está aberta? É `checkinAt` nulo, e é o que decide o rótulo da linha. */
export function estaAberta(assignment: Assignment): boolean {
  return assignment.checkinAt === null;
}

function curto(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : TRACO;
}
