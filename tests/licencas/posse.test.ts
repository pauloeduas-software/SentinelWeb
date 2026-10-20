import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarLicenca,
} from '../helpers/fixtures';

// A COSTURA COM A POSSE (D93) — a etapa que o plano prospectivo da F6 não tinha.
//
// ═════════════════════════════════════════════════════════════════════════════
// A PERGUNTA QUE DECIDE se algo é posse não é "tem tabela própria?", é
// *"alguém responde por isto quando a pessoa sai?"*.
//
// Assento de licença responde SIM: ele custa dinheiro por mês e é nominal. A F5
// já respondeu isso para a unidade de estoque, e a resposta mudou quatro
// arquivos fora do domínio dela. A F6 responde igual.
//
// SEM ESTA COSTURA a desativação e a exclusão do colaborador cobrariam tudo
// MENOS a licença, e o sintoma
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

describe('o 409 conhece o assento', () => {
  it('não deixa desativar nem excluir quem ainda ocupa assento, e diz quantos', async () => {
    const pessoa = await criarColaborador(api, { name: 'Elisa Gomes', email: 'elisa@teste.local' });
    const licenca = await criarLicenca(api, {
      name: 'Jira', categoryId: cenario.categoriaLicencaId, seatsTotal: 2,
    });
    await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedPersonId: pessoa });

    const recusa = await api.put<{ error: string }>(`/api/people/${pessoa}`, { isActive: false });
    expect(recusa.status).toBe(409);
    // A frase diz QUANTOS e por qual camada — sem isso o operador procura no
    // lugar errado, e a camada da licença é justamente a que ninguém lembra.
    expect(recusa.body.error).toContain('1 assento de licença');
    expect(recusa.body.error).toContain('Devolva o que está com ele e encerre as ocupações antes de desativar');

    // Excluir também não, com a mesma conta.
    const exclusao = await api.delete<{ error: string }>(`/api/people/${pessoa}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toContain('1 assento de licença');
    expect(exclusao.body.error).toContain('antes de excluir');
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
  it('desativado responde 409 — a pessoa existe, o estado recusa', async () => {
    const pessoa = await criarColaborador(api, { name: 'Felipe Rocha', email: 'felipe@teste.local' });
    // Desativada pela porta da tela, como no teste de posse: o que este caso
    // prova é a recusa do CHECKOUT DE ASSENTO.
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(200);

    const licenca = await criarLicenca(api, {
      name: 'Slack', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
    });

    const recusa = await api.post<{ error: string }>(
      `/api/licenses/${licenca.id}/checkout-seat`, { assignedPersonId: pessoa },
    );
    // Sem esta recusa, entregar a quem saiu da empresa reabriria uma pendência
    // que alguém acabou de fechar à mão.
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toContain('desativado');
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
