import type { MatchSignal, Sugestao, SuggestionKind } from '../../../types/reconciliation.types';

// O VOCABULÁRIO DA FILA — dado, não componente.
//
// Fica em `helpers/` pela mesma razão do `abas.helper.ts`: um arquivo que
// exporta componente E constante quebra o fast refresh do Vite.

interface Rotulo {
  titulo: string;
  /** A frase que explica o que ACONTECE ao aceitar. Não é descrição: é aviso. */
  acao: string;
}

/** O que cada tipo de sugestão propõe, em português de quem opera. */
export const ROTULOS: Record<SuggestionKind, Rotulo> = {
  LINK: {
    titulo: 'Vincular máquina ao ativo',
    acao: 'O ativo passa a ter esta máquina. Nada muda nos responsáveis.',
  },
};

/** O sinal que casou, com o nome que ele tem na aba Máquina. */
export const ROTULO_DO_SINAL: Record<MatchSignal, string> = {
  SERIAL: 'Série da BIOS',
  UUID: 'UUID do sistema',
  HOSTNAME: 'Nome da máquina',
};

const ROTULO_DA_EVIDENCIA: Record<string, string> = {
  sinal: 'Sinal',
  valor: 'Valor',
  hostname: 'Nome da máquina',
  hwid: 'HWID',
};

/** "SN-ABC-123 casou com o serial do ativo" — a frase de uma linha da evidência. */
export function resumoDaSugestao(sugestao: Sugestao): string {
  switch (sugestao.kind) {
    case 'LINK':
      return `${sugestao.endpoint.hostname} → ${sugestao.asset?.assetTag ?? 'ativo'}`;
  }
}

/** Onde a busca da aba procura: a máquina e o ativo, e nunca id, pontuação ou nome de campo. */
export function textoDaSugestao({ endpoint, asset }: Sugestao): string {
  return [endpoint.hostname, endpoint.biosSerial, asset?.assetTag, asset?.name, asset?.serial].filter(Boolean).join(' ');
}

/**
 * A evidência como pares legíveis.
 *
 * Achatada e sem tipo fechado porque cada sugestão mostra coisas diferentes e o
 * servidor pode acrescentar um campo sem quebrar a tela. O que NÃO é negociável
 * é ela aparecer: sugestão sem evidência visível é palpite, e ninguém deveria
 * aceitar um palpite que reescreve o inventário.
 */
export function linhasDaEvidencia(evidencia: Record<string, unknown>): { chave: string; valor: string }[] {
  return Object.entries(evidencia)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(([chave, valor]) => ({
      chave: ROTULO_DA_EVIDENCIA[chave] ?? chave,
      valor: chave === 'sinal' ? ROTULO_DO_SINAL[valor as MatchSignal] ?? String(valor) : Array.isArray(valor)
        ? valor.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ')
        : typeof valor === 'object'
          ? JSON.stringify(valor)
          : String(valor),
    }));
}
