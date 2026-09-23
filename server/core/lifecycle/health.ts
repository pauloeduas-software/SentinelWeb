import { prisma } from '../database/prismaClient';

export interface DependencyHealth {
  database: boolean;
}

// Dependência travada (banco sem responder) não pode travar o health check
// junto: passado o prazo, conta como fora do ar.
export function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function check(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await withTimeout(fn());
    return true;
  } catch {
    return false;
  }
}

// Dependências sem as quais o sistema não atende. Usado no boot e no /health/ready.
export async function checkDependencies(): Promise<DependencyHealth> {
  const [database] = await Promise.all([check(() => prisma.$queryRaw`SELECT 1`)]);
  return { database };
}

export function isHealthy(health: DependencyHealth): boolean {
  return health.database;
}

export interface ReadinessReport {
  httpStatus: 200 | 503;
  body: {
    status: 'ok' | 'degraded';
    dependencies: DependencyHealth;
    agentsOnline: number;
    time: string;
  };
}

// Resposta do /health/ready. `agentsOnline` (agentes com WebSocket aberto neste
// processo) só informa — não reprova: frota inteira desligada é fim de
// expediente, não servidor doente.
export async function buildReadinessReport(
  checkDeps: () => Promise<DependencyHealth>,
  countAgentsOnline: () => number,
): Promise<ReadinessReport> {
  const dependencies = await checkDeps();
  const healthy = isHealthy(dependencies);
  return {
    httpStatus: healthy ? 200 : 503,
    body: {
      status: healthy ? 'ok' : 'degraded',
      dependencies,
      agentsOnline: countAgentsOnline(),
      time: new Date().toISOString(),
    },
  };
}
