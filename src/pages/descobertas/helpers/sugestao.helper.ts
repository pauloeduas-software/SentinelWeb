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

/**
 * O que cada tipo de sugestão propõe, em português de quem opera.
 *
 * `OCCUPANCY` e `SHARED_POST` têm a frase mais longa de propósito: são as duas
 * que o operador nunca viu em outro sistema, porque nenhum outro tem onde
 * guardar a resposta (docs/FASE-7-PLANO-ITAM.md, D47 e D48).
 */
export const ROTULOS: Record<SuggestionKind, Rotulo> = {
  LINK: {
    titulo: 'Vincular máquina ao ativo',
    acao: 'O ativo passa a ter esta máquina. Nada muda na posse.',
    cor: 'text-status-info',
  },
  MERGE: {
    titulo: 'Fundir máquinas duplicadas',
    acao: 'A telemetria e o histórico migram para a máquina de destino. Não há como desfazer.',
    cor: 'text-status-warning',
  },
  CHECKOUT: {
    titulo: 'Entregar o ativo à pessoa',
    acao: 'Abre a posse no nome dela. Se o ativo já estiver com outra pessoa, a posse anterior é devolvida antes.',
    cor: 'text-status-success',
  },
  OCCUPANCY: {
    titulo: 'Registrar ocupação do posto',
    acao: 'A pessoa passa a ocupar o posto. O ativo continua sendo do posto — a posse dele não muda.',
    cor: 'text-status-success',
  },
  SHARED_POST: {
    titulo: 'Promover a posto compartilhado',
    acao: 'O ativo passa a ser do posto e as pessoas viram ocupantes dele, com turno. A posse pessoal é devolvida.',
    cor: 'text-status-warning',
  },
};

/** "SN-ABC-123 casou com o serial do ativo" — a frase de uma linha da evidência. */
export function resumoDaSugestao(sugestao: Sugestao): string {
  switch (sugestao.kind) {
    case 'LINK':
      return `${sugestao.endpoint.hostname} → ${sugestao.asset?.assetTag ?? 'ativo'}`;
    case 'MERGE':
      return `${sugestao.endpoint.hostname} → ${sugestao.mergeInto?.hostname ?? 'máquina cadastrada'}`;
    case 'CHECKOUT':
      return `${sugestao.asset?.assetTag ?? 'ativo'} → ${sugestao.targetUser?.name ?? 'pessoa'}`;
    case 'OCCUPANCY':
      return `${sugestao.targetUser?.name ?? 'pessoa'} → ${sugestao.targetLocation?.name ?? 'posto'}`;
    case 'SHARED_POST':
      return `${sugestao.asset?.assetTag ?? 'ativo'} → posto compartilhado`;
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
