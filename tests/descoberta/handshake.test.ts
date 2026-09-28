import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { prisma } from '../../server/core/database/prismaClient';

// A BORDA DO AGENTE — o que o rollout do C# vai exercitar por semanas.
//
// Enquanto o binário novo não chega em toda a frota, o servidor atende os dois
// formatos ao mesmo tempo. Este arquivo é o que garante que isso continue
// verdade: o payload ANTIGO tem que seguir válido, e o NOVO não pode depender
// de nenhum campo estar presente.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const buscar = (hwid: string) => prisma.endpoint.findUnique({ where: { hwid } });

describe('o handshake antigo continua valendo', () => {
  it('cria a máquina sem nenhum campo de identidade', async () => {
    const agente = await conectarAgente(api, 'hwid-agente-antigo');
    await agente.handshake();

    const endpoint = await esperarPor('a máquina antiga aparecer', () => buscar('hwid-agente-antigo'));

    expect(endpoint.hostname).toBe('maquina-de-teste');
    expect(endpoint.status).toBe('ONLINE');
    expect(endpoint.biosSerial).toBeNull();

    // O QUE IMPORTA AQUI: `null`, e não `0`. Gravar zero seria afirmar que a
    // máquina tem zero bytes de RAM — diferente de "esta versão do agente não
    // coleta isso", e é a diferença que o `readOptionalBigInt` existe para
    // manter. A primeira soma do painel de cobertura veria a mentira.
    expect(endpoint.ramTotalBytes).toBeNull();
    expect(endpoint.diskTotalBytes).toBeNull();

    await agente.fechar();
  });
});

describe('o handshake novo traz identidade', () => {
  it('grava os oito campos vindos em PascalCase', async () => {
    const agente = await conectarAgente(api, 'hwid-agente-novo');
    await agente.handshake({
      Hostname: 'PC-ANA',
      BiosSerial: 'SN-ABC-123',
      SystemUuid: '4c4c4544-0031-4a10-8051-b7c04f584d32',
      Manufacturer: 'Dell Inc.',
      Model: 'Latitude 5440',
      ChassisType: '10',
      RamTotalBytes: 17179869184,
      DiskTotalBytes: 512110190592,
      LoggedOnUser: 'EMPRESA\\ana.lima',
      MacAddress: '00-1A-2B-3C-4D-5E',
    });

    const endpoint = await esperarPor('a máquina nova aparecer', async () => {
      const achado = await buscar('hwid-agente-novo');
      return achado?.biosSerial ? achado : null;
    });

    expect(endpoint.biosSerial).toBe('SN-ABC-123');
    expect(endpoint.systemUuid).toBe('4c4c4544-0031-4a10-8051-b7c04f584d32');
    expect(endpoint.manufacturer).toBe('Dell Inc.');
    // `Model` no fio vira `hardwareModel` na coluna (D13): `endpoint.model` se
    // confundiria com a relação de catálogo do ativo.
    expect(endpoint.hardwareModel).toBe('Latitude 5440');
    expect(endpoint.ramTotalBytes).toBe(17179869184n);
    expect(endpoint.loggedOnUser).toBe('EMPRESA\\ana.lima');

    await agente.fechar();
  });

  it('aceita camelCase, que é o que as versões antigas mandam', async () => {
    const agente = await conectarAgente(api, 'hwid-camel');
    await agente.handshake({ biosSerial: 'SN-CAMEL-9', hostname: 'pc-camel' } as Record<string, unknown>);

    const endpoint = await esperarPor('a máquina em camelCase', async () => {
      const achado = await buscar('hwid-camel');
      return achado?.biosSerial ? achado : null;
    });

    expect(endpoint.biosSerial).toBe('SN-CAMEL-9');
    await agente.fechar();
  });
});

describe('o que o agente manda vazio é "não sei", nunca zero', () => {
  it('string vazia em RamTotalBytes não vira "esta máquina tem zero bytes"', async () => {
    const agente = await conectarAgente(api, 'vazio-1');
    // O agente C# serializa `null` como string vazia em algumas versões, e
    // `Number('')` é `0` — finito e não negativo. Sem a guarda do
    // `readOptionalBigInt`, isto gravava uma AFIRMAÇÃO sobre a máquina: que ela
    // tem zero bytes de RAM. É diferente de "esta versão do agente não coleta
    // isso", e a diferença aparece na primeira soma do painel de cobertura.
    await agente.handshake({ Hostname: 'pc-vazio', RamTotalBytes: '', DiskTotalBytes: '   ' });
    const endpoint = await esperarPor(
      'a máquina de campos vazios',
      () => prisma.endpoint.findUnique({ where: { hwid: 'vazio-1' } }),
    );
    await agente.fechar();

    expect(endpoint.ramTotalBytes).toBeNull();
    expect(endpoint.diskTotalBytes).toBeNull();
  });

  it('e o número de verdade continua entrando', async () => {
    const agente = await conectarAgente(api, 'vazio-2');
    await agente.handshake({ Hostname: 'pc-cheio', RamTotalBytes: 8589934592 });
    const endpoint = await esperarPor('a máquina com RAM', async () => {
      const achado = await prisma.endpoint.findUnique({ where: { hwid: 'vazio-2' } });
      return achado?.ramTotalBytes ? achado : null;
    });
    await agente.fechar();

    expect(endpoint.ramTotalBytes).toBe(8589934592n);
  });
});

describe('a rota do painel não estoura com os BigInt novos', () => {
  it('devolve ramTotalBytes como string', async () => {
    const agente = await conectarAgente(api, 'hwid-bigint');
    await agente.handshake({ RamTotalBytes: 34359738368, DiskTotalBytes: 1024209543168 });

    await esperarPor('a máquina com specs', async () => {
      const achado = await buscar('hwid-bigint');
      return achado?.ramTotalBytes ? achado : null;
    });

    // ESTE É O TESTE QUE PEGA A REGRESSÃO MAIS SILENCIOSA DA FASE. O
    // `present-endpoint.helper.ts` devolvia `{ ...endpoint }` inteiro; com
    // colunas BigInt no model, o `JSON.stringify` do Fastify morre com "Do not
    // know how to serialize a BigInt" — e morre na rota que o painel consulta a
    // cada 5 segundos, ou seja, a tela inteira fica em branco.
    const { status, body } = await api.get<{ rows: { hwid: string; ramTotalBytes: string | null }[] }>(
      '/api/endpoints?perPage=500',
    );

    expect(status).toBe(200);
    const linha = body.rows.find((row) => row.hwid === 'hwid-bigint');
    expect(linha?.ramTotalBytes).toBe('34359738368');

    await agente.fechar();
  });
});
