import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O ATIVO ENTREGUE A UM POSTO SAI DA LISTAGEM `/computadores`.
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
    const posto = await mesa('Mesa da Listagem 1');

    const antes = await listar('?perPage=100');
    expect(antes.rows.map((l) => l.id)).toContain(item.id);

    await entregarA(item.id, posto.id);

    const depois = await listar('?perPage=100');
    expect(depois.rows.map((l) => l.id)).not.toContain(item.id);
    // O total do envelope acompanha: o `count` usa o MESMO `where` da página.
    expect(depois.total).toBe(antes.total - 1);
  });

  it('volta para a lista quando é devolvido', async () => {
    const item = await ativo('Desktop que volta', 'SN-LISTA-2');
    await entregarA(item.id, (await mesa('Mesa da Listagem 2')).id);
    expect((await listar('?perPage=100')).rows.map((l) => l.id)).not.toContain(item.id);

    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    expect((await listar('?perPage=100')).rows.map((l) => l.id)).toContain(item.id);
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

  it('o contador do cabeçalho exclui o mesmo conjunto que a tabela', async () => {
    const { status, body } = await api.get<{ total: number }>('/api/assets/stats');
    expect(status).toBe(200);

    const padrao = await listar('?perPage=100');
    // A promessa escrita no `/stats`: `total` conta o que a listagem PADRÃO mostra.
    expect(body.total).toBe(padrao.total);
  });

  it('o filtro por status também exclui: clicar no contador não traz o do posto', async () => {
    const item = await ativo('Desktop do status', 'SN-LISTA-5');
    await entregarA(item.id, (await mesa('Mesa da Listagem 5')).id);

    const porStatus = await listar(`?perPage=100&statusId=${seed.statusEmUsoId}`);
    expect(porStatus.rows.map((l) => l.id)).not.toContain(item.id);
  });

  it('mas a BUSCA continua achando, por etiqueta e por série', async () => {
    const item = await ativo('Desktop procurado', 'SN-LISTA-6');
    await entregarA(item.id, (await mesa('Mesa da Listagem 6')).id);

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

  it('a busca EXATA diz em que posto o ativo está, para a tela levar até lá', async () => {
    const item = await ativo('Desktop que leva ao posto', 'SN-LISTA-8');
    const posto = await mesa('Mesa da Listagem 8');
    await entregarA(item.id, posto.id);

    const { body } = await api.get<{ tipo: string; posto: { id: string; name: string } | null }>(
      `/api/search?q=${item.assetTag}`,
    );

    expect(body.tipo).toBe('EXATO');
    expect(body.posto?.id).toBe(posto.id);
    expect(body.posto?.name).toBe('Mesa da Listagem 8');
  });

  // Os três mecanismos de `posto: null` são DIFERENTES, e por isso são três
  // casos: sem posse nenhuma, posse num local que não é mesa, e posse de
  // PESSOA. Num laço só, o segundo não rodaria quando o primeiro caísse, e a
  // falha não diria qual deles quebrou.
  it('é null para o ativo sem posse: o destino é a ficha dele', async () => {
    const item = await ativo('Desktop na prateleira', 'SN-LISTA-9');

    const { body } = await api.get<{ tipo: string; posto: unknown }>(
      `/api/search?q=${item.assetTag}`,
    );
    expect(body.tipo).toBe('EXATO');
    expect(body.posto).toBeNull();
  });

  it('é null para o ativo só GUARDADO numa localização', async () => {
    const item = await ativo('Desktop no depósito 2', 'SN-LISTA-10', deposito);

    const { body } = await api.get<{ posto: unknown }>(`/api/search?q=${item.assetTag}`);
    expect(body.posto).toBeNull();
  });

  it('é null para o ativo entregue a uma PESSOA', async () => {
    // É o caso que o `targetType: 'WORKSTATION'` do `where` governa: posse de
    // pessoa deixa `targetWorkstationId` nulo e não pode virar posto nenhum.
    const item = await ativo('Notebook da Ana', 'SN-LISTA-11');
    const pessoa = await api.post<{ id: string }>('/api/people', {
      name: 'Ana da Busca',
      email: 'ana.busca@teste.local',
    });
    expect(pessoa.status).toBe(201);
    const entrega = await api.post(`/api/assets/${item.id}/checkout`, {
      targetType: 'PERSON',
      targetPersonId: pessoa.body.id,
    });
    expect(entrega.status).toBe(201);

    const { body } = await api.get<{ posto: unknown }>(`/api/search?q=${item.assetTag}`);
    expect(body.posto).toBeNull();
  });

  it('e volta a ser null quando o computador é devolvido', async () => {
    const item = await ativo('Desktop que sai do posto', 'SN-LISTA-12');
    const posto = await mesa('Mesa da Listagem 12');
    await entregarA(item.id, posto.id);

    const noPosto = await api.get<{ posto: { id: string } | null }>(`/api/search?q=${item.assetTag}`);
    expect(noPosto.body.posto?.id).toBe(posto.id);

    expect((await api.post(`/api/assets/${item.id}/checkin`, {})).status).toBe(200);

    const depois = await api.get<{ posto: unknown }>(`/api/search?q=${item.assetTag}`);
    expect(depois.body.posto).toBeNull();
  });

  it('e a ficha do posto mostra o computador que a listagem deixou de mostrar', async () => {
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
