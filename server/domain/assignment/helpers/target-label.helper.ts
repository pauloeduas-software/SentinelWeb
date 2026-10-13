import type { AlvoPosse } from '../use-cases/resolve-responsibles.usecase';

interface AlvoDaPosse {
  targetType: AlvoPosse;
  targetUser: { name: string } | null;
  targetLocation: { name: string } | null;
}

/**
 * O nome de quem recebeu — "Laura Souza", "Mesa 1".
 *
 * Existia duplicado no histórico do ativo (`asset-history.usecase.ts`) e passou
 * a ser preciso também no e-mail de entrega. Mora aqui porque é leitura do
 * `ASSIGNMENT_SELECT`, que é do domínio de posse, e porque uma segunda cópia
 * divergiria na primeira vez que um dos três alvos mudasse de forma.
 *
 * DEVOLVE `null` QUANDO O ALVO NÃO VEIO, e não um texto de reserva. É o que o
 * histórico precisa: com um rótulo sempre preenchido, a aba escreveria
 * "Entregue para colaborador" no lugar de "Entregue" — uma frase que parece
 * dado e não é.
 *
 * O alvo só vem nulo quando o `select` de quem chamou não o trouxe: as duas FKs
 * são garantidas pelo CHECK de coerência no banco.
 */
export function rotuloDoAlvo(assignment: AlvoDaPosse): string | null {
  if (assignment.targetType === 'USER') return assignment.targetUser?.name ?? null;
  return assignment.targetLocation?.name ?? null;
}
