import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O ATIVO ENTREGUE A UM POSTO SAI DA LISTAGEM `/ativos`.
//
// O computador montado numa mesa tem endereço, e o endereço dele é a mesa:
// quem pergunta "o que há no parque" quer o que está em estoque ou com gente.
// Ele continua achável pela BUSCA (etiqueta e série), que é o caminho de quem
// tem o equipamento na mão.
//
// O contador do cabeçalho exclui o mesmo conjunto, senão o badge prometeria uma
// linha que a tabela não mostra — é a promessa que o `/stats` carrega escrita.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

let posto: string;
let deposito: string;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Listagem');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const [mesa, dep] = await Promise.all([
    prisma.location.create({ data: { name: 'Mesa da Listagem', isWorkstation: true }, select: { id: true } }),
    prisma.location.create({ data: { name: 'Depósito da Listagem', isWorkstation: false }, select: { id: true } }),
  ]);
  posto = mesa.id;
  deposito = dep.id;
});

afterAll(async () => {
  await api.fechar();
});

async function ativo(nome: string, serial: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    serial,
    assetTag: `LISTA-${String(contador).padStart(3, '0')}`,
  });
}

async function entregarA(assetId: string, locationId: string) {
  const r = await api.post(`/api/assets/${assetId}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
  });
  expect(r.status, `entrega falhou: ${JSON.stringify(r.body)}`).toBe(201);
}

interface Envelope {
  rows: { id: string; assetTag: string }[];
  total: number;
}

async function listar(query = '') {
  const { status, body } = await api.get<Envelope>(`/api/assets${query}`);
  expect(status).toBe(200);
  return body;
}

describe('o ativo entregue a um posto sai da listagem', () => {
  it('estava na lista antes da entrega, e sai depois dela', async () => {
    const item = await ativo('Desktop da mesa', 'SN-LISTA-1');

    const antes = await listar('?perPage=100');
    expect(antes.rows.map((l) => l.id)).toContain(item.id);

    await entregarA(item.id, posto);

    const depois = await listar('?perPage=100');
    expect(depois.rows.map((l) => l.id)).not.toContain(item.id);
    // O total do envelope acompanha: o `count` usa o MESMO `where` da página.
    expect(depois.total).toBe(antes.total - 1);
  });

  it('volta para a lista quando é devolvido', async () => {
    const item = await ativo('Desktop que volta', 'SN-LISTA-2');
    await entregarA(item.id, posto);
    expect((await listar('?perPage=100')).rows.map((l) => l.id)).not.toContain(item.id);

    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('entregue a um local que NÃO é posto continua na lista: depósito é parque', async () => {
    const item = await ativo('Desktop do depósito', 'SN-LISTA-3');
    await entregarA(item.id, deposito);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('entregue a uma PESSOA continua na lista', async () => {
    const item = await ativo('Notebook da Laura', 'SN-LISTA-4');
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Laura da Listagem',
      email: 'laura.listagem@teste.local',
    });
    expect(pessoa.status).toBe(201);

    const entrega = await api.post(`/api/assets/${item.id}/checkout`, {
      targetType: 'USER',
      targetUserId: pessoa.body.id,
    });
    expect(entrega.status).toBe(201);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
  });

  it('o contador do cabeçalho exclui o mesmo conjunto que a tabela', async () => {
    const { status, body } = await api.get<{ total: number }>('/api/assets/stats');
    expect(status).toBe(200);

    const padrao = await listar('?perPage=100');
    // A promessa escrita no `/stats`: `total` conta o que a listagem PADRÃO mostra.
    expect(body.total).toBe(padrao.total);
  });

  it('o filtro por status também exclui: clicar no contador não traz o do posto', async () => {
    const item = await ativo('Desktop do status', 'SN-LISTA-5');
    await entregarA(item.id, posto);

    const porStatus = await listar(`?perPage=100&statusId=${seed.statusEmUsoId}`);
    expect(porStatus.rows.map((l) => l.id)).not.toContain(item.id);
  });

  it('mas a BUSCA continua achando, por etiqueta e por série', async () => {
    const item = await ativo('Desktop procurado', 'SN-LISTA-6');
    await entregarA(item.id, posto);

    const porEtiqueta = await api.get<{ tipo: string; ativos: { id: string }[] }>(
      `/api/search?q=${item.assetTag}`,
    );
    expect(porEtiqueta.body.tipo).toBe('EXATO');
    expect(porEtiqueta.body.ativos.map((a) => a.id)).toEqual([item.id]);

    const porSerie = await api.get<{ tipo: string; ativos: { id: string }[] }>(
      '/api/search?q=SN-LISTA-6',
    );
    expect(porSerie.body.tipo).toBe('EXATO');
    expect(porSerie.body.ativos.map((a) => a.id)).toEqual([item.id]);
  });

  it('e a ficha do posto mostra o computador que a listagem deixou de mostrar', async () => {
    const item = await ativo('Desktop da ficha', 'SN-LISTA-7');
    await entregarA(item.id, posto);

    const { status, body } = await api.get<{ ativos: { id: string }[]; totalAtivos: number }>(
      `/api/workstations/${posto}`,
    );
    expect(status).toBe(200);
    expect(body.ativos.map((a) => a.id)).toContain(item.id);
  });
});
