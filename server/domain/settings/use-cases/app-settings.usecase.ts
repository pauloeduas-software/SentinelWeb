import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
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
