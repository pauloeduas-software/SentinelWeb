import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// INVARIANTE 5 — os dois CHECKs da `assignments`.
//
// Este arquivo é o ÚNICO da suíte que escreve no banco por SQL cru, e a exceção
// é o assunto: um CHECK existe justamente para quem NÃO passa pela API. A
// validação de aplicação (`assertAlvoCoerente`) já é testada pela porta HTTP em
// `formularios/` e `invariantes/posse.test.ts`; aqui se prova a rede de baixo,
// a que pega o seed e o `psql` à mão.
//
// Testar isto por HTTP seria impossível por construção: o use-case recusa antes
// de chegar ao banco, então o teste passaria sem o CHECK existir.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** Um INSERT cru, com todas as colunas obrigatórias. Devolve o erro, se houver. */
async function inserirPosseCrua(colunas: {
  assetId: string;
  targetType: string;
  targetPersonId?: string | null;
  targetWorkstationId?: string | null;
  checkoutAt?: string;
  checkinAt?: string | null;
}): Promise<string | null> {
  const sql = `
    INSERT INTO assignments
      (id, "assetId", "targetType", "targetPersonId", "targetWorkstationId",
       "checkoutAt", "checkinAt", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), $1::uuid, $2::"AssignmentTarget", $3::uuid, $4::uuid,
       $5::timestamp, $6::timestamp, now(), now())
  `;

  try {
    await prisma.$executeRawUnsafe(
      sql,
      colunas.assetId,
      colunas.targetType,
      colunas.targetPersonId ?? null,
      colunas.targetWorkstationId ?? null,
      colunas.checkoutAt ?? '2026-01-01T10:00:00',
      colunas.checkinAt ?? null,
    );
    return null;
  } catch (erro) {
    return String((erro as Error).message);
  }
}

describe('CHECK 1 — o alvo polimórfico é coerente', () => {
  it('aceita a linha bem formada', async () => {
    const erro = await inserirPosseCrua({
      assetId: cenario.ativo.id,
      targetType: 'PERSON',
      targetPersonId: cenario.laura,
    });
    expect(erro).toBeNull();

    // Limpa para não disputar o índice único parcial com os testes seguintes.
    await prisma.$executeRawUnsafe(`DELETE FROM assignments WHERE "assetId" = $1::uuid`, cenario.ativo.id);
  });

  it('recusa `targetType` PERSON apontando para uma localização', async () => {
    // A linha que o Postgres aceitaria sem o CHECK — e que a Camada 3
    // resolveria como "sem responsável", em silêncio.
    const erro = await inserirPosseCrua({
      assetId: cenario.ativo.id,
      targetType: 'PERSON',
      targetWorkstationId: cenario.mesa1,
    });
    expect(erro).toMatch(/assignments_alvo_coerente/);
  });

  it('recusa DUAS FKs preenchidas ao mesmo tempo', async () => {
    const erro = await inserirPosseCrua({
      assetId: cenario.ativo.id,
      targetType: 'PERSON',
      targetPersonId: cenario.laura,
      targetWorkstationId: cenario.mesa1,
    });
    expect(erro).toMatch(/assignments_alvo_coerente/);
  });

  it('recusa posse SEM alvo nenhum', async () => {
    const erro = await inserirPosseCrua({ assetId: cenario.ativo.id, targetType: 'WORKSTATION' });
    expect(erro).toMatch(/assignments_alvo_coerente/);
  });
});

describe('CHECK 2 — a devolução não antecede a entrega', () => {
  it('recusa duração negativa', async () => {
    const erro = await inserirPosseCrua({
      assetId: cenario.ativo.id,
      targetType: 'PERSON',
      targetPersonId: cenario.laura,
      checkoutAt: '2026-03-10T10:00:00',
      checkinAt: '2026-03-01T10:00:00',
    });
    expect(erro).toMatch(/assignments_devolucao_nao_antecede_entrega/);
  });

  it('ACEITA entrega e devolução no mesmo instante', async () => {
    // É a devolução no mesmo dia da entrega — quem sai da empresa no dia em que
    // recebeu, caso real —, e é por isso que o CHECK é `>=` e não `>`.
    const instante = '2026-03-10T10:00:00';
    const erro = await inserirPosseCrua({
      assetId: cenario.ativo.id,
      targetType: 'PERSON',
      targetPersonId: cenario.laura,
      checkoutAt: instante,
      checkinAt: instante,
    });
    expect(erro).toBeNull();
  });
});

describe('as duas constraints existem no banco', () => {
  it('estão registradas como CHECK na tabela assignments', async () => {
    // A asserção que pega o caso em que alguém aplica o schema com `db push`:
    // as tabelas nascem certas e as constraints escritas à mão somem, porque
    // `db push` não passa pelas migrations (D6).
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c' AND conrelid = 'assignments'::regclass
    `;

    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'assignments_alvo_coerente',
      'assignments_devolucao_nao_antecede_entrega',
    ]);
  });
});
