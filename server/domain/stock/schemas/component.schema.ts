import { z } from 'zod';
import { textoOpcional, uuidObrigatorio } from '../../shared/fields.schema';
import { camposDeCriacao, camposDeEdicao, quantidadeObrigatoria } from './stock.schema';

// O COMPONENTE — o que vai para DENTRO de um ativo.
//
// A régua contra o `Asset`: tem etiqueta própria → é `Asset`. A dock tem
// patrimônio e série, então é `Asset` com `Assignment` de alvo `ASSET` (F4). O
// pente de RAM não tem, então é isto aqui.

export const createComponentSchema = z.strictObject({
  ...camposDeCriacao,
  serial: textoOpcional('número de série', 150),
});

export const updateComponentSchema = z.strictObject({
  ...camposDeEdicao,
  serial: textoOpcional('número de série', 150),
});

/** A INSTALAÇÃO: N unidades deste componente dentro de UM ativo. */
export const attachComponentSchema = z.strictObject({
  assetId: uuidObrigatorio('ativo'),
  qty: quantidadeObrigatoria('quantidade').min(1, 'quantidade mínima é 1').default(1),
  notes: textoOpcional('observações', 2_000),
});

/**
 * A RETIRADA, total ou PARCIAL.
 *
 * `qty` ausente = retira tudo o que a linha tem. Parcial divide a linha (D38):
 * a de 4 fecha e nasce uma de 2 — a soma das abertas continua sendo o estado
 * atual, e a sequência continua sendo o histórico.
 */
export const detachComponentSchema = z.strictObject({
  qty: quantidadeObrigatoria('quantidade').min(1, 'quantidade mínima é 1').optional(),
  notes: textoOpcional('observações', 2_000),
});

export type AttachComponentData = z.infer<typeof attachComponentSchema>;
export type DetachComponentData = z.infer<typeof detachComponentSchema>;
