import type { AcaoDoMovimento, ItemDeEstoque } from '../../../domain/shared/stock.types';

// O VOCABULÁRIO DO ESTOQUE — cor do saldo e rótulo de cada ação da linha do
// tempo. Local à tela, como `licenca.helper.ts`: o que só faz sentido aqui não
// mora no helper compartilhado.

/**
 * Vermelho quando zerou OU ficou negativo, verde enquanto sobra. Sem piso —
 * o item não tem coluna de mínimo (ao contrário da licença).
 *
 * `<= 0`, e não `=== 0`: o servidor calcula `disponivel = qty − fora` sem
 * travar no zero (`stock-balance.helper.ts`), de propósito — um negativo é a
 * inconsistência (saída gravada fora da trava) que a tela precisa mostrar, não
 * esconder atrás da mesma cor de um saldo saudável.
 */
export function corDoSaldo(item: Pick<ItemDeEstoque, 'disponivel'>): string {
  return item.disponivel <= 0 ? '#ef4444' : '#22c55e';
}

export const ROTULO_DA_ACAO: Record<AcaoDoMovimento, string> = {
  ENTRADA: 'Entrada',
  BAIXA: 'Baixa',
  SAIDA: 'Saída',
  DEVOLUCAO: 'Devolução',
};

export const COR_DA_ACAO: Record<AcaoDoMovimento, string> = {
  ENTRADA: 'text-status-success',
  BAIXA: 'text-status-danger',
  SAIDA: 'text-text-secondary',
  DEVOLUCAO: 'text-status-info',
};
