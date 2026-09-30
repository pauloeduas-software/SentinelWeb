import type { DiscoveryMode } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from '../../settings/helpers/app-setting.helper';

// OS BOTÕES DA DESCOBERTA, lidos do singleton que já existe.
//
// Não é helper puro — ele consulta —, e fica em `helpers/` pelo mesmo motivo do
// `app-setting.helper.ts`: é leitura de configuração, não operação de negócio.
// Um `use-cases/` para "ler cinco colunas de uma linha fixa" seria cerimônia.

export interface ConfiguracaoDaDescoberta {
  discoveryMode: DiscoveryMode;
  ghostDays: number;
  shadowHours: number;
  userDailyRetentionDays: number;
  ignoredUserKeys: string[];
  /**
   * O FUSO, que nasceu na F8 (D123) e é lido aqui de propósito.
   *
   * O turno da ocupação é inferido da hora LOCAL em que a pessoa aparece
   * (`shift.helper.ts`), e até a F8 esse fuso era uma constante embutida —
   * `FUSO_PADRAO`. Com `AppSetting.timezone` existindo, manter a constante como
   * fonte da verdade seria fabricar a segunda resposta para a mesma pergunta.
   *
   * Ele viaja NESTA configuração, e não numa leitura própria, porque o job de
   * reconciliação lê isto UMA vez por rodada e passa para cada endpoint: uma
   * consulta a mais por máquina para descobrir o fuso da empresa seriam 500
   * consultas por hora para uma resposta que não muda.
   */
  timezone: string;
}

const CAMPOS = {
  discoveryMode: true,
  ghostDays: true,
  shadowHours: true,
  userDailyRetentionDays: true,
  ignoredUserKeys: true,
  timezone: true,
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

/**
 * A allowlist, em minúsculas e como `Set`.
 *
 * Minúsculas porque `userKey` já é normalizada e quem digita na configuração
 * não sabe disso: "Administrador" na tela tem que casar com `administrador` no
 * dado, senão a allowlist não faz nada e ninguém descobre por quê.
 */
export function chavesIgnoradas(configuracao: ConfiguracaoDaDescoberta): Set<string> {
  return new Set(configuracao.ignoredUserKeys.map((chave) => chave.trim().toLowerCase()).filter(Boolean));
}
