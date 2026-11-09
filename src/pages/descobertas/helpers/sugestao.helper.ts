import type { MatchSignal, Sugestao } from '../../../types/reconciliation.types';

// O VOCABULÁRIO DA FILA — dado, não componente.
//
// Fica em `helpers/` pela mesma razão do `abas.helper.ts`: um arquivo que
// exporta componente E constante quebra o fast refresh do Vite.

/** O sinal que casou, com o nome que ele tem na aba Máquina. */
export const ROTULO_DO_SINAL: Record<MatchSignal, string> = {
  SERIAL: 'Série da BIOS',
  UUID: 'UUID do sistema',
  HOSTNAME: 'Nome da máquina',
};

/**
 * O valor que casou, lido da evidência. Ela é `unknown` de propósito
 * (`reconciliation.types.ts`): o que não for texto não aparece.
 */
export function valorDoSinal({ evidence }: Sugestao): string | null {
  return typeof evidence.valor === 'string' && evidence.valor !== '' ? evidence.valor : null;
}

/** Onde a busca da aba procura: a máquina e o ativo, e nunca id, pontuação ou nome de campo. */
export function textoDaSugestao({ endpoint, asset }: Sugestao): string {
  return [endpoint.hostname, endpoint.biosSerial, asset?.assetTag, asset?.name, asset?.serial].filter(Boolean).join(' ');
}
