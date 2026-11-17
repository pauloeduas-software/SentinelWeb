import { z } from 'zod';
import { uuidObrigatorio } from '../../shared/fields.schema';

// Contrato de entrada das rotas de reconciliação.
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez de
// gravação silenciosa.

export const vinculoSchema = z.strictObject({
  assetId: uuidObrigatorio('computador'),
});

/** Vincular e entregar ao posto numa operação (`link-and-checkout.usecase.ts`). */
export const vinculoComEntregaSchema = z.strictObject({
  assetId: uuidObrigatorio('computador'),
  targetWorkstationId: uuidObrigatorio('posto'),
});
