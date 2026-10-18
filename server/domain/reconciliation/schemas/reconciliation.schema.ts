import { z } from 'zod';
import { uuidObrigatorio } from '../../shared/fields.schema';

// Contrato de entrada das rotas de reconciliação.
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez de
// gravação silenciosa. Aqui isso fecha uma porta específica — não existe jeito
// de mandar `state: 'ACCEPTED'` pelo corpo e fechar uma sugestão sem executar o
// que ela propõe. O aceite não tem corpo: a sugestão já diz tudo que ela afirma.

export const vinculoSchema = z.strictObject({
  assetId: uuidObrigatorio('ativo'),
});

/** Vincular e entregar ao posto numa operação (`link-and-checkout.usecase.ts`). */
export const vinculoComEntregaSchema = z.strictObject({
  assetId: uuidObrigatorio('ativo'),
  targetLocationId: uuidObrigatorio('posto'),
});

export const triagemSchema = z.strictObject({
  reviewState: z.enum(['UNREVIEWED', 'ALLOWED', 'BLOCKED'], 'situação inválida'),
});

/** `?dias=` da lista de ociosos. Não é `strictObject` — ver o filtro de máquinas. */
export const janelaDeOciosidadeSchema = z.object({
  dias: z.coerce.number().int().min(1, 'dias: mínimo de 1').max(365, 'dias: máximo de 365').default(30),
});
