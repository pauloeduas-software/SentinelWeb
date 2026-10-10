import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo, criarColaborador } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// A FILA E QUEM SAIU DA EMPRESA.
//
// O buraco: a reconciliação escolhia a pessoa pelo casamento da conta do Windows
// com o cadastro, e NUNCA olhava se ela continuava operando. Então a fila
// propunha posse e ocupação para gente desativada, e o `isActive` só era
// conferido no fim, no aceite — onde cobria UM dos três tipos:
//
//   | Tipo          | No aceite, antes disto                              |
//   |---------------|-----------------------------------------------------|
//   | `CHECKOUT`    | 409 do `checkoutAsset`                              |
//   | `OCCUPANCY`   | **201** — ocupante cadastrado                        |
//   | `SHARED_POST` | **201** — ocupantes cadastrados                      |
//
// E ocupante de posto responde pelos ativos do posto (`resolverResponsaveis`):
// a brecha reabria por posse DERIVADA exatamente a responsabilidade que a
// desativação fecha, sem nunca passar por um checkout.
//
// Agora o portão é na PROPOSTA (`proporSugestao`, passo 0), que é o funil das
// três, e a fila aprende a desativação como aprende qualquer outra mudança do
// mundo: `SUPERSEDED` (D110), nunca `REJECTED` — ninguém disse não.
//
// ARQUIVO PRÓPRIO, e não mais um `describe` no ciclo-de-vida-da-fila: o teto do
// rate limit é contado POR INSTÂNCIA do Fastify (`helpers/app.ts`), e há uma
// instância por arquivo. Acrescentar estes casos lá dentro estourava o teto do
// arquivo e o `POST /endpoints/:id/link` passava a tomar 429 — com o endpoint
// ficando sem vínculo e a sugestão não nascendo por um motivo que não tem nada
// a ver com o que se está testando.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' (desativada)');
});

afterAll(async () => {
  await api.fechar();
});

/**
 * A presença de alguém ao longo de vários dias.
 *
 * Insert direto, como nos outros arquivos da descoberta e pelo mesmo motivo: a
 * "API" que escreve estas linhas é o agente mandando handshake em dias
 * diferentes, e nenhum teste espera três dias. O que se simula é o CALENDÁRIO.
 *
 * 13h UTC = 10h em São Paulo, e o turno é inferido em hora local: com
 * `new Date()` o rótulo dependeria da hora em que a suíte roda.
 */
async function observar(endpointId: string, userKey: string, userId: string, dias = 4, horaUtc = 13) {
  const hoje = new Date();
  for (let voltar = 1; voltar <= dias; voltar += 1) {
    const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - voltar));
    const instante = new Date(dia.getTime() + horaUtc * 60 * 60 * 1000);
    await prisma.endpointUserDaily.create({
      data: { endpointId, userKey, userId, day: dia, firstSeenAt: instante, lastSeenAt: instante, samples: 6 },
    });
  }
}

/**
 * Uma máquina vinculada a um ativo, pronta para observação.
 *
 * O `expect` no vínculo não é cerimônia: sem ele, um 429 ou um 409 aqui deixa o
 * endpoint sem `assetId` e TODO caso do arquivo falha na asserção final, dizendo
 * "a sugestão não nasceu" quando o que não aconteceu foi o vínculo.
 */
async function maquinaVinculada(hwid: string, assetId: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  const vinculo = await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
  expect(vinculo.status, `vínculo de ${hwid}: ${JSON.stringify(vinculo.body)}`).toBe(201);
  return endpoint.id;
}

const novoAtivo = (nome: string) => criarAtivo(api, {
  statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: nome,
});

const pendentesDe = (endpointId: string, kind: string) =>
  prisma.reconciliationSuggestion.count({
    where: { endpointId, kind: kind as never, state: 'PENDING' },
  });

/** Um colaborador só deste caso: desativar os do cenário envenenaria o arquivo. */
const colaboradorProprio = (marca: string) => criarColaborador(api, {
  name: `Desativavel ${marca}`,
  email: `desativavel.${marca}@teste.local`,
});

const desativar = (userId: string) => api.put(`/api/users/${userId}`, { isActive: false });
const reativar = (userId: string) => api.put(`/api/users/${userId}`, { isActive: true });

describe('desativado não gera sugestão nova', () => {
  it('a evidência que geraria CHECKOUT não gera nada', async () => {
    const pessoa = await colaboradorProprio('antes');
    expect((await desativar(pessoa)).status).toBe(200);

    const ativo = await novoAtivo('pc-inativa-antes');
    const endpointId = await maquinaVinculada('inativa-1', ativo.id);
    // A MESMA evidência que gera checkout para quem está ativo: quatro dias de
    // presença recorrente. O que muda é só o estado da pessoa.
    await observar(endpointId, 'desativavel.antes', pessoa);

    await rodarReconciliacao();

    // Nem PENDING, nem SUPERSEDED, nem REJECTED: a proposta não foi escrita, não
    // foi recusada e não foi substituída. Ela não aconteceu.
    expect(await prisma.reconciliationSuggestion.count({ where: { endpointId } })).toBe(0);
  });

  it('nem a OCUPAÇÃO, que é o ramo que o 409 do aceite não cobria', async () => {
    const pessoa = await colaboradorProprio('posto');
    expect((await desativar(pessoa)).status).toBe(200);

    const ativo = await novoAtivo('pc-inativa-posto');
    const endpointId = await maquinaVinculada('inativa-2', ativo.id);
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    })).status).toBe(201);

    await observar(endpointId, 'desativavel.posto', pessoa);
    await rodarReconciliacao();

    expect(await prisma.reconciliationSuggestion.count({ where: { endpointId } })).toBe(0);
  });
});

describe('desativado DEPOIS: a pendente sai da fila', () => {
  it('vira SUPERSEDED, e a mesma rodada não a recria', async () => {
    const pessoa = await colaboradorProprio('depois');
    const ativo = await novoAtivo('pc-inativa-depois');
    const endpointId = await maquinaVinculada('inativa-3', ativo.id);
    await observar(endpointId, 'desativavel.depois', pessoa);

    await rodarReconciliacao();
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect(sugestao.targetUserId).toBe(pessoa);

    expect((await desativar(pessoa)).status).toBe(200);
    await rodarReconciliacao();

    // SUPERSEDED e não REJECTED: ninguém disse não, a pessoa saiu da empresa.
    const depois = await prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id: sugestao.id } });
    expect(depois.state).toBe('SUPERSEDED');
    expect(depois.resolvedAt).not.toBeNull();

    // E A MESMA RODADA NÃO A RECRIOU. É a prova de que as duas metades se
    // encaixam: a invalidação roda antes de propor, e uma afirmação
    // `SUPERSEDED` é reoferecida quando volta a valer — sem a guarda na
    // proposta, ela voltaria a `PENDING` no mesmo job.
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(0);
  });

  it('reativar devolve a sugestão à fila, da mesma evidência', async () => {
    const pessoa = await colaboradorProprio('volta');
    const ativo = await novoAtivo('pc-inativa-volta');
    const endpointId = await maquinaVinculada('inativa-4', ativo.id);
    await observar(endpointId, 'desativavel.volta', pessoa);

    await rodarReconciliacao();
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(1);

    expect((await desativar(pessoa)).status).toBe(200);
    await rodarReconciliacao();
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(0);

    // É ISTO que `SUPERSEDED` compra e que `REJECTED` teria enterrado: quem
    // voltou para a empresa volta para a fila, sem ninguém reprocessar nada.
    expect((await reativar(pessoa)).status).toBe(200);
    await rodarReconciliacao();

    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(1);
  });
});
