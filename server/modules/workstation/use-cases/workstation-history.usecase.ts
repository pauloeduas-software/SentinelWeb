import { prisma } from '../../../infra/database/prismaClient';
import type { ListEnvelope } from '../../../infra/http/list-query';
import { listWorkstationOccupants } from '../../occupancy/use-cases/list-workstation-occupants.usecase';
import { buscarUnidadesDoAlvo, eventosDasUnidades, type EventoDeEstoque } from '../../stock/helpers/stock-events.helper';
import { rotuloDoComputador } from '../../stock/helpers/stock-select.helper';

// A LINHA DO TEMPO DE UM POSTO — a aba Histórico da ficha (BP).
//
// O espelho de `person/use-cases/person-history.usecase.ts`, e ele é o modelo:
// mesma forma de evento, mesmo envelope, mesma regra de corte.
//
// O QUE ESTA LEITURA RESPONDE: *o que passou por esta mesa* — quem entrou e saiu,
// e o computador e o estoque que foram entregues a ela. É só movimentação: cadastro
// e edição ficam na auditoria (`audit_logs`, AB). Licença não entra porque não vai
// para posto (D39).

/** De onde o evento veio. A tela usa para escolher o ícone e o título. */
type FonteDoEventoDoPosto = 'OCUPACAO' | 'POSSE' | 'ESTOQUE';

/** O que um evento de ocupação acrescenta: QUEM entrou ou saiu, e em que turno. */
interface EventoDeOcupacaoDoPosto {
  occupantId: string;
  personId: string;
  personLabel: string;
  shift: string | null;
  notes: string | null;
}

/** O que um evento de posse acrescenta: QUAL computador. */
interface EventoDePosseDoPosto {
  assignmentId: string;
  assetId: string;
  /** "ATV-00012 — Dell Latitude", ou só a etiqueta quando o ativo não tem nome. */
  assetLabel: string;
  /** As observações da entrega ou da devolução, conforme o evento. */
  notes: string | null;
}

export interface EventoDoPosto {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: uma ocupação ou uma posse
   * rendem DOIS eventos, que colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  fonte: FonteDoEventoDoPosto;
  action: string;
  at: Date;
  ocupacao: EventoDeOcupacaoDoPosto | null;
  posse: EventoDePosseDoPosto | null;
  /** Só o estoque entregue À MESA: o que está no nome de quem a ocupa é da pessoa. */
  estoque: EventoDeEstoque | null;
}

/** Quanto a tela recebe quando não pede nada. O TETO é do schema, na borda. */
const LIMITE_PADRAO = 100;

/** Uma ocupação vira UM ou DOIS eventos: a entrada sempre, a saída se houve. */
function eventosDaOcupacao(ocupacao: OcupacaoDoPosto): EventoDoPosto[] {
  const base = {
    occupantId: ocupacao.id,
    personId: ocupacao.personId,
    personLabel: ocupacao.person.name,
    shift: ocupacao.shift,
    notes: ocupacao.notes,
  };

  // `CREATE` e `END`: o vocabulário da auditoria para a ocupação, como no
  // histórico da pessoa. Quem traduz para "entrou no posto" é a tela.
  const entrada: EventoDoPosto = {
    id: `ocupacao:${ocupacao.id}:entrada`,
    fonte: 'OCUPACAO',
    action: 'CREATE',
    at: ocupacao.startedAt,
    ocupacao: base,
    posse: null,
    estoque: null,
  };

  if (!ocupacao.endedAt) return [entrada];

  return [
    {
      id: `ocupacao:${ocupacao.id}:saida`,
      fonte: 'OCUPACAO',
      action: 'END',
      at: ocupacao.endedAt,
      ocupacao: base,
      posse: null,
      estoque: null,
    },
    entrada,
  ];
}

/** Uma posse vira UM ou DOIS eventos: a entrega sempre, a devolução se houve. */
function eventosDaPosse(posse: PosseDoPosto): EventoDoPosto[] {
  const base = {
    assignmentId: posse.id,
    assetId: posse.assetId,
    assetLabel: rotuloDoComputador(posse.asset),
  };

  const entrega: EventoDoPosto = {
    id: `posse:${posse.id}:entrega`,
    fonte: 'POSSE',
    action: 'CHECKOUT',
    at: posse.checkoutAt,
    ocupacao: null,
    posse: { ...base, notes: posse.checkoutNotes },
    estoque: null,
  };

  if (!posse.checkinAt) return [entrega];

  return [
    {
      id: `posse:${posse.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: posse.checkinAt,
      ocupacao: null,
      posse: { ...base, notes: posse.checkinNotes },
      estoque: null,
    },
    entrega,
  ];
}

/**
 * As posses do posto, abertas e fechadas. Ativo na lixeira continua aparecendo,
 * como no histórico da pessoa: a entrega aconteceu.
 */
function buscarPosses(workstationId: string) {
  return prisma.assignment.findMany({
    where: { targetWorkstationId: workstationId },
    select: {
      id: true,
      assetId: true,
      checkoutAt: true,
      checkinAt: true,
      checkoutNotes: true,
      checkinNotes: true,
      asset: { select: { assetTag: true, name: true } },
    },
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }],
  });
}

type PosseDoPosto = Awaited<ReturnType<typeof buscarPosses>>[number];
type OcupacaoDoPosto = Awaited<ReturnType<typeof listWorkstationOccupants>>[number];

/**
 * Tudo que passou por um posto, do mais recente para o mais antigo.
 *
 * Três fontes, uma lista: as ocupações, as posses e o estoque entregue à mesa.
 * Juntar e cortar depois do merge devolve o topo REAL, e `total` conta as três.
 */
export async function getWorkstationHistory(
  workstationId: string,
  limite = LIMITE_PADRAO,
  pagina = 1,
): Promise<ListEnvelope<EventoDoPosto>> {
  // `listWorkstationOccupants` é quem confere se o posto existe (404): o mesmo
  // 404 da aba Responsáveis, escrito uma vez só.
  const [ocupacoes, posses, unidades] = await Promise.all([
    listWorkstationOccupants(workstationId, 'all'),
    buscarPosses(workstationId),
    buscarUnidadesDoAlvo({ targetWorkstationId: workstationId }),
  ]);

  const daOcupacao = ocupacoes.flatMap(eventosDaOcupacao);
  const daPosse = posses.flatMap(eventosDaPosse);
  const doEstoque: EventoDoPosto[] = eventosDasUnidades(unidades)
    .map((evento) => ({ ...evento, fonte: 'ESTOQUE' as const, ocupacao: null, posse: null }));

  const eventos = [...daOcupacao, ...daPosse, ...doEstoque]
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  return { total: eventos.length, rows: eventos.slice((pagina - 1) * limite, pagina * limite) };
}
