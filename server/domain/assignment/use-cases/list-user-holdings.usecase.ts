import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSET_SELECT } from '../../asset/helpers/asset-select.helper';

// "Quais ativos a Laura responde?" — a pergunta que o MODELO-POSSE.md diz que
// passa a existir com as três camadas, e que o `Asset.assignedToId` sozinho
// nunca respondeu: ele só conhece o caso `USER`.
//
// A resposta tem DUAS origens e elas ficam separadas na saída de propósito. A
// posse direta se desfaz com uma devolução; a do posto se desfaz com uma troca
// de escala — e quem vai desligar a Laura amanhã precisa ver as duas listas
// para saber o que cobrar dela e o que só muda de turno.

/** Mesma forma de ativo da listagem principal — ver `ASSET_SELECT`. */
function buscarAtivos(where: object) {
  return prisma.asset.findMany({
    where,
    select: ASSET_SELECT,
    // Por etiqueta: é o que a pessoa lê no adesivo colado no equipamento na
    // hora de conferir a lista.
    orderBy: { assetTag: 'asc' },
  });
}

type AtivoEmPosse = Awaited<ReturnType<typeof buscarAtivos>>[number];

/**
 * Por qual posto a responsabilidade chegou.
 *
 * Vem embutido em cada ativo, e NÃO se deduz do `asset.location` que já está na
 * resposta: `locationId` é ONDE o ativo está, e o alvo da posse é DE QUEM ele
 * é. Os dois divergem no caso que o próprio MODELO-POSSE.md descreve — o mouse
 * guardado na gaveta da Mesa 1 está na sala e não é do posto. Agrupar no
 * cliente pelo campo errado daria uma lista plausível e errada.
 */
export interface PostoDeOrigem {
  locationId: string;
  locationName: string;
  /** O turno desta pessoa NESTE posto — texto livre ("Manhã", "12x36 A"). */
  shift: string | null;
}

export type AtivoPorPosto = AtivoEmPosse & { posto: PostoDeOrigem };

export interface Holdings {
  /** Posse direta: a `Assignment` aberta aponta para a pessoa (`targetType: USER`). */
  diretos: AtivoEmPosse[];
  /** Herdados do posto: entregues às localizações que a pessoa ocupa hoje. */
  porPosto: AtivoPorPosto[];
}

export async function listUserHoldings(userId: string): Promise<Holdings> {
  const pessoa = await prisma.user.findFirst({ where: { id: userId }, select: { id: true } });
  if (!pessoa) throw new AppError('Registro não encontrado', 404);

  // A fonte é a `Assignment` ABERTA, e não a coluna `assignedToId`: a coluna é
  // cache do caso `USER` (D14), e ler o cache aqui seria consultar a cópia para
  // responder o que o original sabe.
  const diretos = await buscarAtivos({
    assignments: { some: { checkinAt: null, targetType: 'USER', targetUserId: userId } },
  });

  const ocupacoes = await prisma.locationOccupant.findMany({
    where: { userId, endedAt: null },
    select: { locationId: true, shift: true, location: { select: { name: true } } },
    orderBy: [{ location: { name: 'asc' } }, { shift: 'asc' }],
  });

  // Ninguém ocupa posto nenhum: as duas consultas seguintes não têm o que
  // perguntar.
  if (ocupacoes.length === 0) return { diretos, porPosto: [] };

  const idsDeLocal = [...new Set(ocupacoes.map((ocupacao) => ocupacao.locationId))];

  // Aqui o caminho é o oposto do `diretos`, e por um motivo: cada ativo precisa
  // sair sabendo por QUAL posto ele chegou, e um filtro por relação
  // (`assignments: { some: … }`) traz os ativos sem dizer por qual deles. Duas
  // consultas com `in: [...]` e a junção em memória; uma consulta por posto
  // seria N+1 em cima de uma escala de cinco mesas.
  const posses = await prisma.assignment.findMany({
    where: { checkinAt: null, targetType: 'LOCATION', targetLocationId: { in: idsDeLocal } },
    select: { assetId: true, targetLocationId: true },
  });

  const localDoAtivo = new Map<string, string>();
  for (const posse of posses) {
    if (posse.targetLocationId) localDoAtivo.set(posse.assetId, posse.targetLocationId);
  }

  // O `findMany` de ativo é escopado pela lixeira, então um ativo apagado com a
  // posse ainda aberta simplesmente não entra na lista — o que é o certo: ele
  // saiu do inventário, e cobrar da Laura um equipamento que ninguém mais
  // enxerga seria pior do que omiti-lo.
  const ativos = posses.length === 0
    ? []
    : await buscarAtivos({ id: { in: [...localDoAtivo.keys()] } });

  const ativosPorLocal = new Map<string, AtivoEmPosse[]>();
  for (const ativo of ativos) {
    const locationId = localDoAtivo.get(ativo.id);
    if (!locationId) continue;

    const lista = ativosPorLocal.get(locationId);
    if (lista) lista.push(ativo);
    else ativosPorLocal.set(locationId, [ativo]);
  }

  // Lista PLANA de ativos, cada um carregando o posto de onde veio — e não uma
  // lista de postos com ativos dentro. Assim `porPosto` continua sendo uma
  // lista de ativos, igual a `diretos`, e a tela que quiser seções agrupa por
  // `posto.locationId` sem o servidor decidir por ela.
  //
  // A ordem sai pronta das duas consultas anteriores: postos por nome (e turno,
  // para quem ocupa o mesmo local em duas escalas) e, dentro de cada um, os
  // ativos por etiqueta. Nenhuma ordenação extra em memória.
  const porPosto: AtivoPorPosto[] = [];
  for (const ocupacao of ocupacoes) {
    const posto: PostoDeOrigem = {
      locationId: ocupacao.locationId,
      locationName: ocupacao.location.name,
      shift: ocupacao.shift,
    };
    for (const ativo of ativosPorLocal.get(ocupacao.locationId) ?? []) {
      porPosto.push({ ...ativo, posto });
    }
  }

  return { diretos, porPosto };
}
