import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';
import { clienteComSessao, criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';
import { cenarioDePosse, criarAtivo } from '../helpers/fixtures';

// O PORTAL DO COLABORADOR — `GET /api/me/holdings` (F11, Etapa I).
//
// ═════════════════════════════════════════════════════════════════════════════
// AS DUAS COISAS QUE ESTE ARQUIVO PROVA, E A SEGUNDA É A QUE EVITA UM ESTRAGO.
//
// 1. **A rota funciona para quem não tem chave nenhuma.** A Laura é uma
//    colaboradora: ela não tem `users.view`, então `/api/users/:id/holdings`
//    responde 403 para ela — e é por isso que a rota `/api/me/holdings` existe. Se
//    a tela do portal dependesse da rota com `:id`, o portal seria uma tela que só
//    administrador abre.
//
// 2. **O balde do posto diz COM QUEM.** Sem a lista de co-ocupantes, "Mesa 1 ·
//    monitor LG" se lê como *o monitor é meu*: a Laura sai da empresa, devolve o
//    monitor da sala, e a Ana — que divide a mesa no turno da tarde — fica sem
//    monitor. A responsabilidade por equipamento de posto é COMPARTILHADA
//    (docs/MODELO-POSSE.md, Camada 2), e a tela tem de dizer isso.
// ═════════════════════════════════════════════════════════════════════════════

interface Holdings {
  diretos: { id: string; assetTag: string }[];
  porPosto: {
    id: string;
    assetTag: string;
    posto: {
      locationId: string;
      locationName: string;
      shift: string | null;
      coOcupantes: { id: string; name: string; shift: string | null }[];
    };
  }[];
  acessorios: unknown[];
  assentos: unknown[];
}

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
/** A sessão DA LAURA — uma colaboradora sem chave nenhuma. */
let laura: Cliente;
let ativoDireto = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  // A MESA 1 COM DUAS PESSOAS, que é o caso que nenhum ITAM de prateleira modela.
  const ocupouLaura = await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
    userId: cenario.laura, shift: 'Manhã',
  });
  expect(ocupouLaura.status).toBe(201);
  const ocupouAna = await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
    userId: cenario.ana, shift: 'Tarde',
  });
  expect(ocupouAna.status).toBe(201);

  // UM ativo para o POSTO…
  const paraOPosto = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
    targetType: 'LOCATION', targetLocationId: cenario.mesa1,
  });
  expect(paraOPosto.status).toBe(201);

  // …e UM no nome da Laura.
  const outro = await criarAtivo(api, {
    assetTag: 'ATV-PORTAL-DIRETO',
    statusId: cenario.statusDeployableId,
    modelId: cenario.modelId,
  });
  ativoDireto = outro.id;
  const paraLaura = await api.post(`/api/assets/${ativoDireto}/checkout`, {
    targetType: 'USER', targetUserId: cenario.laura,
  });
  expect(paraLaura.status).toBe(201);

  // A SESSÃO DA LAURA, pelas rotas: ela ganha senha e entra. Sem grupo nenhum —
  // é exatamente a pessoa para quem o portal existe.
  // O NOME DE ACESSO NUMA VARIÁVEL: `Date.now()` escrito duas vezes dá dois
  // valores, e o login falharia com 401 por um motivo que não tem nada a ver com o
  // que o arquivo testa.
  const acesso = `laura${Date.now()}`;
  const senha = 'Senha-Do-Portal-123';

  const credencial = await api.post(`/api/users/${cenario.laura}/set-password`, {
    username: acesso, password: senha,
  });
  expect(credencial.status).toBe(200);

  const entrada = await api.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: acesso, password: senha },
  });
  expect(entrada.statusCode).toBe(200);
  const cookie = entrada.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
  if (!cookie) throw new Error('login da Laura sem cookie');
  laura = clienteComSessao(api.app, cookie);
});

afterAll(async () => { await api.fechar(); });

describe('a rota de si mesmo', () => {
  it('responde para quem NÃO tem `users.view`', async () => {
    const resposta = await laura.get<Holdings>('/api/me/holdings');
    expect(resposta.status).toBe(200);
  });

  it('e a rota com `:id` responde 403 para a mesma pessoa', async () => {
    // É a razão de a rota de si mesmo existir: `/api/users/:id/holdings` fala de
    // OUTRA pessoa e exige `users.view`. Sem a rota irmã, o portal seria uma tela
    // que só administrador abre — ou uma tela que exige dar `users.view` a todo
    // mundo, que é pior.
    const resposta = await laura.get(`/api/users/${cenario.laura}/holdings`);
    expect(resposta.status).toBe(403);
  });

  it('nem o id da própria pessoa muda isso', async () => {
    // A permissão é da ROTA, não do alvo: o guard não sabe (e não deve saber) que
    // o `:id` da URL é o da sessão. Fosse por alvo, haveria uma segunda regra de
    // autorização escrita em outro lugar.
    expect((await laura.get(`/api/users/${cenario.ana}/holdings`)).status).toBe(403);
  });
});

describe('os dois baldes', () => {
  it('o direto traz só o que está no nome dela', async () => {
    const { body } = await laura.get<Holdings>('/api/me/holdings');

    expect(body.diretos.map((a) => a.assetTag)).toEqual(['ATV-PORTAL-DIRETO']);
  });

  it('o do posto traz o ativo da mesa, com o nome do posto e o turno dela', async () => {
    const { body } = await laura.get<Holdings>('/api/me/holdings');

    expect(body.porPosto).toHaveLength(1);
    expect(body.porPosto[0].posto.locationName).toBe('Mesa 1');
    expect(body.porPosto[0].posto.shift).toBe('Manhã');
  });

  it('e diz COM QUEM o posto é dividido — sem incluir ela mesma', async () => {
    const { body } = await laura.get<Holdings>('/api/me/holdings');

    const coOcupantes = body.porPosto[0].posto.coOcupantes;
    expect(coOcupantes).toHaveLength(1);
    expect(coOcupantes[0]).toMatchObject({ name: 'Ana Lima', shift: 'Tarde' });
    // ELA NÃO ESTÁ NA LISTA: a pessoa já sabe que responde, e repeti-la faria a
    // tela dizer "dividido com você".
    expect(coOcupantes.some((pessoa) => pessoa.id === cenario.laura)).toBe(false);
  });

  it('os dois nunca se somam: são listas separadas na resposta', async () => {
    const { body } = await laura.get<Holdings>('/api/me/holdings');

    // Não existe um total nesta resposta, e é o D33: somar direto com
    // compartilhado produz uma frase falsa sobre o que a pessoa deve devolver.
    expect(Object.hasOwn(body, 'total')).toBe(false);
    expect(Array.isArray(body.diretos) && Array.isArray(body.porPosto)).toBe(true);
  });
});

describe('a mesma resposta vista pela ficha do colaborador', () => {
  it('o administrador vê os mesmos dois baldes, pela rota com `:id`', async () => {
    // MESMO use-case, de propósito: a Camada 3 não pode ter uma versão para o
    // administrador e outra para o colaborador — uma segunda implementação
    // divergiria no primeiro caso de borda, e a pessoa veria uma lista diferente
    // da que o RH vê na ficha dela.
    const minha = await laura.get<Holdings>('/api/me/holdings');
    const dela = await api.get<Holdings>(`/api/users/${cenario.laura}/holdings`);

    expect(dela.status).toBe(200);
    expect(dela.body.diretos.map((a) => a.assetTag)).toEqual(minha.body.diretos.map((a) => a.assetTag));
    expect(dela.body.porPosto[0].posto.coOcupantes).toEqual(minha.body.porPosto[0].posto.coOcupantes);
  });
});
