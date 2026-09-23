import type { AlvoDaPosse, PosseResolvida } from './posse.types';
import type { ListParams } from './list.types';
import type { User } from './user.types';

// Contrato do ativo com a API. Espelha `ASSET_SELECT`
// (server/domain/asset/helpers/asset-select.helper.ts).

/**
 * Por que um ativo saiu do patrimônio. Espelha o enum `RetiredReason`.
 *
 * Os rótulos em português ficam na tela (pages/gestao-itam/helpers), não aqui:
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
  color: string | null;
}

export interface CategoriaRef extends Referencia {
  type: string;
  color: string | null;
}

export interface ModeloRef extends Referencia {
  modelNumber: string | null;
  eolMonths: number | null;
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
  byod: boolean;
  requestable: boolean;

  statusId: string;
  modelId: string;
  locationId: string | null;
  supplierId: string | null;
  /**
   * CACHE do caso `USER` da posse, e só dele (docs/MODELO-POSSE.md).
   *
   * É `null` quando o detentor é uma LOCALIZAÇÃO ou OUTRO ATIVO. Não é campo de
   * formulário: quem escreve aqui é o checkout/checkin. Para mostrar quem
   * responde pelo ativo, leia `posse`, nunca esta coluna sozinha.
   */
  assignedToId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;

  warrantyMonths: number | null;
  warrantyExpiresAt: string | null;
  eolMonths: number | null;
  eolDate: string | null;
  eolExplicit: boolean;

  /**
   * DESCOMISSIONAMENTO — o ativo saiu do PATRIMÔNIO.
   *
   * Não confundir com as outras duas saídas (D19): `status.type === 'ARCHIVED'`
   * é ter saído da OPERAÇÃO, e a lixeira é ter sido cadastrado ERRADO. Um
   * notebook vendido continua no relatório de depreciação com a data em que
   * saiu; um da lixeira nunca deveria ter existido.
   */
  retiredAt: string | null;
  retiredReason: MotivoDaSaida | null;

  /**
   * O caminho da foto dentro do `UPLOAD_DIR`, ou `null`.
   *
   * A tela o usa SÓ como "tem foto ou não" — a URL que ela monta é por id
   * (`/api/images/asset/:id`, ver `attachment.queries.ts`). O caminho não é
   * atalho para nada: nenhuma rota aceita caminho de arquivo como parâmetro, e
   * o arquivo só sai por rota autenticada (D84).
   */
  imagePath: string | null;

  /** Quem cadastrou e quem editou por último (D26). Nulos no que é anterior à F3. */
  createdById: string | null;
  updatedById: string | null;

  createdAt: string;

  status: StatusRef;
  model: ModeloRef;
  location: Referencia | null;
  supplier: Referencia | null;
  assignedTo: User | null;

  /**
   * A responsabilidade RESOLVIDA desta linha (Camada 3 do MODELO-POSSE.md),
   * calculada pelo servidor para a tela não fazer uma consulta por ativo.
   *
   * Vem no contrato de `GET /api/assets`. Continua sendo lida por
   * `resumoDaPosse()` (pages/gestao-itam/helpers), que trata a ausência: entre
   * a subida do frontend e a do backend da F4, o campo simplesmente não chega.
   */
  posse: PosseResolvida | null;
}

/**
 * O que uma pessoa tem em posse — `GET /api/users/:id/holdings`.
 *
 * As duas listas são separadas de propósito: `diretos` são as posses no nome
 * dela, e `porPosto` são os ativos entregues a localizações que ela ocupa. A
 * devolução de cada grupo é uma operação diferente, e juntá-las numa lista só
 * esconderia isso.
 */
/**
 * Por onde um ativo chega até a Mesa 1: o posto que o detém e o turno de quem o
 * ocupa. Vem embutido em cada item de `porPosto` porque NÃO dá para deduzir de
 * `asset.location` — `locationId` é *onde o ativo está*, o alvo da posse é *de
 * quem ele é*, e os dois divergem (o mouse reserva guardado na gaveta de uma
 * mesa ocupada). Ver docs/MODELO-POSSE.md.
 */
export interface PostoDoAtivo {
  locationId: string;
  locationName: string;
  shift: string | null;
}

/**
 * O que uma pessoa responde, nos dois caminhos que existem:
 *
 * - `diretos` — entregues a ela (`targetType: 'USER'`);
 * - `porPosto` — entregues a um posto que ela ocupa. Ela responde junto com os
 *   outros ocupantes, e é exatamente por isso que a responsabilidade não cabe
 *   numa coluna do ativo.
 */
export interface UserHoldings {
  diretos: Asset[];
  porPosto: (Asset & { posto: PostoDoAtivo })[];
}

/**
 * Os cinco tipos de `StatusLabel`, espelhando o enum do Postgres.
 *
 * São CINCO, não quatro: o `IN_USE` entrou entre `DEPLOYABLE` e `PENDING`
 * porque "está com alguém" e "está na assistência" é a distinção mais cara do
 * inventário (D5). Qualquer lista aqui com quatro está desatualizada.
 *
 * Os rótulos em português e a ajuda de cada um moram em
 * `pages/configuracoes/specs/catalog-ui.types.ts` — aqui é só o contrato.
 */
export type TipoDeStatus = 'DEPLOYABLE' | 'IN_USE' | 'PENDING' | 'ARCHIVED' | 'UNDEPLOYABLE';

export interface AssetStats {
  /** O que a listagem PADRÃO mostra: nem descomissionado, nem arquivado. */
  total: number;
  byStatus: {
    id: string;
    name: string;
    color: string | null;
    showInNav: boolean;
    /** O tipo do rótulo — é ele que diz à tela que este contador é de arquivo. */
    type: TipoDeStatus;
    total: number;
  }[];
  /** Quantos saíram do PATRIMÔNIO (`retiredAt`) — vendido, descartado, roubado. */
  retired: number;
  /** Quantos saíram da OPERAÇÃO (status de tipo `ARCHIVED`) — e voltam trocando o status. */
  archived: number;
}

/**
 * As vistas da listagem de ATIVO — quatro, e não as duas do `ListView` genérico.
 *
 * `retired` e `archived` são do ITAM e por isso não moram no tipo compartilhado:
 * nenhuma outra tabela do sistema tem "saiu do patrimônio" nem "saiu de
 * operação" (D20, docs/FASE-2-PLANO-ITAM.md).
 *
 * As duas parecem a mesma coisa e não são (D19): descomissionar é fato
 * contábil e não volta; arquivar é decisão operacional e volta trocando o
 * status. `active` exclui as duas.
 */
export type AssetView = 'active' | 'trashed' | 'retired' | 'archived';

/** Recortes prontos que respondem a uma pergunta, não a um filtro de coluna. */
export type AssetRelatorio = 'posto-vago';

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
  relatorio?: AssetRelatorio;
};

/**
 * Um evento da aba Histórico — `GET /api/assets/:id/history`.
 *
 * Duas fontes numa lista só: o `ActivityLog` (cadastro, edição com diff,
 * lixeira, descomissionamento) e o histórico de posse. NÃO existe tabela
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

/**
 * A operação do lote SEM os ids: o que a barra de ação monta e o hook da página
 * completa com a seleção.
 *
 * União discriminada igual à do servidor — `op: 'status'` sem `statusId` não
 * compila aqui e responderia 422 lá. Separada de `BulkInput` porque `Omit` não
 * distribui sobre união: `Omit<BulkInput, 'ids'>` colapsaria nas chaves comuns
 * e deixaria `statusId` de fora.
 */
export type BulkOperacao =
  | { op: 'status'; statusId: string }
  | { op: 'location'; locationId: string | null }
  | { op: 'delete' };

/** Corpo de `POST /api/assets/bulk` — UMA operação declarada, N ativos. */
export type BulkInput = BulkOperacao & { ids: string[] };

export interface BulkResult {
  op: BulkInput['op'];
  batchId: string;
  afetados: number;
  ids: string[];
}
