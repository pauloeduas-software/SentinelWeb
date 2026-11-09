import type { Asset, Referencia } from './asset.types';
import type { PessoaRef } from './posse.types';
import type { EntregaNaFicha } from './stock.types';

// Contrato do POSTO DE TRABALHO com a API — `GET /api/workstations`.
//
// O posto é cadastro próprio, que FICA numa localização (decisão Y). O que este
// arquivo tipa é a LEITURA que a tela de postos faz — o posto somado ao que o
// modelo de posse diz sobre ele: quem o ocupa e o que foi entregue a ele.
//
// Mora em arquivo próprio, e não dentro de `catalog.types.ts`, porque a linha
// de catálogo é `Record<string, unknown>` dirigida por spec: aqui os campos são
// fixos e a tela depende de cada um deles.

/**
 * Os recortes da tela.
 *
 * `vagos` é o que justifica a tela: posto com equipamento e sem ninguém
 * respondendo por ele. `ocupados` NÃO é o inverso — um posto recém-criado, sem
 * ativo e sem gente, não é nem um nem outro: é o `sem-uso`.
 */
export type PostoView = 'todos' | 'vagos' | 'ocupados' | 'sem-uso';

/**
 * Um evento da aba Histórico do posto — `GET /api/workstations/:id/history`.
 *
 * TRÊS fontes numa lista só: quem entrou e saiu, o computador e o estoque entregues
 * à mesa. Só movimentação: cadastro e edição ficam na auditoria, no banco (AB).
 */
export interface EventoDoPosto {
  id: string;
  fonte: 'OCUPACAO' | 'POSSE' | 'ESTOQUE';
  action: string;
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  /** Preenchido só quando `fonte === 'OCUPACAO'`. */
  ocupacao: {
    occupantId: string;
    personId: string;
    personLabel: string;
    shift: string | null;
    notes: string | null;
  } | null;
  /** Preenchido só quando `fonte === 'POSSE'`. */
  posse: {
    assignmentId: string;
    assetId: string;
    /** "ATV-00012 — Dell Latitude". */
    assetLabel: string;
    notes: string | null;
  } | null;
  /** Preenchido só quando `fonte === 'ESTOQUE'` — a entrega, não a unidade. */
  estoque: {
    /** Nulo quando o item foi excluído: o nome continua em `itemLabel`. */
    itemId: string | null;
    itemLabel: string;
    unidades: number;
    notes: string | null;
  } | null;
}

/** Os números dos cartões da tela: `ocupados`, `vagos` e `semUso` somam `total`. */
export interface PostoStats {
  total: number;
  ocupados: number;
  vagos: number;
  semUso: number;
}

/** Quem ocupa o posto AGORA, como a listagem mostra: nome e turno. */
export interface PostoOcupante {
  id: string;
  personId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A". Enum engessaria escala real. */
  shift: string | null;
  person: PessoaRef | null;
}

/** Uma linha da lista de postos. */
export interface Posto {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** A localização onde o posto fica — a Matriz, a Filial. */
  locationId: string;
  location: Referencia;

  ocupantes: PostoOcupante[];
  totalOcupantes: number;
  /** A etiqueta e a série do computador entregue ao posto: um só, pela invariante 19. Só na lista. */
  computadores: { assetTag: string; serial: string | null }[];
  /** Ativos com posse ABERTA apontando para este posto. */
  totalAtivos: number;

  /**
   * Tem equipamento e ninguém responde por ele. É sinal operacional, não erro
   * de dado: candidato a voltar para o estoque (docs/referencia/modelo-de-posse.md, "Como
   * isso amarra no status", item 3).
   */
  vago: boolean;
}

/**
 * O ativo como a FICHA DO POSTO o recebe: o contrato de ativo mais a máquina.
 *
 * O campo a mais existe porque esta tela mostra a telemetria do computador da
 * mesa, e para isso precisa saber se o ativo da mesa tem máquina vinculada e
 * qual máquina consultar. Ele NÃO está no `Asset` compartilhado de propósito:
 * `endpointId` sairia em toda listagem, em toda criação e em toda edição de
 * ativo, e ali ninguém o usa — `GET /api/workstations/:id` é a única rota que o
 * manda DENTRO de um objeto de ativo
 * (`server/modules/workstation/use-cases/get-workstation.usecase.ts`). A aba
 * Máquina também conhece um `endpointId`, mas por fora do ativo, em
 * `GET /api/assets/:id/machine`.
 */
export interface AtivoDoPosto extends Omit<Asset, 'posse'> {
  /** `null` quando o agente ainda não foi vinculado ao ativo. */
  endpointId: string | null;
  /** O instante da entrega a esta mesa — o mínimo da devolução pela ficha (AM). */
  entregueEm: string | null;
  /** O dia previsto para a devolução, da mesma entrega (CE). */
  devolucaoPrevista: string | null;
}

/**
 * O posto aberto — `GET /api/workstations/:id`.
 *
 * SEM a lista de ocupantes: a ficha a lê da rota de ocupação
 * (`/api/workstations/:id/occupants`), com período e notas, que é também a que o
 * adicionar/encerrar invalida. Daqui saem só a contagem e o `vago`, que o servidor
 * deriva dela.
 */
export interface PostoDetalhe extends Omit<Posto, 'ocupantes'> {
  /** Os ativos entregues ao posto — posse ABERTA com alvo WORKSTATION. */
  ativos: AtivoDoPosto[];
  /** O estoque na mesa — as entregas ABERTAS com alvo WORKSTATION, uma linha por entrega. */
  itens: EntregaNaFicha[];
}
