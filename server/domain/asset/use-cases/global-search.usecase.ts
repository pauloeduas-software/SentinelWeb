import { prisma } from '../../../core/database/prismaClient';
import { buildAssetWhere } from '../helpers/asset-filters.helper';

// A BUSCA DO LEITOR DE CÓDIGO DE BARRAS (F10, Etapa G).
//
// ═════════════════════════════════════════════════════════════════════════════
// A ORDEM DAS TENTATIVAS É O DESENHO, E ELA SAI DOS ÍNDICES.
//
//   1. `assetTag` EXATO   → índice único parcial `assets_assetTag_unique_undeleted`
//   2. `serial` EXATO     → índice único parcial `assets_serial_unique_undeleted`
//   3. `ILIKE '%x%'`      → NENHUM índice. Varre a tabela.
//
// O terceiro é o último por isso: `contains` com `%` na frente não usa índice em
// Postgres, e numa frota de 50 mil ativos ele é uma varredura completa. Quem
// bipa um código espera resposta instantânea, e em 99% dos bipes o primeiro
// passo já responde — então a varredura só acontece quando alguém DIGITOU algo
// aproximado.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto da busca aproximada. Quem precisa de mais usa a listagem, com filtro. */
const MAX_PARCIAL = 20;

/**
 * O ativo como a busca o devolve: o que identifica, e nada mais. A tela do
 * leitor mostra etiqueta, nome e série e leva à ficha — que é quem tem o resto
 * (e quem decide o custo por cargo, D77). Sem o custo no select, a busca deixa
 * de ser uma porta para ele.
 */
const ATIVO_DA_BUSCA = { id: true, assetTag: true, serial: true, name: true } as const;

type TipoDeAcerto = 'EXATO' | 'PARCIAL' | 'NENHUM';

/** O posto onde o ativo está montado, quando está. */
interface PostoDoAcerto {
  id: string;
  name: string;
}

export interface ResultadoDaBusca {
  /**
   * `EXATO` quando a etiqueta ou a série casaram — é o caso em que a tela pode
   * ABRIR o ativo direto, sem mostrar lista.
   */
  tipo: TipoDeAcerto;
  /** `assetTag`, `serial` ou `aproximado`. É o que a tela explica ao usuário. */
  por: string;
  total: number;
  ativos: { id: string; assetTag: string; serial: string | null; name: string | null }[];
  /**
   * O POSTO DO ACERTO EXATO, quando o ativo está montado numa mesa.
   *
   * Existe porque o ativo entregue a um posto saiu da listagem `/computadores`. A
   * ficha do ativo diz o NOME da mesa e para aí: não leva até ela, e não mostra
   * o resto do que está montado nela nem quem responde por ela. Com o posto, a
   * busca larga em `/postos/:id`, que responde as três coisas.
   *
   * `null` nos outros casos, e não ausente: no aproximado há uma lista e a tela
   * mostra a lista, então um campo com dois estados em vez de três é o que faz
   * "só no acerto EXATO" ser verificável pelo tipo.
   */
  posto: PostoDoAcerto | null;
}

/**
 * O posto de trabalho onde este ativo está, ou `null`.
 *
 * Pela POSSE aberta, e não pela localização onde ele está guardado: o ativo
 * guardado no depósito continua sendo parque e a ficha dele é a do ativo.
 */
async function postoDoAtivo(assetId: string): Promise<PostoDoAcerto | null> {
  const posse = await prisma.assignment.findFirst({
    where: {
      assetId,
      checkinAt: null,
      // O MESMO `where` do `EM_POSTO_DE_TRABALHO` da listagem. É a
      // concordância dos dois que garante que não exista ativo que sai de
      // `/computadores` e a busca não saiba para onde mandar.
      targetType: 'WORKSTATION',
    },
    select: { targetWorkstation: { select: { id: true, name: true } } },
  });

  return posse?.targetWorkstation ?? null;
}

export async function globalSearch(q: string): Promise<ResultadoDaBusca> {
  // `trim` SEM mexer em mais nada: zero à esquerda é parte da etiqueta
  // (`ATV-00042`), e um `replace` esperto comeria justamente o que identifica o
  // ativo. O leitor manda exatamente o que está impresso.
  const termo = q.trim();
  if (termo === '') return { tipo: 'NENHUM', por: 'vazio', total: 0, ativos: [], posto: null };

  const select = ATIVO_DA_BUSCA;

  // 1. A ETIQUETA. `findFirst` e não `findUnique`: a unicidade é índice PARCIAL
  // (`WHERE "deletedAt" IS NULL`), que o Prisma não conhece — e é o `findFirst`
  // que recebe o escopo da lixeira.
  const porEtiqueta = await prisma.asset.findFirst({
    where: { assetTag: termo },
    select,
  });
  if (porEtiqueta) {
    return {
      tipo: 'EXATO', por: 'assetTag', total: 1, ativos: [porEtiqueta],
      posto: await postoDoAtivo(porEtiqueta.id),
    };
  }

  // 2. A SÉRIE.
  const porSerie = await prisma.asset.findFirst({
    where: { serial: termo },
    select,
  });
  if (porSerie) {
    return {
      tipo: 'EXATO', por: 'serial', total: 1, ativos: [porSerie],
      posto: await postoDoAtivo(porSerie.id),
    };
  }

  // 3. O APROXIMADO — e só agora. `buildAssetWhere` é o MESMO `OR` da listagem
  // (etiqueta, série, nome, pedido, modelo e fabricante): duas definições de
  // "busca de ativo" divergiriam, e a tela do leitor passaria a achar coisa que
  // a listagem não acha.
  const aproximados = await prisma.asset.findMany({
    where: buildAssetWhere(termo),
    select,
    orderBy: { assetTag: 'asc' },
    take: MAX_PARCIAL,
  });

  return {
    tipo: aproximados.length > 0 ? 'PARCIAL' : 'NENHUM',
    por: 'aproximado',
    total: aproximados.length,
    ativos: aproximados,
    posto: null,
  };
}
