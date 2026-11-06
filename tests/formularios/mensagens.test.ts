import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// A RECUSA SEMPRE EM PORTUGUÊS, E COM O CAMPO. Pela tela o corpo chega no
// formato certo; quem chama a API por fora (o Swagger, AS) manda o número no
// lugar do texto ou esquece o campo, e a resposta não pode ser a frase padrão
// da zod em inglês nem um "identificador inválido" para o que não veio.

let api: ApiDeTeste;
let statusId = '';
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api);
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

describe('a frase do limite', () => {
  it('sai com o ponto de milhar', async () => {
    const quantidade = await api.post<{ error: string }>('/api/stock/items', { name: 'Limite', categoryId: modelId, qty: 100_001 });
    expect(quantidade.body.error).toBe('Quantidade: máximo de 100.000.');

    const chave = await api.post<{ error: string }>('/api/licenses', {
      name: 'Limite', categoryId: modelId, seatsTotal: 1, keys: [{ productKey: 'CHAVE', seats: 100_001 }],
    });
    expect(chave.body.error).toContain('cobre no máximo 100.000');
  });

  it('o campo ativo responde em português, sem true nem false', async () => {
    const { body } = await api.put<{ error: string }>(`/api/stock/items/${modelId}`, {
      isActive: 'sim', updatedAt: new Date().toISOString(),
    });
    expect(body.error).toBe('Ativo deve ser verdadeiro ou falso.');
  });
});

describe('tipo errado', () => {
  it('valor de compra em número diz o campo, em português', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/assets', {
      modelId, statusId, purchaseCost: 3500,
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Valor de compra: use um valor como 1234,50.');
  });

  it('o que o schema não deu frase própria cai na mensagem da zod em português', async () => {
    // Uma lista no lugar do objeto: nenhum campo chega a ser lido.
    const { status, body } = await api.post<{ error: string }>('/api/workstations', ['Posto']);

    expect(status).toBe(422);
    expect(body.error).toBe('Entrada inválida: esperava um objeto, recebeu um vetor.');
  });
});

describe('select obrigatório', () => {
  it('posto sem localização pede o campo, e não acusa identificador inválido', async () => {
    const semCampo = await api.post<{ error: string }>('/api/workstations', { name: 'Posto sem lugar' });
    const vazio = await api.post<{ error: string }>('/api/workstations', { name: 'Posto sem lugar', locationId: '' });

    expect(semCampo.status).toBe(422);
    expect(semCampo.body.error).toBe('Localização: campo obrigatório.');
    expect(vazio.body.error).toBe('Localização: campo obrigatório.');
  });

  it('localização que não é uuid continua sendo identificador inválido', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/workstations', {
      name: 'Posto sem lugar', locationId: 'sala-3',
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Localização: identificador inválido.');
  });
});
