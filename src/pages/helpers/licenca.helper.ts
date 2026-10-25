import type { Licenca, StatusDaLicenca } from '../../domain/shared/license.types';
import { formatarMoeda } from './format.helper';

// A LICENÇA LIDA EM TEXTO — funções puras compartilhadas pelas três telas que
// mostram licença: a de Licenças, a aba Licenças do ativo e a ficha do
// colaborador. Moram aqui, e não em `licencas/helpers`, para as três dizerem a
// mesma frase.

/**
 * O endereço do detalhe de uma licença: a tela de Licenças abre a janela dela.
 * É por ele que o ativo e a ficha do colaborador apontam para a licença — a
 * devolução mora lá.
 */
export function caminhoDaLicenca(licenseId: string): string {
  return `/licencas?licenca=${licenseId}`;
}

/** O status no vocabulário da tela: `EXPIRADA` é a que a tela chama de vencida. */
export const ROTULO_DO_STATUS: Record<StatusDaLicenca, string> = {
  ATIVA: 'Ativa',
  VENCENDO: 'Vencendo',
  EXPIRADA: 'Vencida',
  ENCERRADA: 'Encerrada',
};

/**
 * O valor da compra é o TOTAL pago; ao lado, quanto saiu cada licença —
 * "R$ 5.000,00 (R$ 500,00 por licença)". Com uma licença só, os dois são o
 * mesmo número, e a conta fica de fora.
 */
export function textoDoValorDaCompra(licenca: Pick<Licenca, 'purchaseCost' | 'seatsTotal'>): string {
  const total = formatarMoeda(licenca.purchaseCost);
  const numero = Number(licenca.purchaseCost);
  if (licenca.purchaseCost == null || Number.isNaN(numero) || licenca.seatsTotal <= 1) return total;
  return `${total} (${formatarMoeda(numero / licenca.seatsTotal)} por licença)`;
}

/**
 * O prazo, em português, a partir do número que o SERVIDOR calculou.
 *
 * A conta não é refeita aqui de propósito: o "hoje" do navegador pode não ser o
 * do servidor, que conta no dia de Brasília.
 */
export function textoDoPrazo(dias: number | null): string {
  if (dias === null) return 'sem vencimento';
  if (dias < 0) return `venceu há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'vence hoje';
  return `vence em ${dias} dia${dias === 1 ? '' : 's'}`;
}

/** "10 compradas · 7 em uso · 3 livres". */
export function resumoDaContagem(licenca: Pick<Licenca, 'seatsTotal' | 'emUso' | 'livres'>): string {
  return [
    `${licenca.seatsTotal} ${licenca.seatsTotal === 1 ? 'comprada' : 'compradas'}`,
    `${licenca.emUso} em uso`,
    `${licenca.livres} ${licenca.livres === 1 ? 'livre' : 'livres'}`,
  ].join(' · ');
}
