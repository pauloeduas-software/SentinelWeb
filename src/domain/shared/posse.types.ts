// Contrato de POSSE com a API — as três camadas de docs/MODELO-POSSE.md:
//
//   Camada 1  Assignment        a posse, com alvo polimórfico (USER|ASSET|LOCATION)
//   Camada 2  LocationOccupant  quem ocupa o posto, com o turno
//   Camada 3  PosseResolvida    a responsabilidade DERIVADA — nunca coluna
//
// Mora em arquivo próprio, e não dentro de `asset.types.ts`, porque posse não é
// um detalhe do ativo: a mesma `Assignment` é lida pela tela do ativo, pela do
// colaborador (`/users/:id/holdings`) e pela do posto (`/locations/:id/occupants`).
//
// A dependência é de mão única — `asset.types.ts` importa daqui, e este arquivo
// não importa de lá. É o que evita ciclo entre dois arquivos de tipo.

/** Para QUEM um ativo foi entregue. Espelha o enum `AssignmentTarget`. */
export type AlvoDaPosse = 'USER' | 'ASSET' | 'LOCATION';

/**
 * COMO a pessoa virou responsável — o caminho que a Camada 3 percorreu:
 *
 * - `DIRETO`  a posse aponta para ela (`targetType: 'USER'`)
 * - `POSTO`   ela ocupa a localização para a qual o ativo foi entregue
 * - `ATIVO`   o ativo está preso a outro ativo, e ela responde por aquele
 *
 * Importa na tela: "Laura" por posse direta e "Laura" por ocupar a Mesa 1 são
 * fatos diferentes, e a devolução de cada um é uma operação diferente.
 */
export type ViaDaResponsabilidade = 'DIRETO' | 'POSTO' | 'ATIVO';

/** Uma pessoa que responde pelo ativo. É calculada, nunca lida de coluna. */
export interface Responsavel {
  id: string;
  name: string;
  email: string;
  via: ViaDaResponsabilidade;
  /**
   * Texto livre vindo de `LocationOccupant.shift` ("Manhã", "12x36 A"). Só
   * existe quando `via` é `POSTO` — é o que distingue Laura de Ana na Mesa 1.
   */
  shift: string | null;
  /** O posto pelo qual a responsabilidade passou, quando passou por um. */
  locationName: string | null;
}

/**
 * O resultado de `resolverResponsaveis()`, que a listagem de ativos traz por
 * linha para a tela não precisar de uma consulta por ativo.
 *
 * Sem posse aberta: tudo nulo e `responsaveis` vazio — o ativo está no estoque.
 */
export interface PosseResolvida {
  /** `null` = não há posse aberta. É o que decide entre entregar e devolver. */
  assignmentId: string | null;
  targetType: AlvoDaPosse | null;
  /** Nome de quem detém: a pessoa, a etiqueta do ativo ou o nome do posto. */
  targetLabel: string | null;
  responsaveis: Responsavel[];
  /**
   * Posse apontando para uma localização SEM ocupante aberto: equipamento
   * parado em posto vazio. É sinal operacional, não erro de dado — por isso
   * vem no contrato e aparece na listagem (MODELO-POSSE.md, "Como amarra no
   * status", item 3).
   */
  postoVago: boolean;
}

/** Pessoa embutida numa linha de posse ou de ocupação. */
export interface PessoaRef {
  id: string;
  name: string;
  email: string;
}

/** Ativo embutido como ALVO de uma posse (a dock que segura o notebook). */
export interface AtivoAlvoRef {
  id: string;
  assetTag: string;
  name: string | null;
}

/** Localização embutida como alvo de uma posse. */
export interface LocalRef {
  id: string;
  name: string;
}

/**
 * Uma linha de posse — `GET /api/assets/:id/assignments`.
 *
 * Aberta = `checkinAt` nulo. Fechada é histórico, e histórico não se apaga: a
 * devolução preenche a data, não deleta a linha.
 *
 * As datas são strings ISO (`JSON.parse` não reconstrói `Date`), como no resto
 * do contrato. As relações embutidas são opcionais porque o histórico pode ser
 * servido enxuto: quem mostra o alvo passa por `rotuloDoAlvo()`, que cai nas
 * FKs quando a relação não veio.
 */
export interface Assignment {
  id: string;
  assetId: string;

  targetType: AlvoDaPosse;
  targetUserId: string | null;
  targetAssetId: string | null;
  targetLocationId: string | null;

  checkoutAt: string;
  expectedCheckinAt: string | null;
  checkinAt: string | null;

  checkoutNotes: string | null;
  checkinNotes: string | null;

  targetUser?: PessoaRef | null;
  targetAsset?: AtivoAlvoRef | null;
  targetLocation?: LocalRef | null;
}

/**
 * Uma pessoa ocupando um posto — `GET /api/locations/:id/occupants`.
 *
 * Aberta = `endedAt` nulo. Encerrar é preencher a data: "quem respondia pela
 * Mesa 1 em março?" continua respondível.
 */
export interface LocationOccupant {
  id: string;
  locationId: string;
  userId: string;
  shift: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  user?: PessoaRef | null;
  /**
   * O posto, embutido — `OCCUPANT_SELECT` já o devolve nas duas listagens.
   *
   * É o que permite a tela do COLABORADOR escrever "Mesa 1" sem uma consulta
   * por linha: lida pelo lado da pessoa, a lista traz postos diferentes, e só o
   * `locationId` obrigaria a um N+1 para escrever o nome de cada um.
   *
   * Opcional como `user`: lida pelo lado do POSTO, quem já sabe o nome é a
   * própria tela, e nada obriga o servidor a repeti-lo em cada linha.
   */
  location?: LocalRef | null;
}

/**
 * O recorte que `GET /api/locations/:id/occupants` devolve:
 *
 * - `current` só as ocupações abertas — quem responde pelo posto AGORA
 * - `all` também as encerradas — o histórico, que nunca é apagado
 */
export type OccupantView = 'current' | 'all';
