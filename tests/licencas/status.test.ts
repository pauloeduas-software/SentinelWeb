import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarFabricante, criarLicenca, diaNoBrasil } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
import { hojeNoBrasil } from '../../server/domain/shared/hoje.helper';
import { diasParaVencer, statusDaLicenca } from '../../server/domain/license/helpers/license-status.helper';

// O STATUS DERIVADO — e todo erro dele é de um dia.
//
// ═════════════════════════════════════════════════════════════════════════════
// O "HOJE" É O DIA DE BRASÍLIA (`hojeNoBrasil`).
//
// Com a meia-noite UTC, a licença que vence hoje virava VENCIDA às 21h de
// Brasília, e o botão de entrega sumia três horas antes do fim do dia. As
// funções puras abaixo recebem o instante, e é com elas que se prova o fuso sem
// mexer no relógio do processo — que é o mesmo do servidor montado pelo teste.
// As datas dos testes por HTTP saem de `diaNoBrasil`, a mesma referência.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('o dia de Brasília, e não o de Greenwich', () => {
  it('às 22h30 de 22/10 em Brasília ainda é dia 22 — em UTC já seria 23', () => {
    expect(hojeNoBrasil(new Date('2026-10-23T01:30:00Z'))).toEqual(dia('2026-10-22'));
    expect(hojeNoBrasil(new Date('2026-10-23T03:00:00Z'))).toEqual(dia('2026-10-23'));
  });

  it('a licença que vence no dia 22 continua VENCENDO às 22h30 do dia 22', () => {
    const hoje = hojeNoBrasil(new Date('2026-10-23T01:30:00Z'));
    const datas = { expirationDate: dia('2026-10-22'), terminationDate: null };
    expect(statusDaLicenca(datas, hoje)).toBe('VENCENDO');
    expect(diasParaVencer(datas.expirationDate, hoje)).toBe(0);
  });

  it('o encerramento marcado para o dia 22 já encerra no dia 22', () => {
    const hoje = hojeNoBrasil(new Date('2026-10-22T12:00:00Z'));
    expect(statusDaLicenca({ expirationDate: null, terminationDate: dia('2026-10-22') }, hoje)).toBe('ENCERRADA');
    expect(statusDaLicenca({ expirationDate: null, terminationDate: dia('2026-10-23') }, hoje)).toBe('ATIVA');
  });
});

interface LicencaLida { status: string; diasParaVencer: number | null }

async function lerStatus(id: string): Promise<LicencaLida> {
  const { status, body } = await api.get<LicencaLida>(`/api/licenses/${id}`);
  expect(status).toBe(200);
  return body;
}

describe('o status pela API, nas bordas', () => {
  it('sem vencimento é ATIVA, e não há dias a contar', async () => {
    const licenca = await criarLicenca(api, { name: 'Perpétua', categoryId: cenario.categoriaLicencaId, seatsTotal: 1 });
    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'ATIVA', diasParaVencer: null });
  });

  it('fora da janela de 30 dias é ATIVA; dentro, VENCENDO', async () => {
    const fora = await criarLicenca(api, {
      name: 'Renova em 31 dias', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(31),
    });
    const dentro = await criarLicenca(api, {
      name: 'Renova em 30 dias', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(30),
    });
    expect(await lerStatus(fora.id)).toMatchObject({ status: 'ATIVA', diasParaVencer: 31 });
    expect(await lerStatus(dentro.id)).toMatchObject({ status: 'VENCENDO', diasParaVencer: 30 });
  });

  it('vence HOJE ainda é VENCENDO; venceu ontem é EXPIRADA, com dias negativos', async () => {
    const hoje = await criarLicenca(api, {
      name: 'Vence hoje', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(0),
    });
    const ontem = await criarLicenca(api, {
      name: 'Venceu ontem', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, expirationDate: diaNoBrasil(-1),
    });
    expect(await lerStatus(hoje.id)).toMatchObject({ status: 'VENCENDO', diasParaVencer: 0 });
    expect(await lerStatus(ontem.id)).toMatchObject({ status: 'EXPIRADA', diasParaVencer: -1 });
  });

  it('o encerramento vence tudo: chegado o dia, ENCERRADA mesmo com vencimento futuro', async () => {
    const licenca = await criarLicenca(api, {
      name: 'Encerra hoje', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
      expirationDate: diaNoBrasil(40), terminationDate: diaNoBrasil(0),
    });
    expect(await lerStatus(licenca.id)).toMatchObject({ status: 'ENCERRADA' });
  });

  it('encerramento FUTURO não existe: o cadastro o recusa', async () => {
    const { status } = await api.post('/api/licenses', {
      name: 'Encerra no mês que vem', categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(30),
    });
    expect(status).toBe(422);
  });

  it('e NÃO existe coluna de status nem de livres: não podem divergir porque não guardam nada', async () => {
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'licenses' AND column_name IN ('status', 'livres', 'minSeats', 'deletedAt')
    `;
    expect(colunas).toEqual([]);
  });
});

describe('o filtro de status', () => {
  const PREFIXO = 'Filtro de status';
  let ids: Record<'semVencimento' | 'longe' | 'limite' | 'hoje' | 'ontem' | 'encerrada', string>;

  beforeAll(async () => {
    const criar = async (sufixo: string, datas: { expirationDate?: string; terminationDate?: string }) =>
      (await criarLicenca(api, {
        name: `${PREFIXO} ${sufixo}`, categoryId: cenario.categoriaLicencaId, seatsTotal: 1, ...datas,
      })).id;

    ids = {
      semVencimento: await criar('sem vencimento', {}),
      longe: await criar('vence em 31 dias', { expirationDate: diaNoBrasil(31) }),
      limite: await criar('vence em 30 dias', { expirationDate: diaNoBrasil(30) }),
      hoje: await criar('vence hoje', { expirationDate: diaNoBrasil(0) }),
      ontem: await criar('venceu ontem', { expirationDate: diaNoBrasil(-1) }),
      encerrada: await criar('encerrada e vencida', { expirationDate: diaNoBrasil(-5), terminationDate: diaNoBrasil(-1) }),
    };
  });

  async function filtrar(status: string) {
    const { status: http, body } = await api.get<{ rows: { id: string; status: string }[] }>(
      `/api/licenses?status=${status}&perPage=100&q=${encodeURIComponent(PREFIXO)}`,
    );
    expect(http).toBe(200);
    return body.rows;
  }

  it('as fronteiras são as do status: 30 dias ainda é vencendo, 31 é ativa, ontem é vencida', async () => {
    expect((await filtrar('ATIVA')).map((l) => l.id).sort()).toEqual([ids.semVencimento, ids.longe].sort());
    expect((await filtrar('VENCENDO')).map((l) => l.id).sort()).toEqual([ids.limite, ids.hoje].sort());
    expect((await filtrar('EXPIRADA')).map((l) => l.id)).toEqual([ids.ontem]);
  });

  it('cada linha filtrada tem o status do filtro, e a encerrada não entra em nenhum', async () => {
    for (const status of ['ATIVA', 'VENCENDO', 'EXPIRADA']) {
      const linhas = await filtrar(status);
      expect(linhas.every((l) => l.status === status), status).toBe(true);
      expect(linhas.map((l) => l.id)).not.toContain(ids.encerrada);
    }
  });

  it('o filtro ENCERRADA traz só a encerrada, que a lista sem filtro mostra junto das outras', async () => {
    expect((await filtrar('ENCERRADA')).map((l) => l.id)).toEqual([ids.encerrada]);

    const { body } = await api.get<{ rows: { id: string; status: string }[] }>(
      `/api/licenses?perPage=100&q=${encodeURIComponent(PREFIXO)}`,
    );
    expect(body.rows.map((l) => l.id).sort()).toEqual(Object.values(ids).sort());
    expect(body.rows.find((l) => l.id === ids.encerrada)?.status).toBe('ENCERRADA');
  });

  it('sem abas: o `view` e um status que não existe são 422', async () => {
    expect((await api.get('/api/licenses?view=encerradas')).status).toBe(422);
    expect((await api.get('/api/licenses?view=atuais')).status).toBe(422);
    expect((await api.get('/api/licenses?status=CANCELADA')).status).toBe(422);
  });
});

describe('a busca e a ordem da lista', () => {
  async function acha(q: string, filtro = ''): Promise<string[]> {
    const { status, body } = await api.get<{ rows: { id: string }[] }>(
      `/api/licenses?perPage=100&q=${encodeURIComponent(q)}${filtro}`,
    );
    expect(status).toBe(200);
    return body.rows.map((linha) => linha.id);
  }

  it('a busca alcança licenciado, e-mail, pedido, categoria e fabricante — e "_" é texto, não curinga', async () => {
    const categoria = (await api.post<{ id: string }>('/api/categories', { name: 'Família Buscável', type: 'LICENSE' })).body.id;
    const fabricante = await criarFabricante(api, 'Fabricante Buscável');
    const criar = async (name: string, orderNumber: string) => (await api.post<{ id: string }>('/api/licenses', {
      name, categoryId: categoria, manufacturerId: fabricante, seatsTotal: 1,
      licensedToName: 'Gabriela Licenciada', licensedToEmail: 'gabi@busca.local', orderNumber,
    })).body.id;
    const alvo = await criar('Contrato da busca', 'PED_7781');
    const parecida = await criar('Contrato parecido', 'PEDX7781');

    for (const q of ['gabriela licenciada', 'GABI@BUSCA', 'família buscável', 'fabricante busc']) {
      expect((await acha(q)).sort(), q).toEqual([alvo, parecida].sort());
    }
    // Sem escapar, o "_" casaria com o "X" da outra.
    expect(await acha('PED_7781')).toEqual([alvo]);
  });

  it('o filtro das encerradas vem pela mais recente', async () => {
    const encerrada = (dias: number) => criarLicenca(api, {
      name: `Ordem encerrada ${dias}`, categoryId: cenario.categoriaLicencaId, seatsTotal: 1, terminationDate: diaNoBrasil(dias),
    });
    const [cinco, uma, tres] = [await encerrada(-5), await encerrada(-1), await encerrada(-3)];

    expect(await acha('Ordem encerrada', '&status=ENCERRADA')).toEqual([uma.id, tres.id, cinco.id]);
  });
});
