import { z } from 'zod';
import { textoOpcional, uuidObrigatorio } from '../../shared/fields.schema';
import { camposDeCriacao, camposDeEdicao, quantidadeObrigatoria } from './stock.schema';

// O CONSUMÍVEL — o que sai e não volta.
//
// Note o que este arquivo NÃO tem: um `checkinConsumableSchema`. Não há coluna
// de fechamento no banco, não há rota no maestro e não há schema aqui (D37) —
// `POST /api/consumables/checkouts/:id/checkin` responde **404 do roteador**.
//
// A alternativa — aceitar a rota e responder 409 "consumível não volta" — põe a
// regra na memória de quem escreve o próximo use-case. Sem coluna e sem rota,
// implementar a devolução exige uma migração, que é o tipo de mudança que
// alguém revisa.

export const createConsumableSchema = z.strictObject(camposDeCriacao);
export const updateConsumableSchema = z.strictObject(camposDeEdicao);

/**
 * O CONSUMO.
 *
 * `userId` é OBRIGATÓRIO, e aqui não há alvo polimórfico: o consumo responde
 * uma pergunta de RATEIO, e orçamento tem dono, não é móvel. "Resma para o
 * Andar 2" ficou em aberto de propósito no plano da fase — se a operação pedir,
 * é o mesmo enum do acessório, mas aí o `userNameSnapshot` precisa de um par
 * para o posto.
 *
 * `qty` EXISTE aqui, ao contrário da entrega de acessório: consumir 3 resmas é
 * um fato só, porque nenhuma delas volta e não há nada a rastrear em separado.
 */
export const consumeSchema = z.strictObject({
  userId: uuidObrigatorio('colaborador'),
  // Mínimo 1: um consumo de zero é uma linha que não diz nada.
  qty: quantidadeObrigatoria('quantidade').min(1, 'quantidade mínima é 1').default(1),
  notes: textoOpcional('observações', 2_000),
});

export type ConsumeData = z.infer<typeof consumeSchema>;
