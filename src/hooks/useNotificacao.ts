import { useEffect, useState, useSyncExternalStore, type PointerEvent } from 'react';
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
// é `components/Notificacoes.tsx`, montado UMA vez em `App.tsx`.
//
// É CLIENT STATE pela definição do docs/referencia/arquitetura.md: só existe
// no navegador, não persiste (uma notificação de ontem depois do F5 seria
// ruído) e não responde pergunta de negócio nenhuma.

export type TipoNotificacao = 'erro' | 'aviso' | 'info' | 'sucesso';

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
// atrás; "salvo" só confirma o que ela já esperava. O aviso e a informação
// ficam no meio.
const DURACAO_MS: Record<TipoNotificacao, number> = {
  erro: 6000,
  aviso: 5000,
  info: 5000,
  sucesso: 3000,
};

// O ERRO LONGO FICA MAIS. Seis segundos dão para "Fabricante em uso", e não
// para a recusa de três linhas que explica com quem o ativo está e o que fazer.
// A conta é por caractere acima do que se lê de relance, com teto: o cartão
// tem X, e um erro que ficasse um minuto cobrindo o canto viraria o defeito.
//
// Soma com a pausa de `usePrazoDoCartao`, e não a substitui: o tempo maior vale
// para quem lê no celular ou sem tirar a mão do teclado, onde nada pausa.
const CARACTERES_DE_RELANCE = 80;
const MS_POR_CARACTERE = 50;
const TETO_MS = 15_000;

function duracao(tipo: TipoNotificacao, mensagem: string): number {
  const base = DURACAO_MS[tipo];
  if (tipo !== 'erro') return base;
  const excesso = Math.max(0, mensagem.length - CARACTERES_DE_RELANCE);
  return Math.min(TETO_MS, base + excesso * MS_POR_CARACTERE);
}

// Um teto para a pilha. Sem link, só a resposta mais recente fica (`limpar`); quem
// se acumula é o cartão com link, que espera alguém fechar. As mais antigas saem
// para as novas entrarem.
const MAXIMO_NA_TELA = 4;

interface AcoesDeNotificacao {
  erro: (mensagem: string, links?: LinkDaNotificacao[]) => void;
  aviso: (mensagem: string) => void;
  info: (mensagem: string) => void;
  sucesso: (mensagem: string) => void;
  fechar: (id: number) => void;
  /** Tira a resposta que está na tela, para não valer pela do clique que acabou de sair. */
  limpar: () => void;
}

interface EstadoDasNotificacoes {
  fila: Notificacao[];
  // As ações num objeto SÓ, criado uma vez: é o que deixa `useNotificacao()`
  // devolver sempre a MESMA referência. Um seletor que montasse
  // `{ erro, aviso, sucesso }` a cada chamada devolveria objeto novo a cada
  // render — e o zustand 5 entende isso como mudança e renderiza em laço.
  acoes: AcoesDeNotificacao;
}

let proximoId = 1;

export const useNotificacoes = create<EstadoDasNotificacoes>()((set) => {
  const fechar = (id: number) => {
    set((estado) => ({ fila: estado.fila.filter((item) => item.id !== id) }));
  };

  // A RESPOSTA NOVA TIRA A ANTERIOR: o erro de uma tentativa não pode ficar ao lado
  // do sucesso da seguinte, nem cinco cliques em fila empilhar cinco cartões. Só o
  // cartão com link fica: ele espera alguém fechar.
  const limpar = () => {
    set((estado) => ({ fila: estado.fila.filter((item) => item.links) }));
  };

  const mostrar = (tipo: TipoNotificacao, mensagem: string, links?: LinkDaNotificacao[]) => {
    limpar();
    const id = proximoId++;
    set((estado) => ({
      fila: [...estado.fila, { id, tipo, mensagem, ...(links?.length ? { links } : {}) }].slice(-MAXIMO_NA_TELA),
    }));
  };

  return {
    fila: [],
    acoes: {
      erro: (mensagem, links) => mostrar('erro', mensagem, links),
      aviso: (mensagem) => mostrar('aviso', mensagem),
      info: (mensagem) => mostrar('info', mensagem),
      sucesso: (mensagem) => mostrar('sucesso', mensagem),
      fechar,
      limpar,
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

function ouvirVisibilidade(avisar: () => void): () => void {
  document.addEventListener('visibilitychange', avisar);
  return () => document.removeEventListener('visibilitychange', avisar);
}

/**
 * O prazo de um cartão: para com o mouse em cima, com o foco dentro dele e com a
 * página fora de vista, e recomeça inteiro ao soltar. Devolve os eventos do cartão.
 *
 * O prazo mora no cartão montado, e não no store: quem sai da tela leva o
 * temporizador junto.
 */
export function usePrazoDoCartao({ id, tipo, mensagem, links }: Notificacao) {
  const fechar = useNotificacoes((estado) => estado.acoes.fechar);
  const [comMouse, setComMouse] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  const paginaOculta = useSyncExternalStore(ouvirVisibilidade, () => document.hidden);
  const segurado = comMouse || comFoco || paginaOculta;

  useEffect(() => {
    if (links || segurado) return undefined;
    const temporizador = setTimeout(() => fechar(id), duracao(tipo, mensagem));
    return () => clearTimeout(temporizador);
  }, [fechar, id, links, mensagem, segurado, tipo]);

  return {
    // Só o mouse: o toque não tem saída, e o cartão ficaria preso depois de um toque.
    onPointerEnter: (evento: PointerEvent) => setComMouse(evento.pointerType === 'mouse'),
    onPointerLeave: () => setComMouse(false),
    onFocus: () => setComFoco(true),
    onBlur: () => setComFoco(false),
  };
}
