import './load-env';

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * O teto de requisições por IP vale neste ambiente?
 *
 * FALSO SÓ NO TESTE, e o motivo está em `server/app.ts`: o teto é contado em
 * memória e não sabe que a suíte inteira é uma pessoa só. Fora disso o ambiente
 * de teste não ganha atalho nenhum — nenhuma guarda, nenhuma validação e nenhuma
 * regra de negócio pergunta o ambiente, porque um teste que roda contra regra
 * diferente da de produção não prova nada sobre produção.
 *
 * FUNÇÃO COM PARÂMETRO, e não uma constante lida do `process.env` no import, por
 * uma razão de prova: o que decide se a produção sobe protegida é o SENTIDO desta
 * comparação, e uma constante só pode ser testada mexendo em `process.env` antes
 * do import — o que em ESM não dá para fazer de dentro de um teste. Com o
 * parâmetro, `tests/invariantes/teto-de-requisicao.test.ts` afirma os quatro
 * casos direto, e inverter o `!==` fica vermelho.
 *
 * O PARÂMETRO É OBRIGATÓRIO, e isso não é estilo. Com `nodeEnv = process.env.NODE_ENV`
 * como padrão, `tetoDeRequisicaoLigado(undefined)` cai no padrão em vez de receber
 * `undefined` — e o caso "ambiente sem NODE_ENV", que é o do `npm run dev`, ficava
 * INALCANÇÁVEL pelo teste: dentro do vitest o padrão vale `'test'`, então a
 * asserção do desenvolvimento afirmava o teste. Quem lê o ambiente é quem chama.
 */
export function tetoDeRequisicaoLigado(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'test';
}

// Variáveis sem as quais o servidor não funciona: faltou alguma, o boot para
// aqui com a lista completa (em vez de falhar aos poucos em runtime).
//
// `JWT_SECRET` entrou na F3: é ele que assina o cookie de sessão. Segredo
// ausente não pode virar "assina com string vazia" nem 500 na primeira tentativa
// de login — sem ele NINGUÉM entra, então o boot para aqui.
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'];

const NODE_ENVS = ['development', 'production', 'test'];

// Abaixo disto o segredo é adivinhável por força bruta offline: quem tiver um
// token assinado consegue descobrir a chave e forjar a sessão de qualquer
// usuário. 32 caracteres é o tamanho de um `openssl rand -hex 16`.
const JWT_SECRET_MINIMO = 32;

// Valores que aparecem em tutorial e em .env.example do mundo inteiro. Um
// segredo público não é segredo, mesmo tendo 64 caracteres.
const JWT_SECRET_OBVIO = /^(change|changeme|secret|segredo|troque|password|senha|jwt|test)/i;

/**
 * Para o boot no que é erro e DEVOLVE os avisos, sem imprimi-los: quem sobe o
 * servidor os mostra depois dos endereços (`server.ts`), onde se leem — antes
 * deles, sumiam no meio do boot.
 */
export function validateEnv(): string[] {
  const avisos: string[] = [];
  const missing = REQUIRED_VARS.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}. ` +
        'Copie o .env.example para .env e preencha.',
    );
  }

  // `isProduction` é uma igualdade com 'production': um erro de digitação
  // (`producao`, `Production`) desligaria em silêncio o cookie Secure, a recusa do
  // segredo fraco e a exigência do AGENT_TOKEN. Valor fora da lista para o boot.
  // Ausente vale: é o `npm run dev`.
  const nodeEnv = process.env.NODE_ENV?.trim();
  if (nodeEnv && !NODE_ENVS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV inválido: "${nodeEnv}". Use ${NODE_ENVS.join(', ')} ou deixe vazio.`);
  }

  const port = process.env.PORT?.trim();
  if (port && Number.isNaN(Number(port))) {
    throw new Error(`PORT inválida: "${port}". Use um número, ex.: PORT=3001`);
  }

  const jwtFraco = validateJwtSecret();
  if (jwtFraco) avisos.push(jwtFraco);

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
    avisos.push('[Env] AGENT_TOKEN vazio: /agent-hub aceita qualquer WebSocket. Só faça isso em desenvolvimento.');
  }
  return avisos;
}

// Segredo fraco é a mesma família do AGENT_TOKEN vazio: em produção derruba o
// boot, em desenvolvimento passa com aviso. Um `JWT_SECRET=dev` publicado deixa
// qualquer um assinar um cookie de administrador — e nada na tela denuncia isso,
// porque o sistema continua funcionando perfeitamente.
function validateJwtSecret(): string | null {
  const secret = getJwtSecret();
  const fraco =
    secret.length < JWT_SECRET_MINIMO
      ? `tem ${secret.length} caracteres (mínimo recomendado: ${JWT_SECRET_MINIMO})`
      : JWT_SECRET_OBVIO.test(secret)
        ? 'começa com um valor de exemplo conhecido'
        : null;

  if (!fraco) return null;

  const comoGerar = 'Gere um valor forte: `openssl rand -hex 32`.';
  if (isProduction) {
    throw new Error(`JWT_SECRET fraco: ${fraco}. Sessão assinada com ele é falsificável. ${comoGerar}`);
  }
  return `[Env] JWT_SECRET fraco: ${fraco}. Aceito só em desenvolvimento. ${comoGerar}`;
}

// Chave que assina o JWT da sessão (cookie httpOnly — docs/historico/fase-03-autenticacao-e-ator.md, D22).
export function getJwtSecret(): string {
  return (process.env.JWT_SECRET ?? '').replace(/^"|"$/g, '').trim();
}

// Segredo compartilhado com o Agente Sentinel. Vazio = sem autenticação,
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
