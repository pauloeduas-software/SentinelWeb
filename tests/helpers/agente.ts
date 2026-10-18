import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import type { ApiDeTeste } from './app';

// O AGENTE DE TESTE — um WebSocket de verdade contra o `/agent-hub` de verdade.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO `app.inject()`, QUE É A REGRA DO RESTO DA SUÍTE
//
// Porque `inject` não faz upgrade de WebSocket: ele monta uma requisição HTTP e
// entrega ao Fastify sem socket, e o `/agent-hub` precisa exatamente do socket.
// Até a F7 isso nunca incomodou: nenhum teste precisava de um agente conectado.
//
// A F7 mudou o que está em jogo: a borda do agente (parse → normalização →
// upsert) é justamente onde o agente VELHO e o NOVO se distinguem, e é o risco
// número um do rollout. Chamar `handleAgentMessage()` direto pularia o parser,
// a tabela de sinônimos PascalCase/camelCase e o `readOptionalBigInt` — ou seja,
// pularia tudo que este teste existe para exercitar. É o mesmo princípio que
// faz os fixtures criarem cenário pela API e não por `prisma.create`.
//
// O preço é abrir uma porta efêmera (`port: 0`) por arquivo. É mais lento que
// `inject` e continua sendo o MESMO Fastify de produção.
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_TOKEN = process.env.AGENT_TOKEN ?? '';

export interface AgenteDeTeste {
  hwid: string;
  /** Manda um Handshake e espera o servidor confirmar que processou. */
  handshake(payload?: Record<string, unknown>): Promise<void>;
  telemetria(payload?: Record<string, unknown>): Promise<void>;
  /**
   * A próxima mensagem que o SERVIDOR mandou a este agente, já desserializada.
   *
   * É o que prova a entrega de um comando: a rota dizer 200 não é o pacote ter
   * chegado do outro lado do socket. As mensagens ficam em fila desde a
   * conexão, então chamar depois do envio não perde a que já chegou.
   */
  receber(descricao: string, tempoLimiteMs?: number): Promise<Record<string, unknown>>;
  fechar(): Promise<void>;
}

/** Sobe a aplicação numa porta efêmera. Uma vez por arquivo de teste. */
async function ouvir(api: ApiDeTeste): Promise<number> {
  const endereco = api.app.server.address();
  if (endereco && typeof endereco === 'object') return (endereco as AddressInfo).port;

  await api.app.listen({ port: 0, host: '127.0.0.1' });
  return (api.app.server.address() as AddressInfo).port;
}

/**
 * Espera uma condição do banco virar verdadeira.
 *
 * O agente é assíncrono por natureza: o `send` volta quando o byte saiu, não
 * quando o servidor gravou. Sem esta espera o teste leria o banco antes do
 * `upsert` e falharia de forma intermitente — o pior tipo de vermelho, porque
 * ensina a rodar de novo em vez de investigar.
 *
 * `sleep` fixo não serve: ele é lento quando acerta e frágil quando erra.
 */
export async function esperarPor<T>(
  descricao: string,
  condicao: () => Promise<T | null | undefined>,
  tempoLimiteMs = 5_000,
): Promise<T> {
  const limite = Date.now() + tempoLimiteMs;

  for (;;) {
    const valor = await condicao();
    if (valor) return valor;
    if (Date.now() > limite) throw new Error(`Tempo esgotado esperando: ${descricao}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Conecta um agente.
 *
 * O payload sai em PascalCase porque é assim que o agente serializa — e é o
 * caminho que o `normalize-payload.helper` tem que resolver. Um teste escrito em
 * camelCase provaria o caminho mais fácil.
 */
export async function conectarAgente(api: ApiDeTeste, hwid: string): Promise<AgenteDeTeste> {
  const porta = await ouvir(api);

  const socket = new WebSocket(`ws://127.0.0.1:${porta}/agent-hub`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  const mandar = async (Type: string, Payload: Record<string, unknown>) => {
    socket.send(JSON.stringify({ Type, Payload: { Hwid: hwid, ...Payload } }));
  };

  // O que o servidor mandou, na ordem. Quem espera uma mensagem e ainda não há
  // nenhuma fica em `esperando`, e é acordado pela próxima que chegar.
  const recebidas: Record<string, unknown>[] = [];
  const esperando: ((mensagem: Record<string, unknown>) => void)[] = [];
  socket.on('message', (bruto) => {
    const mensagem = JSON.parse(bruto.toString()) as Record<string, unknown>;
    const acordar = esperando.shift();
    if (acordar) acordar(mensagem);
    else recebidas.push(mensagem);
  });

  return {
    hwid,
    receber: (descricao, tempoLimiteMs = 5_000) => {
      const pronta = recebidas.shift();
      if (pronta) return Promise.resolve(pronta);

      return new Promise((resolve, reject) => {
        const limite = setTimeout(() => {
          const indice = esperando.indexOf(acordar);
          if (indice >= 0) esperando.splice(indice, 1);
          reject(new Error(`Tempo esgotado esperando: ${descricao}`));
        }, tempoLimiteMs);
        const acordar = (mensagem: Record<string, unknown>) => {
          clearTimeout(limite);
          resolve(mensagem);
        };
        esperando.push(acordar);
      });
    },
    handshake: (payload = {}) => mandar('Handshake', {
      Hostname: 'maquina-de-teste',
      OsVersion: 'Windows 11 Pro',
      ...payload,
    }),
    telemetria: (payload = {}) => mandar('Telemetry', {
      CpuUsagePercentage: 12.5,
      RamTotalBytes: 17179869184,
      RamUsedBytes: 8589934592,
      ...payload,
    }),
    fechar: () => new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    }),
  };
}
