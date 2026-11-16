// A leitura do payload cru acontece só aqui: campo ausente ou nulo vira
// `undefined`, e quem chama decide o padrão.

/** Lê um campo pelo nome que o SentinelAgente manda, em PascalCase. */
export function readField(payload: Record<string, unknown>, name: string): unknown {
  const value = payload[name];
  return value === null ? undefined : value;
}

export function readString(payload: Record<string, unknown>, name: string): string | null {
  const value = readField(payload, name);
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Uma lista do payload; o que não for lista vale como ausente. */
export function readList(payload: Record<string, unknown>, name: string): unknown[] | undefined {
  const value = readField(payload, name);
  return Array.isArray(value) ? value : undefined;
}

export function readNumber(payload: Record<string, unknown>, name: string): number {
  const value = Number(readField(payload, name));
  return Number.isFinite(value) ? value : 0;
}

// Bytes de RAM chegam como número grande (ou string). `BigInt(1.5)` estoura,
// então o valor é truncado antes de virar BigInt.
export function readBigInt(payload: Record<string, unknown>, name: string): bigint {
  const value = readField(payload, name);
  if (typeof value === 'bigint') return value;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? BigInt(Math.trunc(asNumber)) : 0n;
}
