import type { AlvoDaPosse, PosseResolvida } from './posse.types';
import type { ListParams } from './list.types';
import type { User } from './user.types';

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

export interface StatusRef extends Referencia {
  type: string;
}

export interface CategoriaRef extends Referencia {
  type: string;
}

export interface ModeloRef extends Referencia {
  modelNumber: string | null;
  manufacturer: Referencia;
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
  /**
   * CACHE do caso `USER` da posse, e só dele (docs/referencia/modelo-de-posse.md).
   *
   * É `null` quando o detentor é uma LOCALIZAÇÃO ou OUTRO ATIVO. Não é campo de
   * formulário: quem escreve aqui é o checkout/checkin. Para mostrar quem
   * responde pelo ativo, leia `posse`, nunca esta coluna sozinha.
   */
  assignedToId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;

  /**
   * BAIXA — o ativo saiu do PATRIMÔNIO.
   *
   * Não confundir com a lixeira (D19), que é ter sido cadastrado ERRADO. Um
   * notebook vendido continua no patrimônio histórico, com a data em que saiu;
   * um da lixeira nunca deveria ter existido.
   */
  retiredAt: string | null;
  retiredReason: MotivoDaSaida | null;

  /** Quem cadastrou e quem editou por último (D26). Nulos no que é anterior à F3. */
  createdById: string | null;
  updatedById: string | null;

  createdAt: string;

  status: StatusRef;
  model: ModeloRef;
  location: Referencia | null;
  assignedTo: User | null;

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
export type TipoDeStatus = 'DEPLOYABLE' | 'IN_USE' | 'PENDING' | 'UNDEPLOYABLE';

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
  locationId?: string;
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
  fonte: 'ATIVIDADE' | 'POSSE';
  action: string;
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  /** Sempre nulo antes da F3: não havia sessão para dizer quem fez. */
  actorId: string | null;
  /**
   * O diff (`{ campo: { de, para } }`) misturado com valores soltos
   * (`batchId`, `notes`): o formato varia com a operação, e por isso é lido por
   * `lerMudancas()` em vez de ser tipado campo a campo.
   */
  changes: unknown;
  posse: {
    assignmentId: string;
    targetType: AlvoDaPosse;
    targetLabel: string | null;
    notes: string | null;
    expectedCheckinAt: string | null;
  } | null;
}

/** Corpo de `POST /api/assets/:id/retire`. */
export interface RetireInput {
  retiredReason: MotivoDaSaida;
  /** 'AAAA-MM-DD'. Em branco, o servidor usa agora. */
  retiredAt?: string;
  notes?: string;
}

