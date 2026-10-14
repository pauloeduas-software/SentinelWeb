import { prisma } from '../../server/core/database/prismaClient';
import { APP_SETTING_ID } from '../../server/domain/settings/helpers/app-setting.helper';
import type { Seeder } from './seeder';

// A linha de configuração global. Precisa existir antes do primeiro ativo:
// é dela que sai o contador da etiqueta automática.
export const configuracaoSeeder: Seeder = {
  name: 'AppSetting',
  run: async () => {
    await prisma.appSetting.upsert({
      where: { id: APP_SETTING_ID },
      update: {},
      create: { id: APP_SETTING_ID },
    });
  },
};
