// Contrato de POSSE com a API — as três camadas de docs/referencia/modelo-de-posse.md:
//
//   Camada 1  Assignment           a posse, com alvo polimórfico (PERSON|WORKSTATION)
//   Camada 2  WorkstationOccupant  quem ocupa o posto, com o turno
//   Camada 3  PosseResolvida       a responsabilidade DERIVADA — nunca coluna
//
// Mora em arquivo próprio, e não dentro de `asset.types.ts`, porque posse não é
// um detalhe do ativo: a mesma `Assignment` é lida pela tela do ativo, pela do
// colaborador (`/people/:id/history`) e pela do posto (`/workstations/:id`).
//
// A dependência é de mão única — `asset.types.ts` importa daqui, e este arquivo
// não importa de lá. É o que evita ciclo entre dois arquivos de tipo.

/** Para QUEM um ativo foi entregue. Espelha o enum `AssignmentTarget`. */
export type AlvoDaPosse = 'PERSON' | 'WORKSTATION';

/**
 * COMO a pessoa virou responsável — o caminho que a Camada 3 percorreu:
 *
 * - `DIRETO`  a posse aponta para ela (`targetType: 'PERSON'`)
 * - `POSTO`   ela ocupa o posto para o qual o ativo foi entregue
 *
 * Importa na tela: "Laura" por posse direta e "Laura" por ocupar a Mesa 1 são
 * fatos diferentes, e a devolução de cada um é uma operação diferente.
 */
type ViaDaResponsabilidade = 'DIRETO' | 'POSTO';

/** Uma pessoa que responde pelo ativo. É calculada, nunca lida de coluna. */
export interface Responsavel {
  id: string;
  name: string;
  email: string | null;
  via: ViaDaResponsabilidade;
  /**
   * Texto livre vindo de `WorkstationOccupant.shift` ("Manhã", "12x36 A"). Só
   * existe quando `via` é `POSTO` — é o que distingue Laura de Ana na Mesa 1.
   */
  shift: string | null;
  /** O posto pelo qual a responsabilidade passou, quando passou por um. */
  workstationName: string | null;
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
  /** Nome de quem detém: a pessoa ou o nome do posto. */
  targetLabel: string | null;
  responsaveis: Responsavel[];
  /** Quando a posse aberta começou — o `min` do dia da devolução (AM). */
  checkoutAt: string | null;
  /**
   * Posse apontando para um posto SEM ocupante aberto: equipamento
   * parado em posto vazio. É sinal operacional, não erro de dado — por isso
   * vem no contrato e aparece na listagem (docs/referencia/modelo-de-posse.md, "Como amarra no
   * status", item 3).
   */
  postoVago: boolean;
}

/** Pessoa embutida numa linha de posse ou de ocupação. */
export interface PessoaRef {
  id: string;
  name: string;
  /** Opcional no cadastro do colaborador: ele não faz login. */
  email: string | null;
}

/** Posto embutido como alvo de uma posse ou numa ocupação. */
interface PostoRef {
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
  targetPersonId: string | null;
  targetWorkstationId: string | null;

  checkoutAt: string;
  expectedCheckinAt: string | null;
  checkinAt: string | null;

  checkoutNotes: string | null;
  checkinNotes: string | null;

  targetPerson?: PessoaRef | null;
  targetWorkstation?: PostoRef | null;
  /** O nome do posto, por escrito, quando ele foi excluído — `targetWorkstation` vem nulo. */
  targetWorkstationName?: string | null;
}

/**
 * Uma pessoa ocupando um posto — `GET /api/workstations/:id/occupants`.
 *
 * Aberta = `endedAt` nulo. Encerrar é preencher a data: "quem respondia pela
 * Mesa 1 em março?" continua respondível.
 */
export interface WorkstationOccupant {
  id: string;
  /** Nulo só na ocupação encerrada de um posto excluído — o nome fica em `workstationName`. */
  workstationId: string | null;
  workstationName?: string | null;
  personId: string;
  shift: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  person?: PessoaRef | null;
  /**
   * O posto, embutido — `OCCUPANT_SELECT` já o devolve nas duas listagens.
   *
   * É o que permite a tela do COLABORADOR escrever "Mesa 1" sem uma consulta
   * por linha: lida pelo lado da pessoa, a lista traz postos diferentes, e só o
   * `workstationId` obrigaria a um N+1 para escrever o nome de cada um.
   *
   * Opcional como `user`: lida pelo lado do POSTO, quem já sabe o nome é a
   * própria tela, e nada obriga o servidor a repeti-lo em cada linha.
   */
  workstation?: PostoRef | null;
}

/**
 * O recorte que `GET /api/workstations/:id/occupants` devolve:
 *
 * - `current` só as ocupações abertas — quem responde pelo posto AGORA
 * - `all` também as encerradas — o histórico, que nunca é apagado
 */
export type OccupantView = 'current' | 'all';
