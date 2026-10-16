import type { UnidadeDeEstoque } from './stock.types';

/** Colaborador da empresa — quem recebe os ativos do inventário. */
export interface User {
  /**
   * O papel (D148) — `USUARIO`, `TECNICO` ou `ADMIN`.
   *
   * Vem no `USER_LIST_SELECT`, e não só no detalhe: o formulário abre da
   * listagem e edita este campo. Sem ele aqui, o `<select>` inicializaria em
   * `USUARIO` e gravaria `USUARIO` — corrigir um e-mail rebaixaria a pessoa.
   */
  role: 'USUARIO' | 'TECNICO' | 'ADMIN';
  /**
   * Está ativa na empresa? Vem na listagem porque é ela que decide o botão da
   * linha — Desativar ou Ativar — e esmaece quem saiu. O formulário NÃO edita
   * este campo: desativar e ativar são só o botão (ver `UserFormModal`).
   */
  isActive: boolean;
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * O que ainda prende a pessoa ao inventário — as QUATRO pontas da posse
 * (docs/referencia/modelo-de-posse.md), contadas separadas.
 *
 * Separadas porque se resolvem de jeitos diferentes: o ativo se devolve, o
 * assento volta ao contrato, a unidade de estoque volta ao almoxarifado e o
 * posto se desocupa. Uma soma só diria "5 pendências" e mandaria o operador
 * procurar cinco devoluções que não existem.
 *
 * São as mesmas quatro que o 409 do `DELETE` devolve em `details`
 * (`user/use-cases/delete-user.usecase.ts`).
 */
export interface PosseAbertaDoUsuario {
  ativosEmPosse: number;
  /** Assentos de licença de alvo `USER` — nunca os dos ativos dela. */
  assentosEmPosse: number;
  /** Unidades de estoque no NOME dela — nunca as do posto que ela ocupa. */
  itensEmPosse: number;
  postosOcupados: number;
}

/**
 * UM colaborador, como `GET /api/users/:id` o devolve — a tela de perfil.
 *
 * Os campos daqui que a LISTAGEM não traz são proposital: eles existem para
 * esta tela, e viajariam em cada linha de cada histórico se entrassem no
 * `USER_PUBLIC_SELECT` do servidor.
 *
 * DESATIVAR NÃO É LIXEIRA. Quem saiu da empresa continua no cadastro, com o
 * histórico de posse apontando para ele; `deletedAt` (que nem chega aqui) é
 * para cadastro criado errado. Confundir os dois é perder a única prova de quem
 * estava com o equipamento.
 */
export interface UserDetail extends User {

  // A IDENTIDADE (F11, Etapa E). Só nesta leitura.
  employeeNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
  address: string | null;
  /** ISO da admissão. Não é `createdAt`: a pessoa trabalha aqui desde antes. */
  hiredAt: string | null;
  /**
   * O que ainda prende esta pessoa ao inventário, contado nas QUATRO pontas —
   * ver `PosseAbertaDoUsuario` logo acima.
   */
  posseAberta: PosseAbertaDoUsuario;

  /** As unidades de estoque no NOME dela — como a ficha do posto mostra `itens`. */
  itens: UnidadeDeEstoque[];

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
