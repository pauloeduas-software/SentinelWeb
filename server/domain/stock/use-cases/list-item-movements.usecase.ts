import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import {
  ACCESSORY_CHECKOUT_SELECT, COMPONENT_ASSET_SELECT, CONSUMABLE_CHECKOUT_SELECT,
} from '../helpers/stock-select.helper';

// A MOVIMENTAÇÃO DE UM ITEM — a união das DUAS fontes, feita na LEITURA.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE DUAS FONTES, E POR QUE NÃO UMA TERCEIRA TABELA
//
//   as tabelas de SAÍDA   respondem *para onde a unidade foi*: alvo, data,
//                         devolução. É o `accessory_checkouts` e seus irmãos.
//   o `StockLog`          responde *por que a quantidade NOMINAL mudou*:
//                         chegou nota, quebrou, recontagem.
//
// São perguntas diferentes e nenhuma tabela responde as duas. Um terceiro
// registro que guardasse tudo seria uma segunda contagem do mesmo fato, e as
// duas divergiriam no primeiro caminho que esquecesse de escrever numa delas —
// que é o D34 uma camada acima.
//
// A união acontece AQUI, em memória, e é barata: as consultas são por índice
// (`(accessoryId, checkedInAt)` e `(itemType, itemId, createdAt)`) e o resultado
// é uma página, não a tabela.
// ─────────────────────────────────────────────────────────────────────────────
//
// ═════════════════════════════════════════════════════════════════════════════
// UMA LINHA DE SAÍDA RENDE DOIS EVENTOS EM DATAS DIFERENTES — e é por isso que
// cada fonte é lida por DUAS ordenações.
//
// A entrega de janeiro devolvida hoje é o evento MAIS RECENTE do item, e a
// linha dela é uma das MAIS ANTIGAS por `checkedOutAt`. Com uma consulta só,
// ordenada pela data de saída, essa linha não entra no `take` — e a devolução
// de hoje simplesmente não aparece numa lista que promete "mais recente
// primeiro". Some sem erro, e o que fica no topo é plausível.
//
// A saída é ler o topo por CADA dimensão e unir: as `limite` linhas mais
// recentes por data de entrada MAIS as `limite` mais recentes por data de
// saída. Qualquer evento que caiba no corte final está em uma das duas.
// ═════════════════════════════════════════════════════════════════════════════

export type FonteDoMovimento = 'SAIDA' | 'AJUSTE';

/** A divisão da retirada parcial (D38), pronta para a tela rotular. */
export interface RetiradaParcial {
  /** Quantas voltaram ao estoque. */
  retirada: number;
  /** De quantas a instalação tinha. */
  de: number;
}

export interface MovimentoDoItem {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: as duas têm uuid próprio e
   * uma saída rende DOIS eventos (a entrega e a devolução), que colidiriam se a
   * chave fosse só o id da linha. Mesmo desenho do histórico do ativo (F2).
   */
  id: string;
  fonte: FonteDoMovimento;
  /** 'CHECKOUT' | 'CHECKIN' | 'INSTALL' | 'UNINSTALL' | 'ADJUST'. */
  action: string;
  at: Date;
  /** Quantas unidades este evento moveu. Negativo no ajuste de baixa. */
  qty: number;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell Latitude", "COMPRA". */
  rotulo: string | null;
  notes: string | null;
  /**
   * Preenchido só no `UNINSTALL` que deixou peça para trás — é o preço do D38,
   * pago aqui. Sem ele a aba lia "Retirado 4 / Instalado 2" para uma retirada
   * de 2 unidades, e quem lesse o histórico contaria seis movimentos onde houve
   * dois.
   */
  parcial: RetiradaParcial | null;
  actorId: string | null;
}

const LIMITE_PADRAO = 100;

/** Mais recente primeiro — e empate resolvido pelo id, para a ordem ser estável. */
function maisRecentePrimeiro(a: MovimentoDoItem, b: MovimentoDoItem): number {
  const diferenca = b.at.getTime() - a.at.getTime();
  return diferenca !== 0 ? diferenca : b.id.localeCompare(a.id);
}

/**
 * Une as duas leituras da mesma tabela sem repetir linha.
 *
 * A interseção é a regra, não a exceção: uma entrega devolvida no mesmo dia
 * aparece nas duas ordenações. Sem a deduplicação, ela renderia os dois eventos
 * em dobro.
 */
function semRepetir<T extends { id: string }>(...listas: T[][]): T[] {
  const porId = new Map<string, T>();
  for (const lista of listas) {
    for (const linha of lista) porId.set(linha.id, linha);
  }
  return [...porId.values()];
}

async function movimentosDeAcessorio(id: string, limite: number): Promise<MovimentoDoItem[]> {
  const [porEntrega, porDevolucao] = await Promise.all([
    prisma.accessoryCheckout.findMany({
      where: { accessoryId: id },
      select: ACCESSORY_CHECKOUT_SELECT,
      orderBy: { checkedOutAt: 'desc' },
      take: limite,
    }),
    // As devoluções mais recentes, independentemente de quando a entrega saiu.
    // É esta consulta que impede a devolução de hoje de uma entrega antiga de
    // sumir da lista. O índice `(accessoryId, checkedInAt)` serve as duas.
    prisma.accessoryCheckout.findMany({
      where: { accessoryId: id, checkedInAt: { not: null } },
      select: ACCESSORY_CHECKOUT_SELECT,
      orderBy: { checkedInAt: 'desc' },
      take: limite,
    }),
  ]);

  const eventos: MovimentoDoItem[] = [];
  for (const saida of semRepetir(porEntrega, porDevolucao)) {
    const rotulo = saida.targetUser?.name ?? saida.targetLocation?.name ?? null;

    eventos.push({
      id: `saida:${saida.id}:entrega`,
      fonte: 'SAIDA',
      action: 'CHECKOUT',
      at: saida.checkedOutAt,
      qty: -1,
      rotulo,
      notes: saida.checkoutNotes,
      parcial: null,
      actorId: null,
    });

    if (saida.checkedInAt) {
      eventos.push({
        id: `saida:${saida.id}:devolucao`,
        fonte: 'SAIDA',
        action: 'CHECKIN',
        at: saida.checkedInAt,
        qty: 1,
        rotulo,
        // A nota da DEVOLUÇÃO, que é coluna própria: a entrega guarda a dela em
        // `checkoutNotes` e nenhuma sobrescreve a outra.
        notes: saida.checkinNotes,
        parcial: null,
        actorId: null,
      });
    }
  }
  return eventos;
}

async function movimentosDeConsumivel(id: string, limite: number): Promise<MovimentoDoItem[]> {
  // UMA consulta, e não duas como nas outras: o consumo tem UMA data porque não
  // tem fechamento (D37). A segunda ordenação existe onde há um segundo evento.
  const consumos = await prisma.consumableCheckout.findMany({
    where: { consumableId: id },
    select: CONSUMABLE_CHECKOUT_SELECT,
    orderBy: { consumedAt: 'desc' },
    take: limite,
  });

  // UM evento por consumo, e nunca dois: não há devolução (D37). A ausência do
  // par aqui é a mesma ausência que existe no banco.
  return consumos.map((consumo) => ({
    id: `saida:${consumo.id}:consumo`,
    fonte: 'SAIDA' as const,
    action: 'CHECKOUT',
    at: consumo.consumedAt,
    qty: -consumo.qty,
    // O nome COPIADO, não `user.name`: quem consumiu pode ter saído da empresa.
    rotulo: consumo.userNameSnapshot,
    notes: consumo.notes,
    parcial: null,
    actorId: null,
  }));
}

async function movimentosDeComponente(id: string, limite: number): Promise<MovimentoDoItem[]> {
  const [porInstalacao, porRetirada] = await Promise.all([
    prisma.componentAsset.findMany({
      where: { componentId: id },
      select: COMPONENT_ASSET_SELECT,
      orderBy: { attachedAt: 'desc' },
      take: limite,
    }),
    prisma.componentAsset.findMany({
      where: { componentId: id, detachedAt: { not: null } },
      select: COMPONENT_ASSET_SELECT,
      orderBy: { detachedAt: 'desc' },
      take: limite,
    }),
  ]);

  const eventos: MovimentoDoItem[] = [];
  for (const instalacao of semRepetir(porInstalacao, porRetirada)) {
    const ativo = instalacao.asset;
    const complemento = ativo.name || ativo.model.name;
    const rotulo = complemento ? `${ativo.assetTag} — ${complemento}` : ativo.assetTag;

    // ═══ A SUCESSORA DE UMA DIVISÃO NÃO É UMA INSTALAÇÃO NOVA ═══
    //
    // Ela nasce no ato de fechar a linha antiga e carrega unidades que NUNCA
    // voltaram ao estoque. Contá-la como entrada daria "instalou 4, retirou 4,
    // instalou 2" para uma retirada de 2 — três movimentos para um fato só, e
    // a soma continuava certa justamente por causa do evento inventado no meio.
    //
    // Com o vínculo `predecessorId` no banco, a linha some daqui e a retirada
    // passa a dizer o que aconteceu: "Retirado 2, parcial: 2 de 4".
    if (instalacao.predecessorId === null) {
      eventos.push({
        id: `saida:${instalacao.id}:instalacao`,
        fonte: 'SAIDA',
        action: 'INSTALL',
        at: instalacao.attachedAt,
        qty: -instalacao.assignedQty,
        rotulo,
        // A nota da INSTALAÇÃO. A da retirada mora em `detachNotes`, e é por
        // isso que esta continua legível depois que a peça sai.
        notes: instalacao.notes,
        parcial: null,
        actorId: null,
      });
    }

    if (instalacao.detachedAt) {
      // O que VOLTOU ao estoque é o que a linha tinha menos o que a sucessora
      // continua segurando. Sem sucessora, voltou tudo.
      const continuou = instalacao.sucessora?.assignedQty ?? 0;
      const devolvidas = instalacao.assignedQty - continuou;

      eventos.push({
        id: `saida:${instalacao.id}:retirada`,
        fonte: 'SAIDA',
        action: 'UNINSTALL',
        at: instalacao.detachedAt,
        qty: devolvidas,
        rotulo,
        notes: instalacao.detachNotes,
        parcial: instalacao.sucessora
          ? { retirada: devolvidas, de: instalacao.assignedQty }
          : null,
        actorId: null,
      });
    }
  }
  return eventos;
}

export async function listItemMovements(
  spec: StockKindSpec,
  id: string,
  limite = LIMITE_PADRAO,
): Promise<MovimentoDoItem[]> {
  // O item precisa existir, inclusive na LIXEIRA: a movimentação de um item
  // apagado é justamente o que a lixeira existe para guardar (D36).
  //
  // Por isso o `deletedAt: undefined` EXPLÍCITO — é o `INCLUINDO_LIXEIRA` da
  // `softDeleteExtension`, que olha a PRESENÇA da chave e desliga o escopo
  // automático. Sem ele, `findFirst` traria só os vivos e a tela de um item
  // apagado abriria com 404 em cima do histórico que ela foi buscar.
  const existe = await spec.delegate(prisma).findFirst({
    where: { id, deletedAt: undefined },
    select: { id: true },
  });
  if (!existe) throw new AppError(`Nenhum ${spec.rotulo} com este identificador.`, 404);

  const [saidas, ajustes] = await Promise.all([
    spec.kind === 'ACCESSORY' ? movimentosDeAcessorio(id, limite)
      : spec.kind === 'CONSUMABLE' ? movimentosDeConsumivel(id, limite)
        : movimentosDeComponente(id, limite),

    prisma.stockLog.findMany({
      where: { itemType: spec.kind, itemId: id },
      select: { id: true, delta: true, reason: true, notes: true, actorId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limite,
    }),
  ]);

  const doLog: MovimentoDoItem[] = ajustes.map((ajuste) => ({
    id: `ajuste:${ajuste.id}`,
    fonte: 'AJUSTE',
    action: 'ADJUST',
    at: ajuste.createdAt,
    qty: ajuste.delta,
    rotulo: ajuste.reason,
    notes: ajuste.notes,
    parcial: null,
    actorId: ajuste.actorId,
  }));

  // O corte final vale para a UNIÃO, não para cada fonte: sem ele, um item com
  // 100 ajustes e 100 saídas devolveria 200 linhas para um pedido de 100.
  return [...saidas, ...doLog].sort(maisRecentePrimeiro).slice(0, limite);
}
