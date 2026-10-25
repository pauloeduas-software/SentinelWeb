import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarColaborador, criarLicenca } from '../helpers/fixtures';
// A função PURA que a tela usa para esconder a chave: o teste prova o que o
// operador VÊ antes de "Mostrar".
import { esconderChave } from '../../src/pages/licencas/helpers/licenca.helper';

// A CHAVE DE PRODUTO (AA): a da licença — de volume, ou a lista das compradas —
// e a de cada entrega. Só o DETALHE as devolve; a listagem, a busca, o alerta,
// a aba do ativo, a ficha e os históricos, nunca.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

interface Entrega { id: string; productKey?: string | null }

async function entregar(licenseId: string, alvo: object, productKey?: string) {
  return api.post<Entrega & { error: string }>(`/api/licenses/${licenseId}/checkout`, { ...alvo, productKey });
}

describe('a chave da licença', () => {
  it('aceita várias linhas, só o detalhe a devolve, e só espaço vira nulo', async () => {
    const criada = await api.post<{ id: string; productKey?: string }>('/api/licenses', {
      name: 'Office de volume', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
      productKey: 'AAAAA-BBBBB-CCCCC\nDDDDD-EEEEE-FFFFF',
    });
    expect(criada.status).toBe(201);
    expect(criada.body).not.toHaveProperty('productKey');

    const detalhe = await api.get<{ productKey: string | null }>(`/api/licenses/${criada.body.id}`);
    expect(detalhe.body.productKey).toBe('AAAAA-BBBBB-CCCCC\nDDDDD-EEEEE-FFFFF');

    const lista = await api.get<{ rows: Record<string, unknown>[] }>('/api/licenses?q=Office de volume');
    expect(lista.body.rows).toHaveLength(1);
    expect(lista.body.rows[0]).not.toHaveProperty('productKey');

    // A busca não varre a chave.
    expect((await api.get<{ total: number }>('/api/licenses?q=DDDDD-EEEEE')).body.total).toBe(0);

    expect((await api.put(`/api/licenses/${criada.body.id}`, { productKey: '   ' })).status).toBe(200);
    expect((await api.get<{ productKey: string | null }>(`/api/licenses/${criada.body.id}`)).body.productKey).toBeNull();
  });
});

describe('a chave da entrega', () => {
  it('a mesma chave não vai para duas entregas abertas; devolvida, ela volta a poder', async () => {
    const licenca = await criarLicenca(api, { name: 'Windows avulso', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });
    const primeira = await entregar(licenca.id, { assignedPersonId: cenario.laura }, 'WIN-0001');
    expect(primeira.status).toBe(201);

    const repetida = await entregar(licenca.id, { assignedPersonId: cenario.ana }, 'WIN-0001');
    expect(repetida.status).toBe(409);
    expect(repetida.body.error).toBe('Esta chave já está em outra entrega aberta de "Windows avulso".');

    // Sem chave não entra na regra: a licença de volume entrega sem nenhuma.
    expect((await entregar(licenca.id, { assignedPersonId: cenario.ana }, '  ')).status).toBe(201);

    await api.post(`/api/licenses/checkouts/${primeira.body.id}/checkin`);
    expect((await entregar(licenca.id, { assignedAssetId: cenario.ativo.id }, 'WIN-0001')).status).toBe(201);
  });

  it('é uma linha só', async () => {
    const licenca = await criarLicenca(api, { name: 'Chave de uma linha', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    expect((await entregar(licenca.id, { assignedPersonId: cenario.laura }, 'ABC\nDEF')).status).toBe(422);
  });

  it('o "Com quem está" traz a chave; aba do ativo, ficha, alerta e históricos, não', async () => {
    const pessoa = await criarColaborador(api, { name: 'Rita Chaves', email: 'rita@chave.local' });
    const licenca = await criarLicenca(api, { name: 'Chave escondida', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    await entregar(licenca.id, { assignedPersonId: pessoa }, 'SEGREDO-PESSOA');
    await entregar(licenca.id, { assignedAssetId: cenario.ativo.id }, 'SEGREDO-ATIVO');

    const comQuem = await api.get<{ rows: Entrega[] }>(`/api/licenses/${licenca.id}/checkouts`);
    expect(comQuem.body.rows.map((e) => e.productKey).sort()).toEqual(['SEGREDO-ATIVO', 'SEGREDO-PESSOA']);

    for (const url of [
      `/api/assets/${cenario.ativo.id}/licenses`,
      `/api/people/${pessoa}`,
      `/api/people/${pessoa}/history`,
      `/api/assets/${cenario.ativo.id}/history`,
      `/api/licenses/${licenca.id}/history`,
      '/api/licenses/alerts',
      '/api/licenses?q=Chave escondida',
    ]) {
      const { status, body } = await api.get(url);
      expect(status, url).toBe(200);
      expect(JSON.stringify(body), url).not.toContain('SEGREDO');
    }
  });
});

describe('trocar a chave de uma entrega aberta', () => {
  it('troca só a chave; a repetida é 409, a devolvida é 409, e vazia vira nula', async () => {
    const licenca = await criarLicenca(api, { name: 'Troca de chave', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });
    const daLaura = await entregar(licenca.id, { assignedPersonId: cenario.laura }, 'TROCA-1');
    const daAna = await entregar(licenca.id, { assignedPersonId: cenario.ana }, 'TROCA-2');

    const trocada = await api.patch<Entrega>(`/api/licenses/checkouts/${daLaura.body.id}`, { productKey: 'TROCA-3' });
    expect(trocada.status).toBe(200);
    expect(trocada.body.productKey).toBe('TROCA-3');

    const repetida = await api.patch<{ error: string }>(`/api/licenses/checkouts/${daLaura.body.id}`, { productKey: 'TROCA-2' });
    expect(repetida.status).toBe(409);

    // Outro campo da entrega não muda por aqui, e o corpo sem a chave não a apaga.
    expect((await api.patch(`/api/licenses/checkouts/${daLaura.body.id}`, { notes: 'x' })).status).toBe(422);
    const semChave = await api.patch<{ error: string }>(`/api/licenses/checkouts/${daLaura.body.id}`, {});
    expect(semChave.status).toBe(422);
    expect(semChave.body.error).toBe('chave: informe a chave, ou vazio para limpar');
    const comQuem = await api.get<{ rows: Entrega[] }>(`/api/licenses/${licenca.id}/checkouts`);
    expect(comQuem.body.rows.find((linha) => linha.id === daLaura.body.id)?.productKey).toBe('TROCA-3');

    const vazia = await api.patch<Entrega>(`/api/licenses/checkouts/${daLaura.body.id}`, { productKey: '' });
    expect(vazia.body.productKey).toBeNull();

    await api.post(`/api/licenses/checkouts/${daAna.body.id}/checkin`);
    const devolvida = await api.patch<{ error: string }>(`/api/licenses/checkouts/${daAna.body.id}`, { productKey: 'TROCA-9' });
    expect(devolvida.status).toBe(409);
    expect(devolvida.body.error).toContain('já foi devolvida');

    expect((await api.patch('/api/licenses/checkouts/00000000-0000-4000-8000-000000000000', { productKey: 'X' })).status).toBe(404);
  });
});

describe('a chave escondida na tela', () => {
  it('mostra o começo de cada linha e esconde o resto', () => {
    expect(esconderChave('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY')).toBe('ABCDE-FGHIJ-•••••-•••••-•••••');
    expect(esconderChave('XXXX-YYYY')).toBe('XXXX-••••');
    expect(esconderChave('ABCDEFGHIJKL')).toBe('ABCD••••••••');
    expect(esconderChave('AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF')).toBe('AAAA-BBBB-••••\nDDDD-EEEE-••••');
  });
});
