import { z } from 'zod';
import { $Enums } from '@prisma/client';
import { dataNaoPassada, textoOpcional, uuidObrigatorio } from '../../shared/fields.schema';
import { camposDeCriacao, camposDeEdicao } from './stock.schema';

// O ACESSÓRIO — o que é entregue e VOLTA.
//
// O CRUD é o comum dos três; o que é próprio daqui é a ENTREGA, e ela tem uma
// coisa que o Snipe-IT não tem: o alvo pode ser um POSTO.

export const createAccessorySchema = z.strictObject(camposDeCriacao);
export const updateAccessorySchema = z.strictObject(camposDeEdicao);

/**
 * A ENTREGA de UMA unidade.
 *
 * NÃO existe `qty` aqui, e é de propósito: uma linha de `accessory_checkouts` é
 * UMA unidade, e entregar três mouses à Laura são três chamadas — três linhas,
 * três devoluções independentes. Uma entrega com quantidade precisaria de
 * devolução com quantidade, que é o desenho do `ComponentAsset` (D38), e ele
 * existe lá porque instalar 4 pentes na MESMA máquina é um fato só. Entregar 3
 * mouses à mesma pessoa não é: eles se perdem e voltam separados.
 *
 * `targetType` discrimina e as duas FKs são nuláveis — mesma forma do
 * `Assignment`, com a diferença de que aqui o banco também garante (o CHECK
 * `accessory_checkout_alvo_xor`).
 *
 * O ALVO `ASSET` NÃO EXISTE no enum: o que vai para dentro de um ativo é
 * `Component`. Mandar `targetType: 'ASSET'` responde 422 pelo próprio enum.
 */
export const checkoutAccessorySchema = z.strictObject({
  targetType: z.enum($Enums.AccessoryTarget, 'tipo de alvo inválido: use USER ou LOCATION'),
  targetUserId: uuidObrigatorio('colaborador').optional(),
  targetLocationId: uuidObrigatorio('localização').optional(),

  // Prazo de devolução. `dataNaoPassada` porque uma entrega com prazo para
  // ontem NASCE VENCIDA — a mesma borda que a F4 documenta no `Assignment`.
  expectedCheckinAt: dataNaoPassada('devolução prevista'),
  notes: textoOpcional('observações', 2_000),
});

export const checkinAccessorySchema = z.strictObject({
  notes: textoOpcional('observações', 2_000),
});

export type CheckoutAccessoryData = z.infer<typeof checkoutAccessorySchema>;
export type CheckinAccessoryData = z.infer<typeof checkinAccessorySchema>;
