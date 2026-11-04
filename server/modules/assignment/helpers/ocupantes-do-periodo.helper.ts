import { hojeNoBrasil } from '../../shared/hoje.helper';

// QUEM OCUPOU O POSTO DURANTE UMA ENTREGA (AW) — função pura, sem I/O.
//
// É a resposta a "quem respondia por este computador em março?". Snipe-IT e
// GLPI a dão pelo histórico do ativo, porque lá a entrega é a uma pessoa; aqui a
// entrega é ao posto, e as pessoas estão na ocupação. A junção é a mesma da
// Camada 3 (docs/referencia/modelo-de-posse.md), só que no passado: calculada na
// hora, sem guardar nada.

/** Uma ocupação lida para o cruzamento. */
export interface OcupacaoLida {
  id: string;
  /** O posto vivo, ou nulo no excluído — e então o id vem em `workstationFormerId`. */
  workstationId: string | null;
  workstationFormerId: string | null;
  shift: string | null;
  startedAt: Date;
  endedAt: Date | null;
  person: { id: string; name: string; email: string | null; createdAt: Date };
}

/** O que a linha do histórico mostra de cada ocupante. */
export interface OcupanteDoPeriodo {
  id: string;
  shift: string | null;
  startedAt: Date;
  endedAt: Date | null;
  person: OcupacaoLida['person'];
}

/** A entrega, só com o que o cruzamento usa. */
interface PeriodoDaEntrega {
  targetWorkstationId: string | null;
  targetWorkstationFormerId: string | null;
  checkoutAt: Date;
  checkinAt: Date | null;
}

/**
 * O posto de uma linha, vivo ou excluído. É o ID, nunca o nome: um posto novo
 * com o nome do que saiu misturaria as pessoas dos dois, e numa auditoria
 * apontar a pessoa errada é pior que não apontar ninguém.
 */
export function postoDaLinha(linha: { workstationId?: string | null; workstationFormerId?: string | null }): string | null {
  return linha.workstationId ?? linha.workstationFormerId ?? null;
}

/**
 * As ocupações do posto que se sobrepõem ao período da entrega.
 *
 * POR DIA, como a tela: o dia passado é gravado ao meio-dia e o de hoje com a
 * hora real (`instanteDoDia`), então comparar instantes diria que a Laura, que
 * saiu do posto no dia 10, não estava lá quando o computador chegou no dia 10
 * às 15h. Dividir o dia conta como sobrepor: os dois responderam naquele dia.
 * Aberto, de um lado ou do outro, é até hoje.
 */
export function ocupantesDoPeriodo(
  entrega: PeriodoDaEntrega,
  ocupacoes: readonly OcupacaoLida[],
): OcupanteDoPeriodo[] {
  const posto = entrega.targetWorkstationId ?? entrega.targetWorkstationFormerId;
  if (!posto) return [];

  const inicio = hojeNoBrasil(entrega.checkoutAt);
  const fim = entrega.checkinAt ? hojeNoBrasil(entrega.checkinAt) : null;

  return ocupacoes
    .filter((ocupacao) => postoDaLinha(ocupacao) === posto)
    .filter((ocupacao) => {
      const entrou = hojeNoBrasil(ocupacao.startedAt);
      const saiu = ocupacao.endedAt ? hojeNoBrasil(ocupacao.endedAt) : null;
      const entrouAntesDoFim = fim === null || entrou <= fim;
      const saiuDepoisDoInicio = saiu === null || saiu >= inicio;
      return entrouAntesDoFim && saiuDepoisDoInicio;
    })
    .map(({ id, shift, startedAt, endedAt, person }) => ({ id, shift, startedAt, endedAt, person }));
}
