import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, diasAtras, idsDoSeed } from '../helpers/fixtures';

// O RECORTE DO PARQUE, O INTERRUPTOR E A CONFIGURAÇÃO — a segunda metade dos
// alertas da F8.
//
// ARQUIVO SEPARADO POR CAUSA DO TETO DA ROTA, não por tema: `POST /api/alerts/run`
// aceita 10 por minuto (cada chamada varre a frota quatro vezes e pode mandar
// e-mail), e o `@fastify/rate-limit` conta em memória POR INSTÂNCIA do Fastify — o
// harness cria uma por arquivo. Ver o bloco no topo de `alertas.test.ts`.

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante do recorte de alertas');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

beforeEach(async () => {
  await prisma.alert.deleteMany({});
});

async function rodar() {
  const resposta = await api.post<{ criados: number; notificados: number; desligado: boolean }>('/api/alerts/run');
  expect(resposta.status).toBe(200);
  return resposta.body;
}

describe('o recorte do parque (D127)', () => {
  it('ativo DESCOMISSIONADO não gera alerta de prazo', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook vendido' });
    await api.put(`/api/assets/${ativo.id}`, { purchaseDate: diasAtras(360), warrantyMonths: 12 });

    // Sai do PATRIMÔNIO: vendido. É fato contábil, e continua nos relatórios de
    // valor — mas cobrar prazo dele produz um aviso que ninguém pode atender.
    const saida = await api.post(`/api/assets/${ativo.id}/retire`, {
      retiredReason: 'VENDIDO',
      retiredAt: diasAtras(10),
    });
    expect(saida.status).toBe(200);

    await rodar();

    const alertas = await prisma.alert.count({ where: { assetId: ativo.id } });
    expect(alertas).toBe(0);
  });

  it('ativo na LIXEIRA não aparece na central', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook a apagar' });
    await api.put(`/api/assets/${ativo.id}`, { purchaseDate: diasAtras(360), warrantyMonths: 12 });

    await rodar();
    expect(await prisma.alert.count({ where: { assetId: ativo.id } })).toBeGreaterThan(0);

    // Lixeira é `UPDATE`: o `Cascade` da FK não dispara, a linha do alerta FICA, e
    // é o filtro da listagem que a esconde.
    // 200 com `{ success: true }` — a convenção da lixeira no projeto.
    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);

    const central = await api.get<{ rows: { assetId: string | null }[] }>('/api/alerts');
    expect(central.body.rows.some((alerta) => alerta.assetId === ativo.id)).toBe(false);
  });
});

describe('o interruptor', () => {
  it('desligado, a rodada não grava NADA', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do interruptor' });
    await api.put(`/api/assets/${ativo.id}`, { purchaseDate: diasAtras(360), warrantyMonths: 12 });

    expect((await api.put('/api/settings/alerts', { alertsEnabled: false })).status).toBe(200);

    const rodada = await rodar();
    expect(rodada.desligado).toBe(true);
    expect(rodada.criados).toBe(0);
    expect(await prisma.alert.count({})).toBe(0);

    // Religa para não contaminar os outros arquivos da suíte — a configuração é
    // um singleton global.
    await api.put('/api/settings/alerts', { alertsEnabled: true });
  });
});

describe('a leitura', () => {
  it('marcar como lido zera o contador do sino, e a segunda vez não muda a data', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do sino' });
    await api.put(`/api/assets/${ativo.id}`, { purchaseDate: diasAtras(360), warrantyMonths: 12 });
    await rodar();

    const antes = await api.get<{ naoLidos: number; rows: { id: string }[] }>('/api/alerts');
    expect(antes.body.naoLidos).toBeGreaterThan(0);

    const primeiro = antes.body.rows[0].id;
    const lido = await api.post<{ readAt: string }>(`/api/alerts/${primeiro}/read`);
    expect(lido.status).toBe(200);

    // Duas abas abertas no sino não devem fazer a data pular para a da segunda.
    const denovo = await api.post<{ readAt: string }>(`/api/alerts/${primeiro}/read`);
    expect(denovo.body.readAt).toBe(lido.body.readAt);

    const depois = await api.get<{ naoLidos: number }>('/api/alerts');
    expect(depois.body.naoLidos).toBe(antes.body.naoLidos - 1);
  });
});

describe('a configuração', () => {
  it('recusa webhook http (422) e aceita https', async () => {
    // A URL vem do banco e a requisição sai do SERVIDOR: `http` vazaria o
    // conteúdo do alerta em trânsito, e a validação na borda é o que dá a
    // mensagem certa para quem está digitando.
    const recusado = await api.put('/api/settings/alerts', { alertWebhookUrl: 'http://hooks.exemplo.com/x' });
    expect(recusado.status).toBe(422);

    const aceito = await api.put('/api/settings/alerts', { alertWebhookUrl: 'https://hooks.exemplo.com/x' });
    expect(aceito.status).toBe(200);

    await api.put('/api/settings/alerts', { alertWebhookUrl: null });
  });

  it('recusa fuso horário desconhecido (422)', async () => {
    // Um fuso inválido faria o job calcular a janela com `RangeError` a cada tick,
    // e o alerta pararia de sair sem ninguém ter mexido em nada.
    const resposta = await api.put('/api/settings/alerts', { timezone: 'Mordor/Barad-dur' });
    expect(resposta.status).toBe(422);
  });

  it('recusa destinatário que não é e-mail (422)', async () => {
    const resposta = await api.put('/api/settings/alerts', { alertEmails: ['ti@empresa.com', 'não é e-mail'] });
    expect(resposta.status).toBe(422);
  });
});
