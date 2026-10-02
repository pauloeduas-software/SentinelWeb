import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// O ESTADO DA BARRA LATERAL — e são DUAS coisas, não uma.
//
// `recolhida`  preferência de quem usa: barra estreita, só ícones. Vale para
//              sempre, atravessa o F5 e é por isso que persiste.
// `abertaNoCelular`  a gaveta. É momento, não preferência: ninguém quer que a
//              gaveta volte aberta na próxima visita, e persistir isso faria a
//              tela abrir coberta pelo menu.
//
// Por isso o `partialize`: o `persist` guarda só a primeira. Sem ele, as duas
// iriam para o `localStorage` juntas — e a segunda voltaria `true` para quem
// fechou a aba com o menu aberto.
//
// É CLIENT STATE pela definição do docs/ARQUITETURA.md: só existe no navegador,
// ninguém busca, não envelhece e não responde pergunta de negócio nenhuma. Mora
// em `pages/hooks` porque é cromo da moldura — a barra é de `pages/components`,
// e não há domínio de que isto seja um fato. O `eslint` permite: o que `pages`
// não pode importar é HTTP (`axios`, `react-query`, `core/api`), não `zustand`.

interface EstadoDaBarra {
  recolhida: boolean;
  abertaNoCelular: boolean;
  alternarRecolhida: () => void;
  abrirNoCelular: () => void;
  fecharNoCelular: () => void;
}

export const useBarraLateral = create<EstadoDaBarra>()(
  persist(
    (set) => ({
      recolhida: false,
      abertaNoCelular: false,
      alternarRecolhida: () => set((estado) => ({ recolhida: !estado.recolhida })),
      abrirNoCelular: () => set({ abertaNoCelular: true }),
      fecharNoCelular: () => set({ abertaNoCelular: false }),
    }),
    {
      name: 'sentinel.barra-lateral',
      version: 1,
      partialize: (estado) => ({ recolhida: estado.recolhida }),
    },
  ),
);
