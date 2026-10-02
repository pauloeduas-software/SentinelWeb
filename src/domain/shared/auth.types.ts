import type { User } from './user.types';

/**
 * Quem está logado.
 *
 * Os campos de `User` vêm da mesma allowlist de toda rota que devolve usuário
 * (`USER_PUBLIC_SELECT`) — o login não tem uma própria, senão é por ela que o
 * `passwordHash` escapa um dia. O que a sessão tem A MAIS é `permissions`, e a
 * diferença é deliberada: no servidor ela fica FORA daquela allowlist (D136),
 * porque o que a pessoa PODE não é dado dela e viajaria embutido em toda posse
 * e toda ocupação do inventário.
 *
 * Então "a sessão" e "um colaborador da listagem" deixaram de ter os mesmos
 * campos na F11, e é esse o motivo de os dois tipos existirem separados.
 *
 * O que NÃO existe aqui, e nunca vai existir: token. Ele viaja em cookie
 * httpOnly e o JavaScript do painel nunca o vê (docs/FASE-3-PLANO-ITAM.md, D22).
 */
export type SessionUser = User & {
  /**
   * O que esta pessoa alcança — as chaves `<módulo>.<ação>` da união dos grupos
   * dela (F11, D76).
   *
   * VEM SÓ DE DUAS ROTAS, `POST /api/auth/login` e `GET /api/auth/me`, e nunca
   * embutida num `assignedTo` ou num ocupante de posto: no servidor ela não está
   * no `USER_PUBLIC_SELECT` de propósito (D136). Por isso é um campo de
   * `SessionUser` e não de `User` — o colaborador da listagem não tem isto.
   *
   * PARA QUE A TELA USA: para não desenhar o que vai dar 403. Isto **não é
   * segurança** — a segurança é o `preHandler` do servidor, que recusa antes de
   * qualquer tela existir. Esconder um menu não protege dado nenhum, e é por
   * isso que a decisão não pode existir só aqui.
   *
   * Array e não `Set` porque é o que atravessa o JSON: `JSON.stringify(new Set())`
   * devolve `{}`. Quem consulta usa o `pode()` do store.
   */
  permissions: string[];
};

export interface Credenciais {
  username: string;
  password: string;
  /**
   * O código de seis dígitos do aplicativo autenticador (F11, Etapa H).
   *
   * Vai só na SEGUNDA tentativa: a primeira manda usuário e senha, o servidor
   * responde 401 com `etapa: 'TOTP'` e a tela mostra o campo. Mandar o campo
   * vazio no primeiro envio faria o `strictObject` do servidor recusar com 422.
   */
  totp?: string;
  /** Um dos códigos de recuperação — o caminho de quem perdeu o celular. */
  recoveryCode?: string;
}

/**
 * O estado do segundo fator DESTA sessão — `GET /api/auth/totp`.
 *
 * Rota própria e não um campo de `SessionUser`: é o mesmo argumento do D136
 * aplicado a outro dado. "Esta pessoa tem 2FA" não é campo de colaborador para
 * viajar embutido em toda posse e toda ocupação do inventário.
 */
export interface StatusDoSegundoFator {
  ativo: boolean;
  /** `null` quando não está ativo — não é zero, é "não se aplica". */
  codigosRestantes: number | null;
  /** Há segredo gravado esperando confirmação? Decide o rótulo do botão. */
  cadastroPendente: boolean;
}

/** O que o `enroll` devolve: o QR e as duas formas de levá-lo para o celular. */
export interface CadastroDeSegundoFator {
  /** PNG em data URL, gerado NO SERVIDOR — o painel não carrega lib de QR. */
  qrcode: string;
  /** A URI `otpauth://`, para quem preferir copiar. */
  uri: string;
  /** O segredo em base32, para autenticador sem câmera. */
  secret: string;
}

/**
 * Os códigos de recuperação, como a confirmação os entrega.
 *
 * Aparecem UMA vez. Não há rota para relê-los — é essa ausência que faz o sha256
 * no banco valer alguma coisa, a mesma regra do segredo do token (D80).
 */
export interface CodigosDeRecuperacao {
  codigosDeRecuperacao: string[];
}

/**
 * Um token de agente, como a listagem o devolve.
 *
 * Sem `token` e sem `tokenHash`: o segredo aparece UMA vez, na resposta da
 * emissão, e nunca mais. Não há rota para relê-lo, e é essa ausência que faz o
 * sha256 no banco valer alguma coisa — nem quem lê o dump consegue autenticar.
 */
export interface TokenDeAgente {
  id: string;
  name: string;
  ownerType: 'AGENT' | 'USER';
  /** Preenchido no PRIMEIRO handshake, não na emissão (D80). */
  endpointId: string | null;
  /** A metade pública. Identifica a linha na tela sem revelar nada. */
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdById: string | null;
}

/** A resposta da EMISSÃO — a única que carrega o segredo. */
export interface TokenEmitido extends TokenDeAgente {
  token: string;
}

/**
 * Um token PESSOAL (F11, Etapa H).
 *
 * MESMA FORMA do token de agente, e por isso é um apelido em vez de uma interface
 * própria: a tabela é a mesma (`api_tokens`), o `select` de resposta é o mesmo e a
 * tela mostra as mesmas colunas. O que muda é o `ownerType` e o DONO — e o dono
 * não viaja no corpo porque a rota `/api/me/tokens` só responde sobre quem pediu.
 *
 * Duas interfaces idênticas divergiriam no primeiro campo acrescentado a uma delas.
 */
export type TokenPessoal = TokenDeAgente;
