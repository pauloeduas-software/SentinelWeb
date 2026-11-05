import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// O TEMA: claro ou escuro.
//
// Na primeira entrada vale o do sistema operacional, e ele fica gravado: dali em
// diante quem decide é a escolha da pessoa, não o sistema. A classe `dark` no
// <html> e o ícone da aba são o resultado. O mesmo cálculo roda no `index.html`,
// antes do bundle, para o F5 não piscar: a chave `sentinel.tema` e o formato do
// `persist` são o contrato entre os dois.

export type Tema = 'claro' | 'escuro';

interface EstadoDoTema {
  tema: Tema;
  escolher: (tema: Tema) => void;
}

export const useTema = create<EstadoDoTema>()(
  persist(
    (set) => ({
      tema: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro',
      escolher: (tema) => {
        document.documentElement.classList.toggle('dark', tema === 'escuro');
        document
          .querySelector('link[rel="icon"]')
          ?.setAttribute('href', tema === 'escuro' ? '/torre-topo-dark.svg' : '/torre-topo-light.svg');
        set({ tema });
      },
    }),
    { name: 'sentinel.tema', version: 1 },
  ),
);

// Grava já na primeira entrada: sem isto, o tema continuaria seguindo o sistema
// até a pessoa escolher um.
useTema.getState().escolher(useTema.getState().tema);
