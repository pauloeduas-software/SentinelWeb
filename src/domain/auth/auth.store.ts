import { useCallback } from 'react';
import { create } from 'zustand';
import { registrarPerdaDeSessao } from '../../core/api/apiClient';
import { queryClient } from '../../core/api/queryClient';
import type { Credenciais, SessionUser } from '../shared/auth.types';
import { fetchSessao, loginRequest, logoutRequest } from './auth.queries';

// A SESSÃO EM MEMÓRIA — o primeiro conteúdo real do balde `zustand` que o
// docs/referencia/arquitetura.md reservou desde o começo.
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
    // `hooks/useLogin.ts` da página (docs/referencia/arquitetura.md: busca engole erro,
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

// A HIERARQUIA, espelhando `server/domain/access/helpers/papel.ts`.
//
// Duas cópias da mesma ordem, e isso é aceito: a do servidor é a que autoriza, e
// esta só decide o que desenhar. Fazer a tela consultar uma rota para saber que
// ADMIN alcança TECNICO seria uma requisição para uma constante de três valores.
export type Papel = 'USUARIO' | 'TECNICO' | 'ADMIN';
const ORDEM_DOS_PAPEIS: readonly Papel[] = ['USUARIO', 'TECNICO', 'ADMIN'];

function alcanca(papel: Papel, minimo: Papel): boolean {
  return ORDEM_DOS_PAPEIS.indexOf(papel) >= ORDEM_DOS_PAPEIS.indexOf(minimo);
}

/**
 * ESTA PESSOA ALCANÇA ESTE PAPEL? — o que as telas perguntam (D148).
 *
 * Hook e não função solta: ele assina o store, então o menu e os botões se
 * redesenham quando a sessão troca — sem isso, quem entrasse com outra conta na
 * mesma aba veria os itens da anterior até dar F5.
 *
 * ⚠️ ISTO NÃO É SEGURANÇA, e vale repetir onde se lê. A autorização é o
 * `preHandler` do servidor, que fecha tudo por padrão e já recusou antes de
 * qualquer tela existir (`core/http/permission-guard.ts`). Aqui é só interface:
 * não oferecer o clique que vai voltar 403.
 *
 * Sessão ausente devolve `false` em tudo: é o estado dos primeiros
 * milissegundos, e durante ele é melhor não desenhar um item que vai sumir do
 * que desenhar um que vai aparecer.
 */
export function usePode(minimo: Papel): boolean {
  return useAuthStore((estado) => (estado.usuario ? alcanca(estado.usuario.role, minimo) : false));
}

/**
 * A versão para quem precisa testar VÁRIOS papéis num render.
 *
 * `usePode` numa lista de itens quebraria a regra dos hooks (um por item, em
 * número variável). Este devolve a função e assina o store uma vez só.
 */
export function usePermissoes(): (minimo: Papel) => boolean {
  const papel = useAuthStore((estado) => estado.usuario?.role);
  return useCallback((minimo: Papel) => (papel ? alcanca(papel, minimo) : false), [papel]);
}

// O elo entre o 401 do `apiClient` e a tela.
//
// Acontece no carregamento do módulo (e não dentro de um componente) porque a
// perda de sessão pode chegar por qualquer requisição de qualquer tela: se
// dependesse de um `useEffect`, haveria uma janela em que o 401 não teria quem
// o escutasse. O registro é idempotente — o módulo carrega uma vez.
registrarPerdaDeSessao(() => useAuthStore.getState().encerrarLocal());
