import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import type { ClienteLicenca } from '../helpers/license-seats.helper';

// A DEVOLUÇÃO DOS ASSENTOS NO DESLIGAMENTO — a linha mais importante da F6.
//
// ═════════════════════════════════════════════════════════════════════════════
// SEM ESTE ARQUIVO, UM DESLIGADO FICA COM ASSENTO DE LICENÇA PARA SEMPRE.
//
// O `offboard` fecha posses, ocupações e acessórios. A licença ficaria de fora,
// e o sintoma não é um erro — é um número de assentos ocupados que NUNCA DESCE.
// A empresa compra assento novo porque "não tem livre", e os livres estão com
// gente que saiu meses atrás. Nenhuma consulta acusa, porque todas as linhas
// estão corretas: o assento está ocupado, a ocupação está aberta, o saldo bate.
//
// É o mesmo erro que o D82 descreve — o passo que não dá erro quando falta —, e
// é por isso que ele entrou no MESMO arquivo dos outros três, e não numa rota
// própria que alguém precisasse lembrar de chamar.
// ═════════════════════════════════════════════════════════════════════════════
//
// ─────────────────────────────────────────────────────────────────────────────
// O `assignedUserId` DO `where` É O QUE IMPEDE O DESLIGAMENTO DE DESLICENCIAR
// A MÁQUINA.
//
// Sem ele, desligar a Laura devolveria também o assento do desktop da Mesa 1 —
// que continua ligado, com o mesmo software instalado, agora usado pela Ana. O
// inventário passaria a dizer que aquele assento está livre, alguém o
// entregaria a outra pessoa, e a máquina ficaria rodando software sem licença
// atribuída. É o mesmo erro do `checkin-user-accessories.usecase.ts` da F5, com
// uma diferença: ali a unidade fica na mesa e o saldo mente; aqui o assento é
// REENTREGUE a outra pessoa e a exposição vira dupla.
//
// O que é do ATIVO se resolve quando o ativo for devolvido ou descomissionado,
// não quando alguém sai.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssentoDevolvido {
  checkoutId: string;
  seatId: string;
  seatNumber: number;
  licenseId: string;
  licenseName: string;
  /** Devolver numa licença não reatribuível DESTRÓI o assento (D43). */
  queimado: boolean;
}

/**
 * Fecha os assentos de alvo `USER` desta pessoa, DENTRO da transação do
 * desligamento.
 *
 * Recebe o `tx` e não abre transação própria: as devoluções, os ativos, os
 * acessórios e as ocupações do `offboardUser` são UM fato. Metade aplicada é o
 * pior de todos os estados.
 *
 * A QUEIMA VALE AQUI TAMBÉM, e é pior do que num clique: `reassignable = false`
 * mais desligamento destrói valor num fluxo automático, em que ninguém está
 * olhando para a licença. Por isso o retorno carrega `queimado` por assento — é
 * o que a tela do desligamento mostra ANTES de confirmar, e o que o log
 * registra depois.
 */
export async function devolverAssentosDoUsuario(
  client: ClienteLicenca,
  userId: string,
  notes: string | null,
  actorId: string | null,
): Promise<AssentoDevolvido[]> {
  const abertas = await client.licenseSeatCheckout.findMany({
    where: {
      // ⬇ A linha. Ver o bloco no topo do arquivo antes de mexer nela.
      assignedUserId: userId,
      checkinAt: null,
      // A MESMA condição do `contarAssentosDoUsuario`, e as duas têm que ser a
      // mesma: o 409 do `DELETE` conta o que esta consulta fecha. Fosse
      // diferente, uma licença na lixeira com assento aberto travaria o
      // colaborador para sempre.
      seat: { license: { deletedAt: null } },
    },
    select: {
      id: true,
      seat: {
        select: {
          id: true, seatNumber: true, burnedAt: true, licenseId: true,
          license: { select: { name: true, reassignable: true } },
        },
      },
    },
    orderBy: { checkoutAt: 'asc' },
  });

  if (abertas.length === 0) return [];

  const devolvidoEm = new Date();

  // Um `updateMany` só para as N linhas: são todas da mesma pessoa, com o mesmo
  // carimbo e a mesma nota — um laço com N `update` faria N viagens ao banco
  // para escrever exatamente o mesmo valor.
  // `checkinAt: null` REPETIDO no `where`, e não é redundância: entre o
  // `findMany` acima e este `UPDATE` cabe uma devolução manual da mesma
  // ocupação (o `offboard` trava a PESSOA, e o checkin de assento trava o
  // ASSENTO — os dois não se cruzam). Sem a condição, o desligamento
  // reescreveria `checkinAt`, `checkinNotes` e `checkinById` de uma devolução
  // que já aconteceu, apagando quem de fato devolveu. Em READ COMMITTED o
  // Postgres reavalia o `where` depois de esperar a linha, então a condição
  // simplesmente não casa e a linha é pulada.
  await client.licenseSeatCheckout.updateMany({
    where: { id: { in: abertas.map((ocupacao) => ocupacao.id) }, checkinAt: null },
    data: { checkinAt: devolvidoEm, checkinNotes: notes, checkinById: actorId },
  });

  const aQueimar = abertas.filter((o) => !o.seat.license.reassignable && !o.seat.burnedAt);
  if (aQueimar.length > 0) {
    await client.licenseSeat.updateMany({
      where: { id: { in: aQueimar.map((o) => o.seat.id) } },
      data: { burnedAt: devolvidoEm },
    });
  }

  const queimados = new Set(aQueimar.map((o) => o.seat.id));

  // O log é POR LICENÇA, não um só para o lote: quem abre o histórico do Office
  // quer ver que aquele assento voltou naquele dia, e uma linha única pendurada
  // no usuário não apareceria naquela tela.
  for (const ocupacao of abertas) {
    const queimado = queimados.has(ocupacao.seat.id);

    await recordActivity(client, {
      entityType: 'License',
      entityId: ocupacao.seat.licenseId,
      action: 'CHECKIN',
      changes: {
        checkoutId: ocupacao.id,
        seatId: ocupacao.seat.id,
        seatNumber: ocupacao.seat.seatNumber,
        alvo: 'USER',
        alvoId: userId,
        motivo: 'OFFBOARD',
        queimado,
        checkinAt: devolvidoEm.toISOString(),
      },
    }, actorId);

    // A queima tem log próprio também no desligamento, e aqui ela importa MAIS:
    // é perda patrimonial acontecendo sem ninguém clicar em nada.
    if (queimado) {
      await recordActivity(client, {
        entityType: 'License',
        entityId: ocupacao.seat.licenseId,
        action: 'RETIRE',
        changes: {
          motivo: 'QUEIMA_NO_DESLIGAMENTO',
          seatId: ocupacao.seat.id,
          seatNumber: ocupacao.seat.seatNumber,
          userId,
          burnedAt: devolvidoEm.toISOString(),
        },
      }, actorId);
    }
  }

  return abertas.map((ocupacao) => ({
    checkoutId: ocupacao.id,
    seatId: ocupacao.seat.id,
    seatNumber: ocupacao.seat.seatNumber,
    licenseId: ocupacao.seat.licenseId,
    licenseName: ocupacao.seat.license.name,
    queimado: queimados.has(ocupacao.seat.id),
  }));
}
