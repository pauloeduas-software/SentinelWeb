import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarColaborador, criarLicenca, diaNoBrasil, entregarLicenca,
} from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// O CICLO DO CONTRATO (AA): encerrar, reabrir, excluir de vez, e o alerta.
//
// Sem lixeira: a licença que ACABOU se encerra e fica na lista, encerrada (AF)
// — só com tudo devolvido, o padrão do sistema para o que está em uso. A que
// não está em uso também se exclui de vez (AG).

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/**
 * As licenças da busca de um lado do encerramento. Sem abas (AF): as
 * encerradas vêm pelo filtro `ENCERRADA`, e as outras são as da lista inteira
 * que não têm esse status.
 */
async function idsDaLista(lado: 'encerradas' | 'outras', q: string): Promise<string[]> {
  const filtro = lado === 'encerradas' ? '&status=ENCERRADA' : '';
  const { status, body } = await api.get<{ rows: { id: string; status: string }[] }>(
    `/api/licenses?perPage=100&q=${encodeURIComponent(q)}${filtro}`,
  );
  expect(status).toBe(200);
  return body.rows.filter((linha) => (linha.status === 'ENCERRADA') === (lado === 'encerradas')).map((linha) => linha.id);
}

describe('encerrar', () => {
  it('com entrega aberta é 409; devolvida, encerra e passa a ser encerrada na lista', async () => {
    const licenca = await criarLicenca(api, { name: 'Encerrar Office 2016', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.laura });

    const emUso = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/terminate`);
    expect(emUso.status).toBe(409);
    expect(emUso.body.error).toBe('"Encerrar Office 2016" tem 1 entrega aberta e não pode ser encerrada. Faça a devolução antes.');
    expect(await idsDaLista('outras', 'Encerrar Office 2016')).toEqual([licenca.id]);

    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);
    const encerrada = await api.post<{ status: string; terminationDate: string; emUso: number }>(
      `/api/licenses/${licenca.id}/terminate`,
    );
    expect(encerrada.status).toBe(200);
    expect(encerrada.body).toMatchObject({ status: 'ENCERRADA', emUso: 0 });
    expect(encerrada.body.terminationDate.slice(0, 10)).toBe(diaNoBrasil(0));

    // Encerrada não recebe entrega nova, e a frase manda Reabrir — o botão que a
    // tela tem.
    const nova = await api.post<{ error: string }>(`/api/licenses/${licenca.id}/checkout`, { assignedPersonId: cenario.ana });
    expect(nova.status).toBe(409);
    expect(nova.body.error).toBe('A licença "Encerrar Office 2016" está encerrada e não recebe entrega. Se o contrato voltou, reabra-a antes.');

    expect(await idsDaLista('encerradas', 'Encerrar Office 2016')).toEqual([licenca.id]);
    expect(await idsDaLista('outras', 'Encerrar Office 2016')).toEqual([]);

    // Encerrar duas vezes reescreveria a data do fim.
    expect((await api.post(`/api/licenses/${licenca.id}/terminate`)).status).toBe(409);
  });

  it('a compra e o encerramento não aceitam data futura', async () => {
    const licenca = await criarLicenca(api, { name: 'Compra adiantada', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    const compra = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { purchaseDate: diaNoBrasil(5) });
    expect(compra.status).toBe(422);
    expect(compra.body.error).toContain('data de compra não pode ser uma data futura');
    const fim = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { terminationDate: diaNoBrasil(5) });
    expect(fim.status).toBe(422);
    expect(fim.body.error).toContain('data de encerramento não pode ser uma data futura');
    expect(await idsDaLista('outras', 'Compra adiantada')).toEqual([licenca.id]);
  });

  it('apagar a data reabre a licença', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Reabrir Visio', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(-3),
    });
    expect(await idsDaLista('encerradas', 'Reabrir Visio')).toEqual([licenca.id]);

    expect((await api.put(`/api/licenses/${licenca.id}`, { terminationDate: null })).status).toBe(200);
    expect(await idsDaLista('outras', 'Reabrir Visio')).toEqual([licenca.id]);
  });

  it('pelo formulário segue a mesma regra: com entrega aberta é 409, devolvida passa', async () => {
    const licenca = await criarLicenca(api, { name: 'Encerrar pelo form', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const entrega = await entregarLicenca(api, licenca.id, { assignedPersonId: cenario.ana });

    const emUso = await api.put<{ error: string }>(`/api/licenses/${licenca.id}`, { terminationDate: diaNoBrasil(0) });
    expect(emUso.status).toBe(409);
    expect(emUso.body.error).toMatch(/não pode ser encerrada\. Faça a devolução antes\.$/);

    expect((await api.post(`/api/licenses/checkouts/${entrega.id}/checkin`)).status).toBe(200);
    const editada = await api.put<{ status: string }>(`/api/licenses/${licenca.id}`, { terminationDate: diaNoBrasil(0) });
    expect(editada.status).toBe(200);
    expect(editada.body.status).toBe('ENCERRADA');
    expect(await idsDaLista('encerradas', 'Encerrar pelo form')).toEqual([licenca.id]);
  });

  it('o filtro "ainda em uso" das encerradas não existe mais', async () => {
    expect((await api.get('/api/licenses?status=ENCERRADA&emUso=sim')).status).toBe(422);
  });
});

describe('excluir de vez', () => {
  it('em uso não se exclui — o 409 diz com quem e manda devolver', async () => {
    const pessoa = await criarColaborador(api, { name: 'Helena Prado', email: 'helena@teste.local' });
    const licenca = await criarLicenca(api, { name: 'Em uso', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    await entregarLicenca(api, licenca.id, { assignedPersonId: pessoa });
    await entregarLicenca(api, licenca.id, { assignedAssetId: cenario.ativo.id });

    const emUso = await api.delete<{ error: string }>(`/api/licenses/${licenca.id}`);
    expect(emUso.status).toBe(409);
    expect(emUso.body.error).toMatch(/^"Em uso" ainda tem 2 entregas em uso \(.+ e Helena Prado\)\. Devolva antes de excluir\.$/);
    expect((await api.get(`/api/licenses/${licenca.id}`)).status).toBe(200);
  });

  it('a já entregue e devolvida se exclui (AG): as entregas guardam o nome, perdem a chave, e o histórico continua', async () => {
    const pessoa = await criarColaborador(api, { name: 'Igor Contrato Antigo', email: 'igor.contrato@teste.local' });
    const criada = await api.post<{ id: string }>('/api/licenses', {
      name: 'Contrato que acabou', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      keys: [{ productKey: 'CHAVE-QUE-VAI-JUNTO', seats: 1 }],
    });
    expect(criada.status).toBe(201);
    const licencaId = criada.body.id;
    const [chave] = (await api.get<{ keys: { id: string }[] }>(`/api/licenses/${licencaId}`)).body.keys;
    const entrega = await api.post<{ id: string }>(`/api/licenses/${licencaId}/checkout`, {
      assignedPersonId: pessoa, licenseKeyId: chave.id,
    });
    expect(entrega.status).toBe(201);
    expect((await api.post(`/api/licenses/checkouts/${entrega.body.id}/checkin`)).status).toBe(200);

    expect((await api.delete(`/api/licenses/${licencaId}`)).status).toBe(204);
    expect((await api.get(`/api/licenses/${licencaId}`)).status).toBe(404);
    const linha = await prisma.licenseCheckout.findUniqueOrThrow({ where: { id: entrega.body.id } });
    expect([linha.licenseId, linha.licenseName, linha.licenseKeyId]).toEqual([null, 'Contrato que acabou', null]);
    // As chaves vão junto: o texto da chave não fica em lugar nenhum.
    expect(await prisma.licenseKey.count({ where: { productKey: 'CHAVE-QUE-VAI-JUNTO' } })).toBe(0);

    // O histórico da pessoa continua com o nome, sem a ligação.
    const historico = await api.get<{ rows: { fonte: string; licenca: { licenseId: string | null; licenseLabel: string } | null }[] }>(
      `/api/people/${pessoa}/history`,
    );
    expect(historico.body.rows.filter((e) => e.fonte === 'LICENCA').map((e) => [e.licenca?.licenseLabel, e.licenca?.licenseId]))
      .toEqual([['Contrato que acabou', null], ['Contrato que acabou', null]]);

    // A tela velha que ainda mostrava a entrega recebe o 409 de "já devolvida".
    const devolver = await api.post<{ error: string }>(`/api/licenses/checkouts/${entrega.body.id}/checkin`);
    expect(devolver.status).toBe(409);
    expect(devolver.body.error).toBe('Esta entrega de "Contrato que acabou" para Igor Contrato Antigo já foi devolvida.');
    const trocar = await api.patch<{ error: string }>(`/api/licenses/checkouts/${entrega.body.id}`, { licenseKeyId: chave.id });
    expect(trocar.status).toBe(409);
    expect(trocar.body.error).toBe('Esta entrega de "Contrato que acabou" para Igor Contrato Antigo já foi devolvida: a chave não muda mais.');
  });

  it('a resposta diz se já foi entregue — a licença tem passado', async () => {
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

  it('a que nunca foi entregue também some de verdade', async () => {
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

  // A caixa corta em seis, e os testes de cima deixam datas que entram no
  // alerta. Zerado aqui, a ordem deste bloco não depende de
  // quantas sobraram lá.
  beforeAll(async () => {
    await prisma.licenseCheckout.updateMany({ where: { checkinAt: null }, data: { checkinAt: new Date() } });
    await prisma.license.updateMany({ data: { expirationDate: null } });
  });

  it('vencidas primeiro, depois vencendo — e a encerrada fica fora', async () => {
    const vencendo = await criarLicenca(api, {
      name: 'Alerta vencendo', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(3),
    });
    const vencida = await criarLicenca(api, {
      name: 'Alerta vencida', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(-2),
    });
    const encerrada = await criarLicenca(api, {
      name: 'Alerta encerrada', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: diaNoBrasil(-3), terminationDate: diaNoBrasil(-1),
    });

    const { status, body } = await api.get<{ total: number; rows: Alerta[] }>('/api/licenses/alerts');
    expect(status).toBe(200);

    const nossas = body.rows.filter((a) => [vencendo.id, vencida.id, encerrada.id].includes(a.id));
    expect(nossas.map((a) => [a.id, a.motivo])).toEqual([
      [vencida.id, 'VENCIDA'],
      [vencendo.id, 'VENCENDO'],
    ]);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('a contagem de cada motivo bate com o total — e não existe alerta de mínimo', async () => {
    const { body } = await api.get<{ total: number; contagem: Record<string, number> }>('/api/licenses/alerts');
    expect(Object.keys(body).sort()).toEqual(['contagem', 'rows', 'total']);
    expect(Object.keys(body.contagem).sort()).toEqual(['VENCENDO', 'VENCIDA']);
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
      const urgencia = ['VENCIDA', 'VENCENDO'];
      const posicoes = body.rows.map((a) => urgencia.indexOf(a.motivo));
      expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    } finally {
      // Nunca entregues, saem de vez: os outros testes do arquivo não herdam as sete.
      for (const licenca of vencidas) await api.delete(`/api/licenses/${licenca.id}`);
    }
  });
});
