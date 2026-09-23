import { AppError } from '../../../core/errors/app-error';
import type { ClienteStatusPosse } from './assert-status-posse.usecase';

/**
 * Guarda irmã da `assertStatusCoerenteComPosse` — a Invariante 4 aplicada ao
 * DESCOMISSIONAMENTO (docs/INVARIANTES.md, docs/FASE-2-PLANO-ITAM.md D19).
 *
 * Ativo com `Assignment` aberta não pode sair do patrimônio. "Vendido" e "está
 * na mão da Laura" não podem ser verdade ao mesmo tempo: o equipamento sumiria
 * do inventário continuando com ela, e a devolução — a operação que registra em
 * que estado ele voltou e quem recebeu — deixaria de acontecer.
 *
 * ARQUIVO SEPARADO, e não um `if` a mais na guarda de status, porque a pergunta
 * é outra: aquela recusa uma COMBINAÇÃO de tipo de status com posse (2 das 10
 * possíveis); esta recusa a operação inteira, venha de onde vier. O que as duas
 * compartilham — o cliente que serve transação e o formato da mensagem — está
 * importado daqui, não copiado.
 *
 * BLOQUEIA, NUNCA FECHA A POSSE SOZINHA, pelo mesmo motivo da irmã: "tudo bem,
 * eu devolvo junto" apagaria a única informação de quem estava com o
 * equipamento em troca de uma data.
 *
 * @param client   Prisma global ou o `tx` da transação de quem chama.
 * @param assetId  O ativo que está sendo descomissionado.
 * @param etiqueta A etiqueta, só para a mensagem dizer QUAL ativo barrou — é o
 *                 que faz a recusa servir também para o lote (`/assets/bulk`).
 */
export async function assertSemPosseParaDescomissionar(
  client: ClienteStatusPosse,
  assetId: string,
  etiqueta: string,
): Promise<void> {
  const posse = await client.assignment.findFirst({
    where: { assetId, checkinAt: null },
    select: { id: true, targetType: true },
  });
  if (!posse) return;

  throw new AppError(
    `${etiqueta} está entregue e não pode ser descomissionado. Faça a devolução antes.`,
    409,
    { assetId, assignmentId: posse.id, targetType: posse.targetType },
  );
}
