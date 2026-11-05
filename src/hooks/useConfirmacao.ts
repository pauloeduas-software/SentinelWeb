import { create } from 'zustand';

// A CONFIRMAÇÃO DO SISTEMA — o que entrou no lugar do `confirm()` do navegador.
//
// `await confirmar({...})` responde `true` ou `false`, e por isso quem chama
// continua com a mesma linha de antes: `if (!(await confirmar(...))) return;`.
// Quem desenha é `components/DialogoDeConfirmacao.tsx`, montado uma vez no App.
//
// Promessa num store, e não um componente em cada tela: são 14 lugares
// perguntando, quase todos dentro de hooks, que não têm onde desenhar.

export interface PedidoDeConfirmacao {
  titulo: string;
  /** A consequência: o que acontece, e o que não tem volta. */
  descricao?: string;
  /** O verbo do botão. Sem ele, "Confirmar". */
  acao?: string;
  /** Excluir e encerrar: o botão sai no vermelho. */
  perigo?: boolean;
}

interface EstadoDaConfirmacao {
  pedido: PedidoDeConfirmacao | null;
  responder: (resposta: boolean) => void;
}

let resolver: ((resposta: boolean) => void) | null = null;

export const useConfirmacao = create<EstadoDaConfirmacao>()((set) => ({
  pedido: null,
  responder: (resposta) => {
    resolver?.(resposta);
    resolver = null;
    set({ pedido: null });
  },
}));

export function confirmar(pedido: PedidoDeConfirmacao): Promise<boolean> {
  // Uma pergunta por vez: a que estava aberta sai como "não".
  resolver?.(false);
  useConfirmacao.setState({ pedido });
  return new Promise((resolve) => { resolver = resolve; });
}
