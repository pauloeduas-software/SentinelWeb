// Diferença entre o antes e o depois de uma edição — função pura, sem I/O.
//
// A lista de campos é explícita de propósito: sem ela, um `assignedTo` (objeto
// aninhado) entraria na comparação e `===` entre duas instâncias sempre difere,
// marcando como "alterado" um campo que ninguém tocou.
//
// Só entra no resultado o que REALMENTE mudou: gravar o registro inteiro a cada
// edição transformaria o histórico em cópia da tabela.

/** O resultado vai para uma coluna JsonB — só escalar entra. */
export type ValorJson = string | number | boolean | null;

// `type`, não `interface`: interface não ganha índice implícito e por isso não é
// atribuível ao `InputJsonValue` do Prisma.
export type CampoAlterado = {
  de: ValorJson;
  para: ValorJson;
};

export type Changes = Record<string, CampoAlterado>;

export function buildChanges(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  campos: readonly string[],
): Changes {
  const mudancas: Changes = {};

  for (const campo of campos) {
    const valorAntigo = antes[campo];
    const valorNovo = depois[campo];

    // Data não é comparável com ===: duas instâncias do mesmo instante são
    // objetos diferentes.
    const iguais =
      valorAntigo instanceof Date && valorNovo instanceof Date
        ? valorAntigo.getTime() === valorNovo.getTime()
        : valorAntigo === valorNovo;

    if (!iguais) {
      mudancas[campo] = { de: normalizar(valorAntigo), para: normalizar(valorNovo) };
    }
  }

  return mudancas;
}

function normalizar(valor: unknown): ValorJson {
  if (valor instanceof Date) return valor.toISOString();
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  // Campo não escalar não deveria estar na lista de auditados; converter em vez
  // de quebrar o log se alguém acrescentar um.
  return String(valor);
}
