import { z } from 'zod';

// Parâmetro de rota `:id` — usado por todo domínio cujo id é uuid.
//
// Sem isto, um `:id` que não é uuid chega ao Prisma e volta como erro de banco
// (500 genérico) em vez de 422 dizendo o que está errado.
export const idParamSchema = z.strictObject({
  id: z.uuid('identificador inválido'),
});
