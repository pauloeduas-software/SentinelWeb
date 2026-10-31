/** Quem OPERA o sistema — hoje, só Administrador (Z) —, como a LISTAGEM o devolve. */
export interface User {
  /**
   * O cargo (D148) — hoje sempre `ADMIN` (Z). Vem no `USER_LIST_SELECT` para
   * a coluna Cargo da lista.
   */
  role: 'ADMIN';
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
