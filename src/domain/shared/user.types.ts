/** Colaborador da empresa — quem recebe os ativos do inventário. */
export interface User {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  createdAt: string;
}
