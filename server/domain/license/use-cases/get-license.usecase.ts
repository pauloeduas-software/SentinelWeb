import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { contarAssentosDe, type ClienteLicenca, type ClienteQueTrava } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';

/**
 * UMA licença, com a contagem de assentos e a MÁSCARA da chave.
 *
 * `findFirst` e nunca `findUnique`: o escopo da lixeira não alcança o
 * `findUnique` (`core/database/soft-delete.extension.ts`), e a tela de detalhe
 * de uma licença apagada abriria como se ela estivesse ativa.
 *
 * `comMascara: true` — é AQUI que a chave é decifrada, e só aqui na leitura.
 * Uma linha, um decifra. A falha não derruba a tela: a máscara vira `null` e o
 * log registra (ver `paraResposta`).
 */
export async function getLicense(
  id: string,
  client: ClienteLicenca & ClienteQueTrava = prisma,
  /**
   * A sessão pode ver a chave? (F11, D77)
   *
   * A MÁSCARA TAMBÉM É A CHAVE, em pedaço menor. `XXXXX-XXXXX-XXXXX-AB3DF`
   * revela os últimos caracteres — suficiente para conferir qual licença é, que
   * é para isso que ela existe, e por isso mesmo não é dado público: é um
   * fragmento do segredo.
   *
   * Então `licenses.viewKey` governa as DUAS: a revelação completa (rota
   * própria, com log) e a máscara. Sem a chave, `productKeyMask` vem `null` e a
   * tela mostra só `hasProductKey` — "esta licença tem chave guardada", que é
   * fato de cadastro e não segredo.
   *
   * O padrão é `false`: quem chamar sem pensar recebe o menos revelador. A
   * alternativa (`= true`) deixaria todo chamador novo vazando por omissão.
   */
  podeVerChave = false,
): Promise<LicencaNaResposta> {
  const licenca = await client.license.findFirst({
    where: { id },
    select: LICENSE_SELECT,
  }) as LinhaDeLicenca | null;

  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  return paraResposta(licenca, await contarAssentosDe(client, id), { comMascara: podeVerChave });
}
