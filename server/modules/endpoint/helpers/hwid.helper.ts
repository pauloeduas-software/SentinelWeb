// O HWID é o id da instalação do agente (CV). O agente o manda em minúsculas, e
// a normalização é defesa: toda leitura e toda escrita passam por aqui, e uma
// maiúscula ou um espaço em volta não fazem da mesma máquina dois registros.
export function sanitizeHwid(hwid: string): string {
  return hwid.trim().toLowerCase();
}

/** Forma curta para log: o HWID inteiro só polui a linha. */
export function shortHwid(hwid: string): string {
  return sanitizeHwid(hwid).substring(0, 8);
}
