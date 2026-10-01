import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// O BACKUP LIGADO (F10, Etapa A).
//
// O arquivo vizinho (`sistema.test.ts`) prova o padrão: DESLIGADO, as rotas nem
// existem. Aqui elas existem, e o que se prova é o que acontece com o arquivo —
// porque backup é a única fatia deste sistema em que o dado não está no banco.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO NÃO TESTA, E POR QUE ISSO É HONESTO.
//
// A criação de um dump de verdade. Ela exige o `pg_dump` instalado NA MÁQUINA
// que roda a suíte, na mesma versão principal do servidor — e o contêiner da
// aplicação não traz cliente de Postgres (é exatamente o caso que a mensagem de
// erro da rota explica). Um teste que dependesse disso passaria aqui e falharia
// no CI, ou o contrário, sem nada ter mudado no código.
//
// O que É testado, e de forma determinística: a TRADUÇÃO da falha quando o
// binário não existe (apontando `PG_DUMP_BIN` para um caminho inexistente), e
// todo o resto do ciclo — listar, expurgar por retenção, baixar, e as duas
// recusas de caminho.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let pasta = '';
const envAnterior = {
  BACKUP_ENABLED: process.env.BACKUP_ENABLED,
  BACKUP_DIR: process.env.BACKUP_DIR,
  PG_DUMP_BIN: process.env.PG_DUMP_BIN,
};

/** Um dump falso, com a data que o teste precisa. */
async function dumpFalso(nome: string, diasAtras: number) {
  const destino = path.join(pasta, nome);
  await fs.writeFile(destino, 'PGDMP falso');

  const quando = new Date();
  quando.setUTCDate(quando.getUTCDate() - diasAtras);
  await fs.utimes(destino, quando, quando);
}

beforeAll(async () => {
  pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-backup-'));
  process.env.BACKUP_ENABLED = '1';
  process.env.BACKUP_DIR = pasta;
  // O binário inexistente é o cenário "contêiner Node sem cliente de Postgres".
  process.env.PG_DUMP_BIN = path.join(pasta, 'pg_dump-que-nao-existe');

  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
  await fs.rm(pasta, { recursive: true, force: true });

  process.env.BACKUP_ENABLED = envAnterior.BACKUP_ENABLED;
  process.env.BACKUP_DIR = envAnterior.BACKUP_DIR;
  process.env.PG_DUMP_BIN = envAnterior.PG_DUMP_BIN;
});

interface DumpNaResposta {
  nome: string;
  sizeBytes: number;
  criadoEm: string;
}

describe('GET /api/backups', () => {
  it('pasta vazia é lista vazia, não erro', async () => {
    const { status, body } = await api.get<DumpNaResposta[]>('/api/backups');

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('lista só `.dump`, do mais novo para o mais velho', async () => {
    await dumpFalso('sentinel-20260101-010000.dump', 90);
    await dumpFalso('sentinel-20260601-010000.dump', 10);
    await fs.writeFile(path.join(pasta, 'leia-me.txt'), 'não é dump');

    const { body } = await api.get<DumpNaResposta[]>('/api/backups');

    expect(body.map((d) => d.nome)).toEqual([
      'sentinel-20260601-010000.dump',
      'sentinel-20260101-010000.dump',
    ]);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get('/api/backups');
    expect(status).toBe(401);
  });
});

describe('POST /api/backups/prune', () => {
  it('apaga o que passou da retenção e PRESERVA o mais recente', async () => {
    await fs.rm(pasta, { recursive: true, force: true });
    await fs.mkdir(pasta, { recursive: true });

    // Retenção de 30 dias: dois dumps velhos e um de ontem.
    await api.put('/api/settings', { backupRetentionDays: 30 });
    await dumpFalso('sentinel-20250101-010000.dump', 400);
    await dumpFalso('sentinel-20260101-010000.dump', 200);
    await dumpFalso('sentinel-20260930-010000.dump', 1);

    const { status, body } = await api.post<{ apagados: string[]; restantes: number }>(
      '/api/backups/prune',
    );

    expect(status).toBe(200);
    expect(body.apagados.sort()).toEqual([
      'sentinel-20250101-010000.dump',
      'sentinel-20260101-010000.dump',
    ]);
    expect(body.restantes).toBe(1);
  });

  it('com TODOS vencidos, o mais recente fica: retenção atrasada não zera o backup', async () => {
    await fs.rm(pasta, { recursive: true, force: true });
    await fs.mkdir(pasta, { recursive: true });

    await api.put('/api/settings', { backupRetentionDays: 1 });
    await dumpFalso('sentinel-20260101-010000.dump', 200);
    await dumpFalso('sentinel-20260201-010000.dump', 150);

    const { body } = await api.post<{ apagados: string[]; restantes: number }>('/api/backups/prune');

    expect(body.apagados).toEqual(['sentinel-20260101-010000.dump']);
    expect(body.restantes).toBe(1);
  });
});

describe('GET /api/backups/:nome/download', () => {
  it('baixa o dump como anexo binário', async () => {
    await dumpFalso('sentinel-20260715-120000.dump', 2);

    const { status, headers } = await api.get('/api/backups/sentinel-20260715-120000.dump/download');

    expect(status).toBe(200);
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(String(headers['content-disposition'])).toContain('attachment');
  });

  it('recusa travessia de caminho e nome fora do formato — os dois com 404', async () => {
    // 404 nos dois, e não 400: distinguir "nome inválido" de "não existe"
    // ensinaria a quem varre qual forma de nome vale a pena tentar.
    const travessia = await api.get('/api/backups/..%2F..%2F.env/download');
    const formaErrada = await api.get('/api/backups/dump-de-ontem.dump/download');

    expect([travessia.status, formaErrada.status]).toEqual([404, 404]);
  });
});

describe('POST /api/backups — sem o pg_dump no servidor', () => {
  it('responde 503 com a instrução, e não um 500 opaco', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/backups');

    expect(status).toBe(503);
    expect(body.error).toMatch(/pg_dump/);
    expect(body.error).toMatch(/PG_DUMP_BIN|cliente do PostgreSQL/);
  });

  it('não deixa dump parcial no disco quando o comando falha', async () => {
    const antes = await api.get<DumpNaResposta[]>('/api/backups');
    await api.post('/api/backups');
    const depois = await api.get<DumpNaResposta[]>('/api/backups');

    expect(depois.body.length).toBe(antes.body.length);
  });
});
