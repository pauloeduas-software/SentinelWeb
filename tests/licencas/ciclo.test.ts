import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarColaborador, criarLicenca, diaNoBrasil, entregarLicenca,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// O CICLO DO CONTRATO (AA): encerrar, reabrir, excluir de vez, e o alerta.
//
// Sem lixeira: a licença que ACABOU se encerra e vai para a aba Encerradas —
// mesmo com alguém usando, e então ela fica no alerta. Só a que NUNCA foi
// entregue se exclui de vez: a que já foi tem histórico, e se encerra.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

async function idsDaAba(view: 'atuais' | 'encerradas', q: string): Promise<string[]> {
  const { status, body } = await api.get<{ rows: { id: string }[] }>(
    `/api/licenses?view=${view}&perPage=100&q=${encodeURIComponent(q)}`,
  );
  expect(status).toBe(200);
  return body.rows.map((linha) => linha.id);
}

describe('encerrar', () => {
  it('com alguém usando, encerra, muda de aba e entra no alerta até tudo voltar', async () => {
    const licenca = await criarLicenca(api, { name: 'Encerrar Office 2016', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });
    // A contagem, e não só as linhas: a caixa corta em seis.
    const encerradasEmUso = async () => (await api.get<{ contagem: { ENCERRADA_EM_USO: number } }>('/api/licenses/alerts'))
      .body.contagem.ENCERRADA_EM_USO;
    const antes = await encerradasEmUso();

    const encerrada = await api.post<{ status: string; terminationDate: string; emUso: number }>(
      `/api/licenses/${licenca.id}/terminate`,
    );
    expect(encerrada.status).toBe(200);
    expect(encerrada.body).toMatchObject({ status: 'ENCERRADA', emUso: 1 });
    expect(encerrada.body.terminationDate.slice(0, 10)).toBe(diaNoBrasil(0));

    const motivo = async () => (await api.get<{ rows: { id: string; motivo: string }[] }>('/api/licenses/alerts'))
      .body.rows.find((alerta) => alerta.id === licenca.id)?.motivo;
    expect(await motivo()).toBe('ENCERRADA_EM_USO');
    expect(await encerradasEmUso()).toBe(antes + 1);

    // Encerrada não recebe entrega nova; devolver continua podendo, e tira do alerta.
    expect((await api.post(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: cenario.ana })).status).toBe(409);
    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);
    expect(await motivo()).toBeUndefined();
    expect(await encerradasEmUso()).toBe(antes);

    expect(await idsDaAba('encerradas', 'Encerrar Office 2016')).toEqual([licenca.id]);
    expect(await idsDaAba('atuais', 'Encerrar Office 2016')).toEqual([]);

    // Encerrar duas vezes reescreveria a data do fim.
    expect((await api.post(`/api/licenses/${licenca.id}/terminate`)).status).toBe(409);
  });

  it('com a compra lançada no futuro, encerrar hoje é 422 com as duas datas', async () => {
    const licenca = await criarLicenca(api, { name: 'Compra adiantada', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    expect((await api.put(`/api/licenses/${licenca.id}`, { purchaseDate: diaNoBrasil(5) })).status).toBe(200);

    const encerrar = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/terminate`);
    expect(encerrar.status).toBe(422);
    expect(encerrar.body.error).toMatch(/^O encerramento \(.+\) não pode ser antes da data da compra \(.+\)\.$/);
    expect(await idsDaAba('atuais', 'Compra adiantada')).toEqual([licenca.id]);
  });

  it('apagar a data reabre a licença', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Reabrir Visio', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(-3),
    });
    expect(await idsDaAba('encerradas', 'Reabrir Visio')).toEqual([licenca.id]);

    expect((await api.put(`/api/licenses/${licenca.id}`, { terminationDate: null })).status).toBe(200);
    expect(await idsDaAba('atuais', 'Reabrir Visio')).toEqual([licenca.id]);
  });

  it('pelo formulário segue a mesma regra: a data de hoje passa com alguém usando', async () => {
    const licenca = await criarLicenca(api, { name: 'Encerrar pelo form', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.ana });

    const editada = await api.put<{ status: string }>(`/api/licenses/${licenca.id}`, { terminationDate: diaNoBrasil(0) });
    expect(editada.status).toBe(200);
    expect(editada.body.status).toBe('ENCERRADA');
    expect(await idsDaAba('encerradas', 'Encerrar pelo form')).toEqual([licenca.id]);
  });

  it('a aba Encerradas filtra as que alguém ainda usa — para onde o alerta leva', async () => {
    const emUso = await criarLicenca(api, { name: 'Filtro em uso A', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, emUso.id, { assignedAssetId: cenario.ativo.id });
    await api.post(`/api/licenses/${emUso.id}/terminate`);
    const semUso = await criarLicenca(api, {
      name: 'Filtro em uso B', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(-2),
    });

    expect((await idsDaAba('encerradas', 'Filtro em uso')).sort()).toEqual([emUso.id, semUso.id].sort());
    const { body } = await api.get<{ rows: { id: string }[] }>(
      `/api/licenses?view=encerradas&emUso=sim&q=${encodeURIComponent('Filtro em uso')}`,
    );
    expect(body.rows.map((linha) => linha.id)).toEqual([emUso.id]);
    expect((await api.get('/api/licenses?emUso=talvez')).status).toBe(422);
  });
});

describe('excluir de vez', () => {
  it('a que já foi entregue não se exclui, mesmo devolvida — o 409 manda encerrar', async () => {
    const pessoa = await criarColaborador(api, { name: 'Helena Prado', email: 'helena@teste.local' });
    const licenca = await criarLicenca(api, { name: 'Já entregue', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: pessoa });

    const emUso = await api.delete<{ error: string }>(`/api/licenses/${licenca.id}`);
    expect(emUso.status).toBe(409);
    expect(emUso.body.error).toContain('Encerre-a em vez de excluir');

    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);
    const devolvida = await api.delete<{ error: string }>(`/api/licenses/${licenca.id}`);
    expect(devolvida.status).toBe(409);
    expect(devolvida.body.error).toBe(
      '"Já entregue" já foi entregue e não pode ser excluída: o histórico de quem a usou depende dela. '
      + 'Encerre-a em vez de excluir.',
    );
    // O histórico da pessoa continua com o nome — a licença está lá.
    const historico = await api.get<{ rows: { fonte: string; licenca: { licenseLabel: string } | null }[] }>(
      `/api/people/${pessoa}/history`,
    );
    expect(historico.body.rows.filter((e) => e.fonte === 'LICENCA').map((e) => e.licenca?.licenseLabel))
      .toEqual(['Já entregue', 'Já entregue']);
  });

  it('a resposta diz se já foi entregue — é o que desabilita o Excluir na tela', async () => {
    const licenca = await criarLicenca(api, { name: 'Marca de entregue', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const jaEntregue = async () => {
      const detalhe = await api.get<{ jaEntregue: boolean }>(`/api/licenses/${licenca.id}`);
      const lista = await api.get<{ rows: { id: string; jaEntregue: boolean }[] }>(
        `/api/licenses?q=${encodeURIComponent('Marca de entregue')}`,
      );
      expect(lista.body.rows.find((linha) => linha.id === licenca.id)?.jaEntregue).toBe(detalhe.body.jaEntregue);
      return detalhe.body.jaEntregue;
    };

    expect(await jaEntregue()).toBe(false);
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.ana });
    expect(await jaEntregue()).toBe(true);
    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);
    expect(await jaEntregue()).toBe(true);
  });

  it('a que nunca foi entregue some de verdade', async () => {
    const licenca = await criarLicenca(api, { name: 'Cadastrada errado', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    expect((await api.delete(`/api/licenses/${licenca.id}`)).status).toBe(204);
    expect((await api.get(`/api/licenses/${licenca.id}`)).status).toBe(404);
  });

  it('o banco também recusa: a FK não deixa apagar licença com entrega', async () => {
    const licenca = await criarLicenca(api, { name: 'Rede da FK', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    await entregarLicenca(api, licenca.id, { assignedAssetId: cenario.ativo.id });
    await expect(prisma.$executeRawUnsafe('DELETE FROM licenses WHERE id = $1::uuid', licenca.id))
      .rejects.toThrow(/license_checkouts_licenseId_fkey/);
  });

  it('a excluída solta a categoria e o fabricante', async () => {
    const categoria = await api.post<{ id: string }>('/api/categories', { name: 'Família descartável', type: 'LICENSE' });
    const fabricante = await api.post<{ id: string }>('/api/manufacturers', { name: 'Fabricante descartável' });
    const criada = await api.post<{ id: string }>('/api/licenses', {
      name: 'Licença descartável', categoryId: categoria.body.id, manufacturerId: fabricante.body.id, seatsTotal: 1,
    });
    expect(criada.status).toBe(201);
    expect((await api.delete(`/api/categories/${categoria.body.id}`)).status).toBe(409);

    expect((await api.delete(`/api/licenses/${criada.body.id}`)).status).toBe(204);
    expect((await api.delete(`/api/categories/${categoria.body.id}`)).status).toBe(200);
    expect((await api.delete(`/api/manufacturers/${fabricante.body.id}`)).status).toBe(200);
  });
});

describe('o alerta', () => {
  interface Alerta { id: string; motivo: string }

  // A caixa corta em seis, e os testes de cima deixam encerradas em uso e datas
  // que entram no alerta. Zerado aqui, a ordem deste bloco não depende de
  // quantas sobraram lá.
  beforeAll(async () => {
    await prisma.licenseCheckout.updateMany({ where: { checkinAt: null }, data: { checkinAt: new Date() } });
    await prisma.license.updateMany({ data: { expirationDate: null } });
  });

  it('encerrada em uso primeiro, depois vencidas, depois vencendo — e encerrada sem uso fica fora', async () => {
    const vencendo = await criarLicenca(api, {
      name: 'Alerta vencendo', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(3),
    });
    const vencida = await criarLicenca(api, {
      name: 'Alerta vencida', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(-2),
    });
    const emUso = await criarLicenca(api, {
      name: 'Alerta encerrada em uso', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(5),
    });
    await entregarLicenca(api, emUso.id, { assignedPersonId: cenario.laura });
    // A data chega sozinha: o encerramento passa a ser ontem, com a entrega na rua.
    await prisma.license.update({ where: { id: emUso.id }, data: { terminationDate: new Date(`${diaNoBrasil(-1)}T00:00:00.000Z`) } });
    const encerradaSemUso = await criarLicenca(api, {
      name: 'Alerta encerrada sem uso', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(-1),
    });

    const { status, body } = await api.get<{ total: number; rows: Alerta[] }>('/api/licenses/alerts');
    expect(status).toBe(200);

    const nossas = body.rows.filter((a) => [vencendo.id, vencida.id, emUso.id, encerradaSemUso.id].includes(a.id));
    expect(nossas.map((a) => [a.id, a.motivo])).toEqual([
      [emUso.id, 'ENCERRADA_EM_USO'],
      [vencida.id, 'VENCIDA'],
      [vencendo.id, 'VENCENDO'],
    ]);
    expect(body.total).toBeGreaterThanOrEqual(3);
  });

  it('a contagem de cada motivo bate com o total — e não existe alerta de mínimo', async () => {
    const { body } = await api.get<{ total: number; contagem: Record<string, number> }>('/api/licenses/alerts');
    expect(Object.keys(body).sort()).toEqual(['contagem', 'rows', 'total']);
    expect(Object.keys(body.contagem).sort()).toEqual(['ENCERRADA_EM_USO', 'VENCENDO', 'VENCIDA']);
    expect(Object.values(body.contagem).reduce((soma, n) => soma + n, 0)).toBe(body.total);
  });

  it('a caixa recebe só as seis primeiras; a contagem conta todas', async () => {
    const vencidas = await Promise.all(Array.from({ length: 7 }, (_, i) => criarLicenca(api, {
      name: `Alerta em massa ${i}`, categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(-10 - i),
    })));

    try {
      const { body } = await api.get<{ total: number; contagem: Record<string, number>; rows: Alerta[] }>('/api/licenses/alerts');
      expect(body.rows).toHaveLength(6);
      expect(body.contagem.VENCIDA).toBeGreaterThanOrEqual(7);
      expect(body.total).toBeGreaterThan(body.rows.length);

      // Na ordem de urgência: nenhum motivo reaparece depois do seguinte.
      const urgencia = ['ENCERRADA_EM_USO', 'VENCIDA', 'VENCENDO'];
      const posicoes = body.rows.map((a) => urgencia.indexOf(a.motivo));
      expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    } finally {
      // Nunca entregues, saem de vez: os outros testes do arquivo não herdam as sete.
      for (const licenca of vencidas) await api.delete(`/api/licenses/${licenca.id}`);
    }
  });
});
