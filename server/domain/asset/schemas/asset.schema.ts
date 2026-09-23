import { z } from 'zod';

// O hwid é a identidade da máquina, gerada pelo agente C# — não é uuid, então
// tem schema próprio em vez do `idParamSchema` compartilhado.
export const hwidParamSchema = z.strictObject({
  hwid: z.string('hwid é obrigatório').trim().min(1, 'hwid não pode ser vazio').max(256, 'hwid: máximo de 256 caracteres'),
});

// `toUpperCase` no schema, não no controller: a normalização faz parte do
// contrato — o agente recebe sempre o comando em maiúscula.
export const sendCommandSchema = z.strictObject({
  action: z.string('a ação é obrigatória').trim().min(1, 'a ação não pode ser vazia').max(64, 'ação: máximo de 64 caracteres').toUpperCase(),
});
