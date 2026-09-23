// Em JavaScript, o que chega num `catch` é `unknown`: pode ser um Error, um
// objeto do Prisma, uma string ou qualquer coisa que alguém tenha lançado.
// Estas duas funções são o ÚNICO lugar que espia dentro dele — em vez de
// espalhar `catch (error: any)` por todo o código.

export function errorProp(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

/** Código do erro (`P2025` do Prisma, `FST_ERR_*` do Fastify), quando houver. */
export function errorCode(error: unknown): string | undefined {
  const code = errorProp(error, 'code');
  return typeof code === 'string' ? code : undefined;
}
