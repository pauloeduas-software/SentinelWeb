import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarLocal, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { auditarPeloAgente } from '../../server/domain/audit/use-cases/audit-by-agent.usecase';
import { FUSO_PADRAO } from '../../server/domain/reconciliation/helpers/shift.helper';

// A CONFERÊNCIA AUTOMÁTICA — docs/historico/fase-08-ciclo-de-vida.md, D124.
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO NÃO EXISTIA, E COBRE A PARTE MAIS SURPREENDENTE DA FASE.
//
// O D124 é a decisão com mais "nãos" da F8, e nenhum deles tinha teste:
//
//   NÃO nasce no handshake      → roda a cada mensagem de cada máquina (D95)
//   NÃO conta hostname nem MAC  → nenhum dos dois prova que alguém olhou o ferro
//   NÃO é NAO_LOCALIZADO        → serial ausente é caso normal e aceito (F7)
//   NÃO escreve `locationId`    → o agente não sabe onde a máquina está
//   NÃO marca as divergências   → elas são OBSERVAÇÕES, e job não observa
//   NÃO grava `ActivityLog`     → uma linha por ativo por dia afogaria a trilha
//
// O último "não" estava ERRADO no código até esta revisão: o caminho do agente
// passava a posse lida do banco, e a linha diária nascia afirmando
// `divergenciaDePosse` que ninguém viu. O grupo "o que o agente NÃO afirma"
// abaixo é o que impede isso de voltar.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let modelId: string;
let statusId: string;
let statusArquivadoId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  statusArquivadoId = seed.statusArquivadoId;
  const fabricanteId = await criarFabricante(api, 'Fabricante da conferência automática');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/** Uma máquina que bateu e está vinculada ao ativo, com o serial que o agente manda. */
async function maquinaVinculada(hwid: string, assetId: string, biosSerial: string | null) {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ hostname: hwid, ...(biosSerial ? { biosSerial } : {}) });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  // 201: o vínculo CRIA a ligação `Endpoint ↔ Asset` (D45).
  expect((await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId })).status).toBe(201);
  return endpoint.id;
}

const auditoriasDe = (assetId: string) =>
  prisma.audit.findMany({
    where: { assetId },
    select: {
      method: true, result: true, locationIdFound: true, locationIdBefore: true,
      divergenciaDePosse: true, postoVago: true, auditedById: true,
    },
  });

// ─────────────────────────────────────────────────────────────────────────────

describe('só o SERIAL confirma', () => {
  it('serial que bate (normalizado) vira UMA auditoria AGENTE e avança `lastAuditAt`', async () => {
    // O cadastro tem o serial limpo; o agente manda com espaço e caixa trocada, que
    // é o que uma BIOS de verdade devolve. Comparar cru faria a conferência nunca
    // casar em metade da frota — e falhar em silêncio.
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-serial-bate', serial: 'SN-AGENTE-001',
    });
    await maquinaVinculada('agente-bate', ativo.id, '  sn-agente-001 ');

    expect(await auditarPeloAgente(FUSO_PADRAO)).toBeGreaterThanOrEqual(1);

    const auditorias = await auditoriasDe(ativo.id);
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0].method).toBe('AGENTE');
    expect(auditorias[0].result).toBe('OK');
    // O agente não sabe ONDE a máquina está: as duas colunas de local ficam nulas.
    expect(auditorias[0].locationIdFound).toBeNull();
    expect(auditorias[0].locationIdBefore).toBeNull();
    // Job não tem autor, e esse `null` é uma afirmação (D23).
    expect(auditorias[0].auditedById).toBeNull();

    const depois = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id }, select: { lastAuditAt: true },
    });
    expect(depois.lastAuditAt).not.toBeNull();
  });

  it('serial que NÃO bate não gera auditoria nenhuma — e não é NAO_LOCALIZADO', async () => {
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-serial-diferente', serial: 'SN-CADASTRO-XYZ',
    });
    await maquinaVinculada('agente-diverge', ativo.id, 'SN-DA-BIOS-OUTRO');

    await auditarPeloAgente(FUSO_PADRAO);

    // ZERO linhas. Marcar `NAO_LOCALIZADO` seria o sistema afirmando um
    // desaparecimento a partir de um serial que simplesmente não confere.
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
    const ainda = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id }, select: { lastAuditAt: true },
    });
    expect(ainda.lastAuditAt).toBeNull();
  });

  it('máquina SEM serial é caso normal: nada acontece', async () => {
    // `biosSerial` é nulável de propósito desde a F7 — agente velho não é erro.
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-sem-serial', serial: 'SN-SO-NO-CADASTRO',
    });
    await maquinaVinculada('agente-sem-serial', ativo.id, null);

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
  });

  it('ativo sem serial cadastrado também não é conferido', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'pc-cadastro-sem-serial' });
    await maquinaVinculada('agente-cadastro-vazio', ativo.id, 'SN-DA-BIOS-SOZINHO');

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
  });
});

describe('uma por ativo por DIA', () => {
  it('a segunda rodada no mesmo dia não grava nada', async () => {
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-uma-por-dia', serial: 'SN-UMA-POR-DIA',
    });
    await maquinaVinculada('agente-uma-por-dia', ativo.id, 'SN-UMA-POR-DIA');

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(1);

    // O job de reconciliação acorda de hora em hora: sem o corte por dia local,
    // seriam 24 linhas por ativo por dia e `audits` viraria a maior tabela do banco.
    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(1);
  });
});

describe('o que o agente NÃO afirma', () => {
  it('NÃO marca `divergenciaDePosse`, mesmo com a posse apontando para outro posto', async () => {
    // O cenário exato em que o código errado marcava: o ativo é entregue à Mesa A e
    // sua localização é a Mesa B. Um auditor de carne e osso marcaria divergência —
    // ele esteve lá. O agente só sabe que a máquina respondeu.
    const [mesaA, mesaB] = await Promise.all([
      criarLocal(api, { name: 'Mesa A do agente', isWorkstation: true }),
      criarLocal(api, { name: 'Mesa B do agente', isWorkstation: true }),
    ]);

    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-divergente', serial: 'SN-DIVERGENTE-01', locationId: mesaB,
    });
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: mesaA,
    })).status).toBe(201);

    await maquinaVinculada('agente-divergente', ativo.id, 'SN-DIVERGENTE-01');
    await auditarPeloAgente(FUSO_PADRAO);

    const auditorias = await auditoriasDe(ativo.id);
    expect(auditorias).toHaveLength(1);
    // AS DUAS ASSERÇÕES QUE IMPORTAM: o estado do banco diverge, e a linha escrita
    // pelo job não afirma nada sobre isso.
    expect(auditorias[0].divergenciaDePosse).toBe(false);
    expect(auditorias[0].postoVago).toBe(false);

    // E a localização do ativo continua onde estava: o agente não a escreve (D52).
    const depois = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id }, select: { locationId: true },
    });
    expect(depois.locationId).toBe(mesaB);
  });

  it('NÃO grava linha de `ActivityLog` — o registro dela é a linha em `audits`', async () => {
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-sem-trilha', serial: 'SN-SEM-TRILHA',
    });
    await maquinaVinculada('agente-sem-trilha', ativo.id, 'SN-SEM-TRILHA');

    await auditarPeloAgente(FUSO_PADRAO);

    expect(await auditoriasDe(ativo.id)).toHaveLength(1);
    // A conferência MANUAL grava `AUDIT` em `entityType: 'Asset'`. A automática roda
    // para toda máquina vinculada todo dia, e afogaria a trilha inteira.
    expect(await prisma.activityLog.count({
      where: { entityType: 'Asset', entityId: ativo.id, action: 'AUDIT' },
    })).toBe(0);
  });
});

describe('o recorte do parque', () => {
  it('ativo DESCOMISSIONADO não é conferido pelo agente', async () => {
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-vendido', serial: 'SN-VENDIDO-01',
    });
    await maquinaVinculada('agente-vendido', ativo.id, 'SN-VENDIDO-01');

    expect((await api.post(`/api/assets/${ativo.id}/retire`, {
      retiredReason: 'VENDIDO',
    })).status).toBe(200);

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
  });

  it('ativo ARQUIVADO não é conferido — o relatório usa o MESMO recorte', async () => {
    // Era o furo do escopo frouxo: o job tinha só `retiredAt: null`, então um
    // ARCHIVED tinha `lastAuditAt` avançado todo dia e NUNCA aparecia no relatório
    // de auditorias, que lê `ATIVO_NO_PARQUE`. Conferi-lo era trabalho invisível.
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-arquivado', serial: 'SN-ARQUIVADO-01',
    });
    await maquinaVinculada('agente-arquivado', ativo.id, 'SN-ARQUIVADO-01');

    expect((await api.put(`/api/assets/${ativo.id}`, { statusId: statusArquivadoId })).status).toBe(200);

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
  });

  it('ativo na LIXEIRA não é conferido, e a relação aninhada não herda o escopo', async () => {
    // `prisma.endpoint.findMany({ where: { asset: {…} } })` alcança o ativo por
    // RELAÇÃO, e a `softDeleteExtension` não escopa relação aninhada (D8): sem o
    // `deletedAt: null` escrito à mão, um ativo apagado com agente ativo era
    // conferido diariamente por um job, sem nenhuma tela mostrando isso.
    const ativo = await criarAtivo(api, {
      statusId, modelId, name: 'pc-lixeira', serial: 'SN-LIXEIRA-01',
    });
    await maquinaVinculada('agente-lixeira', ativo.id, 'SN-LIXEIRA-01');

    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);

    await auditarPeloAgente(FUSO_PADRAO);
    expect(await auditoriasDe(ativo.id)).toHaveLength(0);
  });
});
