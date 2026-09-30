import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularValorContabil, mesesDecorridos } from '../../server/domain/asset/helpers/depreciacao.helper';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarDepreciacao, criarFabricante, criarModelo, idsDoSeed, pendurarDepreciacao,
} from '../helpers/fixtures';

// O VALOR CONTÁBIL — docs/FASE-8-PLANO-ITAM.md, Etapa C (D55).
//
// ═════════════════════════════════════════════════════════════════════════════
// O TESTE QUE PAGA ESTE ARQUIVO É O DO PISO `AMOUNT` ACIMA DO CUSTO.
//
// O `beforeWrite` de `depreciation.spec.ts` limita o piso a 100% quando ele é
// `PERCENT`. `AMOUNT` NÃO TEM TETO NENHUM — e nada impede alguém pendurar
// "Notebooks — residual R$ 1.000" num modelo de teclado. Sem o `min(custo, …)` da
// fórmula, um mouse de R$ 50 com piso de R$ 5.000 vale R$ 5.000 no papel: um mouse
// que VALORIZOU, e o total da frota subindo a cada mouse cadastrado.
//
// A parte pura é testada direto porque ela é pura: fixar o `agora` por parâmetro é
// o que permite provar a curva sem mexer no relógio do processo.
// ═════════════════════════════════════════════════════════════════════════════

const decimal = (valor: string) => new Prisma.Decimal(valor);
const emUTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('a fórmula (função pura)', () => {
  it('NUNCA devolve mais que o custo, mesmo com piso AMOUNT absurdo', () => {
    const resultado = calcularValorContabil({
      purchaseCost: decimal('50.00'),
      purchaseDate: emUTC('2020-01-01'),
      regra: { months: 36, floorValue: decimal('5000.00'), floorType: 'AMOUNT' },
      agora: emUTC('2026-09-29'),
    });

    // O `min` do clamp. Sem ele: "5000".
    expect(resultado.valorAtual).toBe('50');
    expect(resultado.piso).toBe('50');
  });

  it('NUNCA devolve menos que o piso, mesmo muito depois do fim da vida útil', () => {
    const resultado = calcularValorContabil({
      purchaseCost: decimal('3000.00'),
      purchaseDate: emUTC('2015-01-01'),
      regra: { months: 24, floorValue: decimal('300.00'), floorType: 'AMOUNT' },
      agora: emUTC('2026-09-29'),
    });

    expect(resultado.valorAtual).toBe('300');
    expect(resultado.totalmenteDepreciado).toBe(true);
  });

  it('deprecia linearmente, e o piso PERCENT é sobre o CUSTO', () => {
    // 3000 de custo, piso 10% (= 300), 20 meses de vida, 10 meses decorridos:
    // 3000 − (3000 − 300) × 10/20 = 1650.
    const resultado = calcularValorContabil({
      purchaseCost: decimal('3000.00'),
      purchaseDate: emUTC('2026-01-01'),
      regra: { months: 20, floorValue: decimal('10'), floorType: 'PERCENT' },
      agora: emUTC('2026-11-01'),
    });

    expect(resultado.mesesDecorridos).toBe(10);
    expect(resultado.valorAtual).toBe('1650');
    expect(resultado.piso).toBe('300');
  });

  it('devolve TRÊS motivos diferentes, e nenhum deles é zero', () => {
    const regra = { months: 12, floorValue: decimal('0'), floorType: 'AMOUNT' as const };

    const semCusto = calcularValorContabil({ purchaseCost: null, purchaseDate: emUTC('2026-01-01'), regra });
    const semRegra = calcularValorContabil({ purchaseCost: decimal('100'), purchaseDate: emUTC('2026-01-01'), regra: null });
    const semData = calcularValorContabil({ purchaseCost: decimal('100'), purchaseDate: null, regra });

    // `valorAtual` nulo nos três, com o MOTIVO ao lado. Zero aqui barateia a frota
    // num número formatado e plausível, que é o tipo de erro que ninguém confere.
    for (const resultado of [semCusto, semRegra, semData]) {
      expect(resultado.valorAtual).toBeNull();
    }
    expect(semCusto.motivo).toBe('SEM_CUSTO');
    expect(semRegra.motivo).toBe('SEM_REGRA');
    expect(semData.motivo).toBe('SEM_DATA');
  });

  it('não deprecia antes da compra — data futura dá zero mês decorrido', () => {
    const resultado = calcularValorContabil({
      purchaseCost: decimal('1000.00'),
      purchaseDate: emUTC('2027-01-01'),
      regra: { months: 10, floorValue: decimal('0'), floorType: 'AMOUNT' },
      agora: emUTC('2026-09-29'),
    });

    expect(resultado.mesesDecorridos).toBe(0);
    expect(resultado.valorAtual).toBe('1000');
  });
});

describe('a contagem de meses', () => {
  it('só conta o mês quando o DIA chega', () => {
    // Comprou em 20/01, hoje é 05/02: passou um mês de calendário e ZERO mês de
    // contrato.
    expect(mesesDecorridos(emUTC('2026-01-20'), emUTC('2026-02-05'))).toBe(0);
    expect(mesesDecorridos(emUTC('2026-01-20'), emUTC('2026-02-20'))).toBe(1);
  });

  it('resolve o transbordo de 31/01 pelo `adicionarMeses`', () => {
    // 31/01 + 1 mês é 28/02 (e não 03/03, que é o que `setMonth` sozinho daria).
    // Então em 28/02 já se passou um mês.
    expect(mesesDecorridos(emUTC('2026-01-31'), emUTC('2026-02-28'))).toBe(1);
    expect(mesesDecorridos(emUTC('2026-01-31'), emUTC('2026-02-27'))).toBe(0);
  });
});

describe('pela API', () => {
  let api: ApiDeTeste;

  beforeAll(async () => {
    api = await criarApi();
  });

  afterAll(async () => {
    await api.fechar();
  });

  it('o detalhe do ativo traz o valor calculado no SERVIDOR', async () => {
    const seed = await idsDoSeed();
    const fabricanteId = await criarFabricante(api, 'Fabricante do valor contábil');
    const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

    const depreciacaoId = await criarDepreciacao(api, {
      name: 'Linear 24 meses com piso',
      months: 24,
      floorValue: '200.00',
      floorType: 'AMOUNT',
    });
    await pendurarDepreciacao(api, modelId, depreciacaoId);

    const ativo = await criarAtivo(api, {
      statusId: seed.statusDeployableId,
      modelId,
      name: 'Notebook depreciável',
    });
    await api.put(`/api/assets/${ativo.id}`, { purchaseCost: '2000.00', purchaseDate: '2026-01-01' });

    const detalhe = await api.get<{ valorContabil: { valorAtual: string | null; motivo: string | null; mesesTotais: number | null } }>(
      `/api/assets/${ativo.id}`,
    );

    expect(detalhe.status).toBe(200);
    // Calculado, nunca gravado: não existe coluna `bookValue` (D55).
    expect(detalhe.body.valorContabil.motivo).toBeNull();
    expect(detalhe.body.valorContabil.valorAtual).not.toBeNull();
    expect(detalhe.body.valorContabil.mesesTotais).toBe(24);
  });

  it('a regra de depreciação em uso não pode ser apagada (409)', async () => {
    const seed = await idsDoSeed();
    const fabricanteId = await criarFabricante(api, 'Fabricante da regra em uso');
    const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

    const depreciacaoId = await criarDepreciacao(api, {
      name: 'Regra que um modelo usa',
      months: 36,
      floorValue: '10',
      floorType: 'PERCENT',
    });
    await pendurarDepreciacao(api, modelId, depreciacaoId);

    // Até a F8 o `countUsages` desta spec devolvia `0` FIXO: a aplicação liberava
    // o delete e o P2003 do banco virava 409 genérico, sem dizer por quantos.
    const resposta = await api.delete(`/api/depreciations/${depreciacaoId}`);
    expect(resposta.status).toBe(409);
  });

  it('o relatório separa os três baldes e NÃO soma `null` como zero', async () => {
    // O CENÁRIO É MONTADO AQUI, e não herdado do `it` anterior: o harness
    // compartilha o banco entre os testes do mesmo arquivo, e um teste que depende
    // da ORDEM dos vizinhos quebra quando alguém reordena ou isola um deles.
    const seed = await idsDoSeed();
    const fabricanteId = await criarFabricante(api, 'Fabricante do relatório');
    const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

    const depreciacaoId = await criarDepreciacao(api, {
      name: 'Linear do relatório',
      months: 48,
      floorValue: '5',
      floorType: 'PERCENT',
    });
    await pendurarDepreciacao(api, modelId, depreciacaoId);

    const comTudo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Com custo e regra' });
    await api.put(`/api/assets/${comTudo.id}`, { purchaseCost: '4000.00', purchaseDate: '2025-06-01' });

    // Um SEM custo, para o balde existir e não ser confundido com zero.
    await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Sem custo nenhum' });

    const relatorio = await api.get<{
      comValor: number; semCusto: number; semDepreciacao: number; semData: number;
      total: number; valorAtualTotal: string; curva: { mes: string; valor: string }[];
    }>('/api/reports/depreciacao');

    expect(relatorio.status).toBe(200);

    const { comValor, semCusto, semDepreciacao, semData, total } = relatorio.body;
    expect(comValor).toBeGreaterThan(0);
    expect(semCusto).toBeGreaterThan(0);
    // Os quatro baldes somam o parque: nenhum ativo fica fora da conta, e nenhum
    // entra em dois.
    expect(comValor + semCusto + semDepreciacao + semData).toBe(total);
    expect(Number(relatorio.body.valorAtualTotal)).toBeGreaterThan(0);
    // A curva vem PRONTA do servidor (D55), doze pontos.
    expect(relatorio.body.curva).toHaveLength(12);
  });

  it('a curva NÃO conta ativo que ainda não havia sido comprado', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // O BUG QUE ESTE TESTE IMPEDE DE VOLTAR.
    //
    // Cada ponto da curva recalcula a frota com o `agora` DAQUELE mês. Com `agora`
    // anterior à compra, `mesesDecorridos` devolve 0 — e zero mês decorrido é "não
    // depreciou nada", então o valor é o PREÇO DE COMPRA INTEIRO. O ativo comprado
    // ontem entrava no ponto de doze meses atrás pelo custo cheio.
    //
    // O efeito é sistemático e sempre para o mesmo lado: quanto mais compras
    // recentes, mais inflado o passado do gráfico — e a curva ficava achatada
    // exatamente onde deveria mostrar a frota crescendo.
    //
    // A prova é o campo `ativos` de cada ponto: um ativo comprado HOJE conta no
    // último ponto e não no primeiro. Comparar valores seria frágil (a frota do
    // banco de teste tem outros ativos); comparar a CONTAGEM do mesmo ponto antes e
    // depois de cadastrar um ativo novo é exato.
    // ═════════════════════════════════════════════════════════════════════════
    const seed = await idsDoSeed();
    const fabricanteId = await criarFabricante(api, 'Fabricante da curva');
    const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

    const depreciacaoId = await criarDepreciacao(api, {
      name: 'Linear da curva',
      months: 60,
      floorValue: '0',
      floorType: 'AMOUNT',
    });
    await pendurarDepreciacao(api, modelId, depreciacaoId);

    type Curva = {
      curva: { mes: string; valor: string; ativos: number }[];
      valorAtualTotal: string;
      comValor: number;
    };
    const antes = await api.get<Curva>('/api/reports/depreciacao');
    const primeiroAntes = antes.body.curva[0].ativos;
    const ultimoAntes = antes.body.curva[11].ativos;

    // Comprado HOJE: ele não existia no parque em nenhum dos onze primeiros pontos.
    const recemComprado = await criarAtivo(api, {
      statusId: seed.statusDeployableId, modelId, name: 'Comprado agora',
    });
    const hoje = new Date().toISOString().slice(0, 10);
    expect((await api.put(`/api/assets/${recemComprado.id}`, {
      purchaseCost: '9999.00', purchaseDate: hoje,
    })).status).toBe(200);

    const depois = await api.get<Curva>('/api/reports/depreciacao');

    // O PRIMEIRO ponto (doze meses atrás) não mudou: o ativo não era da frota.
    expect(depois.body.curva[0].ativos).toBe(primeiroAntes);
    // O ÚLTIMO ponto (o mês corrente) ganhou exatamente um.
    expect(depois.body.curva[11].ativos).toBe(ultimoAntes + 1);

    // E o valor do primeiro ponto também não pode ter subido — era por ele que os
    // R$ 9.999 entravam no passado.
    expect(Number(depois.body.curva[0].valor)).toBeCloseTo(Number(antes.body.curva[0].valor), 2);

    // ═════════════════════════════════════════════════════════════════════════
    // O ÚLTIMO PONTO FECHA COM O INDICADOR AO LADO DELE.
    //
    // É o invariante que `CurvaDeDepreciacao.tsx` declara em comentário desde a F8
    // ("o último ponto deixaria de fechar com o total impresso ao lado"), e que a
    // primeira versão desta correção quebrou: com o ponto ancorado no dia 1º, o
    // gráfico mostrava um mês de depreciação a menos que o número acima dele.
    //
    // A série é de FECHAMENTO — cada ponto é o último instante do seu mês, e o mês
    // corrente fecha em `agora` —, e é isso que torna os dois números o mesmo.
    // ═════════════════════════════════════════════════════════════════════════
    const ultimo = depois.body.curva[11];
    expect(Number(ultimo.valor)).toBeCloseTo(Number(depois.body.valorAtualTotal), 2);
    expect(ultimo.ativos).toBe(depois.body.comValor);
  });
});
