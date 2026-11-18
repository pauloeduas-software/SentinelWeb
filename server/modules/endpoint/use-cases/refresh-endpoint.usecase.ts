import { randomUUID } from 'crypto';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAuditDoQueJaAconteceu } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { isAgentConnected, sendToAgent } from '../../agent/agent.registry';
import { sanitizeHwid } from '../helpers/hwid.helper';

// ATUALIZAR AGORA (DK): a máquina manda o inventário e uma amostra de telemetria
// na hora, em vez de no próximo handshake ou na próxima hora. É o "Refetch" do
// Fleet, o "Request inventory" do GLPI e o "Sync" do Intune.
//
// A ROTA ESPERA A RESPOSTA, e não só o envio: o pedido sai como um comando
// `REFRESH`, e ela volta quando o handshake e a telemetria que ele provocou
// estiverem gravados. Quem clicou sabe se deu certo, e a ficha relida já mostra
// o dado novo. Sem resposta, o painel nem saberia se ela rodou.
//
// Estado de processo, como o `agent.registry`: o agente que responde está
// conectado a ESTE processo, e é nele que a resposta chega.

/** O agente que entende o `REFRESH`. O anterior o recusa no log. */
export const VERSAO_QUE_ATUALIZA = '0.2.0';

/** O agente lê o inventário em menos de um segundo; 15 s cobre a rede lenta. */
export const TEMPO_DA_ATUALIZACAO_MS = 15_000;

type Resposta = 'Handshake' | 'Telemetry';

interface Espera {
  faltam: Set<Resposta>;
  /**
   * `null` quando as duas respostas chegaram; senão, o erro de quem pediu primeiro (o
   * prazo esgotado, ou o envio que falhou), que quem esperava junto recebe igual.
   */
  pronta: Promise<AppError | null>;
  acordar: (falha: AppError | null) => void;
}

/** A atualização em curso de cada máquina, pelo HWID saneado. */
const esperas = new Map<string, Espera>();

/**
 * O handshake ou a telemetria da máquina, já gravados: a atualização em curso
 * dela, se há, conta a resposta. Chamado pelo `handleAgentMessage`.
 */
export function registrarRespostaDoAgente(hwid: string, tipo: Resposta): void {
  const espera = esperas.get(sanitizeHwid(hwid));
  if (!espera) return;
  espera.faltam.delete(tipo);
  if (espera.faltam.size === 0) espera.acordar(null);
}

/** `0.2.0` ou mais nova. A versão nula é a do agente que não a manda. */
function entendeORefresh(versao: string | null): boolean {
  const lida = versao?.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  if (!lida) return false;
  const minima = VERSAO_QUE_ATUALIZA.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (lida[i] !== minima[i]) return lida[i] > minima[i];
  }
  return true;
}

export async function atualizarMaquina(
  endpointId: string,
  ator: Ator,
  tempoLimiteMs = TEMPO_DA_ATUALIZACAO_MS,
): Promise<void> {
  const maquina = await prisma.endpoint.findUnique({
    where: { id: endpointId },
    select: { hwid: true, hostname: true, agentVersion: true },
  });
  if (!maquina) throw new AppError('Máquina não encontrada.', 404);

  const naoRespondeu = new AppError(
    `${maquina.hostname} não respondeu em ${tempoLimiteMs / 1000} s. Os dados ficam como estavam; tente de novo em instantes.`,
    504,
  );

  // O segundo clique, ou outra pessoa na mesma máquina: espera a mesma resposta,
  // sem mandar outro pedido.
  const chave = sanitizeHwid(maquina.hwid);
  const emCurso = esperas.get(chave);
  if (emCurso) {
    const falha = await emCurso.pronta;
    if (falha) throw falha;
    return;
  }

  if (!isAgentConnected(maquina.hwid)) {
    throw new AppError(`O agente de ${maquina.hostname} não está conectado agora.`, 409);
  }
  if (!entendeORefresh(maquina.agentVersion)) {
    throw new AppError(
      `O agente de ${maquina.hostname} é anterior à versão ${VERSAO_QUE_ATUALIZA} e não atualiza sob pedido. Atualize o agente da máquina.`,
      409,
    );
  }

  // A espera nasce ANTES do envio: o agente responde em milissegundos, e a
  // resposta que chegasse antes dela se perderia.
  let acordar!: (falha: AppError | null) => void;
  const pronta = new Promise<AppError | null>((resolve) => { acordar = resolve; });
  esperas.set(chave, { faltam: new Set<Resposta>(['Handshake', 'Telemetry']), pronta, acordar });
  const limite = setTimeout(() => acordar(naoRespondeu), tempoLimiteMs);

  try {
    const commandId = randomUUID();
    const entrega = await sendToAgent(maquina.hwid, { Type: 'Command', Payload: { Action: 'REFRESH', CommandId: commandId } });
    if (entrega === 'DESCONECTADO') {
      throw new AppError(`O agente de ${maquina.hostname} não está conectado agora.`, 409);
    }
    if (entrega === 'FALHOU') {
      throw new AppError(
        `O pedido ao agente de ${maquina.hostname} falhou: a conexão caiu antes de ele sair. Tente de novo em instantes.`,
        502,
      );
    }

    // Quem pediu, como o comando (AB): depois do envio, porque o pedido não volta atrás.
    await recordAuditDoQueJaAconteceu({
      entityType: 'Endpoint',
      entityId: endpointId,
      entityLabel: maquina.hostname,
      action: 'COMMAND',
      changes: { comando: 'REFRESH', commandId },
    }, ator);

    const falha = await pronta;
    if (falha) throw falha;
  } catch (erro) {
    // A falha do envio acorda quem esperava junto com a MESMA frase: "não respondeu"
    // seria falso para a máquina que nem recebeu o pedido.
    if (erro instanceof AppError) acordar(erro);
    throw erro;
  } finally {
    clearTimeout(limite);
    acordar(naoRespondeu);
    esperas.delete(chave);
  }
}
