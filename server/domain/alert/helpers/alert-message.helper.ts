import { $Enums } from '@prisma/client';

// O TEXTO DO AVISO — função pura, e ele sai do `payload`, nunca do banco.
//
// O `payload` é congelado no momento do disparo de propósito (ver o schema): o
// e-mail que saiu falava daquilo. Remontar a frase amanhã, relendo o ativo,
// diria outra coisa — "vence em 30 dias" viraria "vence em 29" num aviso que já
// foi lido, e o reenvio de uma linha com `notifiedAt` nulo contradiria o primeiro.

export interface PayloadDoAlerta {
  assetTag?: string;
  assetName?: string | null;
  modelName?: string;
  dias?: number;
  title?: string;
  maintenanceId?: string;
  lastAuditAt?: string | null;
}

const ROTULO: Record<$Enums.AlertType, string> = {
  GARANTIA_VENCENDO: 'Garantia vencendo',
  EOL_PROXIMO: 'Fim de vida próximo',
  AUDITORIA_VENCIDA: 'Auditoria vencida',
  MANUTENCAO_EM_ABERTO: 'Manutenção em aberto',
};

export function rotuloDoTipo(type: $Enums.AlertType): string {
  return ROTULO[type];
}

/** "ATV-00012 — Dell Latitude", ou só a etiqueta quando não há mais nada. */
function identificacao(payload: PayloadDoAlerta): string {
  const partes = [payload.assetTag, payload.assetName ?? payload.modelName].filter(Boolean);
  return partes.length > 0 ? partes.join(' — ') : 'Ativo sem etiqueta';
}

/**
 * Uma linha por alerta, com o NÚMERO na frente do prazo.
 *
 * "vence em 12 dias" é a informação que faz alguém agir; "prazo se aproximando"
 * é a que faz o e-mail ser arquivado sem ler. O plural é tratado porque "1 dias"
 * derruba a confiança no resto do texto.
 */
export function linhaDoAlerta(type: $Enums.AlertType, payload: PayloadDoAlerta): string {
  const quem = identificacao(payload);
  const dias = payload.dias ?? 0;
  const emDias = dias < 0
    ? `venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`
    : dias === 0
      ? 'vence hoje'
      : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

  switch (type) {
    case $Enums.AlertType.GARANTIA_VENCENDO:
      return `- ${quem}: garantia ${emDias}`;
    case $Enums.AlertType.EOL_PROXIMO:
      return `- ${quem}: fim de vida ${emDias}`;
    case $Enums.AlertType.AUDITORIA_VENCIDA:
      return payload.lastAuditAt
        ? `- ${quem}: conferência vencida (última em ${payload.lastAuditAt.slice(0, 10)})`
        : `- ${quem}: NUNCA foi conferido`;
    case $Enums.AlertType.MANUTENCAO_EM_ABERTO:
      return `- ${quem}: "${payload.title ?? 'manutenção'}" aberta há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
}
