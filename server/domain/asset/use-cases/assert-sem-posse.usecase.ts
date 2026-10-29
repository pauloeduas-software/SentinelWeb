import { AppError } from '../../../core/errors/app-error';
import type { ClienteStatusPosse } from './assert-status-posse.usecase';

/**
 * Guarda irmã da `assertStatusCoerenteComPosse` — a Invariante 4 aplicada à
 * BAIXA e à LIXEIRA (docs/referencia/invariantes.md, a 20;
 * docs/historico/fase-02-ativos.md D19; a AL).
 *
 * Ativo com `Assignment` aberta não sai do patrimônio nem vai para a lixeira.
 * "Vendido" e "está na mão da Laura" não podem ser verdade ao mesmo tempo: o
 * equipamento sumiria do inventário continuando com ela, e a devolução — a
 * operação que registra em que estado ele voltou e quem recebeu — deixaria de
 * acontecer. Na lixeira, pior: a pessoa se desativava com o computador ainda no
 * nome dela, e restaurá-lo o devolvia a quem não pode ter posse (invariante 6).
 *
 * ARQUIVO SEPARADO, e não um `if` a mais na guarda de status, porque a pergunta
 * é outra: aquela recusa uma COMBINAÇÃO de tipo de status com posse (1 das 8
 * possíveis: 4 tipos × com/sem posse); esta recusa a operação inteira, venha de
 * onde vier. O que as duas compartilham — o cliente que serve transação e o
 * formato da mensagem — está importado daqui, não copiado.
 *
 * BLOQUEIA, NUNCA FECHA A POSSE SOZINHA, pelo mesmo motivo da irmã: "tudo bem,
 * eu devolvo junto" apagaria a única informação de quem estava com o
 * equipamento em troca de uma data. O Snipe-IT devolve sozinho ao excluir
 * ("Checkin on delete"); aqui a devolução é a da tela, com o status da volta.
 *
 * @param client  Prisma global ou o `tx` da transação de quem chama.
 * @param assetId O ativo que está sendo baixado ou excluído.
 * @param sujeito Quem a frase nomeia — a etiqueta, ou "Este ativo".
 * @param verbo   O que ele não pode: 'receber baixa', 'ir para a lixeira'.
 */
export async function assertSemPosse(
  client: ClienteStatusPosse,
  assetId: string,
  sujeito: string,
  verbo: string,
): Promise<void> {
  const posse = await client.assignment.findFirst({
    where: { assetId, checkinAt: null },
    select: { id: true },
  });
  if (!posse) return;

  throw new AppError(`${sujeito} está entregue e não pode ${verbo}. Faça a devolução antes.`, 409);
}
