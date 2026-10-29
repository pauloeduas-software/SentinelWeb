import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { ASSET_WRITE_SELECT } from '../../asset/helpers/asset-select.helper';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import { rotuloDoAlvo } from '../helpers/target-label.helper';
import type { AlvoPosse, ClientePosse } from './resolve-responsibles.usecase';
import { AppError } from '../../../core/errors/app-error';

// AS TRÊS ESCRITAS DA DEVOLUÇÃO, em um lugar só.
//
// Existe porque fechar uma posse são TRÊS escritas que têm de andar juntas
// (a posse, o status do ativo e o log), e uma segunda cópia delas divergiria no
// primeiro ajuste.
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
 * `AuditLog`: ler de novo aqui seria uma consulta a mais.
 */
interface PosseParaFechar {
  id: string;
  assetId: string;
  targetType: AlvoPosse;
  statusAnteriorId: string;
}

interface DadosDaDevolucao {
  /** Status DEPOIS da devolução. Já resolvido por quem chama — nunca nulo aqui. */
  statusId: string;
  checkinNotes?: string | null;
  /** O instante da devolução, já conferido contra a entrega por quem chama (AM). */
  checkinAt: Date;
}

export async function fecharPosse(
  client: ClientePosse,
  posse: PosseParaFechar,
  dados: DadosDaDevolucao,
  /** Quem operou a devolução (AB). Último parâmetro, como em `recordAudit`. */
  ator: Ator,
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
      checkinAt: dados.checkinAt,
      checkinNotes: dados.checkinNotes ?? null,
    },
  });
  if (count === 0) throw new AppError('Este ativo não está entregue.', 409);

  const assignment = await client.assignment.findUniqueOrThrow({
    where: { id: posse.id },
    select: ASSIGNMENT_SELECT,
  });

  const asset = await client.asset.update({
    where: { id: posse.assetId },
    data: { statusId: dados.statusId },
    select: ASSET_WRITE_SELECT,
  });

  // No histórico do ATIVO, não no da posse: é a linha do tempo do equipamento
  // que alguém abre para perguntar "por onde isto andou".
  await recordAudit(client, {
    entityType: 'Asset',
    entityId: posse.assetId,
    entityLabel: asset.assetTag,
    action: 'CHECKIN',
    changes: {
      assignmentId: posse.id,
      targetType: posse.targetType,
      targetName: rotuloDoAlvo(assignment),
      statusId: { de: posse.statusAnteriorId, para: dados.statusId },
    },
  }, ator);

  return { assignment, asset };
}
