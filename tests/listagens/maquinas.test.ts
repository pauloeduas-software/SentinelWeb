import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ OS FILTROS DA LISTAGEM DE MÁQUINAS, PELO CAMINHO DO HTTP.
//
// Este arquivo nasceu de um 422 em requisição válida: o filtro de vínculo, hoje
// `?vista=`, respondia *campo não reconhecido*. Ele existia no
// `buildEndpointWhere`, estava tipado no use-case e era INALCANÇÁVEL pela borda.
//
// A causa: a query tem dois donos. `parseListQuery` (do `core`) é `strictObject`
// e recusa toda chave que não conhece; o schema do domínio lê a mesma query. Os
// dois recebiam a query inteira, e o primeiro barrava o que era do segundo.
//
// O `workstation.controller.ts` já tinha exatamente este trecho, com um
// comentário explicando o motivo — refez-se o erro em vez de copiar a solução.
// É por isso que o teste entra pela ROTA: chamar `listEndpoints()` direto
// passaria com o defeito de pé, porque o defeito é da borda.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId,
    fabricanteId: await criarFabricante(api),
  });
});

afterAll(async () => {
  await api.fechar();
});

interface Maquina {
  id: string;
  hostname: string;
  asset: { id: string; assetTag: string; name: string | null } | null;
}

const listar = (query: string) => api.get<{ total: number; rows: Maquina[] }>(`/api/endpoints${query}`);

/** Uma máquina de verdade, pelo WebSocket de verdade (D99). */
async function maquina(hwid: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  return endpoint.id;
}

describe('as vistas', () => {
  it('⚠️ responde 200, e não 422 por "campo não reconhecido"', async () => {
    // A asserção que o defeito quebrava. Ela vem primeiro e sozinha de propósito:
    // se ela falhar, nenhuma das outras significa nada.
    const { status } = await listar('?vista=sem');
    expect(status).toBe(200);
  });

  it('separa quem tem ativo de quem não tem', async () => {
    const semCadastro = await maquina('lista-orfa');
    const comCadastro = await maquina('lista-vinculada');

    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Ativo da listagem' });
    await api.post(`/api/endpoints/${comCadastro}/link`, { assetId: ativo.id });

    const sem = await listar('?vista=sem');
    expect(sem.body.rows.map((linha) => linha.id)).toContain(semCadastro);
    expect(sem.body.rows.map((linha) => linha.id)).not.toContain(comCadastro);

    const com = await listar('?vista=com');
    expect(com.body.rows.map((linha) => linha.id)).toContain(comCadastro);
    expect(com.body.rows.map((linha) => linha.id)).not.toContain(semCadastro);

    // O ATIVO VEM NA LINHA, e não só o `assetId`: a lista de máquinas
    // vinculadas mostra a etiqueta e a série, e um uuid não é coluna que alguém leia.
    // `null` (e não ausente) na máquina sem vínculo: é "não tem", não "a tela
    // não sabe" — `toBeNull` recusa `undefined`.
    const vinculada = com.body.rows.find((linha) => linha.id === comCadastro);
    expect(vinculada?.asset).toEqual({ id: ativo.id, assetTag: ativo.assetTag, name: 'Ativo da listagem', serial: null });
    expect(sem.body.rows.find((linha) => linha.id === semCadastro)?.asset).toBeNull();

    // E o total sem filtro é a soma das três: um filtro que não fecha a conta
    // está escondendo linha.
    const sumidos = await listar('?vista=sumidos');
    const tudo = await listar('');
    expect(tudo.body.total).toBe(sem.body.total + com.body.total + sumidos.body.total);
  });

  it('a sumida sai de Com e de Sem e vai para Sumidos, com computador ou sem, e o painel conta as mesmas (DD)', async () => {
    const semComputador = await maquina('lista-sumida-orfa');
    const comComputador = await maquina('lista-sumida-vinculada');
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Ativo da máquina sumida' });
    await api.post(`/api/endpoints/${comComputador}/link`, { assetId: ativo.id });

    // 31 dias sem contato: o prazo é 30, fixo.
    const ha31Dias = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.endpoint.updateMany({ where: { id: { in: [semComputador, comComputador] } }, data: { lastSeen: ha31Dias } });

    const ids = async (query: string) => (await listar(query)).body.rows.map((linha) => linha.id);
    expect(await ids('?vista=sumidos')).toEqual(expect.arrayContaining([semComputador, comComputador]));
    expect(await ids('?vista=com')).not.toContain(comComputador);
    expect(await ids('?vista=sem')).not.toContain(semComputador);

    const { body } = await api.get<{ sumidos: number }>('/api/reconciliation/coverage');
    expect(body.sumidos).toBe((await listar('?vista=sumidos')).body.total);
  });

  it('convive com paginação e busca na MESMA query', async () => {
    // O caso que o defeito tornava impossível: as chaves dos dois donos juntas.
    // Com a query entregue inteira aos dois schemas, isto dava 422 de um lado ou
    // de outro, dependendo de qual parse rodasse primeiro.
    const { status, body } = await listar('?vista=sem&page=1&perPage=10&q=lista');
    expect(status).toBe(200);
    expect(body.rows.every((linha) => linha.asset === null)).toBe(true);
  });
});

describe('o que a listagem continua recusando', () => {
  it('chave desconhecida é 422, dos dois lados', async () => {
    // A estreiteza não foi trocada por permissividade: separar a query por dono
    // deixou os DOIS schemas estritos. Typo em chave de paginação e typo em
    // chave de domínio param na borda.
    expect((await listar('?pag=2')).status).toBe(422);
    // A ordenação saiu da API: `?sort=` é chave desconhecida como qualquer outra.
    expect((await listar('?sort=hostname')).status).toBe(422);
    expect((await listar('?vistaa=sem')).status).toBe(422);
    expect((await listar('?vista=todas')).status).toBe(422);
  });
});
