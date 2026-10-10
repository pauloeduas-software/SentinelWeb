import { prisma } from '../../../core/database/prismaClient';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
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

export type TipoDeAcerto = 'EXATO' | 'PARCIAL' | 'NENHUM';

export interface ResultadoDaBusca {
  /**
   * `EXATO` quando a etiqueta ou a série casaram — é o caso em que a tela pode
   * ABRIR o ativo direto, sem mostrar lista.
   */
  tipo: TipoDeAcerto;
  /** `assetTag`, `serial` ou `aproximado`. É o que a tela explica ao usuário. */
  por: string;
  total: number;
  ativos: unknown[];
}

export async function globalSearch(q: string): Promise<ResultadoDaBusca> {
  // `trim` SEM mexer em mais nada: zero à esquerda é parte da etiqueta
  // (`ATV-00042`), e um `replace` esperto comeria justamente o que identifica o
  // ativo. O leitor manda exatamente o que está impresso.
  const termo = q.trim();
  if (termo === '') return { tipo: 'NENHUM', por: 'vazio', total: 0, ativos: [] };

  // 1. A ETIQUETA. `findFirst` e não `findUnique`: a unicidade é índice PARCIAL
  // (`WHERE deleted_at IS NULL`), que o Prisma não conhece — e é o `findFirst`
  // que recebe o escopo da lixeira.
  const porEtiqueta = await prisma.asset.findFirst({
    where: { assetTag: termo },
    select: ASSET_SELECT,
  });
  if (porEtiqueta) return { tipo: 'EXATO', por: 'assetTag', total: 1, ativos: [porEtiqueta] };

  // 2. A SÉRIE.
  const porSerie = await prisma.asset.findFirst({
    where: { serial: termo },
    select: ASSET_SELECT,
  });
  if (porSerie) return { tipo: 'EXATO', por: 'serial', total: 1, ativos: [porSerie] };

  // 3. O APROXIMADO — e só agora. `buildAssetWhere` é o MESMO `OR` da listagem
  // (etiqueta, série, nome, pedido, modelo e fabricante): duas definições de
  // "busca de ativo" divergiriam, e a tela do leitor passaria a achar coisa que
  // a listagem não acha.
  const aproximados = await prisma.asset.findMany({
    where: buildAssetWhere(termo),
    select: ASSET_SELECT,
    orderBy: { assetTag: 'asc' },
    take: MAX_PARCIAL,
  });

  return {
    tipo: aproximados.length > 0 ? 'PARCIAL' : 'NENHUM',
    por: 'aproximado',
    total: aproximados.length,
    ativos: aproximados,
  };
}
