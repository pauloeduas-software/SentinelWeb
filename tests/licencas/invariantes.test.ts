import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS REDES DO BANCO na licença e na tabela de entregas — por SQL cru, como o
// `invariantes/check-assignment.test.ts` faz para a posse.
//
// Testar isto por HTTP seria impossível por construção: o use-case recusa
// antes de chegar ao banco, e o teste passaria sem o CHECK existir. Aqui se
// prova a rede de baixo, a que pega o `psql` à mão.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let licenseId: string;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
  licenseId = (await criarLicenca(api, { name: 'Licença das redes', categoryId: cenario.categoriaLicencaId, seatsTotal: 50 })).id;
});

afterAll(async () => {
  await api.fechar();
});

interface Linha {
  licenseId?: string | null;
  licenseName?: string | null;
  personId?: string | null;
  assetId?: string | null;
  checkoutAt?: string;
  checkinAt?: string | null;
  licenseKeyId?: string | null;
}

/** Um INSERT cru. Devolve o erro do banco, ou `null` se passou. */
async function inserir(linha: Linha): Promise<string | null> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO license_checkouts
         (id, "licenseId", "assignedPersonId", "assignedAssetId",
          "checkoutAt", "checkinAt", "licenseKeyId", "licenseName", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid,
               $4::timestamp, $5::timestamp, $6::uuid, $7, now(), now())`,
      linha.licenseId === undefined ? licenseId : linha.licenseId,
      linha.personId ?? null,
      linha.assetId ?? null,
      linha.checkoutAt ?? '2026-01-10T10:00:00',
      linha.checkinAt ?? null,
      linha.licenseKeyId ?? null,
      linha.licenseName ?? null,
    );
    return null;
  } catch (erro) {
    return (erro as Error).message;
  }
}

describe('a forma da entrega', () => {
  it('o alvo é UM: nem os dois, nem nenhum', async () => {
    expect(await inserir({ personId: cenario.laura, assetId: cenario.ativo.id })).toMatch(/license_checkouts_alvo_xor/);
    expect(await inserir({})).toMatch(/license_checkouts_alvo_xor/);
  });

  it('a devolução não antecede a entrega', async () => {
    expect(await inserir({ personId: cenario.laura, checkoutAt: '2026-01-10T10:00:00', checkinAt: '2026-01-09T10:00:00' }))
      .toMatch(/license_checkouts_devolucao_nao_antecede/);
  });

  it('a entrega em uso tem licença; sem ela, só a devolvida, com o nome e sem a chave (AG)', async () => {
    expect(await inserir({ licenseId: null, personId: cenario.laura, licenseName: 'Office' }))
      .toMatch(/license_checkouts_licenca_presente/);
    expect(await inserir({ licenseId: null, personId: cenario.laura, checkinAt: '2026-01-11T10:00:00' }))
      .toMatch(/license_checkouts_licenca_presente/);
    // Com a licença nula a FK composta não confere a chave — o CHECK recusa a chave solta.
    const [chaveSolta] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO license_keys (id, "licenseId", "productKey", seats, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, 'CHAVE-SOLTA', 1, now(), now()) RETURNING id`,
      licenseId,
    );
    expect(await inserir({
      licenseId: null, personId: cenario.laura, checkinAt: '2026-01-11T10:00:00', licenseName: 'Office', licenseKeyId: chaveSolta.id,
    })).toMatch(/license_checkouts_licenca_presente/);
    // A devolvida da licença excluída, com o nome por escrito, entra.
    expect(await inserir({ licenseId: null, personId: cenario.laura, checkinAt: '2026-01-11T10:00:00', licenseName: 'Office' }))
      .toBeNull();
  });
});

describe('invariante 23: uma entrega aberta por alvo e licença', () => {
  it('a segunda aberta do mesmo colaborador colide; a devolvida não conta', async () => {
    expect(await inserir({ personId: cenario.ana, checkinAt: '2026-01-11T10:00:00' })).toBeNull();
    expect(await inserir({ personId: cenario.ana })).toBeNull();
    // A violação de unicidade (23505) cita as colunas, não o nome do índice.
    expect(await inserir({ personId: cenario.ana })).toMatch(/23505[\s\S]*"licenseId", \\?"assignedPersonId/);
  });

  it('o mesmo vale para o ativo', async () => {
    expect(await inserir({ assetId: cenario.ativo.id })).toBeNull();
    expect(await inserir({ assetId: cenario.ativo.id })).toMatch(/23505[\s\S]*"licenseId", \\?"assignedAssetId/);
  });
});

describe('invariante 24: a chave da entrega é da licença, e a forma da chave', () => {
  /** Um INSERT cru de chave. Devolve o id, ou o erro do banco. */
  async function chave(licenca: string, productKey: string, seats = 1): Promise<{ id?: string; erro?: string }> {
    try {
      const [linha] = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO license_keys (id, "licenseId", "productKey", seats, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1::uuid, $2, $3, now(), now()) RETURNING id`,
        licenca, productKey, seats,
      );
      return { id: linha.id };
    } catch (erro) {
      return { erro: (erro as Error).message };
    }
  }

  it('a entrega não aponta para a chave de outra licença', async () => {
    const outra = (await criarLicenca(api, { name: 'Licença da chave alheia', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 })).id;
    const daOutra = await chave(outra, 'CHAVE-ALHEIA');

    expect(await inserir({ personId: cenario.laura, licenseKeyId: daOutra.id })).toMatch(/23503/);
    expect(await inserir({ licenseId: outra, personId: cenario.laura, licenseKeyId: daOutra.id })).toBeNull();
    // A rede é a forma, não a conta: a segunda aberta na mesma chave de 1 passa
    // aqui — quem conta é a aplicação, com a licença travada.
    expect(await inserir({ licenseId: outra, personId: cenario.ana, licenseKeyId: daOutra.id })).toBeNull();
  });

  it('a chave cobre ao menos uma, não é vazia, e não repete na licença', async () => {
    expect((await chave(licenseId, 'ZERO', 0)).erro).toMatch(/license_keys_seats_positivo/);
    expect((await chave(licenseId, '   ')).erro).toMatch(/license_keys_chave_preenchida/);
    expect((await chave(licenseId, 'REPETIDA')).id).toBeDefined();
    expect((await chave(licenseId, 'REPETIDA')).erro).toMatch(/23505[\s\S]*"licenseId", \\?"productKey/);

    // A mesma chave em OUTRA licença passa: a unicidade é dentro do contrato.
    const outra = (await criarLicenca(api, { name: 'Licença da mesma chave', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 })).id;
    expect((await chave(outra, 'REPETIDA')).id).toBeDefined();
  });
});

describe('o contrato', () => {
  /** Um UPDATE cru na licença das redes. Devolve o erro do banco, ou `null` se passou. */
  async function gravar(sql: string): Promise<string | null> {
    try {
      await prisma.$executeRawUnsafe(`UPDATE licenses SET ${sql} WHERE id = $1::uuid`, licenseId);
      return null;
    } catch (erro) {
      return (erro as Error).message;
    } finally {
      await prisma.$executeRawUnsafe(
        `UPDATE licenses SET "seatsTotal" = 50, "purchaseDate" = NULL, "expirationDate" = NULL,
                             "terminationDate" = NULL WHERE id = $1::uuid`,
        licenseId,
      );
    }
  }

  it('ao menos uma licença comprada', async () => {
    expect(await gravar('"seatsTotal" = 0')).toMatch(/licenses_seats_positivo/);
  });

  it('o vencimento e o encerramento não antecedem a compra; o encerramento antes do vencimento passa', async () => {
    expect(await gravar(`"purchaseDate" = '2026-03-10', "expirationDate" = '2026-03-09'`))
      .toMatch(/licenses_vencimento_nao_antecede_compra/);
    expect(await gravar(`"purchaseDate" = '2026-03-10', "terminationDate" = '2026-03-09'`))
      .toMatch(/licenses_encerramento_nao_antecede_compra/);
    expect(await gravar(
      `"purchaseDate" = '2026-03-10', "expirationDate" = '2026-12-31', "terminationDate" = '2026-03-10'`,
    )).toBeNull();
    // Sem a compra, nada a comparar.
    expect(await gravar(`"expirationDate" = '2020-01-01', "terminationDate" = '2020-01-01'`)).toBeNull();
  });
});
