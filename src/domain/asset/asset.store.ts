import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// A PREFERÊNCIA DE COLUNAS DA LISTAGEM DE ATIVOS (F10, Etapa B).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ZUSTAND, E NÃO O SERVIDOR NEM O TANSTACK QUERY.
//
// O `docs/referencia/arquitetura.md` já nomeava este caso: *client state* é "o que só existe no
// navegador e ninguém busca". Quais colunas uma pessoa quer ver não é um fato
// sobre o inventário — ninguém consulta, não envelhece, não é compartilhado
// entre telas nem entre pessoas, e não existe pergunta de negócio que ele
// responda. Guardá-lo no servidor criaria uma tabela, uma rota e uma migration
// para uma decisão que morre quando a aba fecha.
//
// `persist` porque o contrário seria pior que não ter: escolher cinco colunas e
// perdê-las no F5 faz a pessoa não usar o seletor uma segunda vez.
//
// É O SEGUNDO CONTEÚDO DO BALDE, depois da sessão em memória (`auth.store.ts`).
// O primeiro não persiste de propósito (token é do cookie httpOnly); este
// persiste de propósito. A regra que vale para os dois é a mesma: nunca o
// mesmo dado em zustand E em query.
// ═════════════════════════════════════════════════════════════════════════════

interface EstadoDasColunas {
  /**
   * Os tokens escolhidos. `null` significa "nunca mexi nisto" — e é diferente
   * de `[]`, que é "desmarquei tudo": sem a distinção, quem abrisse o menu e
   * desmarcasse tudo veria as colunas padrão voltarem no próximo render, como se
   * o clique não tivesse acontecido.
   */
  colunas: string[] | null;
  definir: (tokens: string[]) => void;
  restaurar: () => void;
}

export const useAssetColumnsStore = create<EstadoDasColunas>()(
  persist(
    (set) => ({
      colunas: null,
      definir: (tokens) => set({ colunas: tokens }),
      // `null` e não a lista padrão: restaurar é voltar a NÃO ter preferência,
      // então quem mudar o padrão da aplicação amanhã alcança quem restaurou.
      restaurar: () => set({ colunas: null }),
    }),
    {
      name: 'sentinel.colunas.ativos',
      // `version` para o dia em que o formato mudar: o `persist` chama
      // `migrate` quando o número sobe, e sem ele a única saída seria ler
      // estado antigo com forma nova.
      version: 1,
    },
  ),
);
