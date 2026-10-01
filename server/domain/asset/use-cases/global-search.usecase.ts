import { prisma } from '../../../core/database/prismaClient';
import { urlDoPainel } from '../../../core/config/app-url';
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
//
// O PREFIXO DO QR É DESCARTADO. O QR contém `${APP_URL}/ativos/:id` (D70), e um
// leitor de mão configurado em modo "teclado" digita a URL INTEIRA no campo de
// busca. Sem este corte, bipar o QR dentro do campo não acharia nada — e a
// pessoa concluiria que a etiqueta está errada.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto da busca aproximada. Quem precisa de mais usa a listagem, com filtro. */
const MAX_PARCIAL = 20;

export type TipoDeAcerto = 'EXATO' | 'PARCIAL' | 'NENHUM';

export interface ResultadoDaBusca {
  /**
   * `EXATO` quando a etiqueta, a série ou o id do QR casaram — é o caso em que a
   * tela pode ABRIR o ativo direto, sem mostrar lista.
   */
  tipo: TipoDeAcerto;
  /** `assetTag`, `serial`, `qr` ou `aproximado`. É o que a tela explica ao usuário. */
  por: string;
  total: number;
  ativos: unknown[];
}

/**
 * O id dentro de uma URL do painel, ou `null`.
 *
 * Aceita o caminho com ou sem o domínio: o leitor de mão às vezes é configurado
 * para digitar só o path, e o celular copia a URL inteira. Também aceita o
 * caminho ANTIGO (`/itam/assets/:id`), porque etiqueta impressa dura anos e
 * `App.tsx` mantém o redirecionamento para ela.
 */
export function idDaUrlDoPainel(texto: string): string | null {
  const limpo = texto.trim().replace(urlDoPainel(), '');
  const casou = /\/(?:ativos|itam\/assets)\/([0-9a-fA-F-]{36})/.exec(limpo);

  return casou ? casou[1] : null;
}

export async function globalSearch(q: string): Promise<ResultadoDaBusca> {
  // `trim` SEM mexer em mais nada: zero à esquerda é parte da etiqueta
  // (`ATV-00042`), e um `replace` esperto comeria justamente o que identifica o
  // ativo. O leitor manda exatamente o que está impresso.
  const termo = q.trim();
  if (termo === '') return { tipo: 'NENHUM', por: 'vazio', total: 0, ativos: [] };

  // 0. O QR, antes de tudo: ele é o único caso em que o texto do campo NÃO é
  // uma etiqueta nem uma série.
  const idDoQr = idDaUrlDoPainel(termo);
  if (idDoQr) {
    const porId = await prisma.asset.findFirst({ where: { id: idDoQr }, select: ASSET_SELECT });
    if (porId) return { tipo: 'EXATO', por: 'qr', total: 1, ativos: [porId] };
  }

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
