import { QueryClient } from '@tanstack/react-query';

/**
 * Cache de dado de servidor do painel.
 *
 * Divisão de responsabilidade (ver docs/ARQUITETURA.md):
 * - **TanStack Query** guarda *server state*: o que vem da API, envelhece e é
 *   compartilhado entre telas (ativos, inventário, usuários).
 * - **zustand** guarda *client state*: o que só existe no navegador (sessão em
 *   memória, preferência de tela). Nunca os dois para o mesmo dado.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Telemetria nasce velha: sempre revalida. Quem define o ritmo é o
      // `refetchInterval` de cada query.
      staleTime: 0,
      // Ferramenta interna: uma repetição basta. Mais que isso esconde
      // servidor fora do ar atrás de espera silenciosa.
      retry: 1,
      // Voltar para a aba mostra dado de agora, não de dez minutos atrás
      refetchOnWindowFocus: true,
    },
  },
});
