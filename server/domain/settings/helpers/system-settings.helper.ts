import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from './app-setting.helper';

// A CONFIGURAÇÃO DE SISTEMA — marca e formato (F10, D65).
//
// Mesmo desenho do `lifecycle-settings.helper.ts` e do
// `discovery-settings.helper.ts`: leitura do singleton que já existe, `upsert`
// para o caso do banco restaurado de backup antigo, e em `helpers/` porque ler
// colunas de uma linha fixa não é operação de negócio.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE É O TERCEIRO RECORTE, E NÃO UMA ROTA QUE DEVOLVE O SINGLETON INTEIRO.
//
// A tabela tem hoje 25 colunas, e três telas diferentes escrevem nela: os
// botões da descoberta (F7), os limiares de alerta (F8) e esta. Uma rota
// `GET /api/settings` que devolvesse tudo levaria para o navegador o
// `cryptoCanary` — texto conhecido cifrado, que é material para quem quiser
// atacar a chave offline — e o `assetTagNext`, que NÃO é configuração: ele é um
// contador consumido dentro da transação que cria o ativo, e quem o lê pela
// tela usa `/api/settings/next-asset-tag`, que espia sem consumir.
//
// Recorte por tela é também o que mantém o `PUT` honesto: o corpo tem só o que
// aquela tela mostra, então `strictObject` recusa o resto em vez de aceitar uma
// escrita que a tela não pode nem explicar.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfiguracaoDoSistema {
  locale: string;
  dateFormat: string;
  currency: string;
}

const CAMPOS = {
  locale: true,
  dateFormat: true,
  currency: true,
} as const;

export async function lerConfiguracaoDoSistema(): Promise<ConfiguracaoDoSistema> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS,
  });
}

/**
 * Salva o que a aba *Sistema* oferece.
 *
 * Todos os campos são opcionais porque a tela salva um de cada vez — mandar
 * todos para mudar um seria pedir ao cliente que conhecesse o resto (mesma
 * escolha do PUT da descoberta).
 */
export async function salvarConfiguracaoDoSistema(
  dados: Partial<ConfiguracaoDoSistema>,
): Promise<ConfiguracaoDoSistema> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: dados,
    create: { id: APP_SETTING_ID, ...dados },
    select: CAMPOS,
  });
}
