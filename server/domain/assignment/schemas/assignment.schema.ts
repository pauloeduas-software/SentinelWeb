import { z } from 'zod';
import { dataNaoPassada, textoOpcional, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada da ENTREGA e da DEVOLUÇÃO — as duas únicas operações que
// escrevem posse (docs/referencia/modelo-de-posse.md).
//
// `strictObject` recusa campo desconhecido em vez de ignorar em silêncio. Aqui
// ele faz mais do que fechar mass assignment: mandar `assignedToId` para o
// checkout responde 422, e é a resposta certa — quem decide o responsável é o
// `targetType` com a FK que combina, não uma coluna solta no corpo.

/**
 * As três FKs são TODAS opcionais aqui, e a obrigatoriedade de UMA delas fica
 * no use-case (`assertAlvoCoerente`), não no zod.
 *
 * Por quê: a regra não é "este campo é obrigatório", é "exatamente uma das três
 * está preenchida E é a que casa com o `targetType`". Escrita como `refine`,
 * ela viraria um 422 com a mensagem no objeto inteiro em vez de no campo, e
 * ficaria longe do lugar onde o alvo é de fato usado. No use-case ela vira
 * `AppError(…, 422)` com o texto que ensina o modelo.
 */
export const checkoutSchema = z.strictObject({
  targetType: z.enum(['USER', 'ASSET', 'LOCATION'], 'tipo de alvo inválido: use USER, ASSET ou LOCATION'),
  targetUserId: uuidOpcional('colaborador'),
  targetAssetId: uuidOpcional('ativo detentor'),
  targetLocationId: uuidOpcional('localização'),

  // Status DEPOIS da entrega. Ausente, o use-case escolhe o primeiro de tipo
  // `IN_USE` — o formulário não deveria precisar saber o id dele.
  statusId: uuidOpcional('status'),

  // PRAZO, e por isso não aceita o passado: uma entrega com devolução prevista
  // para ontem nasce VENCIDA — o prazo expira no mesmo segundo em que o
  // equipamento sai, que é um cadastro que ninguém quis fazer.
  // O espelho é o `startedAt` da ocupação, que recusa o FUTURO pelo motivo
  // oposto (shared/fields.schema.ts).
  expectedCheckinAt: dataNaoPassada('devolução prevista'),
  checkoutNotes: textoOpcional('observações da entrega', 2_000),
});

export const checkinSchema = z.strictObject({
  // Status DEPOIS da devolução. Ausente, o use-case escolhe o primeiro de tipo
  // `DEPLOYABLE`: o caminho normal é o equipamento voltar para o estoque, e o
  // anormal (voltou quebrado, voltou para a assistência) é que merece escolha
  // explícita.
  statusId: uuidOpcional('status'),
  checkinNotes: textoOpcional('observações da devolução', 2_000),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckinInput = z.infer<typeof checkinSchema>;
