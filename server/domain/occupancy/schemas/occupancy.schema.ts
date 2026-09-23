import { z } from 'zod';
import { dataNaoFutura, textoOpcional, uuidObrigatorio } from '../../shared/fields.schema';

// Contrato de entrada das rotas de ocupação — a Camada 2 do
// docs/MODELO-POSSE.md: quem ocupa um posto de trabalho.
//
// `strictObject` pelo mesmo motivo do resto do sistema: campo desconhecido vira
// 422 em vez de gravação silenciosa. Aqui isso também fecha uma porta
// específica — `endedAt` NÃO está no schema, então não existe jeito de encerrar
// uma ocupação pelo corpo do POST. Encerrar é o DELETE, e o DELETE deixa linha
// no `ActivityLog`.

/**
 * Início da ocupação. Dia de calendário, não instante — `dataNaoFutura`
 * interpreta 'AAAA-MM-DD' em UTC pelo mesmo motivo da data de compra do ativo
 * (num fuso a oeste de Greenwich, hora local faria a data voltar um dia).
 *
 * Opcional porque o caso normal é "começa agora": ausente, quem preenche é o
 * `@default(now())` do banco — e não um `new Date()` da aplicação, para o
 * início e o `endedAt` saírem do mesmo relógio.
 *
 * PASSADO é o caso real e aceito: a carga inicial é "a Laura ocupa a Mesa 1
 * desde março". FUTURO é recusado, e o porquê está no construtor
 * (shared/fields.schema.ts), junto com o `dataNaoPassada` que é o espelho dele
 * na devolução prevista — a regra mora num lugar só. Aqui vale registrar o
 * limite do modelo: escala com data futura é agenda, e agenda está declarada
 * fora dele (docs/MODELO-POSSE.md, "O que este modelo NÃO resolve").
 */
const inicioOpcional = dataNaoFutura('início da ocupação');

export const addOccupantSchema = z.strictObject({
  userId: uuidObrigatorio('colaborador'),

  // TEXTO LIVRE, com teto de 60 caracteres: "Manhã", "Tarde", "12x36 A". Enum
  // engessaria escalas reais e faixa de horário seria agenda, não inventário
  // (docs/MODELO-POSSE.md, Camada 2). O teto existe só para o campo não virar
  // depósito de observação — para isso há `notes`.
  shift: textoOpcional('turno', 60),

  // Mesmo teto de `Asset.notes`: é o mesmo tipo de campo (observação humana) e
  // um segundo número arbitrário no código não se justificaria.
  notes: textoOpcional('notas', 2_000),

  startedAt: inicioOpcional,
});

/**
 * `?view=` das duas listagens.
 *
 * `current` é o padrão porque é a pergunta da operação — quem ocupa o posto
 * AGORA. `all` traz o histórico inteiro, aberto e encerrado.
 *
 * `strictObject` também aqui: `?vew=all` (typo) usaria o padrão em silêncio e o
 * cliente leria uma lista de ocupantes atuais achando que era o histórico.
 */
export const occupancyViewQuerySchema = z.strictObject({
  view: z.enum(['current', 'all'], 'view inválida: use current ou all').default('current'),
});

/**
 * Params do encerramento: `/api/locations/:id/occupants/:occupantId`.
 *
 * São DOIS uuids porque a ocupação é encerrada DENTRO do posto a que pertence —
 * o use-case filtra pelos dois juntos. Sem o `:id` na consulta, um id de
 * ocupação de outro local encerraria por esta rota, e a URL deixaria de
 * descrever o que aconteceu.
 */
export const occupantParamsSchema = z.strictObject({
  id: z.uuid('identificador inválido'),
  occupantId: uuidObrigatorio('ocupação'),
});
