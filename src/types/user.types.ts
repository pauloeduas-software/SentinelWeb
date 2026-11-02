/**
 * Os cargos, do menor para o maior (AV), espelhando
 * `server/modules/access/helpers/cargo.ts`.
 */
export type Cargo = 'TECNICO' | 'SUPERVISOR' | 'ADMIN';

/** Quem OPERA o sistema, como a LISTAGEM o devolve. */
export interface User {
  /**
   * O cargo (D148, AV). Vem no `USER_LIST_SELECT` para a coluna Cargo da
   * lista e o formulário.
   */
  role: Cargo;
  /**
   * Está ativo? Vem na listagem porque é ele que decide o botão da linha —
   * Desativar ou Ativar — e esmaece quem saiu. O formulário NÃO edita este
   * campo: desativar e ativar são só o botão (ver `UserFormModal`).
   */
  isActive: boolean;
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
