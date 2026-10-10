import type { Sugestao, SuggestionKind } from '../../../domain/shared/reconciliation.types';

// O VOCABULÁRIO DA FILA — dado, não componente.
//
// Fica em `helpers/` pela mesma razão do `abas.helper.ts`: um arquivo que
// exporta componente E constante quebra o fast refresh do Vite.

interface Rotulo {
  titulo: string;
  /** A frase que explica o que ACONTECE ao aceitar. Não é descrição: é aviso. */
  acao: string;
  cor: string;
}

/** O que cada tipo de sugestão propõe, em português de quem opera. */
export const ROTULOS: Record<SuggestionKind, Rotulo> = {
  LINK: {
    titulo: 'Vincular máquina ao ativo',
    acao: 'O ativo passa a ter esta máquina. Nada muda na posse.',
    cor: 'text-status-info',
  },
};

/** "SN-ABC-123 casou com o serial do ativo" — a frase de uma linha da evidência. */
export function resumoDaSugestao(sugestao: Sugestao): string {
  switch (sugestao.kind) {
    case 'LINK':
      return `${sugestao.endpoint.hostname} → ${sugestao.asset?.assetTag ?? 'ativo'}`;
  }
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
      chave,
      valor: Array.isArray(valor)
        ? valor.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ')
        : typeof valor === 'object'
          ? JSON.stringify(valor)
          : String(valor),
    }));
}
