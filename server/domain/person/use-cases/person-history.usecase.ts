import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { listPersonOccupancies } from '../../occupancy/use-cases/list-person-occupancies.usecase';
import { buscarEntregasDaPessoa } from '../../license/use-cases/list-target-checkouts.usecase';
import { eventosDaEntregaDeLicenca, type EventoDeLicenca } from '../../license/helpers/license-events.helper';
import { agruparPorLote, chaveDoLote } from '../../stock/helpers/stock-lote.helper';

// A LINHA DO TEMPO DE UMA PESSOA — o Histórico da ficha do colaborador.
//
// O espelho de `asset/use-cases/asset-history.usecase.ts`, e ele é o modelo:
// mesma forma de evento, mesmo envelope, mesma regra de corte. O que muda é o
// número de fontes — aqui são QUATRO, porque a pessoa participa de relações que
// o ativo não tem dos dois lados.
//
// O QUE ESTA LEITURA RESPONDE: *por onde esta pessoa passou* — o que recebeu,
// onde sentou, que licenças usou, que estoque esteve no nome dela. É só movimentação: cadastro, edição e
// desativação ficam na auditoria (`audit_logs`, AB), que tela nenhuma lê.

/** De onde o evento veio. A tela usa para escolher o ícone e o título. */
type FonteDoEventoDaPessoa = 'POSSE' | 'POSTO' | 'LICENCA' | 'ESTOQUE';

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

/**
 * O que um evento de estoque acrescenta: QUAL item e quantas unidades. É a
 * SAÍDA, não a unidade — "recebeu 3 Mouse USB", como o histórico do item.
 */
interface EventoDeEstoqueDaPessoa {
  /** Nulo quando o item foi excluído: o nome continua em `itemLabel` (AG). */
  itemId: string | null;
  itemLabel: string;
  unidades: number;
  /** A observação é da entrega; a devolução não tem a sua. */
  notes: string | null;
}

export interface EventoDaPessoa {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: todas têm uuid próprio,
   * e uma posse, uma ocupação ou uma entrega de licença rendem DOIS eventos (a
   * abertura e o fechamento), que colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  fonte: FonteDoEventoDaPessoa;
  action: string;
  at: Date;
  posse: EventoDePosseDaPessoa | null;
  posto: EventoDePostoDaPessoa | null;
  /** Só as licenças entregues A ELA — as do computador que ela usa são dele (AA). */
  licenca: EventoDeLicenca | null;
  /** Só o estoque no NOME dela — o da mesa que ela ocupa é do posto. */
  estoque: EventoDeEstoqueDaPessoa | null;
}

/** Quanto a tela recebe quando não pede nada. O TETO é do schema, na borda. */
const LIMITE_PADRAO = 100;

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
    posse: { ...base, notes: posse.checkoutNotes },
    posto: null,
    licenca: null,
    estoque: null,
  };

  if (!posse.checkinAt) return [entrega];

  return [
    {
      id: `posse:${posse.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: posse.checkinAt,
      posse: { ...base, notes: posse.checkinNotes },
      posto: null,
      licenca: null,
      estoque: null,
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

  // `CREATE` e `END` são as palavras que a auditoria usa para
  // `WorkstationOccupant` (audit/use-cases/record-audit.usecase.ts). Um par
  // próprio aqui — `OCCUPY`/`LEAVE` — daria ao sistema dois vocabulários para o
  // mesmo evento. É o `fonte` POSTO que a tela traduz para "entrou no posto".
  const entrada: EventoDaPessoa = {
    id: `posto:${ocupacao.id}:entrada`,
    fonte: 'POSTO',
    action: 'CREATE',
    at: ocupacao.startedAt,
    posse: null,
    posto: base,
    licenca: null,
    estoque: null,
  };

  if (!ocupacao.endedAt) return [entrada];

  return [
    {
      id: `posto:${ocupacao.id}:saida`,
      fonte: 'POSTO',
      action: 'END',
      at: ocupacao.endedAt,
      posse: null,
      posto: base,
      licenca: null,
      estoque: null,
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

/**
 * As unidades de estoque que já estiveram no NOME da pessoa — abertas e
 * devolvidas. O item desativado continua aparecendo: a entrega aconteceu.
 */
function buscarUnidades(personId: string) {
  return prisma.stockMovement.findMany({
    where: { targetPersonId: personId },
    select: {
      id: true,
      itemId: true,
      itemName: true,
      createdAt: true,
      checkoutAt: true,
      returnedAt: true,
      returnRecordedAt: true,
      notes: true,
      targetType: true,
      targetPersonId: true,
      targetWorkstationId: true,
      targetWorkstationName: true,
      item: { select: { name: true } },
    },
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });
}

/**
 * As unidades viram eventos POR SAÍDA, como no histórico do item: a entrega é
 * a saída inteira; cada devolução, as unidades dela registradas juntas (o mesmo
 * `returnRecordedAt` — duas devoluções no mesmo dia são duas). No mesmo
 * instante, a devolução vem antes da entrega.
 */
function eventosDoEstoque(unidades: Awaited<ReturnType<typeof buscarUnidades>>): EventoDaPessoa[] {
  const eventos: EventoDaPessoa[] = [];
  for (const { primeira, unidades: quantas } of agruparPorLote(unidades)) {
    const doLote = unidades.filter((unidade) => chaveDoLote(unidade) === chaveDoLote(primeira));
    // O item excluído deixa o nome por escrito na saída (AG).
    const base = { itemId: primeira.itemId, itemLabel: primeira.item?.name ?? primeira.itemName ?? '—' };

    // Chave: o instante do registro; valor: o dia da devolução e quantas.
    const devolucoes = new Map<number, { at: Date; devolvidas: number }>();
    for (const unidade of doLote) {
      if (!unidade.returnedAt || !unidade.returnRecordedAt) continue;
      const registro = unidade.returnRecordedAt.getTime();
      const devolucao = devolucoes.get(registro);
      if (devolucao) devolucao.devolvidas += 1;
      else devolucoes.set(registro, { at: unidade.returnedAt, devolvidas: 1 });
    }
    // A mais recente primeiro: no mesmo dia, o `sort` estável do merge mantém
    // esta ordem.
    for (const [registro, { at, devolvidas }] of [...devolucoes].sort(([a], [b]) => b - a)) {
      eventos.push({
        id: `estoque:${primeira.id}:devolucao:${registro}`,
        fonte: 'ESTOQUE',
        action: 'CHECKIN',
        at,
        posse: null,
        posto: null,
        licenca: null,
        estoque: { ...base, unidades: devolvidas, notes: null },
      });
    }

    eventos.push({
      id: `estoque:${primeira.id}:entrega`,
      fonte: 'ESTOQUE',
      action: 'CHECKOUT',
      at: primeira.checkoutAt,
      posse: null,
      posto: null,
      licenca: null,
      estoque: { ...base, unidades: quantas, notes: primeira.notes },
    });
  }
  return eventos;
}

type PosseDaPessoa = Awaited<ReturnType<typeof buscarPosses>>[number];
type OcupacaoDaPessoa = Awaited<ReturnType<typeof listPersonOccupancies>>[number];

/**
 * Tudo que aconteceu com uma pessoa, do mais recente para o mais antigo.
 *
 * Quatro fontes, uma lista: as posses diretas (o que ela recebeu e devolveu),
 * as ocupações de posto (onde ela sentou e quando saiu), as licenças entregues
 * a ela e o estoque no nome dela. Juntar e cortar depois do merge devolve o
 * topo REAL.
 */
export async function getPersonHistory(
  personId: string,
  limite = LIMITE_PADRAO,
): Promise<ListEnvelope<EventoDaPessoa>> {
  // `listPersonOccupancies` é quem confere se a pessoa existe (404) — o mesmo
  // 404 da ficha, escrito uma vez só. Importado do domínio de ocupação, nunca
  // recopiado: a leitura da Camada 2 é de lá.
  const [ocupacoes, posses, entregasDeLicenca, unidades] = await Promise.all([
    listPersonOccupancies(personId, 'all'),
    buscarPosses(personId),
    buscarEntregasDaPessoa(personId, { abertas: false }),
    buscarUnidades(personId),
  ]);

  const daPosse = posses.flatMap(eventosDaPosse);
  const doPosto = ocupacoes.flatMap(eventosDoPosto);
  const daLicenca: EventoDaPessoa[] = entregasDeLicenca.flatMap((entrega) => eventosDaEntregaDeLicenca(entrega)
    .map((evento) => ({ ...evento, fonte: 'LICENCA' as const, posse: null, posto: null, estoque: null })));
  const doEstoque = eventosDoEstoque(unidades);

  const eventos = [...daPosse, ...doPosto, ...daLicenca, ...doEstoque]
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  // `total` conta TODAS as fontes: é ele que diz à tela que existe história
  // além do teto — sem ele, uma lista cortada em 100 é indistinguível de uma
  // pessoa com exatamente 100 eventos.
  return {
    total: eventos.length,
    rows: eventos.slice(0, limite),
  };
}
