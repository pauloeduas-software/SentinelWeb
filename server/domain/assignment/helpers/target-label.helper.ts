import type { AlvoPosse } from '../use-cases/resolve-responsibles.usecase';

interface AlvoDaPosse {
  targetType: AlvoPosse;
  targetUser: { name: string } | null;
  targetLocation: { name: string } | null;
  targetAsset: { assetTag: string; name: string | null } | null;
}

/**
 * O nome de quem recebeu — "Laura Souza", "Mesa 1", "ATV-00012 — Dell Latitude".
 *
 * Existia duplicado no histórico do ativo (`asset-history.usecase.ts`) e passou
 * a ser preciso também no e-mail de entrega. Mora aqui porque é leitura do
 * `ASSIGNMENT_SELECT`, que é do domínio de posse, e porque uma segunda cópia
 * divergiria na primeira vez que um dos três alvos mudasse de forma.
 *
 * DEVOLVE `null` QUANDO O ALVO NÃO VEIO, e não um texto de reserva. É o que o
 * histórico precisa: com um rótulo sempre preenchido, a aba escreveria
 * "Entregue para colaborador" no lugar de "Entregue" — uma frase que parece
 * dado e não é. Quem quiser texto de reserva pede por `rotuloDoAlvoOuPadrao`.
 *
 * O alvo só vem nulo quando o `select` de quem chamou não o trouxe: as três FKs
 * são garantidas pelo CHECK de coerência no banco.
 */
export function rotuloDoAlvo(assignment: AlvoDaPosse): string | null {
  if (assignment.targetType === 'USER') return assignment.targetUser?.name ?? null;
  if (assignment.targetType === 'LOCATION') return assignment.targetLocation?.name ?? null;
  if (!assignment.targetAsset) return null;

  const { assetTag, name } = assignment.targetAsset;
  return name ? `${assetTag} — ${name}` : assetTag;
}

/**
 * O mesmo rótulo, com texto de reserva por tipo de alvo.
 *
 * Para o CORPO DO E-MAIL, onde a frase precisa fechar: "entregue para " seguido
 * de nada é pior do que "entregue para o colaborador".
 */
export function rotuloDoAlvoOuPadrao(assignment: AlvoDaPosse): string {
  const rotulo = rotuloDoAlvo(assignment);
  if (rotulo) return rotulo;

  if (assignment.targetType === 'USER') return 'o colaborador';
  if (assignment.targetType === 'LOCATION') return 'a localização';
  return 'o ativo detentor';
}
