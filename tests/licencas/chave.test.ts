import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarColaborador, criarLicenca, diaNoBrasil } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
// A função PURA que a tela usa para esconder a chave: o teste prova o que o
// operador VÊ antes de "Mostrar".
import { esconderChave } from '../../src/pages/licencas/helpers/licenca.helper';

// AS CHAVES DE PRODUTO (AC): a lista da licença — cada chave com quantas
// licenças cobre — e a escolha de uma delas em cada entrega. Só o DETALHE as
// devolve; a listagem, a busca, o alerta, a aba do ativo, a ficha e os
// históricos, nunca.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

interface Chave { id: string; productKey: string; seats: number; emUso: number; jaEntregue: boolean }
interface Detalhe { id: string; keys: Chave[] }
interface Entrega { id: string; licenseKeyId?: string | null; licenseKey?: { productKey: string } | null }

async function cadastrar(name: string, seatsTotal: number, keys: { productKey: string; seats: number }[]) {
  const criada = await api.post<{ id: string; error: string }>('/api/licenses', {
    name, categoryId: cenario.categoriaLicencaId, seatsTotal, keys,
  });
  expect(criada.status, criada.body.error).toBe(201);
  return criada.body.id;
}

async function chavesDe(licenseId: string): Promise<Chave[]> {
  return (await api.get<Detalhe>(`/api/licenses/${licenseId}`)).body.keys;
}

async function entregar(licenseId: string, alvo: object, licenseKeyId?: string) {
  return api.post<Entrega & { error: string }>(`/api/licenses/${licenseId}/checkout`, { ...alvo, licenseKeyId });
}

describe('a lista de chaves da licença', () => {
  it('guarda a ordem digitada e quanto cada uma cobre; só o detalhe a devolve', async () => {
    const id = await cadastrar('Office com chaves', 5, [
      { productKey: 'ZZZZZ-11111', seats: 1 },
      { productKey: 'AAAAA-22222', seats: 3 },
    ]);

    const chaves = await chavesDe(id);
    expect(chaves.map(({ productKey, seats, emUso, jaEntregue }) => ({ productKey, seats, emUso, jaEntregue }))).toEqual([
      { productKey: 'ZZZZZ-11111', seats: 1, emUso: 0, jaEntregue: false },
      { productKey: 'AAAAA-22222', seats: 3, emUso: 0, jaEntregue: false },
    ]);

    const lista = await api.get<{ rows: Record<string, unknown>[] }>('/api/licenses?q=Office com chaves');
    expect(lista.body.rows).toHaveLength(1);
    expect(JSON.stringify(lista.body.rows[0])).not.toContain('ZZZZZ');
    // A busca não varre as chaves.
    expect((await api.get<{ total: number }>('/api/licenses?q=AAAAA-22222')).body.total).toBe(0);
  });

  it('as chaves não cobrem mais do que foi comprado, nem repetem, nem têm duas linhas', async () => {
    const demais = await api.post<{ error: string }>('/api/licenses', {
      name: 'Chaves demais', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
      keys: [{ productKey: 'K-1', seats: 2 }, { productKey: 'K-2', seats: 2 }],
    });
    expect(demais.status).toBe(422);
    expect(demais.body.error).toBe(
      'As chaves cobrem 4, mais do que 3 compradas em "Chaves demais". '
      + 'Aumente a quantidade comprada ou diminua o que as chaves cobrem.',
    );

    const repetida = await api.post<{ error: string }>('/api/licenses', {
      name: 'Chave repetida', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
      keys: [{ productKey: 'K-1', seats: 1 }, { productKey: ' K-1 ', seats: 1 }],
    });
    expect(repetida.status).toBe(422);
    expect(repetida.body.error).toBe('A mesma chave aparece duas vezes na lista.');

    // Só a maiúscula muda: é a mesma chave, e contaria a mesma compra duas vezes.
    const outraCaixa = await api.post<{ error: string }>('/api/licenses', {
      name: 'Chave em outra caixa', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
      keys: [{ productKey: 'abcd-1234', seats: 1 }, { productKey: 'ABCD-1234', seats: 1 }],
    });
    expect(outraCaixa.status).toBe(422);
    expect(outraCaixa.body.error).toBe('A mesma chave aparece duas vezes na lista.');

    for (const keys of [
      [{ productKey: 'ABC\nDEF', seats: 1 }],
      [{ productKey: '   ', seats: 1 }],
      [{ productKey: 'K-1', seats: 0 }],
      [{ productKey: 'K-1', seats: 1, emUso: 0 }],
    ]) {
      const resposta = await api.post('/api/licenses', {
        name: 'Chave inválida', categoryId: cenario.categoriaLicencaId, seatsTotal: 3, keys,
      });
      expect(resposta.status, JSON.stringify(keys)).toBe(422);
    }
  });

  it('a edição inclui, corrige e tira; a chave já entregue não sai e não cobre menos do que está com ela', async () => {
    const id = await cadastrar('Edição das chaves', 4, [
      { productKey: 'ED-1', seats: 1 },
      { productKey: 'ED-2', seats: 2 },
    ]);
    const [primeira, segunda] = await chavesDe(id);
    expect((await entregar(id, { assignedPersonId: cenario.laura }, segunda.id)).status).toBe(201);
    expect((await entregar(id, { assignedPersonId: cenario.ana }, segunda.id)).status).toBe(201);

    // A que já foi entregue não sai da lista.
    const tirarEntregue = await api.put<{ error: string }>(`/api/licenses/${id}`, {
      keys: [{ id: primeira.id, productKey: 'ED-1', seats: 1 }],
    });
    expect(tirarEntregue.status).toBe(409);
    expect(tirarEntregue.body.error).toBe(
      'Uma chave que já foi entregue não sai da lista: o histórico de quem a usou depende dela.',
    );

    // Não cobre menos do que as duas entregas abertas com ela.
    const encolher = await api.put<{ error: string }>(`/api/licenses/${id}`, {
      keys: [{ id: primeira.id, productKey: 'ED-1', seats: 1 }, { id: segunda.id, productKey: 'ED-2', seats: 1 }],
    });
    expect(encolher.status).toBe(409);
    expect(encolher.body.error).toBe(
      'Uma chave não cobre menos do que as entregas abertas com ela: 2 estão com ela. Devolva para liberar.',
    );

    // Corrige o texto da entregue, tira a nunca entregue e inclui uma nova, que vai para o fim.
    const editada = await api.put(`/api/licenses/${id}`, {
      keys: [{ id: segunda.id, productKey: 'ED-2-CORRIGIDA', seats: 2 }, { productKey: 'ED-3', seats: 1 }],
    });
    expect(editada.status).toBe(200);
    expect((await chavesDe(id)).map((chave) => [chave.productKey, chave.seats, chave.emUso])).toEqual([
      ['ED-2-CORRIGIDA', 2, 2],
      ['ED-3', 1, 0],
    ]);

    // A correção vale para as entregas da chave.
    const comQuem = await api.get<{ rows: Entrega[] }>(`/api/licenses/${id}/checkouts`);
    expect(comQuem.body.rows.map((entrega) => entrega.licenseKey?.productKey)).toEqual(['ED-2-CORRIGIDA', 'ED-2-CORRIGIDA']);

    // Sem `keys` no corpo, a lista fica como está.
    expect((await api.put(`/api/licenses/${id}`, { notes: 'só a nota' })).status).toBe(200);
    expect(await chavesDe(id)).toHaveLength(2);

    // A chave de outra licença não entra pela edição.
    const outra = await cadastrar('Outra licença', 1, [{ productKey: 'OUTRA-1', seats: 1 }]);
    const [daOutra] = await chavesDe(outra);
    const alheia = await api.put<{ error: string }>(`/api/licenses/${id}`, {
      keys: [{ id: daOutra.id, productKey: 'OUTRA-1', seats: 1 }],
    });
    expect(alheia.status).toBe(404);
    expect(alheia.body.error).toBe('Chave não encontrada nesta licença.');
  });

  it('a correção que troca ou desloca o texto entre chaves passa — o índice único só vê o fim', async () => {
    const id = await cadastrar('Troca de texto', 3, [
      { productKey: 'TT-A', seats: 1 },
      { productKey: 'TT-B', seats: 1 },
      { productKey: 'TT-C', seats: 1 },
    ]);
    const [a, b, c] = await chavesDe(id);

    const troca = await api.put<{ error: string }>(`/api/licenses/${id}`, {
      keys: [{ id: a.id, productKey: 'TT-B', seats: 1 }, { id: b.id, productKey: 'TT-A', seats: 1 }, { id: c.id, productKey: 'TT-C', seats: 1 }],
    });
    expect(troca.status, troca.body.error).toBe(200);

    const desloca = await api.put<{ error: string }>(`/api/licenses/${id}`, {
      keys: [{ id: a.id, productKey: 'TT-C', seats: 1 }, { id: b.id, productKey: 'TT-D', seats: 1 }, { id: c.id, productKey: 'TT-B', seats: 1 }],
    });
    expect(desloca.status, desloca.body.error).toBe(200);
    expect((await chavesDe(id)).map((chave) => [chave.id, chave.productKey])).toEqual([
      [a.id, 'TT-C'], [b.id, 'TT-D'], [c.id, 'TT-B'],
    ]);
  });

  it('a quantidade não desce abaixo do que as chaves cobrem', async () => {
    const id = await cadastrar('Piso das chaves', 5, [{ productKey: 'PISO-1', seats: 4 }]);

    const reduzir = await api.put<{ error: string }>(`/api/licenses/${id}`, { seatsTotal: 3 });
    expect(reduzir.status).toBe(409);
    expect(reduzir.body.error).toBe(
      'Não dá para reduzir "Piso das chaves" para 3: as chaves cobrem 4. Tire uma chave ou diminua o que ela cobre antes.',
    );

    // Com a lista nova no mesmo corpo, a conta é contra ela.
    const junto = await api.put(`/api/licenses/${id}`, {
      seatsTotal: 3, keys: [{ id: (await chavesDe(id))[0].id, productKey: 'PISO-1', seats: 3 }],
    });
    expect(junto.status).toBe(200);
  });
});

describe('a chave da entrega', () => {
  it('a licença com chaves pede uma, e cada chave vai a tantas entregas quanto cobre', async () => {
    const id = await cadastrar('Entrega com chave', 4, [
      { productKey: 'IND-1', seats: 1 },
      { productKey: 'VOL-1', seats: 2 },
    ]);
    const [individual, volume] = await chavesDe(id);
    const pessoa = await criarColaborador(api, { name: 'Recebe Chave', email: 'recebe@chave.local' });

    const semChave = await entregar(id, { assignedPersonId: cenario.laura });
    expect(semChave.status).toBe(422);
    expect(semChave.body.error).toBe('Escolha a chave desta entrega: "Entrega com chave" tem chaves cadastradas.');

    const daLaura = await entregar(id, { assignedPersonId: cenario.laura }, individual.id);
    expect(daLaura.status).toBe(201);

    const repetida = await entregar(id, { assignedPersonId: cenario.ana }, individual.id);
    expect(repetida.status).toBe(409);
    expect(repetida.body.error).toBe('Esta chave já está em outra entrega aberta de "Entrega com chave". Escolha outra.');

    // A de volume cobre duas.
    expect((await entregar(id, { assignedPersonId: cenario.ana }, volume.id)).status).toBe(201);
    expect((await entregar(id, { assignedAssetId: cenario.ativo.id }, volume.id)).status).toBe(201);
    const cheia = await entregar(id, { assignedPersonId: pessoa }, volume.id);
    expect(cheia.status).toBe(409);
    expect(cheia.body.error).toBe('Esta chave de "Entrega com chave" cobre 2, e as 2 estão em uso. Escolha outra.');

    // As chaves cobrem 3 de 4: a quarta licença está livre, mas sem chave.
    const acabaram = await entregar(id, { assignedPersonId: pessoa });
    expect(acabaram.status).toBe(409);
    expect(acabaram.body.error).toBe(
      'Todas as chaves de "Entrega com chave" estão em uso. Cadastre a chave da próxima licença, em Editar, antes de entregar.',
    );

    // Devolvida, a chave volta a ter lugar.
    await api.post(`/api/licenses/checkouts/${daLaura.body.id}/checkin`);
    expect((await entregar(id, { assignedPersonId: pessoa }, individual.id)).status).toBe(201);

    const uso = await chavesDe(id);
    expect(uso.map((chave) => [chave.emUso, chave.jaEntregue])).toEqual([[1, true], [2, true]]);

    // A chave de outra licença, ou uma que não existe, é 404.
    const outra = await cadastrar('Dona da chave', 1, [{ productKey: 'ALHEIA-1', seats: 1 }]);
    const [alheia] = await chavesDe(outra);
    const livre = await cadastrar('Sem chave alheia', 1, [{ productKey: 'PROPRIA-1', seats: 1 }]);
    const comAlheia = await entregar(livre, { assignedPersonId: cenario.laura }, alheia.id);
    expect(comAlheia.status).toBe(404);
    expect(comAlheia.body.error).toBe('Chave não encontrada nesta licença.');
  });

  it('sem licença livre, a frase é a da quantidade, e não a das chaves', async () => {
    const id = await cadastrar('Cheia com chave', 1, [{ productKey: 'CHEIA-1', seats: 1 }]);
    const [chave] = await chavesDe(id);
    expect((await entregar(id, { assignedPersonId: cenario.laura }, chave.id)).status).toBe(201);

    const resposta = await entregar(id, { assignedPersonId: cenario.ana }, chave.id);
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toContain('Sem licença livre em "Cheia com chave"');
  });

  it('a licença sem chave entrega sem chave, e recusa uma', async () => {
    const licenca = await criarLicenca(api, { name: 'Assinatura sem chave', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    expect((await entregar(licenca.id, { assignedPersonId: cenario.laura })).status).toBe(201);
    const comChave = await entregar(licenca.id, { assignedPersonId: cenario.ana }, '00000000-0000-4000-8000-000000000000');
    expect(comChave.status).toBe(404);
  });

  it('o "Com quem está" traz a chave; aba do ativo, ficha, alerta e históricos, não', async () => {
    const pessoa = await criarColaborador(api, { name: 'Rita Chaves', email: 'rita@chave.local' });
    // Vence hoje, para estar no alerta.
    const criada = await api.post<{ id: string }>('/api/licenses', {
      name: 'Chave escondida', categoryId: cenario.categoriaLicencaId, seatsTotal: 2, expirationDate: diaNoBrasil(0),
      keys: [{ productKey: 'SEGREDO-PESSOA', seats: 1 }, { productKey: 'SEGREDO-ATIVO', seats: 1 }],
    });
    const id = criada.body.id;
    const [daPessoa, doAtivo] = await chavesDe(id);
    await entregar(id, { assignedPersonId: pessoa }, daPessoa.id);
    await entregar(id, { assignedAssetId: cenario.ativo.id }, doAtivo.id);

    const alerta = await api.get<{ rows: { id: string }[] }>('/api/licenses/alerts');
    expect(alerta.body.rows.map((linha) => linha.id)).toContain(id);

    const comQuem = await api.get<{ rows: Entrega[] }>(`/api/licenses/${id}/checkouts`);
    expect(comQuem.body.rows.map((e) => e.licenseKey?.productKey).sort()).toEqual(['SEGREDO-ATIVO', 'SEGREDO-PESSOA']);

    for (const url of [
      `/api/assets/${cenario.ativo.id}/licenses`,
      `/api/people/${pessoa}`,
      `/api/people/${pessoa}/history`,
      `/api/assets/${cenario.ativo.id}/history`,
      `/api/licenses/${id}/history`,
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
  it('troca por outra com lugar; a cheia é 409, a devolvida é 409, e sem chave é 422', async () => {
    const id = await cadastrar('Troca de chave', 3, [
      { productKey: 'TROCA-1', seats: 1 },
      { productKey: 'TROCA-2', seats: 1 },
      { productKey: 'TROCA-3', seats: 1 },
    ]);
    const [um, dois, tres] = await chavesDe(id);
    const daLaura = await entregar(id, { assignedPersonId: cenario.laura }, um.id);
    const daAna = await entregar(id, { assignedPersonId: cenario.ana }, dois.id);

    const trocada = await api.patch<Entrega>(`/api/licenses/checkouts/${daLaura.body.id}`, { licenseKeyId: tres.id });
    expect(trocada.status).toBe(200);
    expect(trocada.body.licenseKeyId).toBe(tres.id);
    expect(trocada.body.licenseKey?.productKey).toBe('TROCA-3');

    // A mesma chave de novo não disputa lugar consigo mesma.
    expect((await api.patch(`/api/licenses/checkouts/${daLaura.body.id}`, { licenseKeyId: tres.id })).status).toBe(200);

    const cheia = await api.patch<{ error: string }>(`/api/licenses/checkouts/${daLaura.body.id}`, { licenseKeyId: dois.id });
    expect(cheia.status).toBe(409);

    // Outro campo da entrega não muda por aqui, e sem chave não há o que trocar.
    expect((await api.patch(`/api/licenses/checkouts/${daLaura.body.id}`, { notes: 'x' })).status).toBe(422);
    expect((await api.patch(`/api/licenses/checkouts/${daLaura.body.id}`, {})).status).toBe(422);
    expect((await api.patch(`/api/licenses/checkouts/${daLaura.body.id}`, { licenseKeyId: null })).status).toBe(422);

    await api.post(`/api/licenses/checkouts/${daAna.body.id}/checkin`);
    const devolvida = await api.patch<{ error: string }>(`/api/licenses/checkouts/${daAna.body.id}`, { licenseKeyId: um.id });
    expect(devolvida.status).toBe(409);
    expect(devolvida.body.error).toContain('já foi devolvida');

    expect((await api.patch('/api/licenses/checkouts/00000000-0000-4000-8000-000000000000', { licenseKeyId: um.id })).status).toBe(404);
  });

  it('a entrega feita antes de a licença ter chaves ganha a sua pela troca', async () => {
    const licenca = await criarLicenca(api, { name: 'Chaves depois', categoryId: cenario.categoriaLicencaId, seatsTotal: 2 });
    const antes = await entregar(licenca.id, { assignedPersonId: cenario.laura });
    expect(antes.status).toBe(201);

    expect((await api.put(`/api/licenses/${licenca.id}`, { keys: [{ productKey: 'DEPOIS-1', seats: 2 }] })).status).toBe(200);
    const [chave] = await chavesDe(licenca.id);

    const ganhou = await api.patch<Entrega>(`/api/licenses/checkouts/${antes.body.id}`, { licenseKeyId: chave.id });
    expect(ganhou.status).toBe(200);
    expect(ganhou.body.licenseKeyId).toBe(chave.id);
  });
});

describe('excluir a licença nunca entregue', () => {
  it('leva as chaves junto', async () => {
    const id = await cadastrar('Cadastro errado com chave', 2, [{ productKey: 'ERRADA-1', seats: 2 }]);
    expect((await api.delete(`/api/licenses/${id}`)).status).toBe(204);
    expect(await prisma.licenseKey.count({ where: { licenseId: id } })).toBe(0);
  });
});

describe('a chave escondida na tela', () => {
  it('mostra o começo de cada linha e esconde o resto', () => {
    expect(esconderChave('ABCDE-FGHIJ-KLMNO-PQRST-UVWXY')).toBe('ABCDE-FGHIJ-•••••-•••••-•••••');
    expect(esconderChave('XXXX-YYYY')).toBe('XXXX-••••');
    expect(esconderChave('ABCDEFGHIJKL')).toBe('ABCD••••••••');
    expect(esconderChave('AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF')).toBe('AAAA-BBBB-••••\nDDDD-EEEE-••••');
    // O hífen no fim ou perto dele não deixa o primeiro grupo à mostra inteiro.
    expect(esconderChave('ABCDEFGHIJKLMNOPQRSTUVWXY-')).toBe(`ABCD${'•'.repeat(22)}`);
    expect(esconderChave('ABCDEFGHIJKLMNOPQRSTUVWXY-Z')).toBe(`ABCD${'•'.repeat(23)}`);
    expect(esconderChave('Senha: Abc-123')).toBe(`Senh${'•'.repeat(10)}`);
    expect(esconderChave('AAAA-BBBB-CCCC\n\nDDDD-EEEE-FFFF')).toBe('AAAA-BBBB-••••\n\nDDDD-EEEE-••••');
  });
});
