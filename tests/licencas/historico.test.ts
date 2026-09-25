import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { assentosDa, cenarioDePosse, criarLicenca } from '../helpers/fixtures';
// As funções PURAS que a tela usa para renderizar a trilha. Importadas aqui
// para que o teste prove o que o operador VÊ, não só o que o banco guarda.
import { lerEvento, rotuloDaAcao } from '../../src/pages/helpers/historico.helper';
import { ACOES_DA_LICENCA, ROTULOS_DA_LICENCA } from '../../src/pages/licencas/helpers/licenca.helper';
import type { EventoDaLicenca } from '../../src/domain/shared/license.types';

// ARQUIVO PRÓPRIO, e o motivo é o teto de escrita: `WRITE_RATE_LIMIT` é 40 por
// minuto contado em MEMÓRIA POR INSTÂNCIA, e `operacoes.test.ts` já gastava 35
// com uma instância só. Um teste a mais lá dentro começaria a receber 429 —
// falha que muda de lugar conforme a ordem dos testes, que é o pior tipo.
// Instância nova, contador novo.

// ═════════════════════════════════════════════════════════════════════════════
// A TRILHA COMO A TELA A LÊ — e a aritmética que o aviso de queima promete.
//
// Este projeto não tem suíte de front (não há jsdom nem testing-library), então
// componente React não se executa aqui. O que SE EXECUTA são as funções puras
// que a tela usa para renderizar — `rotuloDaAcao`, `lerEvento` e os mapas do
// domínio — alimentadas pelo `changes` REAL que a API acabou de gravar.
//
// É o que separa "o histórico existe no banco" de "o histórico é legível":
// ação sem rótulo aparece em CAIXA ALTA na tela, e campo sem rótulo aparece com
// o nome da coluna. Os dois são defeito de leitura que nenhum teste de servidor
// pegaria.
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

describe('o histórico da licença é legível pela tela', () => {
  const CHAVE = 'ZZZZ-AAAA-BBBB-CD34';
  let trilhaId: string;

  beforeAll(async () => {
    const licenca = await criarLicenca(api, {
      name: 'OEM da trilha', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
      reassignable: false, productKey: CHAVE,
    });
    trilhaId = licenca.id;

    // PRÉ-CONDIÇÃO EXPLÍCITA, e ela existe por um motivo concreto: durante a
    // escrita deste arquivo uma das três entregas abaixo respondeu 409 UMA vez,
    // e não reproduziu em 17 execuções do arquivo nem em 144 entregas
    // simultâneas de estresse. Sem esta asserção, uma volta do sintoma deixaria
    // as duas explicações possíveis indistinguíveis — o contrato ter nascido
    // sem assento, ou a entrega ter recusado assento livre. Com ela, a falha já
    // vem separada, e a mensagem do `expect` abaixo carrega o corpo do 409.
    const recemCriada = await assentosDa(api, trilhaId);
    expect(recemCriada.filter((a) => a.checkouts.length === 0), 'assentos livres ao criar')
      .toHaveLength(5);

    // Três ocupados: é o caso em que a fórmula antiga do aviso mentia.
    const entregas = await Promise.all([
      api.post<{ seatId: string }>(`/api/licenses/${trilhaId}/checkout-seat`, { assignedUserId: cenario.laura }),
      api.post<{ seatId: string }>(`/api/licenses/${trilhaId}/checkout-seat`, { assignedUserId: cenario.ana }),
      api.post<{ seatId: string }>(`/api/licenses/${trilhaId}/checkout-seat`, { assignedAssetId: cenario.ativo.id }),
    ]);
    for (const entrega of entregas) expect(entrega.status, JSON.stringify(entrega.body)).toBe(201);

    // Um evento de cada forma que o `changes` assume: diff, ids soltos e leitura.
    expect((await api.put(`/api/licenses/${trilhaId}`, { name: 'OEM da trilha (renomeada)' })).status).toBe(200);
    expect((await api.get(`/api/licenses/${trilhaId}/product-key`)).status).toBe(200);

    const antes = await api.get<{ seatsTotal: number; queimados: number; livres: number }>(
      `/api/licenses/${trilhaId}`,
    );
    // ⬇ A ARITMÉTICA DO AVISO, antes de devolver: 5 comprados, nenhum queimado,
    // 3 ocupados, 2 livres. O que vai RESTAR de utilizável é 4 — e `livres` (2)
    // era o número que a tela prometia antes da correção.
    expect(antes.body).toMatchObject({ seatsTotal: 5, queimados: 0, livres: 2 });
    expect(antes.body.seatsTotal - antes.body.queimados - 1).toBe(4);

    expect((await api.post(`/api/licenses/seats/${entregas[0].body.seatId}/checkin`, {})).status).toBe(200);

    const depois = await api.get<{ seatsTotal: number; queimados: number; livres: number }>(
      `/api/licenses/${trilhaId}`,
    );
    // E a promessa era verdadeira: utilizáveis = seatsTotal − queimados = 4.
    // `livres` subiu para 2 e continua sendo outra pergunta.
    expect(depois.body.seatsTotal - depois.body.queimados).toBe(4);
    expect(depois.body).toMatchObject({ seatsTotal: 5, queimados: 1, livres: 2 });
  });

  it('nenhuma ação aparece em CAIXA ALTA: todas têm rótulo em português', async () => {
    const { body } = await api.get<EventoDaLicenca[]>(`/api/licenses/${trilhaId}/history`);
    expect(body.length).toBeGreaterThanOrEqual(6);

    for (const evento of body) {
      const rotulo = rotuloDaAcao(evento.action, ACOES_DA_LICENCA);
      // `rotuloDaAcao` devolve a ação CRUA quando nenhum mapa a conhece — é o
      // sinal de que falta uma linha em `ACOES_DA_LICENCA`.
      expect(rotulo, `ação sem rótulo: ${evento.action}`).not.toBe(evento.action);
    }
  });

  it('nenhum campo aparece com o nome da coluna: todos têm rótulo', async () => {
    const { body } = await api.get<EventoDaLicenca[]>(`/api/licenses/${trilhaId}/history`);

    for (const evento of body) {
      const { mudancas, detalhes } = lerEvento(evento, ROTULOS_DA_LICENCA);
      for (const item of [...mudancas, ...detalhes]) {
        expect(item.rotulo, `campo sem rótulo em ${evento.action}: ${item.campo}`)
          .not.toBe(item.campo);
      }
    }
  });

  it('a revelação da chave aparece na trilha — e sem a chave', async () => {
    const { body } = await api.get<EventoDaLicenca[]>(`/api/licenses/${trilhaId}/history`);
    const leitura = body.find((evento) => evento.action === 'VIEW_KEY');
    expect(leitura).toBeDefined();

    // É ESTE par que faz o aviso do modal ("fica registrado no histórico") ser
    // verdade em vez de ameaça vazia.
    expect(rotuloDaAcao(leitura!.action, ACOES_DA_LICENCA)).toBe('Chave revelada');
    const { detalhes } = lerEvento(leitura!, ROTULOS_DA_LICENCA);
    expect(detalhes.map((d) => d.rotulo)).toContain('Revelada em');

    // E a chave não vaza pela tela do histórico, que é a quinta porta possível.
    expect(JSON.stringify(body)).not.toContain('CD34');
  });

  it('a queima e a edição aparecem legíveis, cada uma na sua forma', async () => {
    const { body } = await api.get<EventoDaLicenca[]>(`/api/licenses/${trilhaId}/history`);

    const queima = body.find((evento) => evento.action === 'RETIRE');
    expect(rotuloDaAcao(queima!.action, ACOES_DA_LICENCA)).toBe('Assento queimado');
    expect(lerEvento(queima!, ROTULOS_DA_LICENCA).detalhes.map((d) => d.rotulo))
      .toEqual(expect.arrayContaining(['Motivo', 'Assento']));

    // A edição é a OUTRA forma do `changes`: par `{de, para}`, que a tela
    // desenha como "de → para" em vez de valor solto.
    const edicao = body.find((evento) => evento.action === 'UPDATE');
    const { mudancas } = lerEvento(edicao!, ROTULOS_DA_LICENCA);
    expect(mudancas).toEqual(expect.arrayContaining([
      expect.objectContaining({ rotulo: 'Nome', de: 'OEM da trilha', para: 'OEM da trilha (renomeada)' }),
    ]));
  });
});
