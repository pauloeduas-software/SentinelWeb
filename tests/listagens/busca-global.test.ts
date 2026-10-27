import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// A BUSCA DO LEITOR — `GET /api/search`.
//
// Ela não tinha teste nenhum até o corte do QR. O passo que descartava o
// prefixo da URL do painel saiu, e com ele o único caminho que devolvia
// `por: 'qr'`; o que sobrou são a etiqueta exata, a série exata e o aproximado,
// nessa ordem. É essa ordem que este arquivo fixa — ela não é gosto, sai dos
// índices: os dois primeiros passos usam índice único parcial, e o terceiro é
// um `ILIKE '%x%'`, que varre a tabela.

const ETIQUETA = 'BUSCA-0001';
const SERIE = 'SN-BUSCA-9999';
// Um token POR COLUNA, e nenhum deles aparece em outra: é o que faz cada caso do
// aproximado provar o alcance de UMA coluna do `OR`. Com um termo comum às três
// (`da Busca`), derrubar modelo e fabricante do `OR` deixaria o teste verde.
const NO_NOME = 'AlfaBusca';
const NO_MODELO = 'BetaBusca';

let api: ApiDeTeste;
let idDoAtivo: string;

beforeAll(async () => {
  api = await criarApi();

  const { statusDeployableId, categoriaId } = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante GamaBusca');
  const modelId = await criarModelo(api, { categoriaId, fabricanteId, name: `Modelo ${NO_MODELO}` });

  const ativo = await criarAtivo(api, {
    statusId: statusDeployableId,
    modelId,
    assetTag: ETIQUETA,
    serial: SERIE,
    name: `Notebook ${NO_NOME}`,
  });
  idDoAtivo = ativo.id;
});

afterAll(async () => {
  await api.fechar();
});

interface Resultado {
  tipo: string;
  por: string;
  total: number;
  ativos: { id: string }[];
}

describe('GET /api/search', () => {
  it('a etiqueta exata responde EXATO, e é o caso do bipe', async () => {
    const { status, body } = await api.get<Resultado>(`/api/search?q=${ETIQUETA}`);

    expect(status).toBe(200);
    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('assetTag');
    expect(body.ativos.map((ativo) => ativo.id)).toEqual([idDoAtivo]);
  });

  it('a série exata também, e diz que foi pela série', async () => {
    const { body } = await api.get<Resultado>(`/api/search?q=${SERIE}`);

    expect(body.tipo).toBe('EXATO');
    expect(body.por).toBe('serial');
    expect(body.ativos.map((ativo) => ativo.id)).toEqual([idDoAtivo]);
  });

  it('um pedaço do nome cai no aproximado, que a tela mostra como lista', async () => {
    const { body } = await api.get<Resultado>(`/api/search?q=${NO_NOME}`);

    expect(body.tipo).toBe('PARCIAL');
    expect(body.por).toBe('aproximado');
    expect(body.ativos.map((ativo) => ativo.id)).toEqual([idDoAtivo]);
  });

  it('e o aproximado alcança o MODELO, não só as colunas do ativo', async () => {
    const { body } = await api.get<Resultado>(`/api/search?q=${NO_MODELO}`);

    expect(body.tipo).toBe('PARCIAL');
    expect(body.ativos.map((ativo) => ativo.id)).toEqual([idDoAtivo]);
  });

  it('nada encontrado é 200 com total zero, não 404', async () => {
    const { status, body } = await api.get<Resultado>('/api/search?q=ZZZ-INEXISTENTE');

    expect(status).toBe(200);
    expect(body.tipo).toBe('NENHUM');
    expect(body.total).toBe(0);
  });

  it('a URL do painel não abre mais o ativo: o passo do QR saiu', async () => {
    const url = encodeURIComponent(`http://localhost:3000/computadores/${idDoAtivo}`);
    const { status, body } = await api.get<Resultado>(`/api/search?q=${url}`);

    // Não é 422: o texto é uma busca válida, só não acha nada. O id dentro da
    // URL não é mais lido, e `ILIKE '%<url>%'` não casa com nenhuma coluna.
    expect(status).toBe(200);
    expect(body.tipo).toBe('NENHUM');
    expect(body.total).toBe(0);
  });

  it('busca vazia não vai ao banco e é recusada na borda', async () => {
    const { status } = await api.get<Resultado>('/api/search?q=');
    expect(status).toBe(422);
  });

  it('e acima do teto de 300 também, que é o teto que a etiqueta de 200 cabe', async () => {
    const { status } = await api.get<Resultado>(`/api/search?q=${'x'.repeat(301)}`);
    expect(status).toBe(422);
  });
});
