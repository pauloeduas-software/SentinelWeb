import type { AlvoDaPosse, PosseResolvida } from './posse.types';
import type { EventoDeLicencaDoAlvo } from './license.types';
import type { ListParams } from './list.types';

// Contrato do ativo com a API. Espelha `ASSET_SELECT`
// (server/domain/asset/helpers/asset-select.helper.ts).

/**
 * Por que um ativo saiu do patrimônio. Espelha o enum `RetiredReason`.
 *
 * Os rótulos em português ficam na tela (pages/ativos/helpers), não aqui:
 * este arquivo é o CONTRATO com a API, e o contrato são os valores que viajam.
 */
export type MotivoDaSaida =
  | 'VENDIDO' | 'DESCARTADO' | 'DOADO' | 'EXTRAVIADO' | 'ROUBADO' | 'GARANTIA';

/** Relação embutida enxuta: o que a tabela mostra sem uma consulta por linha. */
export interface Referencia {
  id: string;
  name: string;
}

/**
 * O status como vem embutido no ativo. `type` é a união, e não `string`: é ele
 * que decide se o ativo pode ser entregue, e uma comparação com um valor que
 * não existe (`'AVAILABLE'`) precisa ser erro de tipo, não um `false` calado.
 */
interface StatusRef extends Referencia {
  type: TipoDeStatus;
}

interface CategoriaRef extends Referencia {
  type: string;
}

/**
 * O fabricante como vem embutido no modelo do ativo: o nome e os CANAIS DE
 * SUPORTE. Os canais viajam com o ativo porque a pergunta "para onde ligo para
 * acionar a garantia deste notebook?" se faz na ficha DELE — mandar a pessoa
 * para Configurações › Fabricantes procurar a linha certa é o desvio que a
 * ficha existe para poupar.
 *
 * Os três são opcionais no cadastro e chegam `null` quando em branco.
 */
export interface FabricanteRef extends Referencia {
  url: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
}

interface ModeloRef extends Referencia {
  modelNumber: string | null;
  manufacturer: FabricanteRef;
  category: CategoriaRef;
}

/**
 * Um ativo = UM equipamento físico.
 *
 * `purchaseCost` é STRING, não number: a coluna é `Decimal` no Postgres e o
 * JSON a serializa como texto — inclusive perdendo o zero à direita ("4599.90"
 * volta "4599.9"). Tipar como number aqui convidaria a fazer conta em ponto
 * flutuante com dinheiro. Formatar é da tela.
 *
 * As datas são strings ISO: `JSON.parse` não reconstrói `Date`.
 *
 * Não há `category` própria — a categoria do ativo é `model.category`.
 */
export interface Asset {
  id: string;
  assetTag: string;
  serial: string | null;
  name: string | null;
  notes: string | null;

  statusId: string;
  modelId: string;
  locationId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  /** Ausente para quem não é `ADMIN`: o servidor nem lê a coluna (D77). */
  purchaseCost?: string | null;

  /**
   * BAIXA — o ativo saiu do PATRIMÔNIO.
   *
   * Não confundir com a lixeira (D19), que é ter sido cadastrado ERRADO. Um
   * notebook vendido continua no patrimônio histórico, com a data em que saiu;
   * um da lixeira nunca deveria ter existido.
   */
  retiredAt: string | null;
  retiredReason: MotivoDaSaida | null;

  createdAt: string;

  status: StatusRef;
  model: ModeloRef;
  location: Referencia | null;

  /**
   * A responsabilidade RESOLVIDA desta linha (Camada 3 do docs/referencia/modelo-de-posse.md),
   * calculada pelo servidor para a tela não fazer uma consulta por ativo.
   *
   * Vem no contrato de `GET /api/assets`. Continua sendo lida por
   * `resumoDaPosse()` (pages/ativos/helpers), que trata a ausência: entre
   * a subida do frontend e a do backend da F4, o campo simplesmente não chega.
   */
  posse: PosseResolvida | null;

}

/**
 * Os quatro tipos de `StatusLabel`, espelhando o enum do Postgres.
 *
 * `IN_USE` é tipo próprio porque "está com alguém" e "está na assistência" é a
 * distinção mais cara do inventário (D5). Não há tipo "arquivado": o que sai de
 * vez é baixado (`retiredAt`).
 *
 * Os rótulos em português e a ajuda de cada um moram em
 * `pages/configuracoes/specs/catalog-ui.types.ts` — aqui é só o contrato.
 */
type TipoDeStatus = 'DEPLOYABLE' | 'IN_USE' | 'PENDING' | 'UNDEPLOYABLE';

export interface AssetStats {
  /** O que a listagem PADRÃO mostra: nem baixado, nem em posto. */
  total: number;
  byStatus: {
    id: string;
    name: string;
    type: TipoDeStatus;
    total: number;
  }[];
  /** Quantos saíram do PATRIMÔNIO (`retiredAt`) — vendido, descartado, roubado. */
  retired: number;
}

/**
 * As vistas da listagem de ATIVO — três, e não as duas do `ListView` genérico.
 *
 * `retired` é do ITAM e por isso não mora no tipo compartilhado: nenhuma outra
 * tabela do sistema tem "saiu do patrimônio" (D20,
 * docs/historico/fase-02-ativos.md). `active` o exclui.
 */
export type AssetView = 'active' | 'trashed' | 'retired';

/** Recortes prontos que respondem a uma pergunta, não a um filtro de coluna. */

/**
 * O que `GET /api/assets` aceita: o que toda listagem aceita MAIS o que só o
 * ITAM entende.
 *
 * `Omit` no `view` porque aqui ele tem um valor a mais que o genérico — herdar
 * direto seria alargar um tipo compartilhado para caber um caso de um domínio
 * só.
 */
export type AssetListParams = Omit<ListParams, 'view'> & {
  view?: AssetView;
  statusId?: string;
  categoryId?: string;
};

/**
 * Um evento da aba Histórico — `GET /api/assets/:id/history`.
 *
 * Duas fontes numa lista só: o `ActivityLog` (cadastro, edição com diff,
 * lixeira, baixa) e o histórico de posse. NÃO existe tabela
 * `AssetLog` (D18).
 */
export interface EventoDoAtivo {
  id: string;
  fonte: 'ATIVIDADE' | 'POSSE' | 'LICENCA';
  action: string;
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  /**
   * O diff (`{ campo: { de, para } }`) misturado com valores soltos
   * (`notes`): o formato varia com a operação, e por isso é lido por
   * `lerEvento()` em vez de ser tipado campo a campo.
   */
  changes: unknown;
  posse: {
    assignmentId: string;
    targetType: AlvoDaPosse;
    targetLabel: string | null;
    notes: string | null;
    expectedCheckinAt: string | null;
  } | null;
  /** Só as licenças entregues A ESTE ATIVO — as da pessoa responsável ficam nela. */
  licenca: EventoDeLicencaDoAlvo | null;
}

/** Corpo de `POST /api/assets/:id/retire`. */
export interface RetireInput {
  retiredReason: MotivoDaSaida;
  /**
   * 'AAAA-MM-DD', nunca no futuro (o servidor responde 422). A tela manda
   * sempre — o modal nasce com hoje no fuso local (ver `RetireModal`).
   */
  retiredAt?: string;
  notes?: string;
}

