/** Quem OPERA o sistema — Técnico ou Administrador —, como a LISTAGEM o devolve. */
export interface User {
  /**
   * O cargo (D148) — `TECNICO` ou `ADMIN`.
   *
   * Vem no `USER_LIST_SELECT` porque o formulário abre da listagem e edita
   * este campo. Sem ele aqui, o `<select>` inicializaria em `TECNICO` e
   * gravaria `TECNICO` — corrigir um e-mail rebaixaria um administrador.
   */
  role: 'TECNICO' | 'ADMIN';
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
