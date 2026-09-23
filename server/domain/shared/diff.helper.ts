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
    // Comparar DEPOIS de normalizar, nunca antes.
    //
    // `===` entre dois objetos compara identidade, não valor — e as colunas que
    // chegam aqui como objeto são mais de uma: `Date` (duas instâncias do mesmo
    // instante) e `Prisma.Decimal` (`purchaseCost`, `floorValue`). Comparar cru
    // marcava esses campos como alterados em TODA edição, e como o chamador só
    // grava o log quando há mudança, um PUT que não mudou nada ainda assim
    // escrevia `{"purchaseCost":{"de":"1234.56","para":"1234.56"}}` no
    // histórico.
    //
    // Normalizar primeiro resolve os dois de uma vez, e resolve de antemão
    // qualquer coluna-objeto que apareça depois — `Decimal` entrou na F1 sem
    // que o caso especial de `Date`, escrito na F0, desse qualquer sinal.
    const de = normalizar(antes[campo]);
    const para = normalizar(depois[campo]);

    if (de !== para) mudancas[campo] = { de, para };
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

/**
 * Retrato dos campos de um registro, para o log de CREATE e de DELETE.
 *
 * Existe separado do `buildChanges` porque nesses dois casos não há "antes e
 * depois": o valor é o próprio estado. Usa a mesma normalização, então um
 * `Decimal` vira string aqui pelo mesmo caminho que vira ali.
 */
export function buildSnapshot(
  registro: Record<string, unknown>,
  campos: readonly string[],
): Record<string, ValorJson> {
  const retrato: Record<string, ValorJson> = {};
  for (const campo of campos) retrato[campo] = normalizar(registro[campo]);
  return retrato;
}
