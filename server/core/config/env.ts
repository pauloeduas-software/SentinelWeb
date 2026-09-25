import './load-env';
import { createLogger } from '../logger/logger';
import { diagnosticarChaveiro } from '../crypto/keyring';

const logger = createLogger('env');

export const isProduction = process.env.NODE_ENV === 'production';

// Variáveis sem as quais o servidor não funciona: faltou alguma, o boot para
// aqui com a lista completa (em vez de falhar aos poucos em runtime).
//
// `JWT_SECRET` entrou na F3: é ele que assina o cookie de sessão. Segredo
// ausente não pode virar "assina com string vazia" nem 500 na primeira tentativa
// de login — sem ele NINGUÉM entra, então o boot para aqui.
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];

// Abaixo disto o segredo é adivinhável por força bruta offline: quem tiver um
// token assinado consegue descobrir a chave e forjar a sessão de qualquer
// usuário. 32 caracteres é o tamanho de um `openssl rand -hex 16`.
const JWT_SECRET_MINIMO = 32;

// Valores que aparecem em tutorial e em .env.example do mundo inteiro. Um
// segredo público não é segredo, mesmo tendo 64 caracteres.
const JWT_SECRET_OBVIO = /^(change|changeme|secret|segredo|troque|password|senha|jwt|test)/i;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}. ` +
        'Copie o .env.example para .env e preencha.',
    );
  }

  const port = process.env.PORT?.trim();
  if (port && Number.isNaN(Number(port))) {
    throw new Error(`PORT inválida: "${port}". Use um número, ex.: PORT=3001`);
  }

  validateJwtSecret();
  validateEncryptionKey();

  // O /agent-hub exige AGENT_TOKEN. Em produção, sem token o boot PARA: um aviso
  // no log não protege porta nenhuma, e era exatamente esse o buraco anterior.
  // Em desenvolvimento (localhost) o hub segue aberto, com aviso — exigir
  // configuração para rodar local é atrito sem ganho de segurança.
  if (!getAgentToken()) {
    if (isProduction) {
      throw new Error(
        'AGENT_TOKEN não configurado. O /agent-hub aceitaria qualquer WebSocket em produção. ' +
          'Gere um token forte (ex.: `openssl rand -hex 32`) e defina AGENT_TOKEN no .env.',
      );
    }
    logger.warn('[Env] AGENT_TOKEN vazio: /agent-hub aceita qualquer WebSocket. Só faça isso em desenvolvimento.');
  }
}

// Segredo fraco é a mesma família do AGENT_TOKEN vazio: em produção derruba o
// boot, em desenvolvimento passa com aviso. Um `JWT_SECRET=dev` publicado deixa
// qualquer um assinar um cookie de administrador — e nada na tela denuncia isso,
// porque o sistema continua funcionando perfeitamente.
function validateJwtSecret(): void {
  const secret = getJwtSecret();
  const fraco =
    secret.length < JWT_SECRET_MINIMO
      ? `tem ${secret.length} caracteres (mínimo recomendado: ${JWT_SECRET_MINIMO})`
      : JWT_SECRET_OBVIO.test(secret)
        ? 'começa com um valor de exemplo conhecido'
        : null;

  if (!fraco) return;

  const comoGerar = 'Gere um valor forte: `openssl rand -hex 32`.';
  if (isProduction) {
    throw new Error(`JWT_SECRET fraco: ${fraco}. Sessão assinada com ele é falsificável. ${comoGerar}`);
  }
  logger.warn(`[Env] JWT_SECRET fraco: ${fraco}. Aceito só em desenvolvimento. ${comoGerar}`);
}

// A CHAVE DE CRIPTOGRAFIA — mesma família do AGENT_TOKEN e do JWT_SECRET: em
// produção derruba o boot, em desenvolvimento passa com aviso (F6, D91).
//
// A diferença para os outros dois é o que acontece SEM ela. O `/agent-hub` sem
// token fica aberto; a sessão sem segredo fica falsificável. Aqui o sistema
// continua íntegro: o campo de chave de produto é RECUSADO com 422 e a licença
// nasce sem chave. Gravar em claro quando falta configuração seria o buraco —
// o sistema funcionaria, ninguém perceberia, e o segredo estaria no banco.
function validateEncryptionKey(): void {
  const problema = diagnosticarChaveiro();
  if (!problema) return;

  const comoGerar = 'Gere uma chave: `openssl rand -hex 32`.';
  if (isProduction) {
    throw new Error(
      `${problema}. Sem ela nenhuma chave de licença pode ser gravada nem lida. ${comoGerar}`,
    );
  }
  logger.warn(`[Env] ${problema}. O campo de chave de produto responderá 422. ${comoGerar}`);
}

// Chave que assina o JWT da sessão (cookie httpOnly — docs/FASE-3-PLANO-ITAM.md, D22).
export function getJwtSecret(): string {
  return (process.env.JWT_SECRET ?? '').replace(/^"|"$/g, '').trim();
}

// Segredo compartilhado com o Agente Sentinel (C#). Vazio = sem autenticação,
// aceito apenas fora de produção (ver validateEnv).
export function getAgentToken(): string {
  return (process.env.AGENT_TOKEN ?? '').replace(/^"|"$/g, '').trim();
}

export function getPort(): number {
  return Number(process.env.PORT) || 3001;
}

export function getDatabaseUrl(): string {
  // Aspas em volta do valor no .env entrariam na connection string
  return (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
}
