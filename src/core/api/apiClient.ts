import axios from 'axios';

/**
 * Cliente HTTP único do painel.
 *
 * - Em dev o Vite faz proxy de /api para a porta do backend (ver vite.config.ts),
 *   então o frontend não precisa saber em que porta o Fastify subiu.
 * - Em produção o próprio Fastify serve o frontend, logo /api é same-origin.
 * - VITE_API_URL cobre o caso de frontend e backend em hosts diferentes.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  // A SESSÃO INTEIRA DEPENDE DESTA LINHA. O cookie de sessão é httpOnly
  // (docs/historico/fase-03-autenticacao-e-ator.md, D22): JavaScript não o lê e não o manda à mão — quem
  // o envia é o navegador, e só com `withCredentials`. Sem isto, front na 3000
  // e API na 3001 são origens distintas e o cookie simplesmente não viaja: o
  // sintoma é 401 em tudo depois de um login que respondeu 200, sem erro nenhum
  // no console.
  withCredentials: true,
});

// Rotas onde um 401 é RESPOSTA, não sessão perdida: errar a senha no login não
// pode disparar "sua sessão expirou", e o /auth/me devolve 401 justamente para
// dizer "ainda não entrou" quando o painel abre.
const AUTENTICACAO = ['/auth/login', '/auth/me'];

// O que fazer quando o servidor diz que não há sessão.
//
// É um CALLBACK registrado de fora porque `src/core` não pode importar
// `src/domain` (eslint.config.js): quem sabe o que é uma sessão é
// `src/domain/auth/auth.store.ts`, e é ele que se registra aqui ao ser
// carregado. O caminho contrário — o apiClient importando o store — inverteria
// a seta de dependência da arquitetura.
let aoPerderSessao: (() => void) | null = null;

export function registrarPerdaDeSessao(handler: () => void): void {
  aoPerderSessao = handler;
}

/**
 * O erro traduzido, com o mapa POR CAMPO quando o servidor o manda.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE O `fields` PRECISA SOBREVIVER À TRADUÇÃO.
 *
 * O 422 do servidor vem com `{ error: "resumo", fields: { "<campo>": "<motivo>" } }`
 * (server/core/errors/zod-error.ts). Até aqui só o resumo sobrevivia, e isso
 * bastava enquanto todo formulário tinha campos FIXOS: uma faixa vermelha no
 * topo dizendo "IP Fixo: use um endereço IPv4" é legível quando há seis campos
 * na tela.
 *
 * Com campos customizados (F9) deixa de bastar. O conjunto pode ter vinte campos
 * que o cliente criou, e o resumo corta em três com "(e mais N)" — então o
 * motivo do vigésimo campo simplesmente não aparece em lugar nenhum. O `slug`
 * vem no `fields` justamente para a tela pintar a mensagem NO campo, e jogá-lo
 * fora aqui tornaria isso impossível sem cada página refazer a leitura do corpo
 * do erro.
 *
 * Fica nesta classe, e não num `cause` que cada tela destrinche, porque este
 * arquivo já é o único lugar que conhece o formato da resposta de erro — é a
 * mesma razão pela qual a mensagem é traduzida aqui.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class ErroDaApi extends Error {
  /** `campo` → motivo. Vazio quando o erro não é de validação. */
  readonly fields: Record<string, string>;

  /**
   * O corpo do erro, cru — para o campo que SÓ aquela rota manda.
   *
   * O formato do servidor é `{ error: "…", ...details }` (`core/errors/app-error.ts`
   * espalha os `details` no corpo), e até aqui chegavam apenas `error` e `fields`.
   * O login do segundo fator (F11, Etapa H) precisa de um terceiro: `etapa: 'TOTP'`
   * é o que diz à tela *"a senha está certa, peça o código"*. Sem ele, a única
   * alternativa seria comparar a MENSAGEM por texto — que quebra na primeira vez
   * que alguém melhorar a frase.
   *
   * Não é um `Record<string, unknown>` passeando pelo painel: quem lê isto lê UMA
   * chave conhecida, e é por isso que o acesso passa por `detalheDoErro()`.
   */
  readonly corpo: Record<string, unknown>;

  constructor(
    message: string,
    fields: Record<string, string>,
    corpo: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ErroDaApi';
    this.fields = fields;
    this.corpo = corpo;
  }
}

/**
 * Um campo do corpo do erro, como texto — ou `null`.
 *
 * Existe para quem não é `ErroDaApi` passar batido: o `catch` de uma tela recebe
 * `unknown`, e `(erro as ErroDaApi).corpo.etapa` estouraria num erro de rede.
 */
export function detalheDoErro(erro: unknown, campo: string): string | null {
  if (!(erro instanceof ErroDaApi)) return null;
  const valor = erro.corpo[campo];
  return typeof valor === 'string' ? valor : null;
}

/** O `fields` do corpo, se ele vier no formato esperado. */
function camposDoErro(data: unknown): Record<string, string> {
  if (typeof data !== 'object' || data === null) return {};
  const fields = (data as { fields?: unknown }).fields;
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return {};

  const saida: Record<string, string> = {};
  for (const [campo, motivo] of Object.entries(fields)) {
    if (typeof motivo === 'string') saida[campo] = motivo;
  }
  return saida;
}

// O backend responde erro SEMPRE no mesmo formato (`{ error: "mensagem" }`, ver
// server/core/errors). Traduzir isso em Error acontece aqui, num lugar só: as
// telas mostram `error.message` sem cada uma precisar conhecer o formato da
// resposta nem tratar "servidor fora do ar" por conta própria.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 em QUALQUER rota do painel quer dizer a mesma coisa: o cookie sumiu,
    // expirou, ou o usuário por trás dele foi apagado/desligado — o servidor
    // relê o usuário a cada requisição. Avisar num lugar só evita que cada tela
    // precise tratar sessão perdida, e a tela de login aparece sem recarregar a
    // página (nada de `window.location`, que jogaria fora o estado do painel).
    const url: string = error?.config?.url ?? '';
    if (error?.response?.status === 401 && !AUTENTICACAO.some((rota) => url.startsWith(rota))) {
      aoPerderSessao?.();
    }

    const fromServer = error?.response?.data?.error;
    const message =
      typeof fromServer === 'string' && fromServer
        ? fromServer
        : error?.code === 'ECONNABORTED'
          ? 'O servidor demorou demais para responder.'
          : error?.response
            ? 'Erro inesperado no servidor.'
            : 'Não foi possível falar com o servidor.';

    // `ErroDaApi` e não `Error`: continua sendo um `Error` para todo código que
    // só lê `.message` (que é a maioria), e carrega o `fields` para quem precisa
    // pintar o campo certo.
    const data: unknown = error?.response?.data;
    const corpo = typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

    return Promise.reject(
      new ErroDaApi(message, camposDoErro(data), corpo, { cause: error }),
    );
  },
);
