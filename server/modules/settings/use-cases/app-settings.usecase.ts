import type { DiscoveryMode } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { APP_SETTING_ID, formatAssetTag } from '../helpers/app-setting.helper';

type ClienteComEtiqueta = Pick<typeof prisma, 'appSetting' | 'asset'>;

const CAMPOS_ETIQUETA = { assetTagPrefix: true, assetTagZerofill: true, assetTagNext: true } as const;

/**
 * Quantas etiquetas ocupadas o gerador pula antes de desistir.
 *
 * Existe porque a etiqueta pode ter sido digitada À MÃO: nada impede cadastrar
 * `ATV-00007` antes de o contador chegar em 7. Sem o pulo, a colisão viraria um
 * beco sem saída permanente — o erro desfaz a transação, o contador volta ao
 * mesmo número e a próxima tentativa colide de novo, para sempre. Verificado.
 */
const MAX_PULOS = 100;

/**
 * Garante que a linha de configuração exista.
 *
 * O seed já a cria, mas um banco restaurado de backup antigo ou criado à mão não
 * teria. Sem isto, o primeiro cadastro de ativo falharia com um 404 apontando
 * para uma tabela que o usuário nem sabe que existe.
 */
async function ensureAppSettings(client: ClienteComEtiqueta) {
  return client.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS_ETIQUETA,
  });
}

const estaLivre = async (client: ClienteComEtiqueta, assetTag: string) =>
  (await client.asset.findFirst({ where: { assetTag }, select: { id: true } })) === null;

/**
 * Consome a próxima etiqueta livre. **Incrementa primeiro e usa o valor devolvido.**
 *
 * Ler o contador e depois gravar `valor + 1` colide em READ COMMITTED: dois
 * cadastros simultâneos leem o mesmo número e geram a mesma etiqueta — que o
 * índice único então recusa, derrubando um dos dois. O `increment` do Prisma
 * vira `UPDATE ... SET x = x + 1 RETURNING`, atômico no banco.
 *
 * Recebe o cliente por parâmetro para rodar DENTRO da transação que cria o
 * ativo: se a criação falhar, o contador volta atrás junto e a sequência não
 * ganha buraco.
 */
export async function nextAssetTag(client: ClienteComEtiqueta): Promise<string> {
  await ensureAppSettings(client);

  for (let pulos = 0; pulos < MAX_PULOS; pulos++) {
    const config = await client.appSetting.update({
      where: { id: APP_SETTING_ID },
      data: { assetTagNext: { increment: 1 } },
      select: CAMPOS_ETIQUETA,
    });

    // `update` devolve o estado DEPOIS do incremento; a etiqueta desta volta é
    // o valor anterior.
    const etiqueta = formatAssetTag(config.assetTagPrefix, config.assetTagZerofill, config.assetTagNext - 1);
    if (await estaLivre(client, etiqueta)) return etiqueta;
  }

  throw new AppError(
    `As próximas ${MAX_PULOS} etiquetas automáticas já estão em uso. ` +
      'Ajuste o prefixo ou o contador nas configurações, ou informe a etiqueta manualmente.',
    409,
  );
}

/**
 * Espia a próxima etiqueta sem consumir.
 *
 * É o que o formulário mostra ao abrir. Se isto incrementasse, abrir e cancelar
 * o modal furaria a sequência — e sequência com buraco é exatamente o que a
 * etiqueta automática existe para evitar.
 *
 * Pula as ocupadas pelo mesmo motivo que o `nextAssetTag`, para o formulário não
 * anunciar uma etiqueta que o salvamento não vai usar.
 */
export async function peekNextAssetTag(): Promise<{ assetTag: string }> {
  const config = await ensureAppSettings(prisma);

  for (let pulos = 0; pulos < MAX_PULOS; pulos++) {
    const etiqueta = formatAssetTag(config.assetTagPrefix, config.assetTagZerofill, config.assetTagNext + pulos);
    if (await estaLivre(prisma, etiqueta)) return { assetTag: etiqueta };
  }

  // Sem etiqueta livre à vista, o formulário abre com o campo vazio e o usuário
  // digita — em vez de mostrar um número que o salvamento recusaria.
  return { assetTag: '' };
}

// ── A CONFIGURAÇÃO DA DESCOBERTA (F7) ───────────────────────────────────────

/**
 * Salva os botões da convergência RMM × ITAM.
 *
 * `discoveryMode` é o mais perigoso dos três e por isso vale reler o D51 antes
 * de mexer: em `ON`, a varredura VINCULA sozinha a máquina ao ativo quando há um
 * único candidato de 100 pontos (`match-endpoint.usecase.ts`), sem ninguém
 * conferir. Não cria ativo nem consome etiqueta — máquina sem candidato segue
 * sem cadastro —, mas um vínculo errado põe o último contato e o uso da máquina
 * no ativo errado até alguém desvincular.
 *
 * A validação dos limites é do schema, não daqui: `ghostDays: 0` transformaria
 * a frota inteira em fantasma no dia seguinte, e `shadowHours: 0` faria toda
 * máquina nova nascer como Shadow IT antes do primeiro handshake terminar.
 */
const CAMPOS_DA_DESCOBERTA = ['discoveryMode', 'ghostDays', 'shadowHours'] as const;
const SELECT_DA_DESCOBERTA = { discoveryMode: true, ghostDays: true, shadowHours: true } as const;

export async function salvarConfiguracaoDaDescoberta(
  dados: {
    discoveryMode?: DiscoveryMode;
    ghostDays?: number;
    shadowHours?: number;
  },
  ator: Ator,
) {
  return prisma.$transaction(async (tx) => {
    // A linha existe ANTES do "de": no banco sem ela, o "de" são os padrões que
    // a tela mostrava, e não nulo — senão a auditoria punha na conta os dois
    // campos que ela nem mandou.
    await ensureAppSettings(tx);

    // A linha travada antes de ler o "de": dois salvamentos ao mesmo tempo
    // leriam o mesmo modo, e a auditoria diria "de SUGGEST" nas duas trocas.
    await tx.$queryRaw`SELECT id FROM app_settings WHERE id = ${APP_SETTING_ID} FOR NO KEY UPDATE`;
    const antes = await tx.appSetting.findUniqueOrThrow({ where: { id: APP_SETTING_ID }, select: SELECT_DA_DESCOBERTA });

    const depois = await tx.appSetting.update({
      where: { id: APP_SETTING_ID },
      data: dados,
      select: SELECT_DA_DESCOBERTA,
    });

    // A linha é única e sem uuid: o registro é a própria configuração (AB).
    // Ligar o vínculo automático é a mudança que mais importa saber quem fez.
    const changes = buildChanges(antes, depois, CAMPOS_DA_DESCOBERTA);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        entityType: 'AppSetting', entityId: null, entityLabel: 'Configuração da descoberta', action: 'UPDATE', changes,
      }, ator);
    }

    return depois;
  });
}
