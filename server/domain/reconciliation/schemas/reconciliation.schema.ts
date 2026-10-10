import { z } from 'zod';
import { uuidObrigatorio, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada das rotas de reconciliação.
//
// `strictObject` como no resto do sistema: campo desconhecido vira 422 em vez de
// gravação silenciosa. Aqui isso fecha uma porta específica — não existe jeito
// de mandar `state: 'ACCEPTED'` pelo corpo e fechar uma sugestão sem executar o
// que ela propõe. O aceite não tem corpo: a sugestão já diz tudo que ela afirma.

export const filtroDeSugestoesSchema = z.strictObject({
  state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED']).optional(),
  kind: z.enum(['LINK', 'MERGE']).optional(),
  endpointId: uuidOpcional('máquina'),
  assetId: uuidOpcional('ativo'),
});

export const vinculoSchema = z.strictObject({
  assetId: uuidObrigatorio('ativo'),
});

export const triagemSchema = z.strictObject({
  reviewState: z.enum(['UNREVIEWED', 'ALLOWED', 'BLOCKED'], 'situação inválida'),
});

export const fusaoSchema = z.strictObject({
  intoEndpointId: uuidObrigatorio('máquina de destino'),
});

/** `?dias=` da lista de ociosos. Não é `strictObject` — ver o filtro de máquinas. */
export const janelaDeOciosidadeSchema = z.object({
  dias: z.coerce.number().int().min(1, 'dias: mínimo de 1').max(365, 'dias: máximo de 365').default(30),
});
