import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { concederAdministrador } from '../../server/domain/access/cli/conceder-administrador.cli';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { criarApi, type ApiDeTeste, type Resposta } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import {
  criarAtivo, criarColaborador, criarFabricante, criarModelo, criarPosto, idsDoSeed,
} from '../helpers/fixtures';

// A AUDITORIA (AB) — quem fez o quê, só no banco.
//
// O que ela existe para provar é que uma alteração foi de uma CONTA, e não um
// erro do sistema. Então o teste central não confere operação por operação o
// que cada uma grava: confere que TODA escrita que a tela faz deixa ao menos
// uma linha com o número da requisição e a conta da sessão. A rota nova que
// esquecer a auditoria aparece aqui, se entrar na lista.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api) });
});

afterAll(async () => {
  await api.fechar();
});

const proximo = () => {
  contador += 1;
  return String(contador).padStart(3, '0');
};

/**
 * A escrita, e a prova de que ela deixou rastro: 2xx, e TODA linha da
 * requisição assinada pela conta da sessão.
 */
async function auditada<T>(pedido: Promise<Resposta<T>>, contaId = api.adminId): Promise<Resposta<T>> {
  const resposta = await pedido;
  expect(resposta.status, JSON.stringify(resposta.body)).toBeLessThan(300);

  // Sem o número, o `where` abaixo ficaria vazio e conferiria a tabela inteira.
  const requestId = resposta.headers['x-request-id'] as string;
  expect(requestId, 'a resposta não trouxe o X-Request-Id').toBeTruthy();
  const linhas = await prisma.auditLog.findMany({ where: { requestId } });
  expect(linhas.length, `a requisição ${requestId} não deixou linha na auditoria`).toBeGreaterThan(0);
  for (const linha of linhas) {
    expect(linha).toMatchObject({ actorType: 'USER', actorId: contaId, source: 'painel' });
  }
  return resposta;
}

/** Os ids das chaves da licença, na ordem em que foram digitadas. */
async function chavesDaLicenca(licenseId: string): Promise<string[]> {
  const { body } = await api.get<{ keys: { id: string }[] }>(`/api/licenses/${licenseId}`);
  return body.keys.map((chave) => chave.id);
}

describe('toda escrita do painel deixa rastro com a conta da sessão', () => {
  it('catálogo, colaborador e posto', async () => {
    const fabricante = await auditada(api.post<{ id: string }>('/api/manufacturers', { name: `Fab ${proximo()}` }));
    await auditada(api.put(`/api/manufacturers/${fabricante.body.id}`, { name: `Fab ${proximo()}` }));
    const categoria = await auditada(api.post<{ id: string }>('/api/categories', {
      name: `Categoria ${proximo()}`, type: 'ASSET',
    }));
    await auditada(api.put(`/api/categories/${categoria.body.id}`, { name: `Categoria ${proximo()}` }));
    const modelo = await auditada(api.post<{ id: string }>('/api/asset-models', {
      name: `Modelo ${proximo()}`, manufacturerId: fabricante.body.id, categoryId: categoria.body.id,
    }));
    await auditada(api.put(`/api/asset-models/${modelo.body.id}`, { name: `Modelo ${proximo()}` }));
    await auditada(api.delete(`/api/asset-models/${modelo.body.id}`));
    await auditada(api.delete(`/api/categories/${categoria.body.id}`));
    await auditada(api.delete(`/api/manufacturers/${fabricante.body.id}`));

    const status = await auditada(api.post<{ id: string }>('/api/status-labels', {
      name: `Status ${proximo()}`, type: 'UNDEPLOYABLE',
    }));
    await auditada(api.put(`/api/status-labels/${status.body.id}`, { notes: 'Na bancada' }));
    await auditada(api.delete(`/api/status-labels/${status.body.id}`));

    const pessoa = await auditada(api.post<{ id: string }>('/api/people', {
      name: 'Pessoa Auditada', email: `auditada.${proximo()}@teste.local`,
    }));
    await auditada(api.put(`/api/people/${pessoa.body.id}`, { name: 'Pessoa Auditada Editada' }));
    await auditada(api.delete(`/api/people/${pessoa.body.id}`));
    await auditada(api.post(`/api/people/${pessoa.body.id}/restore`));

    const local = await auditada(api.post<{ id: string }>('/api/locations', { name: `Local ${proximo()}` }));
    await auditada(api.put(`/api/locations/${local.body.id}`, { name: `Local ${proximo()}` }));
    const posto = await auditada(api.post<{ id: string }>('/api/workstations', {
      name: `Mesa ${proximo()}`, locationId: local.body.id,
    }));
    await auditada(api.put(`/api/workstations/${posto.body.id}`, { name: `Mesa ${proximo()}` }));

    const ocupacao = await auditada(api.post<{ id: string }>(`/api/workstations/${posto.body.id}/occupants`, {
      personId: pessoa.body.id, shift: 'Manhã',
    }));
    await auditada(api.patch(`/api/workstations/${posto.body.id}/occupants/${ocupacao.body.id}`, { shift: 'Tarde' }));
    await auditada(api.delete(`/api/workstations/${posto.body.id}/occupants/${ocupacao.body.id}`));

    await auditada(api.delete(`/api/workstations/${posto.body.id}`));
    await auditada(api.delete(`/api/locations/${local.body.id}`));
  });

  it('ativo: cadastro, edição, posse, baixa e lixeira', async () => {
    const pessoa = await criarColaborador(api, { name: 'Recebe Ativo', email: `recebe.${proximo()}@teste.local` });
    const ativo = await auditada(api.post<{ id: string }>('/api/assets', {
      statusId: seed.statusDeployableId, modelId, assetTag: `AUD-${proximo()}`,
    }));
    const id = ativo.body.id;

    await auditada(api.put(`/api/assets/${id}`, { name: 'Notebook auditado' }));
    await auditada(api.post(`/api/assets/${id}/checkout`, { targetType: 'PERSON', targetPersonId: pessoa }));
    await auditada(api.post(`/api/assets/${id}/checkin`, {}));
    const mesa = await criarPosto(api, { name: `Mesa do ativo ${proximo()}` });
    await auditada(api.post(`/api/assets/${id}/checkout`, { targetType: 'WORKSTATION', targetWorkstationId: mesa }));
    await auditada(api.post(`/api/assets/${id}/checkin`, {}));
    await auditada(api.post(`/api/assets/${id}/retire`, { retiredReason: 'DOADO', notes: 'Doado à escola' }));
    await auditada(api.post(`/api/assets/${id}/unretire`, {}));
    await auditada(api.delete(`/api/assets/${id}`));
    await auditada(api.post(`/api/assets/${id}/restore`));
  });

  it('estoque: cadastro, edição do total, entrega, devolução, desativação e exclusão', async () => {
    const pessoa = await criarColaborador(api, { name: 'Recebe Estoque', email: `estoque.${proximo()}@teste.local` });
    const item = await auditada(api.post<{ id: string }>('/api/stock/items', {
      name: `Mouse ${proximo()}`, categoryId: seed.categoriaEstoqueId, qty: 3,
    }));
    const id = item.body.id;

    await auditada(api.put(`/api/stock/items/${id}`, { notes: 'Gaveta 2' }));
    await auditada(api.put(`/api/stock/items/${id}`, { qty: 5 }));
    const saida = await auditada(api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${id}/checkout`, {
      targetType: 'PERSON', targetPersonId: pessoa, qty: 1,
    }));
    await auditada(api.post(`/api/stock/checkouts/${saida.body.unidades[0].id}/checkin`, {}));
    await auditada(api.put(`/api/stock/items/${id}`, { isActive: false }));

    const errado = await auditada(api.post<{ id: string }>('/api/stock/items', {
      name: `Cadastro errado ${proximo()}`, categoryId: seed.categoriaEstoqueId, qty: 1,
    }));
    await auditada(api.delete(`/api/stock/items/${errado.body.id}`));
  });

  it('licença: cadastro, edição, entrega, chave, devolução, encerramento e exclusão', async () => {
    const pessoa = await criarColaborador(api, { name: 'Recebe Licença', email: `licenca.${proximo()}@teste.local` });
    const licenca = await auditada(api.post<{ id: string }>('/api/licenses', {
      name: `Office ${proximo()}`, categoryId: seed.categoriaLicencaId, seatsTotal: 2,
    }));
    const id = licenca.body.id;

    await auditada(api.put(`/api/licenses/${id}`, { seatsTotal: 3 }));
    await auditada(api.put(`/api/licenses/${id}`, {
      keys: [{ productKey: 'AAAAA-11111', seats: 1 }, { productKey: 'BBBBB-22222', seats: 1 }],
    }));
    const [primeira, segunda] = await chavesDaLicenca(id);
    const entrega = await auditada(api.post<{ id: string }>(`/api/licenses/${id}/checkout`, {
      assignedPersonId: pessoa, licenseKeyId: primeira,
    }));
    await auditada(api.patch(`/api/licenses/checkouts/${entrega.body.id}`, { licenseKeyId: segunda }));
    await auditada(api.post(`/api/licenses/checkouts/${entrega.body.id}/checkin`, {}));
    const maquina = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, assetTag: `AUD-${proximo()}` });
    const daMaquina = await auditada(api.post<{ id: string }>(`/api/licenses/${id}/checkout`, {
      assignedAssetId: maquina.id, licenseKeyId: primeira,
    }));
    await auditada(api.post(`/api/licenses/checkouts/${daMaquina.body.id}/checkin`, {}));
    await auditada(api.post(`/api/licenses/${id}/terminate`, {}));

    const errada = await auditada(api.post<{ id: string }>('/api/licenses', {
      name: `Cadastro errado ${proximo()}`, categoryId: seed.categoriaLicencaId, seatsTotal: 1,
    }));
    await auditada(api.delete(`/api/licenses/${errada.body.id}`));
  });

  it('usuários e configurações', async () => {
    const usuario = await auditada(api.post<{ id: string }>('/api/users', {
      name: 'Conta Auditada', email: `conta.${proximo()}@teste.local`, password: 'senha-inicial-123',
    }));
    await auditada(api.put(`/api/users/${usuario.body.id}`, { name: 'Conta Renomeada', password: 'senha-trocada-456' }));
    await auditada(api.delete(`/api/users/${usuario.body.id}`));

    const { body } = await api.get<{ ghostDays: number }>('/api/settings/discovery');
    await auditada(api.put('/api/settings/discovery', { ghostDays: body.ghostDays + 1 }));
  });

  it('a configuração salva no banco sem a linha diz só o que a conta mandou', async () => {
    // O banco restaurado sem a linha: o "de" são os padrões que a tela mostrava,
    // e o modo e as horas, que a conta não mandou, não aparecem como escolha dela.
    await prisma.appSetting.deleteMany();
    const salvo = await auditada(api.put('/api/settings/discovery', { ghostDays: 10 }));

    const linha = await prisma.auditLog.findFirstOrThrow({ where: { requestId: salvo.headers['x-request-id'] as string } });
    expect(linha.changes).toEqual({ ghostDays: { de: 30, para: 10 } });
  });

  it('conciliação: rodada, aceite, recusa, desvínculo, triagem e vínculo com entrega', async () => {
    const par = async () => {
      const serial = `SN-AUD-${proximo()}`;
      const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, serial, assetTag: `AUD-${proximo()}` });
      const maquina = await prisma.endpoint.create({
        data: { hwid: `aud-${proximo()}`, hostname: `pc-auditado-${contador}`, osVersion: 'Windows 11', biosSerial: serial },
        select: { id: true },
      });
      return { ativo, maquina };
    };
    const aceito = await par();
    const recusado = await par();

    await auditada(api.post('/api/reconciliation/run', {}));
    const pendente = (endpointId: string) => prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, state: 'PENDING' },
    });
    const sugestao = await pendente(aceito.maquina.id);
    await auditada(api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`, {}));
    // O aceite e o vínculo são uma coisa só: a sugestão fechada como ACEITA (e
    // não como substituída pelo próprio vínculo), e a linha diz qual foi.
    expect((await prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id: sugestao.id } })).state)
      .toBe('ACCEPTED');
    const vinculo = await prisma.auditLog.findFirstOrThrow({ where: { entityId: aceito.ativo.id, action: 'LINK' } });
    expect(vinculo.changes).toMatchObject({ sugestaoId: { de: null, para: sugestao.id } });
    await auditada(api.post(`/api/reconciliation/suggestions/${(await pendente(recusado.maquina.id)).id}/reject`, {}));
    await auditada(api.delete(`/api/endpoints/${aceito.maquina.id}/link`));

    const { maquina, ativo } = recusado;
    await auditada(api.patch(`/api/endpoints/${maquina.id}/review`, { reviewState: 'ALLOWED' }));
    await auditada(api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id }));
    // O mesmo vínculo de novo não muda nada, e nada se grava: uma linha LINK
    // afirmaria um vínculo novo que já existia.
    const deNovo = await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id });
    expect(deNovo.status).toBeLessThan(300);
    expect(await prisma.auditLog.count({ where: { requestId: deNovo.headers['x-request-id'] as string } })).toBe(0);
    await auditada(api.delete(`/api/endpoints/${maquina.id}/link`));

    const mesa = await criarPosto(api, { name: `Mesa da máquina ${proximo()}` });
    await auditada(api.post(`/api/endpoints/${maquina.id}/link-and-checkout`, {
      assetId: ativo.id, targetWorkstationId: mesa,
    }));
  });

  it('a saída da conta', async () => {
    const outra = await api.comoUsuario();
    await auditada(outra.post('/api/auth/logout', {}), outra.userId);
  });
});

describe('o autor vem da sessão, nunca do corpo', () => {
  it('um autor no corpo é recusado (422), e nada é gravado', async () => {
    const antes = await prisma.auditLog.count();
    const resposta = await api.post('/api/manufacturers', { name: 'Fab com autor', actorId: api.adminId });

    expect(resposta.status).toBe(422);
    expect(await prisma.auditLog.count()).toBe(antes);
  });

  it('uma segunda conta assina o que ela fez, não o que o administrador fez', async () => {
    const outra = await api.comoUsuario();
    const criado = await outra.post<{ id: string }>('/api/manufacturers', { name: `Fab da outra ${proximo()}` });
    expect(criado.status).toBe(201);

    const linha = await prisma.auditLog.findFirstOrThrow({ where: { entityId: criado.body.id, action: 'CREATE' } });
    expect(linha.actorId).toBe(outra.userId);
    expect(linha.actorId).not.toBe(api.adminId);
  });
});

describe('o login', () => {
  const senha = 'senha-do-login-123';
  let email: string;
  let id: string;

  beforeAll(async () => {
    email = `login.${proximo()}@teste.local`;
    const criado = await api.post<{ id: string }>('/api/users', { name: 'Quem Entra', email, password: senha });
    expect(criado.status).toBe(201);
    id = criado.body.id;
  });

  const entrar = (password: string, conta = email) => api.anonimo.post('/api/auth/login', { email: conta, password });

  it('a entrada é da conta', async () => {
    const resposta = await entrar(senha);
    expect(resposta.status).toBe(200);

    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { requestId: resposta.headers['x-request-id'] as string },
    });
    expect(linha).toMatchObject({ action: 'LOGIN', actorType: 'USER', actorId: id, entityId: id });
  });

  it('a senha errada fica na conta, SEM autor: quem digitou não provou ser ela', async () => {
    const resposta = await entrar('senha-errada-000');
    expect(resposta.status).toBe(401);

    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { requestId: resposta.headers['x-request-id'] as string },
    });
    expect(linha).toMatchObject({
      action: 'LOGIN_FAILED', entityId: id, actorType: 'ANONYMOUS', actorId: null, actorEmail: null,
      changes: { motivo: 'senha', tentativas: 1 },
    });
  });

  it('o bloqueio fica registrado, e a insistência durante ele, uma vez só', async () => {
    // Conta própria: o teste não depende das falhas dos outros.
    const conta = `bloqueio.${proximo()}@teste.local`;
    const criada = await api.post<{ id: string }>('/api/users', { name: 'Quem Insiste', email: conta, password: senha });
    expect(criada.status).toBe(201);

    for (let i = 0; i < 5; i++) expect((await entrar('senha-errada-000', conta)).status).toBe(401);

    const ultima = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: criada.body.id, action: 'LOGIN_FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ultima.changes).toMatchObject({ motivo: 'senha', tentativas: 5 });
    expect((ultima.changes as { bloqueadaAte: string | null }).bloqueadaAte).not.toBeNull();

    // Na janela, a senha nem é conferida: três tentativas, uma linha — uma por
    // tentativa deixaria qualquer um encher uma tabela que não se apaga.
    for (let i = 0; i < 3; i++) expect((await entrar(senha, conta)).status).toBe(423);
    const durante = await prisma.auditLog.findMany({
      where: { entityId: criada.body.id, action: 'LOGIN_FAILED', changes: { path: ['motivo'], equals: 'bloqueada' } },
    });
    expect(durante).toHaveLength(1);
    expect(durante[0]).toMatchObject({ actorType: 'ANONYMOUS', changes: { motivo: 'bloqueada' } });
  });

  it('e-mail que não existe não grava nada: não há conta onde registrar', async () => {
    const antes = await prisma.auditLog.count();
    expect((await entrar('qualquer-senha-123', 'ninguem@teste.local')).status).toBe(401);
    expect(await prisma.auditLog.count()).toBe(antes);
  });
});

describe('a linha não se altera nem se apaga', () => {
  it('UPDATE e DELETE são recusados pelo banco', async () => {
    const linha = await prisma.auditLog.findFirstOrThrow();

    await expect(prisma.auditLog.update({ where: { id: linha.id }, data: { entityLabel: 'forjado' } }))
      .rejects.toThrow(/não se altera nem se apaga/);
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${linha.id}::uuid`)
      .rejects.toThrow(/não se altera nem se apaga/);

    expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: linha.id } })).toEqual(linha);
  });

  it('a linha de conta sem a conta inteira é recusada', async () => {
    await expect(prisma.auditLog.create({
      data: {
        entityType: 'Asset', entityId: randomUUID(), entityLabel: 'ATV-1', action: 'UPDATE',
        actorType: 'USER', actorId: api.adminId, source: 'painel', requestId: 'req-sem-nome',
      },
    })).rejects.toThrow(/audit_logs_autor_coerente/);
  });

  it('texto só de espaços não é nome, e registro sem id só onde não há registro', async () => {
    const linha = {
      entityType: 'Asset', entityId: randomUUID(), entityLabel: 'ATV-1', action: 'UPDATE',
      actorType: 'USER' as const, actorId: api.adminId, actorName: 'Administrador', actorEmail: 'admin@teste.local',
      source: 'painel', requestId: 'req-em-branco',
    };
    await expect(prisma.auditLog.create({ data: { ...linha, actorName: '   ' } }))
      .rejects.toThrow(/audit_logs_autor_coerente/);
    await expect(prisma.auditLog.create({ data: { ...linha, entityLabel: '\t\n' } }))
      .rejects.toThrow(/audit_logs_registro_por_escrito/);
    await expect(prisma.auditLog.create({ data: { ...linha, entityId: null } }))
      .rejects.toThrow(/audit_logs_registro_com_id/);
  });
});

describe('o que roda sozinho', () => {
  it('o agente e a rodada do job em SUGGEST não mexem em cadastro nem gravam auditoria', async () => {
    const serial = `SN-JOB-${proximo()}`;
    await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, serial, assetTag: `JOB-${proximo()}` });

    // O retrato de tudo que o job não pode tocar — menos o último contato, que
    // é dele (`lastSeenByAgentAt`).
    const retrato = async () => ({
      ativos: (await prisma.asset.findMany({ orderBy: { id: 'asc' } }))
        .map((ativo) => ({ ...ativo, lastSeenByAgentAt: null })),
      posses: await prisma.assignment.findMany({ orderBy: { id: 'asc' } }),
      estoque: await prisma.stockMovement.findMany({ orderBy: { id: 'asc' } }),
      vinculos: await prisma.endpoint.findMany({ select: { id: true, assetId: true }, orderBy: { id: 'asc' } }),
    });
    const antes = await retrato();
    const linhasAntes = await prisma.auditLog.count();

    const hwid = `job-${proximo()}`;
    const agente = await conectarAgente(api, hwid);
    await agente.handshake({ BiosSerial: serial, Hostname: 'pc-do-job' });
    await esperarPor('a máquina do job', () => prisma.endpoint.findUnique({ where: { hwid } }));
    await agente.fechar();
    await rodarReconciliacao();

    expect(await prisma.auditLog.count()).toBe(linhasAntes);
    const depois = await retrato();
    expect(depois.ativos).toEqual(antes.ativos);
    expect(depois.posses).toEqual(antes.posses);
    expect(depois.estoque).toEqual(antes.estoque);
    expect(depois.vinculos.filter((e) => e.assetId)).toEqual(antes.vinculos.filter((e) => e.assetId));
  });

  it('o comando de terminal não grava o que não mudou', async () => {
    // Com um cargo só (Z), toda conta já nasce ADMIN: conceder não muda nada, e
    // uma linha "de ADMIN para ADMIN" afirmaria uma troca que não houve. Quem
    // assina como sistema quando algo muda é o vínculo automático (cascata.test.ts).
    const email = `promovida.${proximo()}@teste.local`;
    const criada = await api.post('/api/users', { name: 'Promovida', email, password: 'senha-promovida-1' });
    expect(criada.status).toBe(201);
    const linhas = await prisma.auditLog.count();

    await concederAdministrador(email);

    expect(await prisma.auditLog.count()).toBe(linhas);
  });
});

describe('dado sensível não entra na auditoria', () => {
  it('nem senha, nem hash, nem chave de licença — só a marca de que mudou', async () => {
    const senha = 'senha-que-nao-pode-vazar-1';
    const chave = 'CHAVE-QUE-NAO-PODE-VAZAR';

    const usuario = await api.post<{ id: string }>('/api/users', {
      name: 'Conta Sensível', email: `sensivel.${proximo()}@teste.local`, password: senha,
    });
    expect(usuario.status).toBe(201);
    expect((await api.put(`/api/users/${usuario.body.id}`, { password: `${senha}-2` })).status).toBe(200);

    const pessoa = await criarColaborador(api, { name: 'Usa a Chave', email: `chave.${proximo()}@teste.local` });
    const licenca = await api.post<{ id: string }>('/api/licenses', {
      name: `Chave ${proximo()}`, categoryId: seed.categoriaLicencaId, seatsTotal: 2,
      keys: [{ productKey: `${chave}-1`, seats: 1 }, { productKey: `${chave}-2`, seats: 1 }],
    });
    expect(licenca.status).toBe(201);
    const [primeira, segunda] = await chavesDaLicenca(licenca.body.id);
    const entrega = await api.post<{ id: string }>(`/api/licenses/${licenca.body.id}/checkout`, {
      assignedPersonId: pessoa, licenseKeyId: primeira,
    });
    expect(entrega.status).toBe(201);
    expect((await api.patch(`/api/licenses/checkouts/${entrega.body.id}`, { licenseKeyId: segunda })).status).toBe(200);
    expect((await api.put(`/api/licenses/${licenca.body.id}`, {
      keys: [{ id: primeira, productKey: `${chave}-1-CORRIGIDA`, seats: 1 }, { id: segunda, productKey: `${chave}-2`, seats: 1 }],
    })).status).toBe(200);

    const vazou = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM audit_logs
      WHERE changes::text ILIKE ${`%${senha}%`}
         OR changes::text ILIKE ${`%${chave}%`}
         OR changes::text ILIKE '%argon2%'
         OR changes::text ILIKE '%passwordHash%'
         OR changes::text ILIKE '%productKey%'
    `;
    expect(Number(vazou[0].n)).toBe(0);

    const troca = await prisma.auditLog.findFirstOrThrow({ where: { entityId: usuario.body.id, action: 'UPDATE' } });
    expect(troca.changes).toEqual({ senha: 'alterada' });
    // Qual chave, pelo id, na troca; quantas, na lista — nunca o texto.
    const [daTroca, daLista] = await prisma.auditLog.findMany({
      where: { entityId: licenca.body.id, action: 'UPDATE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(daTroca.changes).toMatchObject({ checkoutId: entrega.body.id, licenseKeyId: { de: primeira, para: segunda } });
    expect(daLista.changes).toEqual({ chaves: { alteradas: 1 } });
    const criacao = await prisma.auditLog.findFirstOrThrow({ where: { entityId: licenca.body.id, action: 'CREATE' } });
    expect(criacao.changes).toMatchObject({ chaves: { incluidas: 2 } });
  });
});
