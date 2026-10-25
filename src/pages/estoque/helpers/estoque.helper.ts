import type { AcaoDoMovimento, ItemDeEstoque } from '../../../domain/shared/stock.types';

// O VOCABULÁRIO DO ESTOQUE — o aviso do saldo e o rótulo de cada ação da linha
// do tempo. Local à tela: o que só faz sentido aqui não mora no helper
// compartilhado.

/**
 * O saldo não tem cor pelo valor — zero e positivo são só números. A única
 * marca é o NEGATIVO, que é aviso e não dado: o servidor calcula
 * `disponivel = qty − fora` sem travar no zero (`stock-balance.helper.ts`), e
 * um negativo é a inconsistência (saída gravada fora da trava) que a tela
 * precisa mostrar.
 */
export function classeDoSaldo(item: Pick<ItemDeEstoque, 'disponivel'>): string {
  return item.disponivel < 0 ? 'text-status-danger' : '';
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
