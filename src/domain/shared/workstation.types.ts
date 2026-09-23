import type { EntregaDeAcessorio } from './stock.types';
import type { Asset, Referencia } from './asset.types';
import type { LocationOccupant, PessoaRef } from './posse.types';

// Contrato do POSTO DE TRABALHO com a API — `GET /api/workstations`.
//
// O posto NÃO é uma entidade nova: é uma `Location` marcada com
// `isWorkstation` (docs/MODELO-POSSE.md, D15). O que este arquivo tipa é a
// LEITURA que a tela de postos faz — a localização somada ao que o modelo de
// posse diz sobre ela: quem a ocupa e o que foi entregue a ela.
//
// Mora em arquivo próprio, e não dentro de `catalog.types.ts`, porque a linha
// de catálogo é `Record<string, unknown>` dirigida por spec: aqui os campos são
// fixos e a tela depende de cada um deles.

/**
 * Os três recortes da tela.
 *
 * `vagos` é o que justifica a tela: posto com equipamento e sem ninguém
 * respondendo por ele. `ocupados` NÃO é o inverso — um posto recém-criado, sem
 * ativo e sem gente, não é nem um nem outro e só aparece em `todos`.
 */
export type PostoView = 'todos' | 'vagos' | 'ocupados';

/** Quem ocupa o posto AGORA, como a listagem mostra: nome e turno. */
export interface PostoOcupante {
  id: string;
  userId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A". Enum engessaria escala real. */
  shift: string | null;
  user: PessoaRef | null;
}

/**
 * Uma linha da lista de postos.
 *
 * `caminho` são os ANCESTRAIS, da raiz para baixo (`['Sede', 'Andar 2',
 * 'Sala 3']`), sem o próprio posto. Vem pronto do servidor porque montá-lo no
 * cliente exigiria a árvore inteira em memória.
 */
export interface Posto {
  id: string;
  name: string;
  notes: string | null;
  isWorkstation: boolean;
  createdAt: string;

  parent: Referencia | null;
  caminho: string[];

  ocupantes: PostoOcupante[];
  totalOcupantes: number;
  /** Ativos com posse ABERTA apontando para este posto. */
  totalAtivos: number;

  /**
   * Tem equipamento e ninguém responde por ele. É sinal operacional, não erro
   * de dado: candidato a voltar para o estoque (docs/MODELO-POSSE.md, "Como
   * isso amarra no status", item 3).
   */
  vago: boolean;
}

/**
 * O posto aberto — `GET /api/workstations/:id`.
 *
 * `ocupantes` aqui é a ocupação completa (`LocationOccupant`), com período e
 * notas, e não a versão enxuta da lista: o detalhe mostra desde quando cada um
 * está no posto.
 */
export interface PostoDetalhe extends Omit<Posto, 'ocupantes'> {
  manager: Referencia | null;
  ocupantes: LocationOccupant[];
  /** Os ativos entregues ao posto — posse ABERTA com alvo LOCATION. */
  ativos: Asset[];
  /**
   * Os ACESSÓRIOS entregues ao posto (F5) — uma linha por UNIDADE.
   *
   * Lista própria, e não somada aos ativos: um acessório não tem etiqueta nem
   * série, e a tabela de ativos mostra as duas. Misturá-los daria uma tabela
   * com metade das células vazias e faria "quantos ativos tem esta mesa?"
   * responder um número que inclui mouse.
   */
  acessorios: EntregaDeAcessorio[];
  totalAcessorios: number;
}
