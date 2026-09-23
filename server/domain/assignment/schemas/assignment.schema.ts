import { z } from 'zod';
import { dataNaoPassada, textoOpcional, uuidOpcional } from '../../shared/fields.schema';

// Contrato de entrada da ENTREGA e da DEVOLUÇÃO — as duas únicas operações que
// escrevem posse (docs/MODELO-POSSE.md).
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
  // para ontem nasce VENCIDA — entra em `GET /api/assignments/overdue` no mesmo
  // segundo em que o equipamento saiu do estoque, e com o lembrete automático
  // (Leva 3) cobraria de volta o que acabou de ser entregue. Hoje é aceito.
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

/**
 * Teto de ativos por entrega em massa.
 *
 * 100 é o mesmo teto de uma página da listagem (`core/http/list-query.ts`), e
 * não por simetria: a seleção da tela nasce de uma página, então um lote maior
 * que a página é um pedido montado à mão. O limite existe porque cada linha é
 * uma transação — mil ids num corpo só seriam mil transações seguradas por uma
 * requisição HTTP, que estoura o timeout do cliente e deixa o relatório sem
 * quem o leia.
 */
const MAX_ATIVOS_POR_LOTE = 100;

/**
 * ENTREGA EM MASSA: o mesmo corpo do checkout, mais a lista de ativos.
 *
 * O alvo é UM só para todos — é o que a operação significa (o kit inteiro para
 * a mesma pessoa, ou para a mesma Mesa 1). Alvos diferentes por linha seriam N
 * entregas sem nada em comum, e para isso já existe a rota individual.
 *
 * `.extend` sobre o `checkoutSchema` em vez de repetir os sete campos: a
 * coerência entre `targetType` e a FK preenchida é validada UMA vez, no
 * `assertAlvoCoerente` de dentro do `checkoutAsset` que cada linha chama. Um
 * segundo schema com as mesmas regras divergiria do primeiro no próximo ajuste.
 */
export const bulkCheckoutSchema = checkoutSchema.extend({
  assetIds: z
    .array(z.uuid('ativo: identificador inválido'), 'informe os ativos a entregar')
    .min(1, 'selecione ao menos um ativo')
    .max(MAX_ATIVOS_POR_LOTE, `entrega em massa: máximo de ${MAX_ATIVOS_POR_LOTE} ativos por vez`),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckinInput = z.infer<typeof checkinSchema>;
export type BulkCheckoutInput = z.infer<typeof bulkCheckoutSchema>;
