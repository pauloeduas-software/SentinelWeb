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

/**
 * A ficha de quem recebeu (CJ): o colaborador, o posto ou o computador do componente e da
 * licença. Sem nenhum, como o posto excluído, a linha não abre nada.
 */
export function caminhoDoResponsavel(alvo: {
  colaborador?: string | null;
  posto?: string | null;
  computador?: string | null;
}): string | null {
  if (alvo.colaborador) return `/colaboradores/${alvo.colaborador}`;
  if (alvo.posto) return `/postos/${alvo.posto}`;
  if (alvo.computador) return `/computadores/${alvo.computador}`;
  return null;
}
