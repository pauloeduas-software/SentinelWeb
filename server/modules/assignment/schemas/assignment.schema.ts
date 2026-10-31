import { z } from 'zod';
import { dataNaoPassada, diaNaoFuturo, textoOpcional, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada da ENTREGA e da DEVOLUÇÃO — as duas únicas operações que
// escrevem posse (docs/referencia/modelo-de-posse.md).
//
// `strictObject` recusa campo desconhecido em vez de ignorar em silêncio. Aqui
// ele faz mais do que fechar mass assignment: mandar `assignedToId` para o
// checkout responde 422, e é a resposta certa — quem decide o responsável é o
// `targetType` com a FK que combina, não uma coluna solta no corpo.

/**
 * As duas FKs são opcionais aqui, e a obrigatoriedade de UMA delas fica no
 * use-case (`assertAlvoCoerente`), não no zod.
 *
 * Por quê: a regra não é "este campo é obrigatório", é "exatamente uma das duas
 * está preenchida E é a que casa com o `targetType`". Escrita como `refine`,
 * ela viraria um 422 com a mensagem no objeto inteiro em vez de no campo, e
 * ficaria longe do lugar onde o alvo é de fato usado. No use-case ela vira
 * `AppError(…, 422)` com o texto que ensina o modelo.
 */
export const checkoutSchema = z.strictObject({
  targetType: z.enum(['PERSON', 'WORKSTATION'], 'tipo de alvo inválido: use PERSON ou WORKSTATION'),
  targetPersonId: uuidOpcional('colaborador'),
  targetWorkstationId: uuidOpcional('posto'),

  // Status DEPOIS da entrega. Ausente, o use-case escolhe o primeiro de tipo
  // `IN_USE` — o formulário não deveria precisar saber o id dele.
  statusId: uuidOpcional('status'),

  // PRAZO, e por isso não aceita o passado: uma entrega com devolução prevista
  // para ontem nasce VENCIDA — o prazo expira no mesmo segundo em que o
  // equipamento sai, que é um cadastro que ninguém quis fazer.
  // O espelho é o dia da entrega, logo abaixo, que recusa o FUTURO pelo motivo
  // oposto (shared/fields.schema.ts).
  expectedCheckinAt: dataNaoPassada('devolução prevista'),
  checkoutNotes: textoOpcional('observações da entrega', 2_000),

  // O DIA da entrega (AM), como na licença e no estoque: hoje por padrão, o
  // passado para registrar a que já aconteceu — a carga inicial da D17.
  checkoutAt: diaNaoFuturo('data da entrega'),
});

export const checkinSchema = z.strictObject({
  // Status DEPOIS da devolução. Ausente, o use-case escolhe o primeiro de tipo
  // `DEPLOYABLE`: o caminho normal é o equipamento voltar para o estoque, e o
  // anormal (voltou quebrado, voltou para a assistência) é que merece escolha
  // explícita.
  statusId: uuidOpcional('status'),
  checkinNotes: textoOpcional('observações da devolução', 2_000),
  // O DIA da devolução (AM): hoje por padrão; nem futuro, nem antes da entrega.
  checkinAt: diaNaoFuturo('data da devolução'),
  // O ESCOPO: fecha a posse só se ela aponta para este posto, senão 409.
  // É o que a ficha do posto manda, para não fechar a posse de outra pessoa
  // por cima de uma tela velha (`checkin-asset.usecase.ts`).
  targetWorkstationId: uuidOpcional('posto'),
});
