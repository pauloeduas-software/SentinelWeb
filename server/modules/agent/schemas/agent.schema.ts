import { z } from 'zod';

// O corpo do cadastro do agente (CR): o HWID, em PascalCase como o resto do
// protocolo (`agent-protocol.types.ts`). Só ele: o resto da máquina vem no
// handshake, pela conexão que o token abrir.
export const enrollSchema = z.object({
  Hwid: z.string('Hwid: campo obrigatório').trim().min(1, 'Hwid: campo obrigatório'),
});
