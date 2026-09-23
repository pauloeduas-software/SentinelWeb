// Atraso de devolução — função pura, sem I/O (docs/ARQUITETURA.md).

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Quantos dias INTEIROS a devolução já passou do prazo.
 *
 * `Math.floor` e não `round`: vencido hoje de manhã é **0 dia de atraso**, e
 * arredondar para cima diria "1 dia" para quem ainda pode devolver antes do fim
 * do expediente — a primeira mensagem que o operador leria já seria falsa.
 *
 * A conta é em UTC dos dois lados. `expectedCheckinAt` é gravado à meia-noite
 * UTC (`dataOpcional`, server/domain/shared/fields.schema.ts) porque prazo é dia
 * de calendário, não instante; comparar com hora local faria o número virar ao
 * cruzar a meia-noite do fuso, e num fuso a oeste de Greenwich o atraso
 * apareceria um dia antes de existir.
 */
export function diasDeAtraso(prazo: Date, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - prazo.getTime()) / UM_DIA_EM_MS));
}
