import { create } from 'zustand';

// AS NOTIFICAÇÕES DO SISTEMA — o que entrou no lugar do `alert()`.
//
// O `alert()` nativo tinha três defeitos que nenhum ajuste de texto corrigia:
// TRAVA a página inteira até alguém clicar em OK (inclusive a requisição
// seguinte, que só sai depois do clique); tem a cara do NAVEGADOR, e não do
// sistema — quem lê "localhost:5173 diz" não sabe se o erro é do SentinelWeb
// ou do Chrome; e some sem rastro assim que se fecha. A notificação não trava
// nada, fala com a voz da tela e fica o tempo de ser lida.
//
// POR QUE ZUSTAND E NÃO CONTEXT + PROVIDER, que seria o caminho "de livro":
// é o padrão que a moldura já usa para estado de cromo (`useBarraLateral`), e
// ele dispensa duas coisas que um provider exigiria — envolver a árvore e
// separar o contexto do componente em arquivos diferentes só para o
// `react-refresh` não reclamar. Aqui a fila é um store de módulo; quem desenha
// é `pages/components/Notificacoes.tsx`, montado UMA vez em `main.tsx`.
//
// É CLIENT STATE pela definição do docs/referencia/arquitetura.md: só existe
// no navegador, não persiste (uma notificação de ontem depois do F5 seria
// ruído) e não responde pergunta de negócio nenhuma.

export type TipoNotificacao = 'erro' | 'aviso' | 'sucesso';

/** Um link no cartão — a licença que a recusa manda devolver. */
export interface LinkDaNotificacao {
  rotulo: string;
  para: string;
}

export interface Notificacao {
  id: number;
  tipo: TipoNotificacao;
  mensagem: string;
  /** Com links, o cartão fica até alguém fechar: é para clicar, não só ler. */
  links?: LinkDaNotificacao[];
}

// QUANTO TEMPO CADA UMA FICA. O erro fica o dobro do sucesso porque é o que se
// LÊ: "fabricante em uso por 3 registros" pede para a pessoa entender e ir
// atrás; "salvo" só confirma o que ela já esperava. O aviso fica no meio.
const DURACAO_MS: Record<TipoNotificacao, number> = {
  erro: 6000,
  aviso: 5000,
  sucesso: 3000,
};

// O ERRO LONGO FICA MAIS. Seis segundos dão para "Fabricante em uso", e não
// para a recusa de três linhas que explica com quem o ativo está e o que fazer.
// A conta é por caractere acima do que se lê de relance, com teto: o cartão
// tem X, e um erro que ficasse um minuto cobrindo o canto viraria o defeito.
//
// Escolhido no lugar de pausar com o mouse em cima porque não depende de
// mouse nem de foco: quem lê no celular ou sem tirar a mão do teclado ganha
// o mesmo tempo.
const CARACTERES_DE_RELANCE = 80;
const MS_POR_CARACTERE = 50;
const TETO_MS = 15_000;

function duracao(tipo: TipoNotificacao, mensagem: string): number {
  const base = DURACAO_MS[tipo];
  if (tipo !== 'erro') return base;
  const excesso = Math.max(0, mensagem.length - CARACTERES_DE_RELANCE);
  return Math.min(TETO_MS, base + excesso * MS_POR_CARACTERE);
}

// Um teto para a pilha. Uma rajada de falhas (servidor caiu, cinco cliques)
// não pode cobrir a tela de cartões: as mais antigas saem para as novas
// entrarem — a mais recente é a que diz o estado atual.
const MAXIMO_NA_TELA = 4;

interface AcoesDeNotificacao {
  erro: (mensagem: string, links?: LinkDaNotificacao[]) => void;
  aviso: (mensagem: string) => void;
  sucesso: (mensagem: string) => void;
  fechar: (id: number) => void;
}

interface EstadoDasNotificacoes {
  fila: Notificacao[];
  // As ações num objeto SÓ, criado uma vez: é o que deixa `useNotificacao()`
  // devolver sempre a MESMA referência. Um seletor que montasse
  // `{ erro, aviso, sucesso }` a cada chamada devolveria objeto novo a cada
  // render — e o zustand 5 entende isso como mudança e renderiza em laço.
  acoes: AcoesDeNotificacao;
}

// Os temporizadores ficam fora do estado: não são nada que a tela desenhe, e
// guardá-los no store faria cada `setTimeout` notificar os assinantes.
const temporizadores = new Map<number, ReturnType<typeof setTimeout>>();
let proximoId = 1;

export const useNotificacoes = create<EstadoDasNotificacoes>()((set) => {
  const fechar = (id: number) => {
    clearTimeout(temporizadores.get(id));
    temporizadores.delete(id);
    set((estado) => ({ fila: estado.fila.filter((item) => item.id !== id) }));
  };

  const mostrar = (tipo: TipoNotificacao, mensagem: string, links?: LinkDaNotificacao[]) => {
    const id = proximoId++;
    set((estado) => {
      const fila = [...estado.fila, { id, tipo, mensagem, ...(links?.length ? { links } : {}) }];
      // As que saem pelo teto levam o temporizador junto, senão ele dispararia
      // um `fechar` para um id que já não está na fila.
      for (const antiga of fila.slice(0, Math.max(0, fila.length - MAXIMO_NA_TELA))) {
        clearTimeout(temporizadores.get(antiga.id));
        temporizadores.delete(antiga.id);
      }
      return { fila: fila.slice(-MAXIMO_NA_TELA) };
    });
    if (links?.length) return;
    temporizadores.set(id, setTimeout(() => fechar(id), duracao(tipo, mensagem)));
  };

  return {
    fila: [],
    acoes: {
      erro: (mensagem, links) => mostrar('erro', mensagem, links),
      aviso: (mensagem) => mostrar('aviso', mensagem),
      sucesso: (mensagem) => mostrar('sucesso', mensagem),
      fechar,
    },
  };
});

/**
 * As ações de notificar, para quem dispara: `notificar.erro(mensagem)`.
 *
 * Referência estável — pode entrar em lista de dependência de `useEffect` ou
 * `useCallback` sem disparar nada a cada render.
 */
export function useNotificacao(): AcoesDeNotificacao {
  return useNotificacoes((estado) => estado.acoes);
}
