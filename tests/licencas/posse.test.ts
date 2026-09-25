import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarLicenca,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// A COSTURA COM A POSSE (D93) — a etapa que o plano prospectivo da F6 não tinha.
//
// ═════════════════════════════════════════════════════════════════════════════
// A PERGUNTA QUE DECIDE se algo é posse não é "tem tabela própria?", é
// *"alguém responde por isto quando a pessoa sai?"*.
//
// Assento de licença responde SIM: ele custa dinheiro por mês e é nominal. A F5
// já respondeu isso para o acessório, e a resposta mudou quatro arquivos fora
// do domínio dela. A F6 responde igual.
//
// SEM ESTA COSTURA o desligamento fecharia tudo MENOS a licença, e o sintoma
// não é um erro — é um número de assentos ocupados que nunca desce. A empresa
// compra assento novo porque "não tem livre", e os livres estão com gente que
// saiu. É o D82 outra vez: o passo que não dá erro quando falta é o que precisa
// estar escrito no mesmo lugar dos outros.
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

async function abertosDoUsuario(userId: string): Promise<number> {
  return prisma.licenseSeatCheckout.count({ where: { assignedUserId: userId, checkinAt: null } });
}

async function abertosDoAtivo(assetId: string): Promise<number> {
  return prisma.licenseSeatCheckout.count({ where: { assignedAssetId: assetId, checkinAt: null } });
}

describe('o desligamento leva o assento junto', () => {
  it('fecha os assentos da PESSOA e devolve o placar', async () => {
    const pessoa = await criarColaborador(api, { name: 'Bruno Dias', email: 'bruno@teste.local' });
    const licenca = await criarLicenca(api, {
      name: 'Adobe CC', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
    });

    expect((await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: pessoa })).status).toBe(201);
    expect(await abertosDoUsuario(pessoa)).toBe(1);

    const desligamento = await api.post<{ assentosDevolvidos: { licenseName: string; queimado: boolean }[] }>(
      `/api/users/${pessoa}/offboard`, {},
    );
    expect(desligamento.status).toBe(200);
    expect(desligamento.body.assentosDevolvidos).toEqual([
      expect.objectContaining({ licenseName: 'Adobe CC', queimado: false }),
    ]);

    // O ASSENTO VOLTOU AO CONTRATO.
    expect(await abertosDoUsuario(pessoa)).toBe(0);
    const { body } = await api.get<{ livres: number; ocupados: number }>(`/api/licenses/${licenca.id}`);
    expect(body).toMatchObject({ livres: 3, ocupados: 0 });
  });

  it('NÃO fecha o assento do ATIVO — ele não é da pessoa', async () => {
    // A assimetria declarada do D93, e o erro que ela evita: devolver o assento
    // do desktop faria o inventário dizer que ele está livre, alguém o
    // entregaria a outra pessoa, e a máquina ficaria rodando software sem
    // licença atribuída. Exposição DUPLA — pior que a do acessório, onde a
    // unidade pelo menos fica parada na mesa.
    const pessoa = await criarColaborador(api, { name: 'Carla Reis', email: 'carla@teste.local' });
    const desktop = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Desktop da Mesa 1',
    });
    const licenca = await criarLicenca(api, {
      name: 'Windows 11 Pro', categoryId: cenario.categoriaLicencaId, seatsTotal: 4,
    });

    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: pessoa });
    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: desktop.id });

    const desligamento = await api.post<{ assentosDevolvidos: unknown[] }>(
      `/api/users/${pessoa}/offboard`, {},
    );
    expect(desligamento.status).toBe(200);
    expect(desligamento.body.assentosDevolvidos).toHaveLength(1);

    expect(await abertosDoUsuario(pessoa)).toBe(0);
    // ⬇ A linha inteira deste teste: o assento da MÁQUINA continua aberto.
    expect(await abertosDoAtivo(desktop.id)).toBe(1);
  });

  it('QUEIMA no desligamento, e o placar separa a perda da devolução', async () => {
    const pessoa = await criarColaborador(api, { name: 'Davi Melo', email: 'davi@teste.local' });
    const licenca = await criarLicenca(api, {
      name: 'CAD OEM', categoryId: cenario.categoriaLicencaId, seatsTotal: 2, reassignable: false,
    });

    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: pessoa });

    const desligamento = await api.post<{ assentosDevolvidos: { queimado: boolean }[] }>(
      `/api/users/${pessoa}/offboard`, {},
    );
    expect(desligamento.body.assentosDevolvidos[0].queimado).toBe(true);

    // 2 comprados, 1 utilizável. Perda patrimonial acontecendo num fluxo
    // automático, em que ninguém está olhando para a licença.
    const { body } = await api.get<{ seatsTotal: number; livres: number; queimados: number }>(
      `/api/licenses/${licenca.id}`,
    );
    expect(body).toMatchObject({ seatsTotal: 2, livres: 1, queimados: 1 });

    // O log do DESLIGAMENTO carrega o placar da perda, separado do da devolução.
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: 'User', entityId: pessoa, action: 'OFFBOARD' },
      select: { changes: true },
    });
    expect(log.changes).toMatchObject({ assentosDevolvidos: 1, assentosQueimados: 1 });
  });
});

describe('o 409 do DELETE conhece o assento', () => {
  it('não deixa excluir quem ainda ocupa assento, e diz quantos', async () => {
    const pessoa = await criarColaborador(api, { name: 'Elisa Gomes', email: 'elisa@teste.local' });
    const licenca = await criarLicenca(api, {
      name: 'Jira', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });
    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: pessoa });

    const recusa = await api.delete<{ error: string; assentosEmPosse: number }>(
      `/api/users/${pessoa}`,
    );
    expect(recusa.status).toBe(409);
    // A frase diz QUANTOS e por qual camada — sem isso o operador procura no
    // lugar errado, e a camada da licença é justamente a que ninguém lembra.
    expect(recusa.body.error).toContain('1 assento de licença');
    expect(recusa.body.error).toContain('Faça o desligamento antes de excluir');
    // E O NÚMERO TAMBÉM NOS `details`: é por eles que a tela decide abrir o
    // modal de desligamento, sem reparsear uma frase em português. Sem
    // `assentosEmPosse`, quem só ocupa assento recebia um 409 com todos os
    // números em zero e a tela concluía que não havia nada a desligar.
    expect(recusa.body.assentosEmPosse).toBe(1);
  });

  it('não deixa excluir ativo que ainda ocupa assento', async () => {
    const maquina = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Estação CAD',
    });
    const licenca = await criarLicenca(api, {
      name: 'SolidWorks', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });
    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: maquina.id });

    const recusa = await api.delete<{ error: string }>(`/api/assets/${maquina.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('1 assento de licença');
    expect(recusa.body.error).toContain('aba Licenças');
  });
});

describe('quem não pode receber assento', () => {
  it('desligado responde 409 — a pessoa existe, o estado recusa', async () => {
    const pessoa = await criarColaborador(api, { name: 'Felipe Rocha', email: 'felipe@teste.local' });
    await api.post(`/api/users/${pessoa}/offboard`, {});

    const licenca = await criarLicenca(api, {
      name: 'Slack', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
    });

    const recusa = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedUserId: pessoa },
    );
    // Sem esta recusa, entregar a quem saiu reabriria — uma linha depois do
    // desligamento — exatamente a pendência que o desligamento fechou.
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('desligado');
  });
});

describe('a aba Licenças do ativo', () => {
  it('lista o que está licenciado NAQUELA máquina', async () => {
    const maquina = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Notebook do Design',
    });
    const licenca = await criarLicenca(api, {
      name: 'Figma Org', categoryId: cenario.categoriaLicencaId, seatsTotal: 3,
    });
    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: maquina.id });

    const { status, body } = await api.get<{ seat: { license: { name: string } } }[]>(
      `/api/assets/${maquina.id}/licenses`,
    );
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].seat.license.name).toBe('Figma Org');
  });
});

describe('o holdings promete o que o desligamento cumpre', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // A TELA DO PERFIL É A ÚNICA QUE MOSTRA ASSENTO ANTES DE ALGUÉM DESLIGAR.
  //
  // Ninguém tropeça num assento de licença como tropeça num notebook em cima da
  // mesa: ele não tem etiqueta, não ocupa espaço e não aparece em lugar nenhum
  // do inventário físico. Se `holdings` não o devolve, o modal do desligamento
  // não tem como listá-lo — e a operação fecha (às vezes QUEIMA) um assento que
  // a tela nunca mostrou.
  //
  // Por isso o conjunto desta lista tem que ser EXATAMENTE o que o `offboard`
  // fecha. É o que o segundo teste prova.
  // ═══════════════════════════════════════════════════════════════════════════

  it('mostra os assentos da PESSOA e não os do ATIVO', async () => {
    const pessoa = await criarColaborador(api, { name: 'Ígor Nunes', email: 'igor@teste.local' });
    const maquina = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Desktop do Ígor',
    });

    const daPessoa = await criarLicenca(api, {
      name: 'Notion Team', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });
    const daMaquina = await criarLicenca(api, {
      name: 'AutoCAD', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });

    await api.post(`/api/licenses/${daPessoa.id}/checkout-seat`, { assignedUserId: pessoa });
    await api.post(`/api/licenses/${daMaquina.id}/checkout-seat`, { assignedAssetId: maquina.id });

    const { status, body } = await api.get<{ assentos: { licenseName: string }[] }>(
      `/api/users/${pessoa}/holdings`,
    );
    expect(status).toBe(200);

    // O AutoCAD está no desktop que o Ígor usa, e NÃO aparece aqui: ele é da
    // máquina (D39). Mostrá-lo mandaria o operador procurar no desligamento uma
    // devolução que nunca vai acontecer.
    expect(body.assentos.map((assento) => assento.licenseName)).toEqual(['Notion Team']);
  });

  it('a lista é exatamente o conjunto que o offboard fecha, queima inclusive', async () => {
    const pessoa = await criarColaborador(api, { name: 'Júlia Alves', email: 'julia@teste.local' });

    const volta = await criarLicenca(api, {
      name: 'Zoom Pro', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });
    const queima = await criarLicenca(api, {
      name: 'Plugin OEM', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
      reassignable: false,
    });

    await api.post(`/api/licenses/${volta.id}/checkout-seat`, { assignedUserId: pessoa });
    await api.post(`/api/licenses/${queima.id}/checkout-seat`, { assignedUserId: pessoa });

    const antes = await api.get<{ assentos: { checkoutId: string; reassignable: boolean }[] }>(
      `/api/users/${pessoa}/holdings`,
    );

    // A PROMESSA: o modal lê `reassignable` para pintar o aviso vermelho de
    // queima. Errar este campo é prometer devolução e entregar destruição.
    expect(antes.body.assentos).toHaveLength(2);
    expect(antes.body.assentos.filter((assento) => !assento.reassignable)).toHaveLength(1);

    const desligamento = await api.post<{
      assentosDevolvidos: { checkoutId: string; queimado: boolean }[];
    }>(`/api/users/${pessoa}/offboard`, {});

    // O CUMPRIMENTO: mesmos `checkoutId`, e a queima caiu em quem a tela avisou.
    expect(new Set(desligamento.body.assentosDevolvidos.map((a) => a.checkoutId)))
      .toEqual(new Set(antes.body.assentos.map((a) => a.checkoutId)));

    const queimadoNaPromessa = antes.body.assentos.find((a) => !a.reassignable)!.checkoutId;
    const queimadoNoFato = desligamento.body.assentosDevolvidos.filter((a) => a.queimado);
    expect(queimadoNoFato).toHaveLength(1);
    expect(queimadoNoFato[0].checkoutId).toBe(queimadoNaPromessa);

    // E a lista esvaziou: não sobrou assento pendurado em quem saiu.
    const depois = await api.get<{ assentos: unknown[] }>(`/api/users/${pessoa}/holdings`);
    expect(depois.body.assentos).toEqual([]);
  });
});
