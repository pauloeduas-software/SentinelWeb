import { create } from 'zustand';
import { registrarPerdaDeSessao } from '../../core/api/apiClient';
import { queryClient } from '../../core/api/queryClient';
import type { Credenciais, SessionUser } from '../shared/auth.types';
import { fetchSessao, loginRequest, logoutRequest } from './auth.queries';

// A SESSÃO EM MEMÓRIA — o primeiro conteúdo real do balde `zustand` que o
// docs/ARQUITETURA.md reservou desde o começo.
//
// Client state, não server state: existe só no navegador, não envelhece e
// ninguém faz polling dela. O TanStack Query, que guarda tudo o mais, seria a
// ferramenta errada aqui — e as duas juntas seriam duas fontes de verdade para
// o mesmo dado, que é a única regra absoluta daquela divisão.
//
// O que NÃO mora aqui: token. Ele está no cookie httpOnly e o JavaScript do
// painel nunca o vê (D22). O que o store guarda é o usuário — nome para o
// cabeçalho e o "já estou logado?" que decide entre o painel e a tela de login.
//
// E nada disto é `persist`: recarregar a página REPERGUNTA ao servidor
// (`conferirSessao`). Guardar o usuário no `localStorage` faria o painel se
// desenhar como logado depois que o cookie expirou — e todas as telas
// quebrariam com 401 em vez de mostrar a tela de login.

interface AuthState {
  usuario: SessionUser | null;
  /** O painel ainda está perguntando ao servidor quem é o dono do cookie. */
  verificando: boolean;
  conferirSessao: () => Promise<void>;
  entrar: (credenciais: Credenciais) => Promise<void>;
  sair: () => Promise<void>;
  /** Sessão perdida do lado do servidor: limpa o que ficou no navegador. */
  encerrarLocal: () => void;
}

/**
 * Tudo que a sessão anterior trouxe da API sai da memória junto com ela.
 *
 * Sem isto, o próximo login mostraria por alguns instantes a lista de ativos
 * de quem estava logado antes — dado de outra pessoa na tela de uma nova, que
 * é o tipo de vazamento que ninguém reporta como bug de segurança.
 */
function limparCacheDoServidor(): void {
  queryClient.clear();
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  verificando: true,

  conferirSessao: async () => {
    const usuario = await fetchSessao();
    set({ usuario, verificando: false });
  },

  entrar: async (credenciais) => {
    // O erro PROPAGA de propósito: é um clique do usuário, e a tela precisa
    // mostrar "usuário ou senha inválidos" ou "conta bloqueada". Quem trata é o
    // `hooks/useLogin.ts` da página (docs/ARQUITETURA.md: busca engole erro,
    // mutação propaga).
    const usuario = await loginRequest(credenciais);
    limparCacheDoServidor();
    set({ usuario, verificando: false });
  },

  sair: async () => {
    try {
      await logoutRequest();
    } finally {
      // `finally`: o logout local acontece mesmo que a chamada falhe. Ficar
      // "logado" na tela porque o servidor não respondeu é o pior dos dois
      // mundos — quem clicou em sair espera ter saído, e o cookie expira só.
      limparCacheDoServidor();
      set({ usuario: null, verificando: false });
    }
  },

  encerrarLocal: () => {
    limparCacheDoServidor();
    set({ usuario: null, verificando: false });
  },
}));

// O elo entre o 401 do `apiClient` e a tela.
//
// Acontece no carregamento do módulo (e não dentro de um componente) porque a
// perda de sessão pode chegar por qualquer requisição de qualquer tela: se
// dependesse de um `useEffect`, haveria uma janela em que o 401 não teria quem
// o escutasse. O registro é idempotente — o módulo carrega uma vez.
registrarPerdaDeSessao(() => useAuthStore.getState().encerrarLocal());
