// A MÁQUINA VISTA DE OUTRAS TELAS — a aba Máquina e os links de uma recusa
// apontam para ela, como `caminhoDoItem` faz com o item de estoque.

/**
 * O endereço de uma máquina vinculada. Descobertas não tem ficha de máquina: é a
 * lista Vinculadas já buscada pelo nome, onde mora o Desvincular.
 */
export function caminhoDaMaquina(hostname: string): string {
  return `/descobertas?aba=com&busca=${encodeURIComponent(hostname)}`;
}
