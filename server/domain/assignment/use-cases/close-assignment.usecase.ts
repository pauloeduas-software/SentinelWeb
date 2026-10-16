import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ASSET_SELECT } from '../../asset/helpers/asset-select.helper';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import type { AlvoPosse, ClientePosse } from './resolve-responsibles.usecase';
import { AppError } from '../../../core/errors/app-error';

// AS TRÊS ESCRITAS DA DEVOLUÇÃO, em um lugar só.
//
// Existe porque fechar uma posse são TRÊS escritas que têm de andar juntas, e
// uma segunda cópia delas divergiria no primeiro ajuste — a mais provável das
// divergências sendo a pior: esquecer de limpar `Asset.assignedToId` deixa a
// pessoa como dona de um equipamento que ela devolveu.
//
// Hoje o chamador é um só, o checkin (`checkin-asset.usecase.ts`). A função fica
// separada porque é o lugar onde a próxima porta de devolução entra sem copiar
// nada.
//
// Recebe o cliente (`ClientePosse` aceita o global e o de transação) porque quem
// chama já abriu a SUA transação. Abrir uma aqui dentro aninharia transação, que
// o Prisma não suporta.

/**
 * A posse aberta que vai ser fechada — o que quem chama já leu do banco.
 *
 * `statusAnteriorId` é o status do ATIVO antes da devolução, e vem de fora
 * porque quem chama já o leu para decidir o que gravar. Serve só ao diff do
 * `ActivityLog`: ler de novo aqui seria uma consulta a mais por ativo num laço
 * de desligamento.
 */
export interface PosseParaFechar {
  id: string;
  assetId: string;
  targetType: AlvoPosse;
  statusAnteriorId: string;
}

export interface DadosDaDevolucao {
  /** Status DEPOIS da devolução. Já resolvido por quem chama — nunca nulo aqui. */
  statusId: string;
  checkinNotes?: string | null;
}

export async function fecharPosse(
  client: ClientePosse,
  posse: PosseParaFechar,
  dados: DadosDaDevolucao,
  /** Quem operou a devolução (D23). Último parâmetro, como em `recordActivity`. */
  actorId: string | null = null,
) {
  // A posse fecha ANTES de o status mudar, e a ordem não é estética: enquanto a
  // posse está aberta, um status de estoque contradiz a Camada 1 — é exatamente
  // o que `assertStatusCoerenteComPosse` recusa na edição de ativo. Fechando
  // primeiro, o `DEPLOYABLE` passa a ser verdade antes de ser escrito.
  // `updateMany` com `checkinAt: null`, e não `update` por id: é a rede embaixo
  // da trava do ativo. Fechar uma posse JÁ fechada regravaria a data e quem
  // recebeu de uma devolução que aconteceu antes — e seguiria adiante mudando o
  // status de um ativo que pode já estar com outra pessoa.
  const { count } = await client.assignment.updateMany({
    where: { id: posse.id, checkinAt: null },
    data: {
      checkinAt: new Date(),
      checkinNotes: dados.checkinNotes ?? null,
      // QUEM RECEBEU de volta. A coluna nasceu nulável esperando a F3 e a
      // partir daqui tem nome — e este nome não é trilha de auditoria: ele sai
      // IMPRESSO no termo de entrega (F4), que é dado de negócio e precisa
      // sobreviver a qualquer expurgo do `ActivityLog` (D25). O que ficou para
      // trás continua nulo de propósito: não há backfill (D24).
      checkinById: actorId,
    },
  });
  if (count === 0) throw new AppError('Este ativo não está entregue.', 409);

  const assignment = await client.assignment.findUniqueOrThrow({
    where: { id: posse.id },
    select: ASSIGNMENT_SELECT,
  });

  const asset = await client.asset.update({
    where: { id: posse.assetId },
    data: {
      statusId: dados.statusId,
      // Limpo SEMPRE, inclusive quando a posse era de LOCATION ou de ASSET e a
      // coluna já estava nula: o cache do caso `USER` não pode sobreviver à
      // devolução por nenhum caminho (docs/referencia/modelo-de-posse.md).
      assignedToId: null,
    },
    select: ASSET_SELECT,
  });

  // No histórico do ATIVO, não no da posse: é a linha do tempo do equipamento
  // que alguém abre para perguntar "por onde isto andou".
  await recordActivity(client, {
    entityType: 'Asset',
    entityId: posse.assetId,
    action: 'CHECKIN',
    changes: {
      assignmentId: posse.id,
      targetType: posse.targetType,
      statusId: { de: posse.statusAnteriorId, para: dados.statusId },
    },
  }, actorId);

  return { assignment, asset };
}
