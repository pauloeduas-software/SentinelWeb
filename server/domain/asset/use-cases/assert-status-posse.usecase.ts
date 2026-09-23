import { $Enums } from '@prisma/client';
import type { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

/**
 * Cliente aceito por esta guarda: tanto o global quanto o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão (`$transaction`, `$connect`…) que o
 * cliente de transação não tem — é o que faz a MESMA função servir os dois.
 * Mesmo padrão do `ClienteCatalogo` (catalog/specs/catalog-spec.types.ts).
 */
export type ClienteStatusPosse = Omit<typeof prisma, `$${string}`>;

/**
 * Os dois tipos incompatíveis com posse aberta, e a razão de cada um — a razão
 * entra na mensagem para o erro ENSINAR o modelo em vez de só recusar.
 *
 * - `DEPLOYABLE` é "está no estoque, pode ser entregue". Um ativo que já está
 *   com alguém não está no estoque; dizer que está abre a porta para uma
 *   segunda entrega do mesmo equipamento.
 * - `ARCHIVED` é "saiu da operação". Não se arquiva o que ainda está na mão de
 *   um colaborador — o equipamento sumiria dos relatórios continuando com ele.
 */
const TIPOS_PROIBIDOS_COM_POSSE: Partial<Record<$Enums.StatusLabelType, string>> = {
  [$Enums.StatusLabelType.DEPLOYABLE]: 'é um status de estoque',
  [$Enums.StatusLabelType.ARCHIVED]: 'tira o ativo de operação',
};

/**
 * Invariante estado × posse (docs/INVARIANTES.md).
 *
 * Um ativo com `Assignment` ABERTA (`checkinAt: null`) não pode receber status
 * de tipo `DEPLOYABLE` nem `ARCHIVED`. São 2 combinações proibidas de 10
 * (5 tipos × com/sem posse) — a regra é estreita DE PROPÓSITO, porque as outras
 * oito descrevem operação real:
 *
 * - `PENDING` COM responsável é o notebook que foi para o conserto e VOLTA para
 *   a mesma pessoa. Fechar a posse na saída para a assistência obrigaria a
 *   refazer o checkout na volta e perderia a continuidade de quem responde por
 *   ele enquanto está fora.
 * - `UNDEPLOYABLE` COM responsável é o notebook quebrado que ainda está na
 *   gaveta dela, aguardando descarte. Continua sendo responsabilidade de
 *   alguém, e é exatamente isso que o relatório precisa mostrar.
 * - `IN_USE` COM responsável é o caso normal, e `IN_USE` SEM responsável é o
 *   sinal operacional que a F4 vai caçar (ver MODELO-POSSE.md, "posto vago").
 *
 * BLOQUEIA, NUNCA LIMPA SOZINHO. A alternativa "tudo bem, fecho a assignment
 * junto" é perda de dado silenciosa: quem mandou o status para `DEPLOYABLE`
 * queria registrar uma DEVOLUÇÃO — com data, quem recebeu, em que estado — e o
 * sistema apagaria a única informação de quem estava com o equipamento, em
 * troca de um campo. O checkin existe para isso e é uma operação com formulário
 * próprio; esta guarda só recusa o atalho que passaria por cima dele.
 *
 * @param client   Prisma global ou o `tx` da transação de quem chama.
 * @param assetId  O ativo que está sendo alterado.
 * @param statusIdFinal  O status DEPOIS da edição — não o que veio no corpo.
 */
export async function assertStatusCoerenteComPosse(
  client: ClienteStatusPosse,
  assetId: string,
  statusIdFinal: string,
): Promise<void> {
  // Sem posse aberta não há o que contradizer: qualquer um dos cinco tipos
  // serve, e a consulta do status nem precisa acontecer.
  const posse = await client.assignment.findFirst({
    where: { assetId, checkinAt: null },
    select: { id: true, targetType: true },
  });
  if (!posse) return;

  const status = await client.statusLabel.findUnique({
    where: { id: statusIdFinal },
    select: { name: true, type: true },
  });
  // Status inexistente não é problema desta guarda: a FK do `assets.statusId`
  // recusa a gravação logo abaixo e o `error-handler` traduz o P2003. Inventar
  // um 404 aqui só mudaria de lugar o mesmo erro.
  if (!status) return;

  const motivo = TIPOS_PROIBIDOS_COM_POSSE[status.type];
  if (!motivo) return;

  throw new AppError(
    `"${status.name}" ${motivo}, e este ativo está entregue. Faça a devolução antes de mudar o status.`,
    409,
    { assignmentId: posse.id, targetType: posse.targetType, statusType: status.type },
  );
}
