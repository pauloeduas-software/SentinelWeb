import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from './app-setting.helper';

// OS LIMIARES DE PRAZO E O FUSO — o que sobrou da configuração do ciclo de vida.
//
// ERAM DEZ CAMPOS (F8): alertas ligados, destinatários, webhook, hora da janela,
// intervalo e aviso de auditoria, dias de manutenção aberta, mais estes três.
// Os sete primeiros saíram com os alertas (D151), a conferência (D157) e a
// manutenção (D158) — e as colunas foram junto, porque configuração que não
// configura nada é um campo na tela que mente.
//
// MORA NO DOMÍNIO `settings` e não em `report` porque DOIS domínios a leem: o
// relatório de prazos (os limiares) e o job de lembrete de atraso (o fuso). Se
// morasse no relatório, o job de posse importaria `report` para descobrir em que
// fuso é meia-noite, que é uma seta que o docs/referencia/arquitetura.md não
// desenha.
//
// SÓ LEITURA: a gravação (`salvarConfiguracaoDoCicloDeVida`) saiu com a rota
// `PUT /api/settings/alerts`, que era a única que a chamava. Os três campos que
// restaram mudam no banco ou no seed — nenhuma tela os edita hoje.

export interface ConfiguracaoDoCicloDeVida {
  warrantyAlertDays: number;
  eolAlertDays: number;
  timezone: string;
}

const CAMPOS = {
  warrantyAlertDays: true,
  eolAlertDays: true,
  timezone: true,
} as const;

/**
 * Lê os três do singleton.
 *
 * `upsert` e não `findUnique` pelo mesmo motivo do resto desta pasta: um banco
 * restaurado de backup antigo pode não ter a linha, e o padrão do schema é a
 * resposta certa — melhor do que estourar numa leitura de configuração.
 */
export async function lerConfiguracaoDoCicloDeVida(): Promise<ConfiguracaoDoCicloDeVida> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS,
  });
}
