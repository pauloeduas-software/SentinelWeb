import type { DiscoveryMode } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { APP_SETTING_ID } from '../../settings/helpers/app-setting.helper';

// OS BOTÕES DA DESCOBERTA, lidos do singleton que já existe.
//
// Não é helper puro — ele consulta —, e fica em `helpers/` pelo mesmo motivo do
// `app-setting.helper.ts`: é leitura de configuração, não operação de negócio.
// Um `use-cases/` para "ler três colunas de uma linha fixa" seria cerimônia.

export interface ConfiguracaoDaDescoberta {
  discoveryMode: DiscoveryMode;
  ghostDays: number;
  shadowHours: number;
}

const CAMPOS = {
  discoveryMode: true,
  ghostDays: true,
  shadowHours: true,
} as const;

/**
 * A configuração, com a linha criada se ainda não existir.
 *
 * O `upsert` está aqui pelo mesmo motivo do `ensureAppSettings` da etiqueta
 * automática: o seed cria a linha, mas um banco restaurado de backup antigo não
 * teria — e o job de reconciliação falharia num 404 sobre uma tabela que o
 * usuário nem sabe que existe.
 */
export async function lerConfiguracaoDaDescoberta(): Promise<ConfiguracaoDaDescoberta> {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS,
  });
}
