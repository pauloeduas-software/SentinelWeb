import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse } from '../helpers/fixtures';

// AS DUAS CHAVES DA IMPORTAÇÃO NÃO TÊM PORTA PELA API (F10, D0/D131).
//
// `checkoutAt` retroativo e `semAviso` existem em `CheckoutData` para o
// importador de CSV chamar o MESMO use-case de entrega da tela — e não um
// segundo caminho que grava posse, que é o que o D17 recusa.
//
// O preço de existirem é este arquivo. Se a borda aceitasse as duas, qualquer
// cliente da API poderia:
//
//   `checkoutAt`  → fabricar histórico de posse com data escolhida, que é o
//                   dado usado para decidir quem responde por um equipamento
//                   desde quando;
//   `semAviso`    → entregar sem emitir termo e sem avisar ninguém, o que
//                   desliga em silêncio o fluxo de aceite inteiro da F4.
//
// A defesa não é um `if`: é o `strictObject` do `checkoutSchema`, que recusa
// chave desconhecida com 422. Este teste é o que garante que ela continua não
// estando lá — acrescentar as duas ao schema "para o formulário usar" é uma
// linha, e ela passaria sem este arquivo.
//
// O comportamento das duas (a data que de fato grava, e o silêncio que de fato
// silencia) é exercitado pelo caminho de quem as usa, em `apply.test.ts`: aqui
// só se prova que a porta da frente está fechada.

let api: ApiDeTeste;
let ativoId = '';
let lauraId = '';

beforeAll(async () => {
  api = await criarApi();
  const cenario = await cenarioDePosse(api);
  ativoId = cenario.ativo.id;
  lauraId = cenario.laura;
});

afterAll(async () => {
  await api.fechar();
});

/** O corpo que a tela de entrega monta — sem nenhuma das duas chaves. */
function corpoDaEntrega(sobrescrever: Record<string, unknown> = {}) {
  return { targetType: 'USER', targetUserId: lauraId, ...sobrescrever };
}

describe('POST /api/assets/:id/checkout e as chaves que só o importador conhece', () => {
  it('recusa `checkoutAt` com 422, nomeando a chave', async () => {
    const { status, body } = await api.post<{ fields?: Record<string, string> }>(
      `/api/assets/${ativoId}/checkout`,
      corpoDaEntrega({ checkoutAt: '2024-01-10' }),
    );

    expect(status).toBe(422);
    expect(body.fields?.checkoutAt).toMatch(/não reconhecido/);
  });

  it('recusa `semAviso` com 422, nomeando a chave', async () => {
    const { status, body } = await api.post<{ fields?: Record<string, string> }>(
      `/api/assets/${ativoId}/checkout`,
      corpoDaEntrega({ semAviso: true }),
    );

    expect(status).toBe(422);
    expect(body.fields?.semAviso).toMatch(/não reconhecido/);
  });

  it('aceita o mesmo corpo sem as duas chaves — o 422 é delas, não do resto', async () => {
    // O CONTROLE POSITIVO. Sem ele, os dois testes acima passariam igual se o
    // corpo estivesse errado por outro motivo qualquer, e o arquivo inteiro
    // provaria nada.
    const { status } = await api.post(`/api/assets/${ativoId}/checkout`, corpoDaEntrega());

    expect(status).toBe(201);
  });
});
