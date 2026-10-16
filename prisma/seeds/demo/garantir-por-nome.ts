/**
 * Cria a linha só se não existir NENHUMA com o mesmo nome, sem diferença de
 * maiúscula.
 *
 * Não é `upsert` como no seed principal, de propósito: o `upsert` procura o
 * nome EXATO, e o catálogo recusa "dell" quando há "Dell"
 * (`catalog/helpers/nome-unico.helper.ts`). Quem já cadastrou "DELL" pela tela
 * ganharia um segundo fabricante ao rodar a demonstração. E nada aqui é
 * atualizado: o que a pessoa editou pela interface fica como está.
 *
 * Devolve `true` quando criou — o resumo do seed conta o que entrou.
 */
export async function garantirPorNome(
  buscar: (nome: string) => Promise<unknown>,
  criar: () => Promise<unknown>,
  nome: string,
): Promise<boolean> {
  if (await buscar(nome)) return false;
  await criar();
  return true;
}

/** O `where` de nome sem diferença de maiúscula, o mesmo do catálogo. */
export const mesmoNome = (nome: string) => ({ name: { equals: nome, mode: 'insensitive' as const } });
