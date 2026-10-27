// O ITEM DE ESTOQUE VISTO DE OUTRAS TELAS — a ficha do posto, a do colaborador
// e os links de uma recusa apontam para o detalhe do item, onde mora a
// devolução (AE), como `caminhoDaLicenca` faz com a licença.

/** O endereço do detalhe de um item: a tela de Estoque abre a janela dele. */
export function caminhoDoItem(itemId: string): string {
  return `/estoque?item=${itemId}`;
}

/** "3 unidades", "1 unidade". */
export function textoDeUnidades(unidades: number): string {
  return `${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}`;
}
