import type { UnidadeDeEstoque } from './stock.types';

/** Colaborador da empresa — quem recebe os ativos do inventário, como a LISTAGEM o devolve. */
export interface User {
  /**
   * O cargo (D148) — `USUARIO`, `TECNICO` ou `ADMIN`.
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
 *
 * Sem `role`: a ficha não mostra nem edita o cargo — quem edita é o formulário,
 * que abre da listagem.
 */
export interface UserDetail extends Omit<User, 'role'> {
  /** As unidades de estoque no NOME dela — como a ficha do posto mostra `itens`. */
  itens: UnidadeDeEstoque[];
}

/**
 * Um evento da aba Histórico da pessoa — `GET /api/users/:id/history`.
 *
 * TRÊS fontes numa lista só, e é uma a mais que o ativo tem: o `ActivityLog`
 * (cadastro, edição com diff, credencial, lixeira, desativação), as posses
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
