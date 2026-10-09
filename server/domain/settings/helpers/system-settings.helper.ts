import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from './app-setting.helper';

// A CONFIGURAÇÃO DE SISTEMA — marca, formato e backup (F10, D65).
//
// Mesmo desenho do `lifecycle-settings.helper.ts` e do
// `discovery-settings.helper.ts`: leitura do singleton que já existe, `upsert`
// para o caso do banco restaurado de backup antigo, e em `helpers/` porque ler
// colunas de uma linha fixa não é operação de negócio.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE É O TERCEIRO RECORTE, E NÃO UMA ROTA QUE DEVOLVE O SINGLETON INTEIRO.
//
// A tabela tem hoje 26 colunas, e três telas diferentes escrevem nela: os
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
  companyName: string;
  logoPath: string | null;
  faviconPath: string | null;
  primaryColor: string;
  locale: string;
  dateFormat: string;
  currency: string;
  csvDelimiter: string;
}

const CAMPOS = {
  companyName: true,
  logoPath: true,
  faviconPath: true,
  primaryColor: true,
  locale: true,
  dateFormat: true,
  currency: true,
  csvDelimiter: true,
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
 * `logoPath` e `faviconPath` NÃO entram aqui, e isso é a regra: o caminho de um
 * arquivo é escrito por quem gravou o arquivo (`set-branding.usecase.ts`),
 * nunca por um `PUT` de JSON. Aceitá-los no corpo deixaria qualquer cliente
 * apontar a logo para um caminho arbitrário dentro do `UPLOAD_DIR` — e a rota
 * que serve a imagem leria esse caminho.
 *
 * Todos os outros são opcionais porque a tela salva um de cada vez — mandar os
 * sete para mudar um seria pedir ao cliente que conhecesse os outros seis
 * (mesma escolha do PUT da descoberta e do dos alertas).
 */
export async function salvarConfiguracaoDoSistema(
  dados: Partial<Omit<ConfiguracaoDoSistema, 'logoPath' | 'faviconPath'>>,
): Promise<ConfiguracaoDoSistema> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: dados,
    create: { id: APP_SETTING_ID, ...dados },
    select: CAMPOS,
  });
}
