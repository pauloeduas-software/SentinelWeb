import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarLocal } from '../helpers/fixtures';

// A CONFERÊNCIA FÍSICA — docs/FASE-8-PLANO-ITAM.md, Etapa B.
//
// ═════════════════════════════════════════════════════════════════════════════
// O PRIMEIRO TESTE DESTE ARQUIVO É A AMARRA DA FASE (D52).
//
// Auditar na Mesa 2 um ativo entregue à Mesa 1 tem que mover `Asset.locationId` e
// NÃO TOCAR a `Assignment`. É o tipo de regra que um refactor bem-intencionado
// quebra: "se o ativo está na Mesa 2, a posse devia apontar para lá" parece
// conserto e é transferência de RESPONSABILIDADE a partir de um palpite —
// empréstimo de uma tarde e mudança de posto são indistinguíveis pela observação.
//
// Se este teste falhar, o `MODELO-POSSE.md` deixou de valer: a Laura e a Ana
// param de responder pelo equipamento sem ninguém ter assinado nada.
// ═════════════════════════════════════════════════════════════════════════════

// ⚠️ CADA `it` MONTA O PRÓPRIO CENÁRIO, E POR ISSO PASSA UM SUFIXO.
//
// `cenarioDePosse` cria fabricante, posto e dois colaboradores com nomes fixos, e
// os três têm unicidade no banco (`@unique` nos dois primeiros, índice parcial no
// e-mail). Sem o sufixo, a segunda chamada no mesmo arquivo morre com 409
// "Registro já existe" VINDO DE DENTRO DO FIXTURE — que se lê como defeito da
// aplicação, não do teste. Era o que este arquivo fazia: sete dos oito `it`
// falhavam antes de exercitar qualquer regra.
//
// O sufixo é descritivo e não um contador: quem vê o 409 quer saber qual teste o
// produziu, e "(posto-vago)" responde de graça.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('a amarra da fase (D52)', () => {
  it('conferir em outro posto move a LOCALIZAÇÃO e deixa a POSSE intacta', async () => {
    const cenario = await cenarioDePosse(api, ' (d52)');
    const mesa2 = await criarLocal(api, { name: 'Mesa 2 da auditoria', isWorkstation: true });

    // O ativo é ENTREGUE à Mesa 1 (alvo LOCATION) e sua localização é a Mesa 1.
    expect((await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: cenario.mesa1,
    })).status).toBe(201);

    await api.put(`/api/assets/${cenario.ativo.id}`, { locationId: cenario.mesa1 });

    // O auditor acha o equipamento na Mesa 2.
    const auditoria = await api.post<{
      result: string; locationIdBefore: string | null; locationIdFound: string | null;
      divergenciaDePosse: boolean;
    }>(`/api/assets/${cenario.ativo.id}/audit`, {
      result: 'DIVERGENTE',
      locationIdFound: mesa2,
    });

    expect(auditoria.status).toBe(201);
    expect(auditoria.body.locationIdBefore).toBe(cenario.mesa1);
    expect(auditoria.body.locationIdFound).toBe(mesa2);
    // A posse aponta para a Mesa 1 e o ativo está na Mesa 2: divergência de posse.
    expect(auditoria.body.divergenciaDePosse).toBe(true);

    const [ativo, posse] = await Promise.all([
      prisma.asset.findUniqueOrThrow({
        where: { id: cenario.ativo.id },
        select: { locationId: true, lastAuditAt: true },
      }),
      prisma.assignment.findFirstOrThrow({
        where: { assetId: cenario.ativo.id, checkinAt: null },
        select: { targetLocationId: true, targetType: true },
      }),
    ]);

    // AS DUAS ASSERÇÕES QUE IMPORTAM.
    expect(ativo.locationId).toBe(mesa2);            // moveu o LUGAR
    expect(posse.targetLocationId).toBe(cenario.mesa1); // NÃO moveu a POSSE
    expect(ativo.lastAuditAt).not.toBeNull();
  });
});

describe('a coerência do resultado', () => {
  it('recusa OK quando o ativo foi achado em outro lugar (422)', async () => {
    const cenario = await cenarioDePosse(api, ' (ok-em-outro-lugar)');
    const outroLocal = await criarLocal(api, { name: 'Sala do OK incoerente' });
    await api.put(`/api/assets/${cenario.ativo.id}`, { locationId: cenario.mesa1 });

    // O sistema RECUSA em vez de reinterpretar: corrigir em silêncio para
    // DIVERGENTE funcionaria, e por isso mesmo é pior — quem mandou continuaria
    // achando que "OK com local diferente" significa alguma coisa.
    const resposta = await api.post(`/api/assets/${cenario.ativo.id}/audit`, {
      result: 'OK',
      locationIdFound: outroLocal,
    });

    expect(resposta.status).toBe(422);
  });

  it('recusa NAO_LOCALIZADO com local encontrado (422)', async () => {
    const cenario = await cenarioDePosse(api, ' (nao-localizado)');
    const local = await criarLocal(api, { name: 'Sala do não localizado' });

    const resposta = await api.post(`/api/assets/${cenario.ativo.id}/audit`, {
      result: 'NAO_LOCALIZADO',
      locationIdFound: local,
    });

    expect(resposta.status).toBe(422);
  });

  it('recusa `method` no corpo — toda auditoria por HTTP é MANUAL', async () => {
    const cenario = await cenarioDePosse(api, ' (method-no-corpo)');

    // Aceitar `method: 'AGENTE'` deixaria qualquer cliente carimbar uma
    // conferência como se o agente tivesse confirmado o número de série.
    const resposta = await api.post(`/api/assets/${cenario.ativo.id}/audit`, {
      result: 'OK',
      method: 'AGENTE',
    });

    expect(resposta.status).toBe(422);
  });
});

describe('os dois sinais que o sistema MARCA e nunca corrige', () => {
  it('marca `postoVago` quando a posse aponta para posto sem ocupante', async () => {
    const seed = await cenarioDePosse(api, ' (posto-vago)');
    const mesaVazia = await criarLocal(api, { name: 'Mesa sem ninguém', isWorkstation: true });

    await api.post(`/api/assets/${seed.ativo.id}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: mesaVazia,
    });
    await api.put(`/api/assets/${seed.ativo.id}`, { locationId: mesaVazia });

    const auditoria = await api.post<{ postoVago: boolean; divergenciaDePosse: boolean }>(
      `/api/assets/${seed.ativo.id}/audit`,
      { result: 'OK' },
    );

    expect(auditoria.body.postoVago).toBe(true);
    // Está no posto da posse: NÃO é divergência de posse. Os dois sinais são
    // independentes, e confundi-los faria todo posto vago parecer posse errada.
    expect(auditoria.body.divergenciaDePosse).toBe(false);
  });

  it('não marca divergência de posse quando o alvo é uma PESSOA', async () => {
    const cenario = await cenarioDePosse(api, ' (alvo-pessoa)');
    const sala = await criarLocal(api, { name: 'Sala de reunião da auditoria' });

    await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });
    await api.put(`/api/assets/${cenario.ativo.id}`, { locationId: cenario.mesa1 });

    const auditoria = await api.post<{ divergenciaDePosse: boolean }>(
      `/api/assets/${cenario.ativo.id}/audit`,
      { result: 'DIVERGENTE', locationIdFound: sala },
    );

    // O notebook da Laura na sala de reunião não é divergência nenhuma: é
    // terça-feira. Com alvo USER o sistema não sabe onde a pessoa está.
    expect(auditoria.body.divergenciaDePosse).toBe(false);
  });
});

describe('a conferência por posto (D54)', () => {
  it('cria UMA linha por ativo e deduz o resultado de cada um', async () => {
    const cenario = await cenarioDePosse(api, ' (por-posto)');
    const mesa = await criarLocal(api, { name: 'Mesa da conferência em lote', isWorkstation: true });

    const [aqui, sumido, visitante] = await Promise.all([
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Está aqui', locationId: mesa }),
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Sumiu', locationId: mesa }),
      criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Visitante', locationId: cenario.mesa1 }),
    ]);

    const lista = await api.get<{ doPosto: unknown[]; noPosto: { asset: { id: string } }[] }>(
      `/api/locations/${mesa}/auditoria`,
    );
    expect(lista.body.noPosto.map((item) => item.asset.id).sort()).toEqual([aqui.id, sumido.id].sort());

    const resultado = await api.post<{ auditorias: { assetId: string; result: string }[]; divergentes: number }>(
      `/api/locations/${mesa}/auditoria`,
      { encontrados: [aqui.id, visitante.id], naoLocalizados: [sumido.id] },
    );

    expect(resultado.status).toBe(201);
    // TRÊS linhas de `Audit`, uma por ativo — não uma linha de posto.
    expect(resultado.body.auditorias).toHaveLength(3);

    const porAtivo = new Map(resultado.body.auditorias.map((linha) => [linha.assetId, linha.result]));
    expect(porAtivo.get(aqui.id)).toBe('OK');                 // achado onde já estava
    expect(porAtivo.get(visitante.id)).toBe('DIVERGENTE');    // achado, estava noutro lugar
    expect(porAtivo.get(sumido.id)).toBe('NAO_LOCALIZADO');   // não apareceu
    expect(resultado.body.divergentes).toBe(1);

    // O visitante foi MOVIDO para a mesa; o sumido NÃO se moveu.
    const [depoisVisitante, depoisSumido] = await Promise.all([
      prisma.asset.findUniqueOrThrow({ where: { id: visitante.id }, select: { locationId: true } }),
      prisma.asset.findUniqueOrThrow({ where: { id: sumido.id }, select: { locationId: true, lastAuditAt: true } }),
    ]);
    expect(depoisVisitante.locationId).toBe(mesa);
    expect(depoisSumido.locationId).toBe(mesa);
    // `lastAuditAt` AVANÇA até no não localizado: a conferência aconteceu. Não
    // avançar faria o ativo desaparecido aparecer como "nunca conferido" para
    // sempre, escondendo o problema real atrás de um problema de dado.
    expect(depoisSumido.lastAuditAt).not.toBeNull();
  });

  it('recusa o mesmo ativo nas duas listas (422)', async () => {
    const cenario = await cenarioDePosse(api, ' (duas-listas)');
    const mesa = await criarLocal(api, { name: 'Mesa da contradição', isWorkstation: true });

    const resposta = await api.post(`/api/locations/${mesa}/auditoria`, {
      encontrados: [cenario.ativo.id],
      naoLocalizados: [cenario.ativo.id],
    });

    expect(resposta.status).toBe(422);
  });

  it('recusa conferência vazia (422)', async () => {
    const mesa = await criarLocal(api, { name: 'Mesa vazia da conferência', isWorkstation: true });

    const resposta = await api.post(`/api/locations/${mesa}/auditoria`, {
      encontrados: [], naoLocalizados: [],
    });

    expect(resposta.status).toBe(422);
  });
});

describe('a coluna que NÃO nasceu (D53)', () => {
  it('`assets` tem `lastAuditAt` e não tem `nextAuditAt`', async () => {
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'assets' AND column_name IN ('lastAuditAt', 'nextAuditAt')
    `;

    const nomes = colunas.map((coluna) => coluna.column_name);
    expect(nomes).toContain('lastAuditAt');
    // `nextAuditAt` seria `lastAuditAt + intervalo`, e o intervalo é configuração
    // GLOBAL: no dia em que alguém trocar 12 meses por 6, toda linha gravada antes
    // passaria a mentir.
    expect(nomes).not.toContain('nextAuditAt');
  });
});
