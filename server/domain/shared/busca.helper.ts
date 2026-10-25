// A BUSCA POR TEXTO das listagens — o `contains` do Prisma, que no Postgres
// vira `ILIKE '%…%'`.
//
// O Prisma NÃO escapa os curingas do texto: buscar "_" virava `ILIKE '%_%'` e
// trazia todas as linhas, e "50%" achava "500". A barra é o caractere de escape
// padrão do `ILIKE`.
//
// `mode: 'insensitive'` é obrigatório: sem ele buscar "dell" não acha "Dell".

/** Escapa os curingas do `ILIKE`: `%`, `_` e a própria barra. */
export function escaparCuringas(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/** O filtro "contém este texto": sem diferença de maiúscula, e o texto ao pé da letra. */
export function contemTexto(q: string) {
  return { contains: escaparCuringas(q), mode: 'insensitive' } as const;
}
