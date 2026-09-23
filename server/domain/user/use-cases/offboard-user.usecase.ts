import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { assertStatusExiste, escolherStatusPorTipo } from '../../assignment/use-cases/checkout-asset.usecase';
import { fecharPosse } from '../../assignment/use-cases/close-assignment.usecase';
import { USER_DETAIL_SELECT } from '../helpers/user-select.helper';
import { travarUsuarioOuFalhar } from './lock-user.usecase';

// DESLIGAMENTO — D32. As DUAS camadas, numa transação só.
//
// O nome é `offboard`, e não `checkin-all`: quem lê "check-in de tudo" não
// espera que a operação mexa em POSTO — e é essa exatamente a metade que se
// esquece. Devolver os ativos diretos e deixar a Laura ocupando a Mesa 1 mantém
// um desligado como responsável resolvido por todo equipamento daquele posto:
// `resolverResponsaveis()` continua devolvendo o nome dele, meses depois, e
// nenhuma consulta acusa nada, porque a responsabilidade é DERIVADA
// (docs/MODELO-POSSE.md, Camada 3).
//
// ─────────────────────────────────────────────────────────────────────────────
// DESLIGAR NÃO É APAGAR, e as duas colunas existem separadas por isso.
//
//   `terminatedAt` + `isActive = false`  saiu da empresa. O cadastro FICA, com
//                                        todo o histórico de posse apontando
//                                        para ele — é o que responde "quem
//                                        estava com este notebook em março?".
//   `deletedAt`                          o cadastro foi um erro. Lixeira.
//
// Por isso esta operação NUNCA escreve `deletedAt`. Quem confunde as duas perde
// o histórico de uma pessoa real para "limpar a lista" — e o histórico é a
// única prova que o inventário tem num inquérito trabalhista.
// ─────────────────────────────────────────────────────────────────────────────
//
// TUDO numa `$transaction` porque os três passos são UM fato. Metade aplicada é
// o pior de todos os estados: o desligado sem ativos mas ainda ocupando a Mesa
// 1 é exatamente o bug que o D32 existe para impedir, e ele nasceria de um
// `Promise.all` que falhou no meio.

export interface OffboardData {
  /** Vai para o `checkinNotes` de cada devolução e para o log do desligamento. */
  notes?: string | null;
  /** Status de volta dos ativos. Ausente, o primeiro `DEPLOYABLE` — o estoque. */
  statusId?: string | null;
}

export interface AtivoDevolvido {
  assignmentId: string;
  assetId: string;
  assetTag: string;
}

export interface OcupacaoEncerrada {
  id: string;
  locationId: string;
  locationName: string;
  shift: string | null;
}

export interface ResultadoDesligamento {
  user: { id: string; name: string; email: string; isActive: boolean; terminatedAt: Date | null };
  devolvidos: AtivoDevolvido[];
  ocupacoesEncerradas: OcupacaoEncerrada[];
}

export async function offboardUser(
  userId: string,
  data: OffboardData,
  /** Quem desligou (D23). Nulo enquanto a rota não exigir sessão. */
  actorId: string | null = null,
): Promise<ResultadoDesligamento> {
  return prisma.$transaction(async (tx) => {
    // A TRAVA, antes de tudo. Ela é a outra metade da defesa do checkout: aqui
    // ela impede que uma entrega simultânea leia `isActive: true` e crie uma
    // posse DEPOIS de este desligamento ter lido a lista do que fechar.
    //
    // Sem as duas pontas travando a MESMA linha, o desligado termina com posse
    // aberta e o `DELETE` passa a responder 409 para sempre, sobre um ativo que
    // a tela do desligamento já não oferece devolver
    // (`user/use-cases/lock-user.usecase.ts`).
    await travarUsuarioOuFalhar(tx, userId);

    // `findFirst` pelo escopo da lixeira: colaborador apagado precisa ser
    // restaurado antes. Desligar quem está na lixeira escreveria história sobre
    // um cadastro que nenhuma tela enxerga.
    const pessoa = await tx.user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, terminatedAt: true },
    });
    if (!pessoa) throw new AppError('Registro não encontrado', 404);

    // 409 e não 404: a pessoa existe, o ESTADO dela é que recusa — mesma
    // família do "esta ocupação já foi encerrada" e do "este ativo já está
    // entregue". Repetir o desligamento reescreveria `terminatedAt` e apagaria
    // a data real da saída, que é justamente o dado que a operação existe para
    // registrar.
    //
    // Isto só é seguro porque a outra ponta fechou junto: o checkout recusa
    // entregar equipamento a quem está `isActive = false`
    // (assignment/use-cases/checkout-asset.usecase.ts). Sem aquela recusa, um
    // desligado poderia voltar a acumular posse e este 409 trancaria a única
    // operação capaz de limpá-la.
    if (pessoa.terminatedAt) {
      throw new AppError('Este colaborador já foi desligado.', 409, {
        terminatedAt: pessoa.terminatedAt.toISOString(),
      });
    }

    // ── 1. DEVOLVER o que está no nome da pessoa ───────────────────────────
    //
    // Só `targetType: 'USER'`. Os ativos do POSTO NÃO são devolvidos: eles são
    // do posto, não dela — devolver o monitor da Mesa 1 porque a Laura saiu
    // tiraria da Ana, que continua trabalhando lá, um equipamento que está na
    // mesa dela (docs/MODELO-POSSE.md; é a mesma razão do D28).
    //
    // O `asset: { deletedAt: null }` é a MESMA condição do `contarPosseAberta`,
    // e as duas têm que ser a mesma: o 409 do `DELETE` conta o que esta consulta
    // fecha. Fosse diferente, um ativo na lixeira com posse aberta travaria o
    // colaborador para sempre — o 409 exigiria o desligamento, e o
    // desligamento estouraria no `update` de um ativo que a extension não
    // enxerga (P2025). A posse daquele ativo continua aberta e volta com ele,
    // se ele for restaurado.
    const abertas = await tx.assignment.findMany({
      where: { targetType: 'USER', targetUserId: userId, checkinAt: null, asset: { deletedAt: null } },
      select: { id: true, assetId: true, targetType: true, asset: { select: { statusId: true } } },
      orderBy: { checkoutAt: 'asc' },
    });

    const devolvidos: AtivoDevolvido[] = [];

    // O bloco inteiro depende de haver o que devolver — e a escolha do status
    // acontece UMA vez para o lote, dentro dele. Fora do `if`, um desligamento
    // sem ativo nenhum seria recusado com "nenhum status de estoque cadastrado":
    // um erro sobre o catálogo, numa operação que não ia tocar em ativo algum.
    if (abertas.length > 0) {
      if (data.statusId) await assertStatusExiste(tx, data.statusId);
      const statusDeVolta = data.statusId ?? (await escolherStatusPorTipo(tx, 'DEPLOYABLE', 'Disponível'));

      for (const posse of abertas) {
        // Sequencial, dentro da MESMA transação: são as três escritas do
        // checkin por ativo (`fecharPosse`), a mesma mecânica da devolução
        // avulsa. O `ActivityLog` de cada uma nasce ali dentro — por isso não
        // há um log "CHECKIN" escrito aqui.
        const { asset } = await fecharPosse(
          tx,
          {
            id: posse.id,
            assetId: posse.assetId,
            targetType: posse.targetType,
            statusAnteriorId: posse.asset.statusId,
          },
          { statusId: statusDeVolta, checkinNotes: data.notes ?? null },
          actorId,
        );

        devolvidos.push({ assignmentId: posse.id, assetId: posse.assetId, assetTag: asset.assetTag });
      }
    }

    // ── 2. ENCERRAR as ocupações de posto ──────────────────────────────────
    //
    // O passo com dentes. Marcar a pessoa inativa NÃO a tira da lista de
    // responsáveis da Mesa 1: `resolverResponsaveis()` lê
    // `LocationOccupant.endedAt IS NULL`, e `isActive` não aparece em lugar
    // nenhum daquela consulta. Sem este bloco, o desligamento seria cosmético.
    const ocupacoes = await tx.locationOccupant.findMany({
      where: { userId, endedAt: null },
      select: { id: true, locationId: true, shift: true, location: { select: { name: true } } },
      orderBy: { startedAt: 'asc' },
    });

    const saidaEm = new Date();
    const ocupacoesEncerradas: OcupacaoEncerrada[] = [];
    for (const ocupacao of ocupacoes) {
      await tx.locationOccupant.update({
        where: { id: ocupacao.id },
        // `endedAt` e NADA mais: a linha continua na tabela, como no
        // encerramento avulso — "quem respondia pela Mesa 1 em março?" precisa
        // continuar respondível depois da saída.
        data: { endedAt: saidaEm },
      });

      // `END`, não `DELETE`: o vínculo terminou, não foi cadastrado errado. As
      // duas palavras existem separadas no `ActivityAction` exatamente para o
      // histórico distinguir os dois eventos.
      await recordActivity(tx, {
        entityType: 'LocationOccupant',
        entityId: ocupacao.id,
        action: 'END',
        changes: {
          motivo: 'OFFBOARD',
          userId,
          locationId: ocupacao.locationId,
          shift: ocupacao.shift,
          endedAt: saidaEm.toISOString(),
        },
      }, actorId);

      ocupacoesEncerradas.push({
        id: ocupacao.id,
        locationId: ocupacao.locationId,
        locationName: ocupacao.location.name,
        shift: ocupacao.shift,
      });
    }

    // ── 3. DESLIGAR a pessoa ───────────────────────────────────────────────
    //
    // Por último de propósito: se qualquer devolução ou encerramento falhar, a
    // transação volta atrás e a pessoa NÃO fica marcada como desligada com
    // pendência aberta — o estado que faria o 409 do `DELETE` disparar sem que
    // ninguém entendesse por quê.
    const desligada = await tx.user.update({
      where: { id: userId },
      data: { isActive: false, terminatedAt: saidaEm },
      select: USER_DETAIL_SELECT,
    });

    // O log do DESLIGAMENTO em si, além dos N de checkin e dos M de END: é a
    // linha que alguém procura pelo nome da pessoa, e ela carrega o placar do
    // que a operação fechou. Sem ela, o histórico teria as consequências
    // espalhadas por duas entidades e nenhum registro do ato.
    await recordActivity(tx, {
      entityType: 'User',
      entityId: userId,
      action: 'OFFBOARD',
      changes: {
        terminatedAt: saidaEm.toISOString(),
        ativosDevolvidos: devolvidos.length,
        ocupacoesEncerradas: ocupacoesEncerradas.length,
        notes: data.notes ?? null,
      },
    }, actorId);

    return {
      user: {
        id: desligada.id,
        name: desligada.name,
        email: desligada.email,
        isActive: desligada.isActive,
        terminatedAt: desligada.terminatedAt,
      },
      devolvidos,
      ocupacoesEncerradas,
    };
  });
}
