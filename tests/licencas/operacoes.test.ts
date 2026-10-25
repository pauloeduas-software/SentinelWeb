import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarLicenca, diaNoBrasil, entregarLicenca,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS OPERAÇÕES SOBRE A LICENÇA — a conta, as datas, a entrega e a devolução.
//
// Cada `it` cria a SUA licença e os SEUS alvos quando vai mudá-los: o banco é do
// arquivo inteiro (`setup/each-file.ts`), e um teste que dependesse do anterior
// falharia rodado sozinho com `-t`.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

interface Contagem { seatsTotal: number; emUso: number; livres: number }

async function contas(id: string): Promise<Contagem> {
  const { status, body } = await api.get<Contagem>(`/api/licenses/${id}`);
  expect(status).toBe(200);
  return { seatsTotal: body.seatsTotal, emUso: body.emUso, livres: body.livres };
}

/** Um colaborador novo, com e-mail próprio — para o teste que muda o estado dele. */
async function colaborador(nome: string) {
  return criarColaborador(api, { name: nome, email: `${nome.toLowerCase().replace(/\W+/g, '.')}@teste.local` });
}

async function maquina(name: string) {
  return criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name });
}

describe('a conta: compradas − em uso', () => {
  it('nasce com tudo livre, e cada entrega desconta uma', async () => {
    const licenca = await criarLicenca(api, { name: 'Office 2021', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });
    expect(await contas(licenca.id)).toEqual({ seatsTotal: 3, emUso: 0, livres: 3 });

    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    await entregarLicenca(api, licenca.id, { assignedAssetId: cenario.ativo.id });

    expect(await contas(licenca.id)).toEqual({ seatsTotal: 3, emUso: 2, livres: 1 });
  });

  it('a devolução libera a licença', async () => {
    const licenca = await criarLicenca(api, { name: 'Visio', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });

    const devolucao = await api.post<{ id: string; checkinAt: string | null }>(`/api/licenses/checkouts/${entrega.id}/checkin`);
    expect(devolucao.status).toBe(200);
    expect(devolucao.body).toMatchObject({ id: entrega.id, checkinAt: expect.any(String) });
    expect(await contas(licenca.id)).toEqual({ seatsTotal: 2, emUso: 0, livres: 2 });
  });

  it('não existe reatribuível nem queima: o campo é recusado e não sai na resposta', async () => {
    const recusa = await api.post('/api/licenses', {
      name: 'Windows OEM', categoryId: cenario.categoriaLicencaId, seatsTotal: 2, reassignable: false,
    });
    expect(recusa.status).toBe(422);

    const licenca = await criarLicenca(api, { name: 'Sem queima', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const { body } = await api.get<Record<string, unknown>>(`/api/licenses/${licenca.id}`);
    expect(body).not.toHaveProperty('reassignable');
    expect(body).not.toHaveProperty('queimadas');
  });
});

describe('a quantidade', () => {
  it('aumentar sempre pode', async () => {
    const licenca = await criarLicenca(api, { name: 'Acrobat', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });

    expect((await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 5 })).status).toBe(200);
    expect(await contas(licenca.id)).toEqual({ seatsTotal: 5, emUso: 1, livres: 4 });
  });

  it('reduzir até o que está em uso pode; abaixo disso não, e a frase diz quantas estão em uso', async () => {
    const licenca = await criarLicenca(api, { name: 'Project', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.ana });

    const recusa = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { seatsTotal: 1 });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe('Não dá para reduzir "Project" para 1: 2 estão em uso. Devolva para liberar.');

    expect((await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 2 })).status).toBe(200);
    expect(await contas(licenca.id)).toMatchObject({ seatsTotal: 2, livres: 0 });
  });

  it('o mínimo é 1: zero é 422 no cadastro e na edição', async () => {
    const cadastro = await api.post('/api/licenses', {
      name: 'Contrato vazio', categoryId: cenario.categoriaLicencaId, seatsTotal: 0,
    });
    expect(cadastro.status).toBe(422);

    const licenca = await criarLicenca(api, { name: 'Slack', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    expect((await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 0 })).status).toBe(422);
    expect((await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: 1 })).status).toBe(200);
  });

  it('quantidade nula ou vazia é 422 — nunca vira zero', async () => {
    const licenca = await criarLicenca(api, { name: 'Teams', categoryId: cenario.categoriaLicencaId, seatsTotal: 4 });

    for (const valor of [null, '', '3']) {
      const { status } = await api.put(`/api/licenses/${licenca.id}`, { seatsTotal: valor });
      expect(status, `seatsTotal = ${JSON.stringify(valor)}`).toBe(422);
    }
    expect(await contas(licenca.id)).toMatchObject({ seatsTotal: 4 });
  });

  it('a edição parcial não toca no que não veio', async () => {
    const licenca = await criarLicenca(api, { name: 'Zoom', categoryId: cenario.categoriaLicencaId, seatsTotal: 7 });

    expect((await api.put(`/api/licenses/${licenca.id}`, { notes: 'renovar em março' })).status).toBe(200);
    const { body } = await api.get<{ seatsTotal: number; notes: string; name: string }>(`/api/licenses/${licenca.id}`);
    expect(body).toMatchObject({ seatsTotal: 7, notes: 'renovar em março', name: 'Zoom' });
  });

  it('o nome pode repetir: a renovação convive com o contrato velho', async () => {
    await criarLicenca(api, { name: 'Microsoft 365', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const { status } = await api.post('/api/licenses', {
      name: 'Microsoft 365', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });
    expect(status).toBe(201);
  });
});

describe('as datas não antecedem a compra', () => {
  const base = () => ({ categoryId: cenario.categoriaLicencaId, seatsTotal: 1, purchaseDate: '2026-03-10' });

  it('vencimento ou encerramento antes da compra é 422, com as duas datas na frase', async () => {
    const vencimento = await api.post<{ error: string }>('/api/licenses', {
      ...base(), name: 'Vence antes da compra', expirationDate: '2026-03-05',
    });
    expect(vencimento.status).toBe(422);
    expect(vencimento.body.error).toBe('O vencimento (05/03/2026) não pode ser antes da data da compra (10/03/2026).');

    const encerramento = await api.post<{ error: string }>('/api/licenses', {
      ...base(), name: 'Encerra antes da compra', terminationDate: '2026-03-09',
    });
    expect(encerramento.status).toBe(422);
    expect(encerramento.body.error).toContain('O encerramento (09/03/2026)');
  });

  it('o mesmo dia passa, e o encerramento antes do vencimento também — os dois não se comparam', async () => {
    const { status } = await api.post('/api/licenses', {
      ...base(), name: 'Encerrada antes do fim pago', expirationDate: '2026-12-31', terminationDate: '2026-03-10',
    });
    expect(status).toBe(201);
  });

  it('sem a data da compra, não há o que comparar', async () => {
    const { status } = await api.post('/api/licenses', {
      name: 'Sem data de compra', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: '2020-01-01',
    });
    expect(status).toBe(201);
  });

  it('na edição, a data que não veio é a que está gravada', async () => {
    const criada = await api.post<{ id: string }>('/api/licenses', {
      ...base(), name: 'Compra que anda', expirationDate: '2026-04-10',
    });
    expect(criada.status).toBe(201);

    // Só a compra muda — e passa do vencimento que já estava lá.
    const recusa = await api.put<{ error: string }>(`/api/licenses/${criada.body.id}`, { purchaseDate: '2026-04-20' });
    expect(recusa.status).toBe(422);
    expect(recusa.body.error).toContain('O vencimento (10/04/2026)');

    // Apagar a compra tira a comparação.
    expect((await api.put(`/api/licenses/${criada.body.id}`, { purchaseDate: null })).status).toBe(200);
    expect((await api.put(`/api/licenses/${criada.body.id}`, { expirationDate: '2020-01-01' })).status).toBe(200);
  });
});

describe('a entrega recusa', () => {
  it('sem licença livre — e a frase diz os números', async () => {
    const licenca = await criarLicenca(api, { name: 'Slack única', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });

    const { status, body } = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout`, { assignedPersonId: cenario.ana },
    );
    expect(status).toBe(409);
    expect(body.error).toContain('1 comprada, 1 em uso');
    expect(body.error).toContain('Devolva uma entrega ou aumente');
  });

  it('o mesmo alvo duas vezes', async () => {
    const licenca = await criarLicenca(api, { name: 'Notion', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });
    await entregarLicenca(api, licenca.id, { assignedAssetId: cenario.ativo.id });

    const { status, body } = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout`, { assignedAssetId: cenario.ativo.id },
    );
    expect(status).toBe(409);
    expect(body.error).toContain('já está com "Notion"');
  });

  it('dois alvos ou nenhum é 422; posto não é campo', async () => {
    const licenca = await criarLicenca(api, { name: 'Jira', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });
    const url = `/api/licenses/${licenca.id}/checkout`;

    expect((await api.post(url, { assignedPersonId: cenario.laura, assignedAssetId: cenario.ativo.id })).status).toBe(422);
    expect((await api.post(url, {})).status).toBe(422);
    expect((await api.post(url, { assignedWorkstationId: cenario.mesa1 })).status).toBe(422);
  });

  it('licença vencida e licença encerrada; vencendo entrega', async () => {
    const vencida = await criarLicenca(api, {
      name: 'Vencida ontem', categoryId: cenario.categoriaLicencaId, seatsTotal: 5, expirationDate: diaNoBrasil(-1),
    });
    const encerrada = await criarLicenca(api, {
      name: 'Encerrada ontem', categoryId: cenario.categoriaLicencaId, seatsTotal: 5, terminationDate: diaNoBrasil(-1),
    });
    const vencendo = await criarLicenca(api, {
      name: 'Vence em 5 dias', categoryId: cenario.categoriaLicencaId, seatsTotal: 5, expirationDate: diaNoBrasil(5),
    });
    const alvo = { assignedPersonId: cenario.laura };

    const r1 = await api.post<{ error: string }>(`/api/licenses/${vencida.id}/checkout`, alvo);
    expect(r1.status).toBe(409);
    expect(r1.body.error).toContain('venceu há 1 dia');

    const r2 = await api.post<{ error: string }>(`/api/licenses/${encerrada.id}/checkout`, alvo);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('ENCERRADA');

    expect((await api.post(`/api/licenses/${vencendo.id}/checkout`, alvo)).status).toBe(201);
  });

  it('ativo baixado é 409; ativo na lixeira é 404', async () => {
    const licenca = await criarLicenca(api, { name: 'Antivírus', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });
    const baixado = await maquina('Vendido');
    const apagado = await maquina('Apagado');
    expect((await api.post(`/api/assets/${baixado.id}/retire`, { retiredReason: 'VENDIDO' })).status).toBe(200);
    expect((await api.delete(`/api/assets/${apagado.id}`)).status).toBe(200);

    const r1 = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/checkout`, { assignedAssetId: baixado.id });
    expect(r1.status).toBe(409);
    expect(r1.body.error).toContain('teve baixa');

    expect((await api.post(`/api/licenses/${licenca.id}/checkout`, { assignedAssetId: apagado.id })).status).toBe(404);
  });

  it('colaborador desativado é 409; na lixeira é 404', async () => {
    const licenca = await criarLicenca(api, { name: 'Canva', categoryId: cenario.categoriaLicencaId, seatsTotal: 5 });
    const desativado = await colaborador('Felipe Rocha');
    const apagado = await colaborador('Gustavo Lixeira');
    expect((await api.put(`/api/people/${desativado}`, { isActive: false })).status).toBe(200);
    expect((await api.delete(`/api/people/${apagado}`)).status).toBe(200);

    const r1 = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: desativado });
    expect(r1.status).toBe(409);
    expect(r1.body.error).toContain('desativado');

    expect((await api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: apagado })).status).toBe(404);
  });
});

describe('a data da entrega e da devolução', () => {
  it('a entrega aceita um dia passado; futura é 422', async () => {
    const licenca = await criarLicenca(api, { name: 'Entrega antiga', categoryId: cenario.categoriaLicencaId, seatsTotal: 3 });
    const antiga = await api.post<{ checkoutAt: string }>(`/api/licenses/${licenca.id}/checkout`, {
      assignedPersonId: cenario.laura, checkoutAt: diaNoBrasil(-10),
    });
    expect(antiga.status).toBe(201);
    // Meio-dia de Brasília: lido no fuso de quem usa, continua sendo aquele dia.
    expect(antiga.body.checkoutAt).toBe(`${diaNoBrasil(-10)}T15:00:00.000Z`);

    const futura = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/checkout`, {
      assignedPersonId: cenario.ana, checkoutAt: diaNoBrasil(1),
    });
    expect(futura.status).toBe(422);
    expect(futura.body.error).toContain('não pode ser uma data futura');
  });

  it('a devolução aceita um dia passado, mas nunca futuro nem antes da entrega', async () => {
    const licenca = await criarLicenca(api, { name: 'Devolução antiga', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const entrega = await api.post<{ id: string }>(`/api/licenses/${licenca.id}/checkout`, {
      assignedPersonId: cenario.laura, checkoutAt: diaNoBrasil(-10),
    });
    const devolver = (checkinAt: string) =>
      api.post<{ error: string; checkinAt: string }>(`/api/licenses/checkouts/${entrega.body.id}/checkin`, { checkinAt });

    expect((await devolver(diaNoBrasil(1))).status).toBe(422);

    const antes = await devolver(diaNoBrasil(-11));
    expect(antes.status).toBe(422);
    expect(antes.body.error).toMatch(/^A devolução \(.+\) não pode ser antes da entrega \(.+\)\.$/);

    const passada = await devolver(diaNoBrasil(-3));
    expect(passada.status).toBe(200);
    expect(passada.body.checkinAt).toBe(`${diaNoBrasil(-3)}T15:00:00.000Z`);
    expect(await contas(licenca.id)).toMatchObject({ emUso: 0, livres: 1 });
  });

  it('no mesmo dia, a devolução nunca fica antes da hora real da entrega', async () => {
    // A entrega das 23h de ontem: o meio-dia de ontem cairia antes dela.
    const licenca = await criarLicenca(api, { name: 'Entrega da noite', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    const dasOnzeDaNoite = new Date(`${diaNoBrasil(0)}T02:00:00.000Z`); // 23h de ontem em Brasília
    await prisma.licenseCheckout.update({ where: { id: entrega.id }, data: { checkoutAt: dasOnzeDaNoite } });

    const devolvida = await api.post<{ checkinAt: string }>(
      `/api/licenses/checkouts/${entrega.id}/checkin`, { checkinAt: diaNoBrasil(-1) },
    );
    expect(devolvida.status).toBe(200);
    expect(devolvida.body.checkinAt).toBe(dasOnzeDaNoite.toISOString());
  });

  it('sem corpo, a devolução é hoje — e campo desconhecido é 422', async () => {
    const licenca = await criarLicenca(api, { name: 'Devolução de hoje', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`, { notes: 'x' })).status).toBe(422);

    const hoje = await api.post<{ checkinAt: string }>(`/api/licenses/checkouts/${entrega.id}/checkin`);
    expect(hoje.status).toBe(200);
    expect(hoje.body.checkinAt.slice(0, 10) >= diaNoBrasil(-1)).toBe(true);
  });
});

describe('a devolução', () => {
  it('é pela ENTREGA: a já devolvida é 409, e a inexistente 404', async () => {
    const licenca = await criarLicenca(api, { name: 'Figma', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });

    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);

    const segunda = await api.post<{ error: string }>(`/api/licenses/checkouts/${entrega.id}/checkin`);
    expect(segunda.status).toBe(409);
    expect(segunda.body.error).toContain('já foi devolvida');

    expect((await api.post('/api/licenses/checkouts/00000000-0000-4000-8000-000000000000/checkin')).status).toBe(404);
  });

  it('a tela velha não devolve quem recebeu depois', async () => {
    // O defeito da devolução pela VAGA: a tela via Laura na vaga 3, outra aba
    // devolvia e entregava a Ana, e o clique velho devolvia a Ana. Pela
    // entrega, o clique velho só encontra a entrega da Laura, já fechada.
    const licenca = await criarLicenca(api, { name: 'Photoshop', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const daLaura = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    expect((await api.post(`/api/licenses/checkouts/${daLaura.id}/checkin`)).status).toBe(200);
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.ana });

    expect((await api.post(`/api/licenses/checkouts/${daLaura.id}/checkin`)).status).toBe(409);
    expect(await contas(licenca.id)).toMatchObject({ emUso: 1 });
  });
});
