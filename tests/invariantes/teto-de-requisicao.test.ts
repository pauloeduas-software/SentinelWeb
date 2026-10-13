import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tetoDeRequisicaoLigado } from '../../server/core/config/env';
import { criarApi, type ApiDeTeste, type Resposta } from '../helpers/app';

// O TETO DE REQUISIÇÕES POR IP — o único lugar da suíte onde ele é o assunto.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO EXISTE, e por que ele é o único assim.
//
// O limitador NÃO é registrado no ambiente de teste (`server/app.ts`,
// `comTetoDeRequisicao`): a suíte vem de um IP só e cada arquivo é uma rajada, e
// o teto media o tamanho do arquivo em vez de medir abuso. O preço de desligá-lo
// é este: a defesa deixa de ser exercitada por acidente em toda rota, e passa a
// depender de alguém prová-la de propósito. É o que este arquivo faz.
//
// Ele monta DUAS aplicações — uma como todo o resto da suíte a monta, outra com
// o limitador ligado — e compara as duas na MESMA rajada. É essa comparação que
// prova as duas metades de uma vez: que o teto some no teste (ou o primeiro caso
// falharia) e que ele morde quando está de pé (ou o segundo falharia). Um teste
// só, de um lado só, não distinguiria "o teto está desligado" de "o teto está
// ligado e o número está errado".
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A rota da rajada: criar fabricante, que é `WRITE_RATE_LIMIT`.
 *
 * O CORPO VAI `{}` DE PROPÓSITO. O teto é um hook `onRequest` — ele conta a
 * requisição antes de o handler existir —, então o contador sobe sem criar 41
 * fabricantes. O 422 que volta é a prova de que a requisição ATRAVESSOU o
 * limitador e chegou ao schema: é ele que distingue "passou" de "foi barrada",
 * e é por isso que a asserção olha o 422 em vez de só não olhar o 429.
 */
const ROTA = '/api/manufacturers';

/** O `max` de `WRITE_RATE_LIMIT` (server/core/http/write-rate-limit.ts). */
const TETO_DE_ESCRITA = 40;

let semTeto: ApiDeTeste;
let comTeto: ApiDeTeste;

beforeAll(async () => {
  semTeto = await criarApi();
  // A única chamada do projeto que liga o limitador. Se um dia houver outra,
  // ela é um erro: o resto da suíte não quer contador nenhum.
  comTeto = await criarApi({ comTetoDeRequisicao: true });
});

afterAll(async () => {
  await semTeto.fechar();
  await comTeto.fechar();
});

async function rajada(api: ApiDeTeste, quantas: number): Promise<Resposta<{ error: string }>[]> {
  const respostas: Resposta<{ error: string }>[] = [];
  // Em série, e não `Promise.all`: a ordem importa — a asserção é sobre QUAL
  // requisição foi a barrada, e em paralelo o plugin contaria as 41 em ordem
  // indeterminada.
  for (let i = 0; i < quantas; i += 1) {
    respostas.push(await api.post<{ error: string }>(ROTA, {}));
  }
  return respostas;
}

describe('o teto de requisições por IP', () => {
  it('no harness não existe: a rajada inteira chega ao schema', async () => {
    const respostas = await rajada(semTeto, TETO_DE_ESCRITA + 1);

    // Todas, inclusive a que seria a 41ª: nenhuma barrada.
    expect(respostas.map((r) => r.status)).toEqual(Array(TETO_DE_ESCRITA + 1).fill(422));
  });

  it('ligado, barra a requisição seguinte ao teto — e a mensagem é a nossa', async () => {
    const respostas = await rajada(comTeto, TETO_DE_ESCRITA + 1);

    // As 40 primeiras atravessam o limitador e morrem no schema.
    expect(respostas.slice(0, TETO_DE_ESCRITA).map((r) => r.status))
      .toEqual(Array(TETO_DE_ESCRITA).fill(422));

    const barrada = respostas[TETO_DE_ESCRITA];
    expect(barrada.status).toBe(429);
    // A MENSAGEM É NOSSA, e isso é a outra metade do que se prova aqui: o plugin
    // LANÇA o 429 em vez de responder, e quem o traduz é o
    // `core/errors/error-handler.ts` — o único lugar do sistema que monta
    // resposta de erro. Sem o caso de 429 lá, isto virava "Requisição inválida",
    // que não diz o que fazer, ou um 500.
    expect(barrada.body.error).toBe('Muitas requisições. Tente novamente em instantes.');

    // E O TETO É POR ROTA. A leitura da MESMA entidade continua respondendo com
    // a escrita já estourada — senão o limitador de um formulário derrubaria a
    // tela inteira de quem o preencheu rápido demais. A asserção fica aqui, no
    // mesmo caso, porque ela fala do contador que esta rajada acabou de esgotar:
    // num `it` à parte ela dependeria da ordem dos testes, ou gastaria outras 41
    // requisições para reconstruir o mesmo estado.
    expect((await comTeto.get(ROTA)).status).toBe(200);
  });

  it('a decisão de ligar ou não é do AMBIENTE, e só o teste dispensa', () => {
    // O que a produção sobe depende do sentido desta comparação, e nenhum teste
    // pode montar uma aplicação de produção para conferir o padrão do `buildApp`.
    // Aqui a decisão é afirmada direto: inverter o `!==` fica vermelho.
    expect(tetoDeRequisicaoLigado('production')).toBe(true);
    expect(tetoDeRequisicaoLigado('development')).toBe(true);
    // `npm run dev` não define NODE_ENV nenhum: o caso ausente é o de
    // desenvolvimento, e é o mais fácil de esquecer.
    expect(tetoDeRequisicaoLigado(undefined)).toBe(true);
    expect(tetoDeRequisicaoLigado('test')).toBe(false);
  });
});
