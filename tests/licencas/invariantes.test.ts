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
  personId?: string | null;
  assetId?: string | null;
  checkoutAt?: string;
  checkinAt?: string | null;
  productKey?: string | null;
}

/** Um INSERT cru. Devolve o erro do banco, ou `null` se passou. */
async function inserir(linha: Linha): Promise<string | null> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO license_checkouts
         (id, "licenseId", "assignedPersonId", "assignedAssetId",
          "checkoutAt", "checkinAt", "productKey", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid,
               $4::timestamp, $5::timestamp, $6, now(), now())`,
      linha.licenseId === undefined ? licenseId : linha.licenseId,
      linha.personId ?? null,
      linha.assetId ?? null,
      linha.checkoutAt ?? '2026-01-10T10:00:00',
      linha.checkinAt ?? null,
      linha.productKey ?? null,
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

  it('toda entrega tem licença — aberta ou devolvida', async () => {
    // 23502 é o NOT NULL: o Prisma não repete o nome da coluna na mensagem.
    expect(await inserir({ licenseId: null, personId: cenario.laura })).toMatch(/23502/);
    expect(await inserir({ licenseId: null, personId: cenario.laura, checkinAt: '2026-01-11T10:00:00' }))
      .toMatch(/23502/);
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

describe('a mesma chave não fica em duas entregas abertas da licença', () => {
  it('a segunda aberta com a mesma chave colide; a devolvida e a sem chave não contam', async () => {
    // Licença própria: nas outras, a Ana e o ativo já têm entrega aberta.
    const outra = (await criarLicenca(api, { name: 'Licença das chaves', categoryId: cenario.categoriaLicencaId, seatsTotal: 10 })).id;
    const chave = 'CHAVE-RED-01';
    expect(await inserir({ licenseId: outra, personId: cenario.laura, productKey: chave, checkinAt: '2026-01-11T10:00:00' })).toBeNull();
    expect(await inserir({ licenseId: outra, personId: cenario.laura, productKey: chave })).toBeNull();
    expect(await inserir({ licenseId: outra, personId: cenario.ana, productKey: chave }))
      .toMatch(/23505[\s\S]*"licenseId", \\?"productKey/);
    // Duas abertas SEM chave na mesma licença: o NULL não colide.
    expect(await inserir({ licenseId: outra, personId: cenario.ana })).toBeNull();
    expect(await inserir({ licenseId: outra, assetId: cenario.ativo.id })).toBeNull();
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
