import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/infra/database/prismaClient';

// A LISTAGEM DE USUÁRIOS — `GET /api/users`, quem opera o sistema.
//
// Em ordem de NOME, e sem lixeira: excluir apaga a linha (W), então a rota não
// aceita `?view=trashed` nem tem `restore`.

let api: ApiDeTeste;

/** Marca única da corrida: a busca por ela isola os cadastros deste arquivo. */
const MARCA = `lst${Date.now()}`;

beforeAll(async () => {
  api = await criarApi();

  // Cadastrados FORA da ordem alfabética: se a listagem ordenasse pelo
  // cadastro, a resposta viria Carla, Ana, Bruno.
  for (const nome of ['Carla', 'Ana', 'Bruno']) {
    const criado = await api.post('/api/users', {
      name: `${nome} ${MARCA}`,
      email: `${nome.toLowerCase()}.${MARCA}@teste.local`,
    });
    expect(criado.status).toBe(201);
  }
});

afterAll(async () => {
  await api.fechar();
});

interface Envelope {
  total: number;
  rows: { id: string; name: string }[];
}

async function buscar(termo: string) {
  return api.get<Envelope>(`/api/users?q=${encodeURIComponent(termo)}`);
}

describe('GET /api/users', () => {
  it('lista em ordem alfabética, não pela data do cadastro', async () => {
    const { status, body } = await buscar(MARCA);

    expect(status).toBe(200);
    expect(body.rows.map((linha) => linha.name)).toEqual([
      `Ana ${MARCA}`, `Bruno ${MARCA}`, `Carla ${MARCA}`,
    ]);
  });

  it('não tem lixeira: `?view=trashed` é 422 e excluído não volta', async () => {
    expect((await api.get('/api/users?view=trashed')).status).toBe(422);

    const ana = (await buscar(`Ana ${MARCA}`)).body.rows[0];
    expect((await api.delete(`/api/users/${ana.id}`)).status).toBe(200);

    expect((await api.post(`/api/users/${ana.id}/restore`)).status).toBe(404);
    expect((await buscar(`Ana ${MARCA}`)).body.total).toBe(0);
  });

  it('excluir apaga a linha, e o e-mail fica livre para um cadastro novo', async () => {
    const email = `bruno.${MARCA}@teste.local`;
    const bruno = (await buscar(`Bruno ${MARCA}`)).body.rows[0];
    expect((await api.delete(`/api/users/${bruno.id}`)).status).toBe(200);

    // Nem no banco: não há `deletedAt` segurando a linha (W).
    expect(await prisma.user.findUnique({ where: { id: bruno.id } })).toBeNull();

    const denovo = await api.post('/api/users', {
      name: `Bruno ${MARCA}`, email,
    });
    expect(denovo.status).toBe(201);
  });
});
