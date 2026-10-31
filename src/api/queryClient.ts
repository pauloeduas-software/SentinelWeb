import { QueryClient } from '@tanstack/react-query';
import { ErroDaApi } from './apiClient';

/**
 * Cache de dado de servidor do painel.
 *
 * Divisão de responsabilidade (ver docs/referencia/arquitetura.md):
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
      // servidor fora do ar atrás de espera silenciosa. E só para o que pode
      // mudar na segunda tentativa: 4xx (403, 404, 409, 422) é resposta do
      // servidor, repetir o pedido devolve a mesma recusa e só atrasa a tela.
      retry: (tentativas, error) => {
        const status = error instanceof ErroDaApi ? error.status : undefined;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return tentativas < 1;
      },
      // Voltar para a aba mostra dado de agora, não de dez minutos atrás
      refetchOnWindowFocus: true,
    },
  },
});
