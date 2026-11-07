import type { PosseResolvida } from '../types/posse.types';

/**
 * Quem responde, numa linha: "Posto Mesa 1" ou "Laura Souza" (BL).
 *
 * É o alvo da entrega, e nunca quem ocupa o posto: esse só aparece pendurado no
 * posto, na aba Responsáveis. Vazio quando o ativo não foi entregue.
 */
export function nomeDoResponsavel(posse: Pick<PosseResolvida, 'targetType' | 'targetLabel'> | null | undefined): string {
  const alvo = posse?.targetLabel ?? '';
  return alvo && posse?.targetType === 'WORKSTATION' ? `Posto ${alvo}` : alvo;
}
