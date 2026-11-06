import { create } from 'zustand';

// A VAGA DO TÍTULO NO CABEÇALHO: o `AppHeader` registra o elemento, e a
// `PaginaCabecalho` desenha o título lá dentro por portal. Quem sabe o título é a
// página (a ficha do ativo mostra a etiqueta, não o nome do menu), e o cabeçalho
// fica de pé entre uma tela e outra. É cromo da moldura, como `useBarraLateral`.

interface EstadoDaVaga {
  vaga: HTMLElement | null;
  registrar: (vaga: HTMLElement | null) => void;
}

export const useVagaDoTitulo = create<EstadoDaVaga>()((set) => ({
  vaga: null,
  registrar: (vaga) => set({ vaga }),
}));
