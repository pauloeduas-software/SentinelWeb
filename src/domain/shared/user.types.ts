/** `{ id, name }` — como departamento e gestor chegam na resposta. */
export interface Referencia {
  id: string;
  name: string;
}

/**
 * Colaborador da empresa — quem recebe os ativos do inventário.
 *
 * `department` É OPCIONAL NO TIPO, e isso é o contrato do D135 aparecendo aqui:
 * ele só vem na LISTAGEM de pessoas (`USER_LIST_SELECT` no servidor), que é a
 * única tela que mostra a coluna. Nos lugares onde um usuário vem EMBUTIDO — o
 * `assignedTo` de um ativo, o ocupante de um posto, o alvo de uma posse — ele
 * não vem, porque o join não tem o que fazer em cada linha de cada histórico.
 *
 * Então `user.department` ausente não é dado faltando: é o select certo tendo
 * sido usado. Quem precisa dele numa tela nova pede a rota que o traz.
 */
export interface User {
  /**
   * O papel (D148) — `USUARIO`, `TECNICO` ou `ADMIN`.
   *
   * Vem no `USER_LIST_SELECT`, e não só no detalhe: o formulário abre da
   * listagem e edita este campo. Sem ele aqui, o `<select>` inicializaria em
   * `USUARIO` e gravaria `USUARIO` — corrigir um e-mail rebaixaria a pessoa.
   */
  role: 'USUARIO' | 'TECNICO' | 'ADMIN';
  id: string;
  name: string;
  email: string;
  /** Só na listagem de pessoas e no perfil — ver acima (D135). */
  department?: Referencia | null;
  /**
   * O id do gestor, cru. Só na LISTAGEM, e só porque o formulário o edita.
   *
   * Sem ele, o `<select>` de gestor abriria vazio ao editar e gravaria `null` —
   * editar o nome de alguém apagaria o gestor dela em silêncio.
   */
  managerId?: string | null;
  createdAt: string;
}

/**
 * O que ainda prende a pessoa ao inventário — as QUATRO pontas da posse
 * (docs/referencia/modelo-de-posse.md), contadas separadas.
 *
 * Separadas porque se resolvem de jeitos diferentes: o ativo e o acessório se
 * devolvem, o assento volta ao contrato (ou QUEIMA, D43) e o posto se desocupa.
 * Uma soma só diria "5 pendências" e mandaria o operador procurar cinco
 * devoluções que não existem.
 *
 * São as mesmas quatro que o 409 do `DELETE` devolve em `details`
 * (`user/use-cases/delete-user.usecase.ts`) — e é por isso que faltar uma aqui
 * não é cosmético: a tela que decidir pelo `details` enxergaria zero pendência
 * em quem só ocupa assento de licença.
 */
export interface PosseAbertaDoUsuario {
  ativosEmPosse: number;
  /** Unidades de acessório de alvo `USER` — só as DIRETAS, nunca as do posto (F5). */
  acessoriosEmPosse: number;
  /** Assentos de licença de alvo `USER` — nunca os dos ativos dela (F6, D93). */
  assentosEmPosse: number;
  postosOcupados: number;
}

/**
 * UM colaborador, como `GET /api/users/:id` o devolve — a tela de perfil.
 *
 * Tem dois campos que a LISTAGEM não traz, e a diferença é proposital: eles
 * existem para a tela de perfil e para o desligamento, e viajariam em cada
 * linha de cada histórico se entrassem no `USER_PUBLIC_SELECT` do servidor.
 *
 * `terminatedAt` NÃO é lixeira. Quem saiu da empresa continua no cadastro, com
 * o histórico de posse apontando para ele; `deletedAt` (que nem chega aqui) é
 * para cadastro criado errado. Confundir os dois é perder a única prova de quem
 * estava com o equipamento.
 */
export interface UserDetail extends User {
  isActive: boolean;
  /** ISO da saída, ou `null` para quem continua na empresa. */
  terminatedAt: string | null;

  // A IDENTIDADE (F11, Etapa E). Só nesta leitura, pelo mesmo motivo de
  // `isActive`/`terminatedAt`.
  employeeNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
  address: string | null;
  /** ISO da admissão. Não é `createdAt`: a pessoa trabalha aqui desde antes. */
  hiredAt: string | null;
  /**
   * Quem COBRA esta pessoa — a hierarquia de gente.
   *
   * ⚠️ NUNCA quem responde pelo ativo dela (D72). Responsabilidade por
   * equipamento é *quem está com ele*, e sai de `posse.responsaveis`.
   */
  manager: Referencia | null;
  posseAberta: PosseAbertaDoUsuario;

}

/**
 * Um evento da aba Histórico da pessoa — `GET /api/users/:id/history`.
 *
 * TRÊS fontes numa lista só, e é uma a mais que o ativo tem: o `ActivityLog`
 * (cadastro, edição com diff, credencial, lixeira, desligamento), as posses
 * DIRETAS dela e as OCUPAÇÕES de posto. A terceira é o que responde "quem
 * cadastrou a Laura na Mesa 1?", pergunta que o D25 mandou para o log em vez de
 * virar coluna.
 *
 * Responde o que aconteceu COM a pessoa, nunca o que ela FEZ: a consulta do
 * servidor é por `entityId`, não por `actorId`.
 */
export interface EventoDaPessoa {
  id: string;
  fonte: 'ATIVIDADE' | 'POSSE' | 'POSTO';
  action: string;
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  /** Quem operou. Nulo no que é anterior à F3, e de propósito (D24). */
  actorId: string | null;
  /**
   * O diff (`{ campo: { de, para } }`) misturado com valores soltos: o formato
   * varia com a operação, e por isso é lido por `lerEvento()` em vez de ser
   * tipado campo a campo.
   */
  changes: unknown;
  /** Preenchido só quando `fonte === 'POSSE'`. */
  posse: {
    assignmentId: string;
    assetId: string;
    /** "ATV-00012 — Dell Latitude". */
    assetLabel: string;
    notes: string | null;
    expectedCheckinAt: string | null;
  } | null;
  /** Preenchido só quando `fonte === 'POSTO'`. */
  posto: {
    occupantId: string;
    locationId: string;
    locationLabel: string;
    shift: string | null;
    notes: string | null;
  } | null;
}
