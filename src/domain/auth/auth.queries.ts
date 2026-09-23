import { apiClient } from '../../core/api/apiClient';
import type { Credenciais, SessionUser } from '../shared/auth.types';

// O acesso HTTP do domínio de autenticação.
//
// POR QUE AQUI NÃO TEM TanStack Query, sendo que todo outro domínio tem:
// sessão NÃO é server state. Ela não envelhece sozinha, ninguém faz polling
// dela e nenhuma tela a busca por conta própria — o painel a lê uma vez ao
// abrir e depois só muda quando alguém entra ou sai. Guardá-la no cache do
// Query e no `auth.store.ts` ao mesmo tempo criaria exatamente o que o
// docs/ARQUITETURA.md proíbe: duas fontes de verdade para o mesmo dado.
//
// Então o balde certo é o zustand (`auth.store.ts`), e este arquivo é só o
// transporte que ele usa.

export async function loginRequest(credenciais: Credenciais): Promise<SessionUser> {
  // A resposta traz o USUÁRIO e nada mais — o token vem no cookie httpOnly, que
  // este código nunca vê nem precisa ver (D22).
  const { data } = await apiClient.post<SessionUser>('/auth/login', credenciais);
  return data;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/**
 * Quem está logado, segundo o servidor.
 *
 * Devolve `null` em vez de propagar o erro porque as duas respostas possíveis
 * levam ao mesmo lugar: 401 é "ainda não entrou" (o caso normal de quem abre o
 * painel) e servidor fora do ar também termina na tela de login — onde a
 * tentativa seguinte mostra o erro de verdade, com a frase que o `apiClient`
 * traduziu. Um erro propagado aqui deixaria o painel preso na tela de espera.
 */
export async function fetchSessao(): Promise<SessionUser | null> {
  try {
    const { data } = await apiClient.get<SessionUser>('/auth/me');
    return data;
  } catch {
    return null;
  }
}
