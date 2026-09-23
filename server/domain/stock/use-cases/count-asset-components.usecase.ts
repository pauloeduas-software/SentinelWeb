import type { ClienteEstoque } from '../helpers/stock-kind.helper';

/**
 * Quantas unidades de componente estão DENTRO deste ativo agora.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * É o que recusa o `DELETE` de um ativo com peça dentro (F5).
 *
 * Sem ela, mandar o notebook para a lixeira deixa as 4 unidades de RAM presas:
 * o `disponivel` do componente continua descontado — a contagem de saldo olha
 * `component_assets`, que não tem `deletedAt` e não sabe que o ativo sumiu — e a
 * tela que ofereceria a retirada (`GET /api/assets/:id/components`) responde 404,
 * porque o ativo não existe mais para o inventário. As unidades saem do estoque
 * sem nunca voltarem, e nada acusa.
 *
 * É a metade que faltava do 409 que `deleteStockItem` já dava do outro lado:
 * *"este acessório ainda tem N unidades fora do estoque"*. Aqui a frase é a
 * mesma regra vista do lado do ativo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SOMA de `assignedQty`, não `COUNT` de linhas: a pergunta da frase é quantas
 * UNIDADES estão presas, e duas instalações de 2 pentes são 4 peças, não 2.
 *
 * Recebe o cliente (global ou de transação) porque o `DELETE` conta DENTRO da
 * transação que apaga, depois da trava da linha do ativo — contar por fora
 * deixaria a janela que a trava existe para fechar.
 */
export async function contarComponentesInstalados(
  client: ClienteEstoque,
  assetId: string,
): Promise<number> {
  const { _sum } = await client.componentAsset.aggregate({
    where: { assetId, detachedAt: null },
    _sum: { assignedQty: true },
  });
  return _sum.assignedQty ?? 0;
}
