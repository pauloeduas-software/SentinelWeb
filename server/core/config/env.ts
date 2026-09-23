import './load-env';
import { createLogger } from '../logger/logger';

const logger = createLogger('env');

export const isProduction = process.env.NODE_ENV === 'production';

// Variáveis sem as quais o servidor não funciona: faltou alguma, o boot para
// aqui com a lista completa (em vez de falhar aos poucos em runtime).
const REQUIRED_VARS = ['DATABASE_URL'];

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
