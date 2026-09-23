import type { Endpoint, Telemetry } from '@prisma/client';

// Os bytes de RAM são BigInt no banco, e BigInt não tem representação em JSON:
// `JSON.stringify` estoura. A conversão acontece AQUI, na saída do domínio, e
// não com um `BigInt.prototype.toJSON` global — remendo que mudava o
// comportamento de toda a aplicação para resolver um campo (docs/ITAM-TODO.md, F0).
//
// O formato do fio continua o mesmo de antes (string), então o frontend não muda.

export type PresentedTelemetry = Omit<Telemetry, 'ramTotal' | 'ramUsed'> & {
  ramTotal: string;
  ramUsed: string;
};

export type PresentedEndpoint = Endpoint & { telemetries: PresentedTelemetry[] };

export function presentTelemetry(telemetry: Telemetry): PresentedTelemetry {
  return { ...telemetry, ramTotal: telemetry.ramTotal.toString(), ramUsed: telemetry.ramUsed.toString() };
}

export function presentEndpoint(endpoint: Endpoint & { telemetries: Telemetry[] }): PresentedEndpoint {
  return { ...endpoint, telemetries: endpoint.telemetries.map(presentTelemetry) };
}
