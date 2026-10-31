import type { AgentEnvelope, AgentMessageType, ParsedAgentMessage } from '../../shared/agent-protocol.types';
import { sanitizeHwid } from '../../endpoint/helpers/hwid.helper';
import { readString } from './payload.helper';

const KNOWN_TYPES: AgentMessageType[] = ['Handshake', 'Telemetry', 'Ping'];

// Traduz o que chegou no fio em mensagem identificada. Devolve `null` para
// qualquer coisa que não dê para tratar (JSON quebrado, tipo desconhecido,
// mensagem sem HWID) — quem chama decide o que fazer, sem try/catch espalhado.
export function parseAgentMessage(raw: string): ParsedAgentMessage | null {
  let envelope: AgentEnvelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }

  const type = (envelope.Type ?? envelope.type) as AgentMessageType;
  if (!KNOWN_TYPES.includes(type)) return null;

  const payload = envelope.Payload ?? envelope.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const hwid = readString(payload as Record<string, unknown>, 'hwid');
  if (!hwid) return null;

  return { type, hwid: sanitizeHwid(hwid), payload: payload as Record<string, unknown> };
}
