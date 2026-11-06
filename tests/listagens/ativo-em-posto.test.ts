import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O ATIVO ENTREGUE A UM POSTO CONTINUA NA LISTAGEM `/computadores` (BJ).
//
// A lista é o parque inteiro, e a linha diz em que mesa ele está: a localização
// do posto, os ocupantes e o selo de posto vago.
//
// O contador do cabeçalho conta o mesmo conjunto, senão o badge prometeria outra
// coisa que a tabela — é a promessa que o `/stats` carrega escrita.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

let deposito: string;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Listagem');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const dep = await prisma.location.create({ data: { name: 'Depósito da Listagem' }, select: { id: true } });
  deposito = dep.id;
});

/**
 * UMA MESA POR CASO. Um posto de trabalho tem no máximo um ativo (invariante
 * 19), então os casos não podem dividir a mesma mesa — o segundo levaria 409.
 */
async function mesa(nome: string) {
  return prisma.workstation.create({
    data: { name: nome, location: { create: { name: `Local de ${nome}` } } },
    select: { id: true, name: true },
  });
}

afterAll(async () => {
  await api.fechar();
});

async function ativo(nome: string, serial: string, locationId?: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    serial,
    assetTag: `LISTA-${String(contador).padStart(3, '0')}`,
    locationId,
  });
}

async function entregarA(assetId: string, workstationId: string) {
  const r = await api.post(`/api/assets/${assetId}/checkout`, {
    targetType: 'WORKSTATION',
    targetWorkstationId: workstationId,
  });
  expect(r.status, `entrega falhou: ${JSON.stringify(r.body)}`).toBe(201);
}

interface PostoAtual {
  id: string;
  name: string;
  location: { id: string; name: string };
}

interface Envelope {
  rows: {
    id: string;
    assetTag: string;
    location: { id: string; name: string } | null;
    postoAtual: PostoAtual | null;
    posse: { targetLabel: string | null; postoVago: boolean };
  }[];
  total: number;
}

async function listar(query = '') {
  const { status, body } = await api.get<Envelope>(`/api/assets${query}`);
  expect(status).toBe(200);
  return body;
}

describe('o ativo entregue a um posto continua na listagem', () => {
  it('estava na lista antes da entrega, e continua depois dela', async () => {
    const item = await ativo('Desktop da mesa', 'SN-LISTA-1');
    const posto = await mesa('Mesa da Listagem 1');

    const antes = await listar('?perPage=100');
    expect(antes.rows.map((l) => l.id)).toContain(item.id);

    await entregarA(item.id, posto.id);

    const depois = await listar('?perPage=100');
    expect(depois.rows.map((l) => l.id)).toContain(item.id);
    // O total do envelope acompanha: o `count` usa o MESMO `where` da página.
    expect(depois.total).toBe(antes.total);
  });

  it('continua na lista depois de devolvido', async () => {
    const item = await ativo('Desktop que volta', 'SN-LISTA-2');
    await entregarA(item.id, (await mesa('Mesa da Listagem 2')).id);
    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('a busca de Computadores acha pela etiqueta e pela série', async () => {
    const item = await ativo('Desktop buscado', 'SERIE-DA-LISTA');
    await entregarA(item.id, (await mesa('Mesa da Listagem 3')).id);

    for (const termo of [item.assetTag, 'serie-da-lista']) {
      expect((await listar(`?q=${encodeURIComponent(termo)}`)).rows.map((l) => l.id)).toEqual([item.id]);
    }
  });

  it('GUARDADO numa localização continua na lista: depósito é parque', async () => {
    const item = await ativo('Desktop do depósito', 'SN-LISTA-3', deposito);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('entregue a uma PESSOA continua na lista', async () => {
    const item = await ativo('Notebook da Laura', 'SN-LISTA-4');
    const pessoa = await api.post<{ id: string }>('/api/people', {
      name: 'Laura da Listagem',
      email: 'laura.listagem@teste.local',
    });
    expect(pessoa.status).toBe(201);

    const entrega = await api.post(`/api/assets/${item.id}/checkout`, {
      targetType: 'PERSON',
      targetPersonId: pessoa.body.id,
    });
    expect(entrega.status).toBe(201);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('o contador do cabeçalho conta o mesmo conjunto que a tabela', async () => {
    await entregarA((await ativo('Desktop contado', 'SN-LISTA-6')).id, (await mesa('Mesa da Listagem 6')).id);

    const { status, body } = await api.get<{ total: number }>('/api/assets/stats');
    expect(status).toBe(200);

    const padrao = await listar('?perPage=100');
    // A promessa escrita no `/stats`: `total` conta o que a listagem PADRÃO mostra.
    expect(body.total).toBe(padrao.total);
  });

  it('o filtro por status também traz: clicar no contador acha o do posto', async () => {
    const item = await ativo('Desktop do status', 'SN-LISTA-5');
    await entregarA(item.id, (await mesa('Mesa da Listagem 5')).id);

    const porStatus = await listar(`?perPage=100&statusId=${seed.statusEmUsoId}`);
    expect(porStatus.rows.map((l) => l.id)).toContain(item.id);
  });

  it('a busca de Postos acha a mesa pela etiqueta e pela série do computador, e só enquanto ele está lá (BI)', async () => {
    const posto = await mesa('Mesa da busca');
    const computador = await ativo('Na mesa da busca', 'SERIE-DA-BUSCA');
    await entregarA(computador.id, posto.id);

    const buscar = async (termo: string) => {
      const { body } = await api.get<Envelope>(`/api/workstations?q=${encodeURIComponent(termo)}`);
      return body.rows.map((linha) => linha.id);
    };
    expect(await buscar(computador.assetTag)).toEqual([posto.id]);
    expect(await buscar('serie-da-busca')).toEqual([posto.id]);

    expect((await api.post(`/api/assets/${computador.id}/checkin`, {})).status).toBe(200);
    expect(await buscar(computador.assetTag)).toEqual([]);
  });

  it('e a ficha do posto mostra o mesmo computador', async () => {
    const item = await ativo('Desktop da ficha', 'SN-LISTA-7');
    const posto = await mesa('Mesa da Listagem 7');
    await entregarA(item.id, posto.id);

    const { status, body } = await api.get<{ ativos: { id: string }[]; totalAtivos: number }>(
      `/api/workstations/${posto.id}`,
    );
    expect(status).toBe(200);
    expect(body.ativos.map((a) => a.id)).toContain(item.id);
  });
});

// A LINHA DIZ EM QUE MESA ELE ESTÁ (BJ).
//
// Entregar não muda `Asset.locationId`. Sem o `postoAtual`, um computador do
// Depósito entregue a um posto na Filial apareceria na lista como Depósito.
describe('a linha do computador num posto', () => {
  async function linha(assetId: string) {
    const achada = (await listar('?perPage=100')).rows.find((l) => l.id === assetId);
    expect(achada, 'o computador devia estar na lista').toBeDefined();
    return achada!;
  }

  it('traz o posto e a localização dele, igual à ficha; o guardado continua o mesmo', async () => {
    const item = await ativo('Desktop da linha', 'SN-LISTA-L1', deposito);
    const posto = await mesa('Mesa da Linha 1');
    await entregarA(item.id, posto.id);

    const lida = await linha(item.id);
    expect(lida.postoAtual).toEqual({
      id: posto.id, name: 'Mesa da Linha 1', location: { id: expect.any(String), name: 'Local de Mesa da Linha 1' },
    });
    expect(lida.location?.id).toBe(deposito);
    expect(lida.postoAtual).toEqual((await ficha(item.id)).postoAtual);
  });

  it('a localização acompanha quando o posto muda de lugar', async () => {
    const item = await ativo('Desktop que muda na lista', 'SN-LISTA-L2', deposito);
    const posto = await mesa('Mesa da Linha 2');
    await entregarA(item.id, posto.id);

    const filial = await prisma.location.create({ data: { name: 'Filial da Linha' }, select: { id: true } });
    expect((await api.put(`/api/workstations/${posto.id}`, { locationId: filial.id })).status).toBe(200);

    expect((await linha(item.id)).postoAtual?.location).toEqual({ id: filial.id, name: 'Filial da Linha' });
  });

  it('depois de devolvido, volta a valer o lugar guardado', async () => {
    const item = await ativo('Desktop devolvido na lista', 'SN-LISTA-L3', deposito);
    await entregarA(item.id, (await mesa('Mesa da Linha 3')).id);
    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    const lida = await linha(item.id);
    expect(lida.postoAtual).toBeNull();
    expect(lida.location?.id).toBe(deposito);
  });

  it('o posto vago aparece na resposta da lista', async () => {
    const item = await ativo('Desktop sem ninguém', 'SN-LISTA-L4');
    await entregarA(item.id, (await mesa('Mesa da Linha 4')).id);

    expect((await linha(item.id)).posse).toMatchObject({ targetLabel: 'Mesa da Linha 4', postoVago: true });
  });

  it('fora de posto, não há posto na linha', async () => {
    const item = await ativo('Desktop guardado na lista', 'SN-LISTA-L5', deposito);

    expect((await linha(item.id)).postoAtual).toBeNull();
  });
});

// A FICHA MOSTRA O LUGAR DO POSTO (AW).
//
// Entregar não mexe em `Asset.locationId`, que é onde o computador fica
// guardado. Na mesa, ele está onde o posto fica: a ficha traz o `postoAtual`,
// lido da posse aberta, e o posto que muda de lugar leva o computador junto.
interface Ficha {
  location: { id: string; name: string } | null;
  postoAtual: { id: string; name: string; location: { id: string; name: string } } | null;
}

async function ficha(assetId: string) {
  const { status, body } = await api.get<Ficha>(`/api/assets/${assetId}`);
  expect(status).toBe(200);
  return body;
}

describe('a ficha do computador num posto mostra o lugar do posto', () => {
  it('entregue, traz o posto e a localização dele; o guardado continua o mesmo', async () => {
    const item = await ativo('Desktop da ficha', 'SN-LISTA-F1', deposito);
    const posto = await mesa('Mesa da Ficha 1');
    await entregarA(item.id, posto.id);

    const lida = await ficha(item.id);
    expect(lida.postoAtual).toEqual({
      id: posto.id, name: 'Mesa da Ficha 1', location: { id: expect.any(String), name: 'Local de Mesa da Ficha 1' },
    });
    expect(lida.location?.id).toBe(deposito);
  });

  it('o posto que muda de localização leva o computador junto', async () => {
    const item = await ativo('Desktop que muda', 'SN-LISTA-F2', deposito);
    const posto = await mesa('Mesa da Ficha 2');
    await entregarA(item.id, posto.id);

    const filial = await prisma.location.create({ data: { name: 'Filial da Ficha' }, select: { id: true } });
    expect((await api.put(`/api/workstations/${posto.id}`, { locationId: filial.id })).status).toBe(200);

    expect((await ficha(item.id)).postoAtual?.location).toEqual({ id: filial.id, name: 'Filial da Ficha' });
  });

  it('devolvido, o posto some e vale de novo onde ele fica guardado', async () => {
    const item = await ativo('Desktop devolvido', 'SN-LISTA-F3', deposito);
    await entregarA(item.id, (await mesa('Mesa da Ficha 3')).id);
    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    const lida = await ficha(item.id);
    expect(lida.postoAtual).toBeNull();
    expect(lida.location?.id).toBe(deposito);
  });

  it('entregue a uma pessoa, não há posto', async () => {
    const item = await ativo('Notebook da ficha', 'SN-LISTA-F4', deposito);
    const pessoa = await api.post<{ id: string }>('/api/people', { name: 'Bia da Ficha', email: 'bia.ficha@teste.local' });
    expect(pessoa.status).toBe(201);
    expect((await api.post(`/api/assets/${item.id}/checkout`, { targetType: 'PERSON', targetPersonId: pessoa.body.id })).status).toBe(201);

    expect((await ficha(item.id)).postoAtual).toBeNull();
  });
});
