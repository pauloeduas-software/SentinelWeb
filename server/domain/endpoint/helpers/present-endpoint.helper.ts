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

/**
 * O `Endpoint` na saída do domínio: os dois `BigInt` coletados viram string.
 *
 * ISTO NÃO É DETALHE. O `presentEndpoint` devolvia `{ ...endpoint }` inteiro, e
 * a F7 pôs `ramTotalBytes` e `diskTotalBytes` na tabela: sem a conversão, os
 * dois iam crus para o `JSON.stringify` e a rota morria com *"Do not know how to
 * serialize a BigInt"* — na tela que o painel consulta a cada 5 segundos. O tipo
 * acima é o que faz o compilador cobrar a conversão de qualquer BigInt novo.
 */
export type PresentedEndpoint = Omit<Endpoint, 'ramTotalBytes' | 'diskTotalBytes'> & {
  ramTotalBytes: string | null;
  diskTotalBytes: string | null;
  telemetries: PresentedTelemetry[];
};

export function presentTelemetry(telemetry: Telemetry): PresentedTelemetry {
  return { ...telemetry, ramTotal: telemetry.ramTotal.toString(), ramUsed: telemetry.ramUsed.toString() };
}

export function presentEndpoint(endpoint: Endpoint & { telemetries: Telemetry[] }): PresentedEndpoint {
  return {
    ...endpoint,
    ramTotalBytes: endpoint.ramTotalBytes?.toString() ?? null,
    diskTotalBytes: endpoint.diskTotalBytes?.toString() ?? null,
    telemetries: endpoint.telemetries.map(presentTelemetry),
  };
}
