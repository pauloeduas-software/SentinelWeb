// O ITEM DE ESTOQUE VISTO DE OUTRAS TELAS — a ficha do posto, a do colaborador
// e os links de uma recusa apontam para a ficha do item, onde mora a
// devolução (AE), como `caminhoDaLicenca` faz com a licença.

/**
 * O endereço da ficha de um item. `busca` é quem está com ele — o nome do
 * colaborador ou do posto —, e a aba Responsáveis já abre filtrada.
 */
export function caminhoDoItem(itemId: string, busca?: string): string {
  const parametros = busca ? `?${new URLSearchParams({ quem: busca }).toString()}` : '';
  return `/estoque/${itemId}${parametros}`;
}

/** "3 unidades", "1 unidade". */
export function textoDeUnidades(unidades: number): string {
  return `${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}`;
}
