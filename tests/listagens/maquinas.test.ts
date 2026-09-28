import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ OS FILTROS DA LISTAGEM DE MÁQUINAS, PELO CAMINHO DO HTTP.
//
// Este arquivo nasceu de um 422 em requisição válida: `GET /api/endpoints?vinculo=sem`
// respondia *campo não reconhecido: "vinculo"*. Os dois filtros que a F7
// escreveu — vínculo e triagem — existiam no `buildEndpointWhere`, estavam
// tipados no use-case e eram INALCANÇÁVEIS pela borda.
//
// A causa: a query tem dois donos. `parseListQuery` (do `core`) é `strictObject`
// e recusa toda chave que não conhece; o schema do domínio lê a mesma query. Os
// dois recebiam a query inteira, e o primeiro barrava o que era do segundo.
//
// O `workstation.controller.ts` já tinha exatamente este trecho, com um
// comentário explicando o motivo — a F7 refez o erro em vez de copiar a solução.
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
  assetId: string | null;
  reviewState: string;
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

describe('o filtro de vínculo', () => {
  it('⚠️ responde 200, e não 422 por "campo não reconhecido"', async () => {
    // A asserção que o defeito quebrava. Ela vem primeiro e sozinha de propósito:
    // se ela falhar, nenhuma das outras significa nada.
    const { status } = await listar('?vinculo=sem');
    expect(status).toBe(200);
  });

  it('separa quem tem ativo de quem não tem', async () => {
    const semCadastro = await maquina('lista-orfa');
    const comCadastro = await maquina('lista-vinculada');

    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Ativo da listagem' });
    await api.post(`/api/endpoints/${comCadastro}/link`, { assetId: ativo.id });

    const sem = await listar('?vinculo=sem');
    expect(sem.body.rows.map((linha) => linha.id)).toContain(semCadastro);
    expect(sem.body.rows.map((linha) => linha.id)).not.toContain(comCadastro);

    const com = await listar('?vinculo=com');
    expect(com.body.rows.map((linha) => linha.id)).toContain(comCadastro);
    expect(com.body.rows.map((linha) => linha.id)).not.toContain(semCadastro);

    // E o total sem filtro é a soma dos dois: um filtro que não fecha a conta
    // está escondendo linha.
    const tudo = await listar('');
    expect(tudo.body.total).toBe(sem.body.total + com.body.total);
  });

  it('convive com paginação, ordenação e busca na MESMA query', async () => {
    // O caso que o defeito tornava impossível: as chaves dos dois donos juntas.
    // Com a query entregue inteira aos dois schemas, isto dava 422 de um lado ou
    // de outro, dependendo de qual parse rodasse primeiro.
    const { status, body } = await listar('?vinculo=sem&sort=hostname&order=asc&page=1&perPage=10&q=lista');
    expect(status).toBe(200);
    expect(body.rows.every((linha) => linha.assetId === null)).toBe(true);
  });
});

describe('o filtro de triagem', () => {
  it('filtra por reviewState, e o valor inválido é 422', async () => {
    const id = await maquina('lista-bloqueada');
    await api.patch(`/api/endpoints/${id}/review`, { reviewState: 'BLOCKED' });

    const bloqueadas = await listar('?reviewState=BLOCKED');
    expect(bloqueadas.status).toBe(200);
    expect(bloqueadas.body.rows.map((linha) => linha.id)).toContain(id);

    const naoTriadas = await listar('?reviewState=UNREVIEWED');
    expect(naoTriadas.body.rows.map((linha) => linha.id)).not.toContain(id);

    // Valor fora do enum é 422 com a frase do domínio — e não filtro ignorado
    // em silêncio, que era o que um schema aberto entregaria.
    const invalido = await listar('?reviewState=SEI_LA');
    expect(invalido.status).toBe(422);
  });

  it('e os dois filtros valem juntos', async () => {
    const { status, body } = await listar('?vinculo=sem&reviewState=BLOCKED');
    expect(status).toBe(200);
    expect(body.rows.every((linha) => linha.assetId === null && linha.reviewState === 'BLOCKED')).toBe(true);
  });
});

describe('o que a listagem continua recusando', () => {
  it('chave desconhecida é 422, dos dois lados', async () => {
    // A estreiteza não foi trocada por permissividade: separar a query por dono
    // deixou os DOIS schemas estritos. Typo em chave de paginação e typo em
    // chave de domínio param na borda.
    expect((await listar('?ordr=asc')).status).toBe(422);
    expect((await listar('?vinculoo=sem')).status).toBe(422);
  });

  it('e máquina fundida continua fora de toda listagem', async () => {
    const perdedora = await maquina('lista-fundida');
    const vencedora = await maquina('lista-vencedora');
    await api.post(`/api/endpoints/${perdedora}/merge`, { intoEndpointId: vencedora });

    for (const query of ['', '?vinculo=sem', '?reviewState=UNREVIEWED']) {
      const { body } = await listar(query);
      expect(body.rows.map((linha) => linha.id)).not.toContain(perdedora);
    }
  });
});
