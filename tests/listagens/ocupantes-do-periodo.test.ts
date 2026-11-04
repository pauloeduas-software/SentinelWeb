import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarLocal, criarModelo, criarPosto, diaNoBrasil, idsDoSeed,
} from '../helpers/fixtures';

// QUEM OCUPOU O POSTO EM CADA ENTREGA (AW).
//
// "Quem respondia por este computador em março?" Snipe-IT e GLPI respondem pelo
// histórico do ativo, porque lá a entrega é a uma pessoa. Aqui ela é ao posto,
// e cada linha do histórico de posse traz as ocupações que se sobrepõem ao
// período dela — por dia, e dividir o dia conta. O posto excluído cruza pelo
// id que a exclusão guardou, nunca pelo nome.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante do Período');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

interface LinhaDaPosse {
  checkinAt: string | null;
  targetWorkstationId: string | null;
  targetWorkstationFormerId: string | null;
  ocupantesDoPeriodo: { person: { name: string } }[];
}

const pessoa = (nome: string) =>
  criarColaborador(api, { name: nome, email: `${nome.toLowerCase().replace(/[^a-z]+/g, '.')}@teste.local` });

/** Uma ocupação de `de` a `ate` dias atrás; sem `ate`, aberta. */
async function ocupar(posto: string, personId: string, de: number, ate?: number) {
  const criada = await api.post<{ id: string }>(`/api/workstations/${posto}/occupants`, {
    personId, startedAt: diaNoBrasil(-de),
  });
  expect(criada.status, JSON.stringify(criada.body)).toBe(201);
  if (ate !== undefined) {
    const fim = await api.delete(`/api/workstations/${posto}/occupants/${criada.body.id}`, { endedAt: diaNoBrasil(-ate) });
    expect(fim.status, JSON.stringify(fim.body)).toBe(200);
  }
}

async function entregar(assetId: string, posto: string, de: number) {
  const r = await api.post(`/api/assets/${assetId}/checkout`, {
    targetType: 'WORKSTATION', targetWorkstationId: posto, checkoutAt: diaNoBrasil(-de),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
}

async function devolver(assetId: string, ate: number) {
  const r = await api.post(`/api/assets/${assetId}/checkin`, { checkinAt: diaNoBrasil(-ate) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

async function historico(assetId: string) {
  const { status, body } = await api.get<LinhaDaPosse[]>(`/api/assets/${assetId}/assignments`);
  expect(status).toBe(200);
  return body;
}

const nomes = (linha: LinhaDaPosse | undefined) => linha?.ocupantesDoPeriodo.map((o) => o.person.name).sort();

describe('o histórico de posse traz quem ocupou o posto no período', () => {
  it('entra quem se sobrepõe, inclusive na borda do dia; fica de fora quem saiu antes ou entrou depois', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do Período' });
    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Desktop do período' });
    const [antes, borda, dentro, fim, depois] = await Promise.all([
      pessoa('Antes Período'), pessoa('Borda Período'), pessoa('Dentro Período'), pessoa('Fim Período'), pessoa('Depois Período'),
    ]);

    await ocupar(mesa, antes, 100, 80);
    await ocupar(mesa, borda, 70, 60); // sai no dia em que o computador chega
    await ocupar(mesa, dentro, 50, 40);
    await ocupar(mesa, fim, 30); // entra no dia em que ele volta, e fica
    await ocupar(mesa, depois, 20);

    await entregar(ativo.id, mesa, 60);
    await devolver(ativo.id, 30);

    const [linha] = await historico(ativo.id);
    expect(nomes(linha)).toEqual(['Borda Período', 'Dentro Período', 'Fim Período']);
  });

  // HOJE grava a hora real, e o dia passado o meio-dia: sem a comparação POR
  // DIA, quem saiu do posto de manhã não estaria lá quando o computador chegou
  // à tarde. Aqui a saída e a entrega são hoje, nessa ordem, sem data no corpo.
  it('quem sai hoje antes de o computador chegar hoje divide o dia, e entra', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa de Hoje do Período' });
    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Desktop de hoje' });
    const saiuHoje = await pessoa('Saiu Hoje');

    const ocupacao = await api.post<{ id: string }>(`/api/workstations/${mesa}/occupants`, {
      personId: saiuHoje, startedAt: diaNoBrasil(-5),
    });
    expect(ocupacao.status).toBe(201);
    const fim = await api.delete<{ endedAt: string }>(`/api/workstations/${mesa}/occupants/${ocupacao.body.id}`);
    expect(fim.status).toBe(200);

    const entrega = await api.post<{ assignment: { checkoutAt: string } }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa,
    });
    expect(entrega.status).toBe(201);
    // A pré-condição do caso: os instantes não se cruzam, só o dia.
    expect(new Date(fim.body.endedAt).getTime()).toBeLessThan(new Date(entrega.body.assignment.checkoutAt).getTime());

    const [linha] = await historico(ativo.id);
    expect(nomes(linha)).toEqual(['Saiu Hoje']);
  });

  it('a entrega em aberto vai até hoje, e a de uma pessoa não tem ocupantes', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa Aberta do Período' });
    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Desktop aberto' });
    const [saiu, ficou, dona] = await Promise.all([pessoa('Saiu Aberta'), pessoa('Ficou Aberta'), pessoa('Dona Aberta')]);

    // Primeiro com a pessoa, depois na mesa, onde fica.
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'PERSON', targetPersonId: dona, checkoutAt: diaNoBrasil(-90),
    })).status).toBe(201);
    await devolver(ativo.id, 80);

    await ocupar(mesa, saiu, 70, 40);
    await ocupar(mesa, ficou, 10);
    await entregar(ativo.id, mesa, 50);

    const [aberta, daPessoa] = await historico(ativo.id);
    expect(aberta.checkinAt).toBeNull();
    expect(nomes(aberta)).toEqual(['Ficou Aberta', 'Saiu Aberta']);
    expect(daPessoa.ocupantesDoPeriodo).toEqual([]);
  });

  it('o posto excluído cruza pelo id: o novo com o mesmo nome não mistura as pessoas', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa Repetida' });
    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Desktop da mesa repetida' });
    const [daVelha, daNova] = await Promise.all([pessoa('Da Mesa Velha'), pessoa('Da Mesa Nova')]);

    await ocupar(mesa, daVelha, 50, 40);
    await entregar(ativo.id, mesa, 60);
    await devolver(ativo.id, 30);
    expect((await api.delete(`/api/workstations/${mesa}`)).status).toBe(200);

    // Outro posto, com o mesmo nome e uma ocupação no mesmo período.
    const nova = await criarPosto(api, { name: 'Mesa Repetida', locationId: await criarLocal(api, { name: 'Local da Mesa Nova' }) });
    await ocupar(nova, daNova, 50);

    const [linha] = await historico(ativo.id);
    expect(linha).toMatchObject({ targetWorkstationId: null, targetWorkstationFormerId: mesa });
    expect(nomes(linha)).toEqual(['Da Mesa Velha']);
  });
});
