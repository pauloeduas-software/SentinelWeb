import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from './app-setting.helper';

// A CONFIGURAÇÃO DO CICLO DE VIDA — alertas, auditoria e o fuso (F8).
//
// Mesmo desenho do `discovery-settings.helper.ts`: leitura do singleton que já
// existe, com `upsert` para o caso do banco restaurado de backup antigo, e em
// `helpers/` porque ler colunas de uma linha fixa não é operação de negócio.
//
// MORA NO DOMÍNIO `settings` e não em `alert` porque três domínios a leem — o
// relatório (corte de auditoria), o job de alertas (limiares, hora, fuso) e a
// reconciliação (o fuso do turno, D123). Se ela morasse no domínio de alerta, o
// relatório importaria `alert` para descobrir de quanto em quanto tempo um ativo
// deve ser conferido, que é uma seta que o ARQUITETURA.md não desenha.

export interface ConfiguracaoDoCicloDeVida {
  alertsEnabled: boolean;
  alertEmails: string[];
  alertWebhookUrl: string | null;
  warrantyAlertDays: number;
  eolAlertDays: number;
  maintenanceOpenDays: number;
  auditIntervalMonths: number;
  auditWarningDays: number;
  alertHour: number;
  timezone: string;
}

const CAMPOS = {
  alertsEnabled: true,
  alertEmails: true,
  alertWebhookUrl: true,
  warrantyAlertDays: true,
  eolAlertDays: true,
  maintenanceOpenDays: true,
  auditIntervalMonths: true,
  auditWarningDays: true,
  alertHour: true,
  timezone: true,
} as const;

export async function lerConfiguracaoDoCicloDeVida(): Promise<ConfiguracaoDoCicloDeVida> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS,
  });
}

/**
 * Salva os campos que a tela de Configurações oferece.
 *
 * Todos opcionais porque a tela salva um de cada vez — mandar os dez para mudar
 * um seria pedir ao cliente que conhecesse os outros nove (mesma escolha do PUT
 * da configuração da descoberta, F7).
 */
export async function salvarConfiguracaoDoCicloDeVida(
  dados: Partial<ConfiguracaoDoCicloDeVida>,
): Promise<ConfiguracaoDoCicloDeVida> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: dados,
    create: { id: APP_SETTING_ID, ...dados },
    select: CAMPOS,
  });
}
