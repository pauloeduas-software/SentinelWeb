import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { listPersonOccupancies } from '../../occupancy/use-cases/list-person-occupancies.usecase';

// A LINHA DO TEMPO DE UMA PESSOA — o Histórico da ficha do colaborador.
//
// O espelho de `asset/use-cases/asset-history.usecase.ts`, e ele é o modelo:
// mesma forma de evento, mesmo envelope, mesma regra de corte. O que muda é o
// número de fontes — aqui são TRÊS, porque a pessoa participa de duas relações
// que o ativo não tem dos dois lados.
//
// O QUE ESTA LEITURA RESPONDE: *o que aconteceu COM esta pessoa.* Por isso a
// consulta é por `entityId`. Não diz quem operou: o histórico não guarda o
// autor (X).

/**
 * De onde o evento veio. A tela usa para escolher o ícone e o que mostrar — um
 * diff de campos não se lê como uma entrega nem como uma ocupação de posto.
 */
type FonteDoEventoDaPessoa = 'ATIVIDADE' | 'POSSE' | 'POSTO';

/** O que um evento de posse acrescenta: QUAL equipamento ela recebeu. */
interface EventoDePosseDaPessoa {
  assignmentId: string;
  assetId: string;
  /** "ATV-00012 — Dell Latitude", ou só a etiqueta quando o ativo não tem nome. */
  assetLabel: string;
  /** As observações da entrega ou da devolução, conforme o evento. */
  notes: string | null;
  expectedCheckinAt: Date | null;
}

/** O que um evento de posto acrescenta: QUAL posto, e em que turno. */
interface EventoDePostoDaPessoa {
  occupantId: string;
  /** Nulo quando o posto foi excluído: o nome continua em `workstationLabel`. */
  workstationId: string | null;
  workstationLabel: string;
  shift: string | null;
  notes: string | null;
}

export interface EventoDaPessoa {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: as três têm uuid próprio,
   * e tanto uma posse quanto uma ocupação rendem DOIS eventos (a abertura e o
   * fechamento), que colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  fonte: FonteDoEventoDaPessoa;
  action: string;
  at: Date;
  changes: Prisma.JsonValue | null;
  posse: EventoDePosseDaPessoa | null;
  posto: EventoDePostoDaPessoa | null;
}

/** Quanto a tela recebe quando não pede nada. O TETO é do schema, na borda. */
const LIMITE_PADRAO = 100;

/**
 * AQUI NÃO HÁ LISTA DE EXCLUSÃO, e a ausência dela é o ponto.
 *
 * O histórico do ativo precisa tirar `CHECKOUT` e `CHECKIN` do `ActivityLog`
 * porque lá os mesmos dois eventos chegam pelas duas fontes — o log grava
 * `entityType: 'Asset'` para a entrega, e a tabela de posse descreve a mesma
 * entrega com mais dado. Contar as duas seria contar a entrega em dobro.
 *
 * Do lado da pessoa isso não acontece: a entrega é gravada no ATIVO
 * (`entityType: 'Asset'`) e a ocupação é gravada na OCUPAÇÃO
 * (`entityType: 'WorkstationOccupant'`) — nenhuma das duas cai numa consulta por
 * `entityType: 'Person'`. As três fontes são disjuntas por construção, e é por
 * isso que a soma dos totais fecha sem subtrair nada.
 */
const ENTITY_TYPE = 'Person';

function rotuloDoAtivo(asset: { assetTag: string; name: string | null }): string {
  return asset.name ? `${asset.assetTag} — ${asset.name}` : asset.assetTag;
}

/** Uma posse vira UM ou DOIS eventos: a entrega sempre, a devolução se houve. */
function eventosDaPosse(posse: PosseDaPessoa): EventoDaPessoa[] {
  const base = {
    assignmentId: posse.id,
    assetId: posse.assetId,
    assetLabel: rotuloDoAtivo(posse.asset),
    expectedCheckinAt: posse.expectedCheckinAt,
  };

  const entrega: EventoDaPessoa = {
    id: `posse:${posse.id}:entrega`,
    fonte: 'POSSE',
    action: 'CHECKOUT',
    at: posse.checkoutAt,
    changes: null,
    posse: { ...base, notes: posse.checkoutNotes },
    posto: null,
  };

  if (!posse.checkinAt) return [entrega];

  return [
    {
      id: `posse:${posse.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: posse.checkinAt,
      changes: null,
      posse: { ...base, notes: posse.checkinNotes },
      posto: null,
    },
    entrega,
  ];
}

/** Uma ocupação vira UM ou DOIS eventos: a entrada sempre, a saída se houve. */
function eventosDoPosto(ocupacao: OcupacaoDaPessoa): EventoDaPessoa[] {
  const base = {
    occupantId: ocupacao.id,
    workstationId: ocupacao.workstationId,
    // O posto excluído deixou o nome por escrito (`workstationSpec.beforeDelete`).
    workstationLabel: ocupacao.workstation?.name ?? ocupacao.workstationName ?? '—',
    shift: ocupacao.shift,
    notes: ocupacao.notes,
  };

  // `CREATE` e `END` são as palavras que o `ActivityLog` já usa para
  // `WorkstationOccupant` (activity/use-cases/record-activity.usecase.ts). Um par
  // próprio aqui — `OCCUPY`/`LEAVE` — daria ao sistema dois vocabulários para o
  // mesmo evento, e a tela teria de conhecer os dois. É o `fonte` que desfaz a
  // ambiguidade com o `CREATE` da pessoa: (ATIVIDADE, CREATE) é "cadastrado",
  // (POSTO, CREATE) é "entrou no posto".
  const entrada: EventoDaPessoa = {
    id: `posto:${ocupacao.id}:entrada`,
    fonte: 'POSTO',
    action: 'CREATE',
    at: ocupacao.startedAt,
    changes: null,
    posse: null,
    posto: base,
  };

  if (!ocupacao.endedAt) return [entrada];

  return [
    {
      id: `posto:${ocupacao.id}:saida`,
      fonte: 'POSTO',
      action: 'END',
      at: ocupacao.endedAt,
      changes: null,
      posse: null,
      posto: base,
    },
    entrada,
  ];
}

/**
 * As posses DIRETAS da pessoa — alvo `PERSON`, abertas e fechadas.
 *
 * O ativo vem embutido porque a linha é lida POR EQUIPAMENTO ("recebeu o
 * notebook"), e uma consulta por linha só para escrever a etiqueta seria N+1.
 *
 * ATIVO NA LIXEIRA CONTINUA APARECENDO, de propósito. A extension de soft
 * delete não alcança leitura aninhada (documentado nos riscos da F2), e aqui
 * isso joga a favor: a entrega aconteceu, e esconder a linha porque o ativo foi
 * excluído depois faria o histórico mentir por omissão. O que seria erro na
 * listagem é o comportamento certo numa trilha append-only.
 */
function buscarPosses(personId: string) {
  return prisma.assignment.findMany({
    where: { targetType: 'PERSON', targetPersonId: personId },
    select: {
      id: true,
      assetId: true,
      checkoutAt: true,
      checkinAt: true,
      expectedCheckinAt: true,
      checkoutNotes: true,
      checkinNotes: true,
      asset: { select: { assetTag: true, name: true } },
    },
    // `createdAt` como desempate, pelo mesmo motivo de `listAssetAssignments`:
    // entre entregas com o mesmo `checkoutAt` o Postgres não promete ordem.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }],
  });
}

type PosseDaPessoa = Awaited<ReturnType<typeof buscarPosses>>[number];
type OcupacaoDaPessoa = Awaited<ReturnType<typeof listPersonOccupancies>>[number];

/**
 * Tudo que aconteceu com uma pessoa, do mais recente para o mais antigo.
 *
 * Três fontes, uma lista: o `ActivityLog` (cadastro, edição com o diff campo a
 * campo, desativação), as posses
 * diretas (o que ela recebeu e devolveu) e as ocupações de posto (onde ela
 * sentou e quando saiu).
 *
 * Buscar o topo de cada fonte e cortar depois do merge devolve o topo REAL: um
 * log que ficou fora da janela é, por construção, mais antigo que os que
 * entraram, e nenhum merge o traria de volta para dentro.
 */
export async function getPersonHistory(
  personId: string,
  limite = LIMITE_PADRAO,
): Promise<ListEnvelope<EventoDaPessoa>> {
  const where = { entityType: ENTITY_TYPE, entityId: personId };

  // `listPersonOccupancies` é quem confere se a pessoa existe (404) — o mesmo
  // 404 da ficha, escrito uma vez só. Importado do domínio de ocupação, nunca
  // recopiado: a leitura da Camada 2 é de lá.
  const [ocupacoes, posses, logs, totalDeLogs] = await Promise.all([
    listPersonOccupancies(personId, 'all'),
    buscarPosses(personId),
    prisma.activityLog.findMany({
      where,
      select: { id: true, action: true, changes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limite,
    }),
    prisma.activityLog.count({ where }),
  ]);

  const doLog: EventoDaPessoa[] = logs.map((linha) => ({
    id: `log:${linha.id}`,
    fonte: 'ATIVIDADE',
    action: linha.action,
    at: linha.createdAt,
    changes: linha.changes,
    posse: null,
    posto: null,
  }));

  const daPosse = posses.flatMap(eventosDaPosse);
  const doPosto = ocupacoes.flatMap(eventosDoPosto);

  const eventos = [...doLog, ...daPosse, ...doPosto].sort((a, b) => b.at.getTime() - a.at.getTime());

  // `total` conta as TRÊS fontes: é ele que diz à tela que existe história além
  // do teto — sem ele, uma lista cortada em 100 é indistinguível de uma pessoa
  // com exatamente 100 eventos.
  return { total: totalDeLogs + daPosse.length + doPosto.length, rows: eventos.slice(0, limite) };
}
