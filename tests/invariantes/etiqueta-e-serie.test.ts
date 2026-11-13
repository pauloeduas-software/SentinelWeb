import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed, motivoDaBaixa } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// A ETIQUETA E A SÉRIE SÃO ÚNICAS ENTRE OS VIVOS, SEM DIFERENÇA DE MAIÚSCULA (CN).
//
// "ABC123" e "abc123" são a mesma máquina: o vínculo com o agente compara a série
// em minúsculas, e dois cadastros assim casariam com a mesma máquina. O baixado
// continua com a série, porque a baixa não o tira dos vivos; a lixeira libera as
// duas, e restaurar confere de novo. O banco recusa o mesmo par por baixo
// (`assets_assetTag_unique_undeleted` e `assets_serial_unique_undeleted`).

let api: ApiDeTeste;
let statusId = '';
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante da etiqueta e da série');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

const computador = (dados: { assetTag?: string; serial?: string }) => criarAtivo(api, { statusId, modelId, ...dados });
const cadastrar = (dados: { assetTag?: string; serial?: string }) =>
  api.post<{ error: string }>('/api/assets', { statusId, modelId, ...dados });

describe('o cadastro', () => {
  it('recusa a etiqueta repetida, também com outra caixa', async () => {
    await computador({ assetTag: 'CN-ETQ-01' });

    for (const assetTag of ['CN-ETQ-01', 'cn-etq-01']) {
      const { status, body } = await cadastrar({ assetTag });
      expect(status).toBe(409);
      expect(body.error).toBe('A etiqueta CN-ETQ-01 já está em uso por outro computador.');
    }
  });

  it('recusa a série repetida, também com outra caixa, e diz quem a tem', async () => {
    const dono = await computador({ serial: 'CN-SERIE-01' });

    for (const serial of ['CN-SERIE-01', 'cn-serie-01']) {
      const { status, body } = await cadastrar({ serial });
      expect(status).toBe(409);
      expect(body.error).toBe(`O número de série CN-SERIE-01 já está em uso por ${dono.assetTag}.`);
    }
  });

  it('o curinga não colide: "_" e "%" são o texto ao pé da letra', async () => {
    await computador({ serial: 'CN_CUR%01' });
    expect((await cadastrar({ serial: 'CNXCURA01' })).status).toBe(201);
  });
});

describe('a edição', () => {
  it('recusa a série de outro com outra caixa, e aceita a própria com outra caixa', async () => {
    const dono = await computador({ serial: 'CN-EDICAO-01' });
    const outro = await computador({ serial: 'CN-EDICAO-02' });

    const recusa = await api.put<{ error: string }>(`/api/assets/${outro.id}`, { serial: 'cn-edicao-01' });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe(`O número de série CN-EDICAO-01 já está em uso por ${dono.assetTag}.`);

    expect((await api.put(`/api/assets/${dono.id}`, { serial: 'cn-edicao-01' })).status).toBe(200);
  });
});

describe('a baixa e a lixeira', () => {
  it('o baixado continua com a série', async () => {
    const vendido = await computador({ serial: 'CN-BAIXA-01' });
    expect((await api.post(`/api/assets/${vendido.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);

    const { status, body } = await cadastrar({ serial: 'cn-baixa-01' });
    expect(status).toBe(409);
    expect(body.error).toBe(`O número de série CN-BAIXA-01 já está em uso por ${vendido.assetTag}.`);
  });

  it('a lixeira libera a série, e restaurar confere de novo', async () => {
    const engano = await computador({ serial: 'CN-LIXEIRA-01' });
    expect((await api.delete(`/api/assets/${engano.id}`)).status).toBe(200);

    const certo = await computador({ serial: 'cn-lixeira-01' });

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${engano.id}/restore`);
    expect(status).toBe(409);
    expect(body.error).toBe(`O número de série cn-lixeira-01 já está em uso por ${certo.assetTag}.`);
  });
});

describe('o banco', () => {
  // O Postgres não diz o nome do índice na violação, e sim a expressão dele: é o
  // `lower()` que prova que a caixa não passa.
  it('quem escreve por fora da API leva o erro do índice, com outra caixa', async () => {
    await computador({ assetTag: 'CN-BANCO-01', serial: 'CN-BANCO-SERIE' });
    const outro = await computador({});

    await expect(prisma.$executeRaw`UPDATE assets SET "assetTag" = 'cn-banco-01' WHERE id = ${outro.id}::uuid`)
      .rejects.toThrow(/Key \(lower\("assetTag"\)\)=\(cn-banco-01\) already exists/);
    await expect(prisma.$executeRaw`UPDATE assets SET serial = 'cn-banco-serie' WHERE id = ${outro.id}::uuid`)
      .rejects.toThrow(/Key \(lower\(serial\)\)=\(cn-banco-serie\) already exists/);
  });
});
