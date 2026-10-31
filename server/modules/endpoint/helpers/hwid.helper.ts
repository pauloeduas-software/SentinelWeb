// O HWID é a identidade da máquina e chega do agente com grafia instável
// (maiúsculas, espaço em volta). Toda leitura e toda escrita passam por aqui —
// senão a mesma máquina vira dois registros no banco.
export function sanitizeHwid(hwid: string): string {
  return hwid.trim().toLowerCase();
}

/** Forma curta para log: o HWID inteiro só polui a linha. */
export function shortHwid(hwid: string): string {
  return sanitizeHwid(hwid).substring(0, 8);
}
