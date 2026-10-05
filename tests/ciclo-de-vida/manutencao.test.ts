import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarFornecedor, criarManutencao, criarModelo,
  diasAtras, idsDoSeed,
} from '../helpers/fixtures';

// O HISTÓRICO DE SERVIÇO — docs/historico/fase-08-ciclo-de-vida.md, Etapa A.
//
// O QUE ESTA SUÍTE EXISTE PARA IMPEDIR são três coisas que falhariam em silêncio:
//
//   1. `cost` virar número no caminho. A coluna é `Decimal(12,2)` e o JSON a
//      serializa como STRING; um `z.coerce.number()` em qualquer borda faria
//      "1234.56" voltar 1234.5600000000001 sem nenhum erro aparecer.
//   2. o fornecedor com manutenção ser apagável. A F6 já tinha esse furo com
//      licença — `countUsages` não a contava —, e o P2003 do banco devolvia 409
//      com frase genérica em vez da contagem.
//   3. a listagem global somar o custo de ativo na LIXEIRA. `maintenances` não tem
//      `deletedAt`, então a extension de soft delete não a alcança, e relação
//      aninhada não herda escopo (D8).

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante da manutenção');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

describe('o custo', () => {
  it('atravessa como STRING e volta com os centavos intactos', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do custo' });

    const criada = await criarManutencao(api, ativo.id, {
      title: 'Troca de teclado',
      startDate: diasAtras(3),
      cost: '1234.56',
    });

    // STRING, e não 1234.56: o dia em que isto virar número é o dia em que o
    // centavo começa a sumir, e nenhuma outra asserção do projeto pegaria.
    expect(typeof criada.cost).toBe('string');
    expect(criada.cost).toBe('1234.56');

    const noBanco = await prisma.maintenance.findUniqueOrThrow({
      where: { id: criada.id },
      select: { cost: true },
    });
    expect(noBanco.cost?.toString()).toBe('1234.56');
  });

  it('aceita vírgula do formulário e grava ponto', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook da vírgula' });

    const criada = await criarManutencao(api, ativo.id, {
      title: 'Reparo com vírgula',
      startDate: diasAtras(1),
      cost: '99,90',
    });

    expect(criada.cost).toBe('99.9');
  });
});

describe('as bordas de data', () => {
  it('recusa encerramento ANTES da abertura (422)', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook da data' });

    const resposta = await api.post(`/api/assets/${ativo.id}/maintenances`, {
      type: 'REPARO',
      title: 'Reparo impossível',
      startDate: diasAtras(2),
      completionDate: diasAtras(5),
    });

    expect(resposta.status).toBe(422);
  });

  it('ACEITA abertura no futuro — upgrade agendado é manutenção legítima', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do agendado' });

    const resposta = await api.post(`/api/assets/${ativo.id}/maintenances`, {
      type: 'UPGRADE',
      title: 'Upgrade de RAM no mês que vem',
      startDate: diasAtras(-30),
    });

    // Esta é a asserção invertida da de cima, e ela existe porque a tentação é
    // usar `dataNaoFutura` nos dois campos: contrato de suporte que começa na
    // renovação e upgrade agendado seriam recusados por zelo.
    expect(resposta.status).toBe(201);
  });

  it('recusa encerrar DUAS vezes (409)', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do encerramento' });
    const criada = await criarManutencao(api, ativo.id, {
      title: 'Reparo a encerrar',
      startDate: diasAtras(4),
    });

    const primeira = await api.post(`/api/maintenances/${criada.id}/close`, {});
    expect(primeira.status).toBe(200);

    // Duas abas abertas na mesma lista: a segunda perde, e recebe a frase em vez
    // de sobrescrever em silêncio a data que a primeira gravou.
    const segunda = await api.post(`/api/maintenances/${criada.id}/close`, {});
    expect(segunda.status).toBe(409);
  });
});

describe('o status do ativo', () => {
  it('NÃO muda quando a manutenção é aberta', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do status' });

    await criarManutencao(api, ativo.id, { title: 'Contrato de suporte', type: 'SUPORTE', startDate: diasAtras(1) });

    const depois = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id },
      select: { statusId: true },
    });

    // Contrato de suporte anual não tira nada do chão. Se algum dia a abertura
    // passar a mexer no status, a lista de "Pronto p/ Uso" encolhe porque alguém
    // cadastrou um contrato — e ninguém vai ligar as duas coisas.
    expect(depois.statusId).toBe(statusId);
  });
});

describe('o fornecedor em uso', () => {
  it('não pode ser apagado enquanto houver manutenção (409 com a contagem)', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do fornecedor' });
    const fornecedorId = await criarFornecedor(api, 'Assistência Técnica da F8');

    await criarManutencao(api, ativo.id, {
      title: 'Reparo na assistência',
      startDate: diasAtras(2),
      supplierId: fornecedorId,
    });

    const resposta = await api.delete(`/api/suppliers/${fornecedorId}`);
    expect(resposta.status).toBe(409);
  });
});

describe('a listagem global', () => {
  it('NÃO soma o custo de ativo que está na lixeira', async () => {
    const vivo = await criarAtivo(api, { statusId, modelId, name: 'Notebook vivo' });
    const condenado = await criarAtivo(api, { statusId, modelId, name: 'Notebook condenado' });

    await criarManutencao(api, vivo.id, { title: 'Reparo do vivo', startDate: diasAtras(1), cost: '100.00' });
    await criarManutencao(api, condenado.id, { title: 'Reparo do condenado', startDate: diasAtras(1), cost: '900.00' });

    const antes = await api.get<{ resumo: { custoTotal: string } }>('/api/maintenances?q=Reparo do');
    expect(Number(antes.body.resumo.custoTotal)).toBe(1000);

    // Lixeira é `UPDATE assets SET "deletedAt"`: o Postgres não vê `DELETE`
    // nenhum, o `Cascade` da FK não dispara, e a linha de manutenção FICA. Sem o
    // filtro explícito, o custo dela continuaria no total.
    // 200 com `{ success: true }`, e não 204: é a convenção do projeto para a
    // lixeira (`estoque/operacoes.test.ts` já a afirma). A rota devolve corpo
    // porque apagar é `UPDATE`, e quem chama quer saber que o `UPDATE` casou.
    expect((await api.delete(`/api/assets/${condenado.id}`)).status).toBe(200);

    const depois = await api.get<{ resumo: { custoTotal: string }; total: number }>('/api/maintenances?q=Reparo do');
    expect(Number(depois.body.resumo.custoTotal)).toBe(100);
    expect(depois.body.total).toBe(1);
  });

  it('o filtro de situação separa aberta de encerrada', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook das situações' });

    const aberta = await criarManutencao(api, ativo.id, { title: 'Situação aberta', startDate: diasAtras(9) });
    await criarManutencao(api, ativo.id, {
      title: 'Situação encerrada', startDate: diasAtras(9), completionDate: diasAtras(1),
    });

    // DUAS abertas no mesmo ativo convivem de propósito (simetria invertida do
    // `assignments_um_aberto_por_ativo`): esta linha prova que não há 409.
    const terceira = await api.post(`/api/assets/${ativo.id}/maintenances`, {
      type: 'SUPORTE', title: 'Segunda aberta no mesmo ativo', startDate: diasAtras(8),
    });
    expect(terceira.status).toBe(201);

    const abertas = await api.get<{ total: number; rows: { id: string }[] }>(
      `/api/maintenances?situacao=abertas&assetId=${ativo.id}`,
    );
    expect(abertas.body.total).toBe(2);
    expect(abertas.body.rows.map((linha) => linha.id)).toContain(aberta.id);

    const encerradas = await api.get<{ total: number }>(
      `/api/maintenances?situacao=encerradas&assetId=${ativo.id}`,
    );
    expect(encerradas.body.total).toBe(1);
  });

  it('recusa filtro desconhecido em vez de ignorar (422)', async () => {
    // `?situacoa=abertas` (typo) devolvendo tudo é a falha muda que o
    // `strictObject` existe para evitar.
    const resposta = await api.get('/api/maintenances?situacoa=abertas');
    expect(resposta.status).toBe(422);
  });
});

describe('a trilha', () => {
  it('grava DUAS linhas: uma na manutenção e uma no ativo', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook da trilha' });
    const criada = await criarManutencao(api, ativo.id, { title: 'Reparo auditado', startDate: diasAtras(1) });

    const [naManutencao, noAtivo] = await Promise.all([
      prisma.activityLog.findFirst({
        where: { entityType: 'Maintenance', entityId: criada.id, action: 'CREATE' },
        select: { actorId: true },
      }),
      prisma.activityLog.findFirst({
        where: { entityType: 'Asset', entityId: ativo.id, action: 'SERVICE' },
        select: { actorId: true },
      }),
    ]);

    // Nenhuma é cópia da outra: a primeira responde "o que mudou nesta linha", a
    // segunda responde "o que aconteceu com este ativo" — que é a pergunta da aba
    // Histórico, a única tela que alguém abre para saber disso.
    expect(naManutencao?.actorId).toBe(api.adminId);
    expect(noAtivo?.actorId).toBe(api.adminId);
  });

  it('encerrar pelo PUT também aparece no histórico do ATIVO', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // DOIS CAMINHOS PARA O MESMO FATO, E UM DELES NÃO DEIXAVA RASTRO.
    //
    // `POST /close` grava `SERVICE_CLOSE` em `entityType: 'Asset'`, porque a aba
    // Histórico do notebook é a única tela que responde "o que aconteceu com este
    // equipamento". O PUT alcança a MESMA coluna `completionDate` e não gravava nada
    // lá: dava para encerrar — e reabrir — sem rastro na única tela onde alguém
    // procuraria, e sem passar pelo 409 de "já encerrada".
    //
    // Consertado pelo lado do LOG, não proibindo o campo: corrigir uma data digitada
    // errada é edição legítima.
    // ═════════════════════════════════════════════════════════════════════════
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do PUT' });
    const criada = await criarManutencao(api, ativo.id, {
      title: 'Reparo encerrado por PUT', startDate: diasAtras(5),
    });

    const fechado = (acao: 'SERVICE_CLOSE' | 'SERVICE') =>
      prisma.activityLog.count({
        where: { entityType: 'Asset', entityId: ativo.id, action: acao },
      });

    // Só o `SERVICE` da abertura, até aqui.
    expect(await fechado('SERVICE_CLOSE')).toBe(0);

    expect((await api.put(`/api/maintenances/${criada.id}`, {
      completionDate: diasAtras(1),
    })).status).toBe(200);

    expect(await fechado('SERVICE_CLOSE')).toBe(1);

    // REABRIR é o serviço voltando a existir, e também é evento: sem a linha, o
    // alerta `MANUTENCAO_EM_ABERTO` volta a disparar para uma manutenção que o
    // histórico do ativo diz que foi encerrada.
    expect((await api.put(`/api/maintenances/${criada.id}`, {
      completionDate: null,
    })).status).toBe(200);

    expect(await fechado('SERVICE')).toBe(2);

    // E um PUT que NÃO muda a situação não inventa evento: o histórico não é
    // contador de cliques.
    expect((await api.put(`/api/maintenances/${criada.id}`, {
      title: 'Reparo encerrado por PUT (título novo)',
    })).status).toBe(200);

    expect(await fechado('SERVICE')).toBe(2);
    expect(await fechado('SERVICE_CLOSE')).toBe(1);
  });
});
