import { randomUUID } from 'node:crypto';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { cifrar } from '../../../core/crypto/cipher';
import { temChaveAtiva } from '../../../core/crypto/keyring';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { LICENSE_AUDITED } from '../helpers/license-audited.helper';
import {
  aadDaChave, LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { CreateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { reconciliarAssentos } from './reconcile-seats.usecase';

/**
 * O CADASTRO DE UMA LICENÇA — o contrato e os assentos, numa transação.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O `id` É GERADO AQUI, E NÃO PELO PRISMA. Esta é a linha que o D91 custa.
 *
 * O AAD da cifra é `"licenses:productKey:<id>"` — é ele que impede alguém com
 * acesso ao banco de copiar a chave cifrada de uma licença para outra e o
 * sistema revelá-la como legítima. Para amarrar o valor ao id, o id precisa
 * existir ANTES do INSERT; o `@default(uuid())` só o devolveria depois.
 *
 * É por isso que `License.id` não tem default no schema: devolvê-lo ao Prisma
 * reabriria o buraco EM SILÊNCIO — a criação continuaria funcionando e só o AAD
 * ficaria errado, o que ninguém nota até alguém tentar mover uma chave.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function createLicense(
  data: CreateLicenseData,
  actorId: string | null,
): Promise<LicencaNaResposta> {
  const { productKey, ...campos } = data;
  const id = randomUUID();

  // FORA da transação: é checagem de CONFIGURAÇÃO do servidor, não leitura do
  // banco, e abrir transação para recusar por falta de variável de ambiente é
  // segurar conexão à toa.
  const cifrada = cifrarChaveOuRecusar(productKey, id);

  const criada = await prisma.$transaction(async (tx) => {
    await assertReferenciasDaLicenca(tx, campos);

    const licenca = await tx.license.create({
      data: {
        ...campos,
        id,
        productKey: cifrada,
        createdById: actorId,
        updatedById: actorId,
      },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    // OS ASSENTOS NASCEM JUNTO, na mesma transação. Uma licença de 50 assentos
    // com zero linhas em `license_seats` passaria a invariante 11 a mentir no
    // primeiro instante de vida dela.
    await reconciliarAssentos(tx, id, data.seatsTotal);

    await recordActivity(tx, {
      entityType: 'License',
      entityId: id,
      action: 'CREATE',
      // `LICENSE_AUDITED` NÃO CONTÉM `productKey` (D42) — o retrato publicaria
      // o segredo em claro numa tabela que ninguém pensa em proteger. O que
      // entra é `hasProductKey`, abaixo.
      changes: { ...buildSnapshot(licenca, LICENSE_AUDITED), hasProductKey: cifrada !== null },
    }, actorId);

    return licenca;
  });

  // Licença recém-criada: todos os assentos livres, nenhum ocupado. A conta sai
  // do mesmo caminho da listagem para a resposta ter exatamente a forma que a
  // listagem tem — uma tela que recebe `livres` em GET e não em POST é uma tela
  // com dois caminhos de renderização.
  return paraResposta(criada, {
    ocupados: 0, queimados: 0, aposentados: 0, livres: data.seatsTotal,
  }, { comMascara: true });
}

/**
 * Cifra, ou recusa com 422 — NUNCA grava em claro (D42).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO EXISTE PLANO B.
 *
 * "Se a chave de criptografia não estiver configurada, grava em claro" é o
 * `/agent-hub` aberto que a F0 fechou: o sistema funciona, ninguém percebe, e o
 * segredo está no banco — em texto puro, num dump, num backup, numa tela de
 * suporte.
 *
 * Sem `APP_ENCRYPTION_KEY`, o CAMPO é recusado e a licença é criada sem chave.
 * A operação não é bloqueada, só a parte dela que não pode ser feita com
 * segurança. Em produção o boot já parou antes (`core/config/env.ts`), então
 * este 422 só acontece em desenvolvimento — que é exatamente onde ele ensina.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Devolve `undefined` quando o campo não veio (não mexe), `null` quando veio
 * vazio (apaga), e o pacote cifrado quando veio preenchido.
 */
export function cifrarChaveOuRecusar(
  productKey: string | null | undefined,
  licenseId: string,
): string | null | undefined {
  if (productKey === undefined) return undefined;
  if (productKey === null) return null;

  if (!temChaveAtiva()) {
    throw new AppError(
      'Chave de criptografia não configurada (APP_ENCRYPTION_KEY): a chave de produto não pode '
      + 'ser gravada. Configure a variável ou salve a licença sem a chave.',
      422,
      { campo: 'productKey' },
    );
  }

  return cifrar(productKey, aadDaChave(licenseId));
}
