import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarLicenca, entregarLicenca,
} from '../helpers/fixtures';

// A COSTURA COM A POSSE (D93).
//
// A licença entregue é posse: alguém responde por ela quando a pessoa sai ou a
// máquina é vendida. Por isso a desativação do colaborador e a baixa do ativo
// cobram as abertas — e o 409 manda para onde o botão de devolver EXISTE: a
// tela de Licenças. A ficha do colaborador e a aba Licenças do ativo listam o
// que está com cada um, com o link para lá.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

describe('o colaborador', () => {
  it('não se desativa nem se exclui com licença aberta, e o 409 diz QUAIS — com a referência de cada uma', async () => {
    const pessoa = await criarColaborador(api, { name: 'Elisa Gomes', email: 'elisa@teste.local' });
    const vpn = await criarLicenca(api, { name: 'VPN', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const office = await criarLicenca(api, { name: 'Office', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    await entregarLicenca(api, vpn.id, { assignedPersonId: pessoa });
    await entregarLicenca(api, office.id, { assignedPersonId: pessoa });

    type Recusa = { error: string; refs: { tipo: string; id: string; nome: string }[] };
    const recusa = await api.put<Recusa>(`/api/people/${pessoa}`, { isActive: false });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('tem 2 licenças (Office e VPN)');
    expect(recusa.body.error).toContain('antes de desativar');
    expect(recusa.body.refs).toEqual([
      { tipo: 'licenca', id: office.id, nome: 'Office' },
      { tipo: 'licenca', id: vpn.id, nome: 'VPN' },
    ]);

    const exclusao = await api.delete<Recusa>(`/api/people/${pessoa}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toContain('tem 2 licenças (Office e VPN)');
    expect(exclusao.body.refs.map((ref) => ref.nome)).toEqual(['Office', 'VPN']);
  });

  it('a ficha lista as licenças DELA — e só as dela — e a devolução destrava', async () => {
    const pessoa = await criarColaborador(api, { name: 'Olívia Reis', email: 'olivia@teste.local' });
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'PC da Olívia' });
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);
    const doPc = await criarLicenca(api, { name: 'Windows da máquina', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const dela = await criarLicenca(api, { name: 'Adobe da Olívia', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, doPc.id, { assignedAssetId: ativo.id });
    await entregarLicenca(api, dela.id, { assignedPersonId: pessoa });

    const ficha = await api.get<{ licencas: { id: string; license: { name: string } }[] }>(`/api/people/${pessoa}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.licencas.map((l) => l.license.name)).toEqual(['Adobe da Olívia']);

    // A licença da MÁQUINA não prende a pessoa: devolvida a dela, e devolvido o
    // computador, ela se desativa com o Windows ainda no PC.
    expect((await api.post(`/api/licenses/checkouts/${ficha.body.licencas[0].id}/checkin`)).status).toBe(200);
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(200);
  });
});

describe('o ativo', () => {
  it('não se exclui nem dá baixa com licença aberta, e o 409 manda para a tela de Licenças', async () => {
    const maquina = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Estação CAD' });
    const licenca = await criarLicenca(api, { name: 'SolidWorks', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, licenca.id, { assignedAssetId: maquina.id });

    type Recusa = { error: string; refs: { tipo: string; id: string; nome: string }[] };
    const exclusao = await api.delete<Recusa>(`/api/assets/${maquina.id}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toContain('ainda tem a licença SolidWorks');
    expect(exclusao.body.error).toContain('tela de Licenças');
    expect(exclusao.body.refs).toEqual([{ tipo: 'licenca', id: licenca.id, nome: 'SolidWorks' }]);

    const baixa = await api.post<Recusa>(`/api/assets/${maquina.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(baixa.status).toBe(409);
    expect(baixa.body.error).toContain('tela de Licenças');
    expect(baixa.body.refs.map((ref) => ref.nome)).toEqual(['SolidWorks']);
  });

  it('a aba Licenças lista o que está NAQUELA máquina, com o status', async () => {
    const maquina = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Notebook do Design' });
    const licenca = await criarLicenca(api, { name: 'Figma Org', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });
    await entregarLicenca(api, licenca.id, { assignedAssetId: maquina.id });

    const aba = await api.get<{ id: string; status: string; license: { name: string } }[]>(`/api/assets/${maquina.id}/licenses`);
    expect(aba.status).toBe(200);
    expect(aba.body).toHaveLength(1);
    expect(aba.body[0]).toMatchObject({ status: 'ATIVA', license: { name: 'Figma Org' } });

    expect((await api.post(`/api/licenses/checkouts/${aba.body[0].id}/checkin`)).status).toBe(200);
    expect((await api.get<unknown[]>(`/api/assets/${maquina.id}/licenses`)).body).toEqual([]);
    expect((await api.post(`/api/assets/${maquina.id}/retire`, { retiredReason: 'VENDIDO' })).status).toBe(200);
  });
});
