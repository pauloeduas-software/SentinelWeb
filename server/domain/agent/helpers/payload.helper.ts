// O agente C# manda os campos em PascalCase; versões antigas mandam camelCase.
// Em vez de espalhar `payload.Hwid || payload.hwid` por todo lado, a leitura do
// payload cru acontece só aqui.

/** Lê um campo aceitando PascalCase ou camelCase, na ordem dos nomes dados. */
export function readField(payload: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    const camel = name.charAt(0).toLowerCase() + name.slice(1);
    if (payload[pascal] !== undefined && payload[pascal] !== null) return payload[pascal];
    if (payload[camel] !== undefined && payload[camel] !== null) return payload[camel];
  }
  return undefined;
}

export function readString(payload: Record<string, unknown>, ...names: string[]): string | null {
  const value = readField(payload, ...names);
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readNumber(payload: Record<string, unknown>, ...names: string[]): number {
  const value = Number(readField(payload, ...names));
  return Number.isFinite(value) ? value : 0;
}

// Bytes de RAM chegam como número grande (ou string). `BigInt(1.5)` estoura,
// então o valor é truncado antes de virar BigInt.
export function readBigInt(payload: Record<string, unknown>, ...names: string[]): bigint {
  const value = readField(payload, ...names);
  if (typeof value === 'bigint') return value;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? BigInt(Math.trunc(asNumber)) : 0n;
}

/**
 * Bytes que podem simplesmente NÃO TER VINDO — as specs coletadas da F7.
 *
 * Separado do `readBigInt` acima porque o zero dele é uma resposta legítima para
 * uso de RAM ("a máquina está usando 0 bytes agora" é improvável, mas é uma
 * medida) e é uma MENTIRA para total de RAM: gravar `ramTotalBytes = 0` para um
 * agente velho afirma que a máquina tem zero bytes de memória, que é diferente
 * de "esta versão do agente não coleta isso". A diferença aparece na primeira
 * soma do painel de cobertura.
 */
export function readOptionalBigInt(payload: Record<string, unknown>, ...names: string[]): bigint | null {
  const value = readField(payload, ...names);
  if (value === undefined) return null;
  if (typeof value === 'bigint') return value;

  // STRING VAZIA NÃO É ZERO. `Number('')` é `0`, finito e não negativo — sem
  // esta linha, um agente que manda `"RamTotalBytes": ""` grava "esta máquina
  // tem zero bytes de RAM", que é exatamente a mentira que esta função existe
  // para não contar. O mesmo vale para string de espaços.
  if (typeof value === 'string' && value.trim() === '') return null;

  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  return BigInt(Math.trunc(asNumber));
}
