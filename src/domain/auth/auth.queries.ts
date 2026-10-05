import { apiClient, detalheDoErro } from '../../core/api/apiClient';
import type { Credenciais, SessionUser } from '../shared/auth.types';

// O acesso HTTP do domínio de autenticação.
//
// POR QUE AQUI NÃO TEM TanStack Query, sendo que todo outro domínio tem:
// sessão NÃO é server state. Ela não envelhece sozinha, ninguém faz polling
// dela e nenhuma tela a busca por conta própria — o painel a lê uma vez ao
// abrir e depois só muda quando alguém entra ou sai. Guardá-la no cache do
// Query e no `auth.store.ts` ao mesmo tempo criaria exatamente o que o
// docs/referencia/arquitetura.md proíbe: duas fontes de verdade para o mesmo dado.
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

/**
 * O login foi recusado porque falta o SEGUNDO FATOR? (F11, Etapa H)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA FUNÇÃO EXISTE AQUI, E NÃO NO HOOK DA TELA DE LOGIN.
 *
 * A regra do projeto é que página não fala HTTP (`eslint.config.js` recusa o
 * import de `core/api` em `src/pages`), e ler um campo do CORPO DO ERRO é falar
 * HTTP: é conhecer o formato da resposta. O hook da tela precisa de uma pergunta
 * de negócio — *"ele quer o código?"* —, não do formato.
 *
 * O servidor responde 401 com `{ error: "…", etapa: "TOTP" }` quando a senha está
 * certa e o código falta ou está errado. A alternativa seria a tela comparar a
 * MENSAGEM por texto, que quebra na primeira vez que alguém melhorar a frase.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function pedindoSegundoFator(erro: unknown): boolean {
  return detalheDoErro(erro, 'etapa') === 'TOTP';
}
