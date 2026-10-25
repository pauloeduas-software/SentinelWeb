import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarColaborador, criarLicenca, entregarLicenca } from '../helpers/fixtures';

// O DETALHE DA LICENÇA — as duas listas dele andam de 15 em 15: com quem está
// (com busca pelo nome) e o histórico (do mais recente para o mais antigo).

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let licencaId: string;

interface Pagina<T> { total: number; rows: T[] }
interface Entrega { id: string; assignedPerson: { name: string } | null; assignedAsset: { assetTag: string } | null }
interface Evento { action: string; at: string; entrega: { alvoLabel: string } }

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  // 17 colaboradores e um computador: passa de uma página nas duas listas.
  licencaId = (await criarLicenca(api, { name: 'Detalhe paginado', categoryId: cenario.categoriaLicencaId, seatsTotal: 30 })).id;
  for (let i = 1; i <= 17; i++) {
    const nome = `Pessoa ${String(i).padStart(2, '0')}`;
    const pessoa = await criarColaborador(api, { name: nome, email: `pessoa${i}@detalhe.local` });
    await entregarLicenca(api, licencaId, { assignedPersonId: pessoa });
  }
  const pc = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Estação de render' });
  await entregarLicenca(api, licencaId, { assignedAssetId: pc.id });
});

afterAll(async () => {
  await api.fechar();
});

describe('com quem está', () => {
  it('15 por página, e a segunda traz o resto', async () => {
    const primeira = await api.get<Pagina<Entrega>>(`/api/licenses/${licencaId}/checkouts`);
    expect(primeira.status).toBe(200);
    expect(primeira.body.total).toBe(18);
    expect(primeira.body.rows).toHaveLength(15);

    const segunda = await api.get<Pagina<Entrega>>(`/api/licenses/${licencaId}/checkouts?page=2`);
    expect(segunda.body.rows).toHaveLength(3);
    const ids = new Set([...primeira.body.rows, ...segunda.body.rows].map((e) => e.id));
    expect(ids.size).toBe(18);
  });

  it('a busca acha pelo nome do colaborador e pelo nome ou etiqueta do computador', async () => {
    const pessoa = await api.get<Pagina<Entrega>>(`/api/licenses/${licencaId}/checkouts?q=pessoa 07`);
    expect(pessoa.body.rows.map((e) => e.assignedPerson?.name)).toEqual(['Pessoa 07']);

    const computador = await api.get<Pagina<Entrega>>(`/api/licenses/${licencaId}/checkouts?q=render`);
    expect(computador.body.total).toBe(1);
    expect(computador.body.rows[0].assignedAsset).not.toBeNull();

    const ninguem = await api.get<Pagina<Entrega>>(`/api/licenses/${licencaId}/checkouts?q=ninguém assim`);
    expect(ninguem.body).toEqual({ total: 0, rows: [] });
  });

  it('a devolvida sai da lista', async () => {
    const licenca = await criarLicenca(api, { name: 'Detalhe devolvida', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`);

    expect((await api.get<Pagina<Entrega>>(`/api/licenses/${licenca.id}/checkouts`)).body.total).toBe(0);
  });
});

describe('o histórico', () => {
  it('15 por página, do mais recente para o mais antigo', async () => {
    const primeira = await api.get<Pagina<Evento>>(`/api/licenses/${licencaId}/history`);
    expect(primeira.body.total).toBe(18);
    expect(primeira.body.rows).toHaveLength(15);
    // A entrega ao computador foi a última.
    expect(primeira.body.rows[0].entrega.alvoLabel).toContain('Estação de render');

    const datas = primeira.body.rows.map((e) => e.at);
    expect([...datas].sort().reverse()).toEqual(datas);

    const segunda = await api.get<Pagina<Evento>>(`/api/licenses/${licencaId}/history?page=2`);
    expect(segunda.body.rows).toHaveLength(3);
  });

  it('uma página além do fim vem vazia — mesmo a que passa do inteiro do Postgres', async () => {
    const alem = await api.get<Pagina<Evento>>(`/api/licenses/${licencaId}/history?page=200000000`);
    expect(alem.status).toBe(200);
    expect(alem.body).toMatchObject({ total: 18, rows: [] });
  });

  it('não tem busca: `?q=` é 422, e o `?limit=` antigo também', async () => {
    expect((await api.get(`/api/licenses/${licencaId}/history?q=Pessoa`)).status).toBe(422);
    expect((await api.get(`/api/licenses/${licencaId}/history?limit=5`)).status).toBe(422);
  });
});
