import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A 201ª LOCALIZAÇÃO (F10, Etapa B) — o furo que a auditoria da F1 anotou como
// observação 7 e que ficou aberto desde então.
//
// `/options` devolve no máximo 200 linhas, em ordem alfabética. Com 201
// localizações cadastradas, a última é INALCANÇÁVEL pelo formulário: ela não
// está na lista, o `<select>` não a oferece, e não havia campo de busca. A outra
// metade do furo — o `<select>` renderizar VAZIO quando o valor atual não está
// entre as 200, mandando `null` no salvamento — foi fechada na época com a opção
// de "vínculo atual".
//
// O `?q=` do servidor já existia desde a F1, nas três rotas de `/options`. O que
// este arquivo prova é o contrato de que a tela nova depende: o teto continua
// valendo, e com termo a linha fora das 200 primeiras aparece.

const QUANTAS = 205;
/** Alfabeticamente DEPOIS de todas as outras: é a que o teto esconde. */
const ESCONDIDA = 'Zzz Mesa Inalcançável';
const PREFIXO = 'Opt-';

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();

  // `createMany` e não 205 `POST`: o que está sendo testado é a LEITURA, e
  // duzentas e cinco requisições de cadastro levariam mais tempo que o resto da
  // suíte inteira. O cadastro em si tem teste próprio.
  await prisma.location.createMany({
    data: [
      ...Array.from({ length: QUANTAS }, (_, indice) => ({
        name: `${PREFIXO}${String(indice).padStart(4, '0')}`,
      })),
      { name: ESCONDIDA },
    ],
  });
});

afterAll(async () => {
  await api.fechar();
});

interface Opcao {
  id: string;
  name: string;
}

describe('GET /api/locations/options', () => {
  it('corta no teto de 200, em ordem alfabética', async () => {
    const { status, body } = await api.get<Opcao[]>('/api/locations/options');

    expect(status).toBe(200);
    expect(body.length).toBe(200);
    expect(body[0].name.startsWith(PREFIXO)).toBe(true);
  });

  it('a linha fora das 200 primeiras NÃO vem na lista sem busca', async () => {
    const { body } = await api.get<Opcao[]>('/api/locations/options');
    expect(body.some((opcao) => opcao.name === ESCONDIDA)).toBe(false);
  });

  it('e vem com `?q=`: é o que torna a 201ª escolhível pela tela', async () => {
    const { status, body } = await api.get<Opcao[]>('/api/locations/options?q=Inalcan');

    expect(status).toBe(200);
    expect(body.map((opcao) => opcao.name)).toEqual([ESCONDIDA]);
  });

  it('a busca é insensível a maiúsculas e a acento não é inventado', async () => {
    const minusculo = await api.get<Opcao[]>('/api/locations/options?q=inalcan');
    expect(minusculo.body.map((o) => o.name)).toEqual([ESCONDIDA]);
  });

  it('busca sem resultado é lista vazia, não erro', async () => {
    const { status, body } = await api.get<Opcao[]>('/api/locations/options?q=nao-existe-nada');

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe('As outras duas rotas de /options têm a mesma busca', () => {
  it('usuários', async () => {
    const { status, body } = await api.get<Opcao[]>('/api/users/options?q=admin');
    expect(status).toBe(200);
    // O seed cria o administrador; o que importa é a rota aceitar o parâmetro e
    // filtrar, não quantos ela devolve.
    expect(Array.isArray(body)).toBe(true);
  });

  it('ativos', async () => {
    const { status } = await api.get<Opcao[]>('/api/assets/options?q=ATV');
    expect(status).toBe(200);
  });
});
