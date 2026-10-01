import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../server/core/database/prismaClient';
import { diretorioDeUpload } from '../../server/core/storage/storage';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { PDF_MINIMO, PNG_1x1, corpoMultipart } from '../helpers/multipart';

// ANEXO E IMAGEM — e a prova do D84, que é o motivo de esta suíte existir.
//
// O D84 recusou `@fastify/static` numa raiz `/uploads/` porque o guard da F3
// libera, em PRODUÇÃO, todo GET fora de `/api`:
//
//   if (estaticoPublico && request.method === 'GET' && !path.startsWith('/api'))
//
// Um `GET /uploads/<uuid>.pdf` não começa com `/api`. Nota fiscal, contrato,
// assinatura e termo assinado ficariam legíveis sem sessão — e só em produção,
// porque em desenvolvimento quem serve o estático é o Vite. É um furo que não
// aparece na máquina de quem o introduz.
//
// Por isso TODA leitura de arquivo aqui passa por `/api/`, e o primeiro teste
// deste arquivo é o anônimo tomando 401.

// O corpo e os dois arquivos de exemplo saem de `helpers/multipart.ts`: a F10
// precisa dos mesmos para a marca e para o CSV, e duas cópias do boundary
// divergiriam onde a diferença se lê como "a rota recusou o arquivo".
const PDF = PDF_MINIMO;
const multipart = corpoMultipart;

interface Anexo {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
}

let api: ApiDeTeste;
let assetId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api);
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
  const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId });
  assetId = ativo.id;
});

afterAll(async () => {
  await api.fechar();
});

async function subirAnexo(nome = 'nota-fiscal.pdf', tipo = 'application/pdf', bytes = PDF) {
  const { payload, headers } = multipart(nome, tipo, bytes);
  const resposta = await api.app.inject({
    method: 'POST',
    url: `/api/assets/${assetId}/attachments`,
    headers: { ...headers, cookie: api.cookie },
    payload,
  });
  return { status: resposta.statusCode, body: JSON.parse(resposta.body || '{}') as Anexo };
}


describe('a porta fechada (D84)', () => {
  it('download de anexo SEM sessão responde 401', async () => {
    const criado = await subirAnexo();
    expect(criado.status).toBe(201);

    const { status } = await api.anonimo.get(`/api/attachments/${criado.body.id}/download`);
    expect(status).toBe(401);
  });

  it('imagem SEM sessão responde 401', async () => {
    const { status } = await api.anonimo.get(`/api/images/asset/${assetId}`);
    expect(status).toBe(401);
  });

  it('não existe rota estática servindo o UPLOAD_DIR', async () => {
    // A prova direta do D84: o caminho que uma raiz `/uploads/` teria não é
    // rota nenhuma. Se alguém registrar `@fastify/static` ali, este teste cai.
    expect(api.app.hasRoute({ method: 'GET', url: '/uploads/*' })).toBe(false);
  });
});

describe('upload', () => {
  it('aceita PDF, grava o arquivo no disco e devolve o ator', async () => {
    const { status, body } = await subirAnexo('contrato.pdf');
    expect(status).toBe(201);
    expect(body.originalName).toBe('contrato.pdf');
    expect(body.mimeType).toBe('application/pdf');
    expect(body.uploadedById).toBe(api.adminId);

    // O ARQUIVO está mesmo lá, com o nome que NÓS demos.
    const linha = await prisma.attachment.findUniqueOrThrow({
      where: { id: body.id },
      select: { path: true },
    });
    expect(linha.path).toMatch(/^anexos[/\\][0-9a-f-]{36}\.pdf$/);
    await expect(fs.access(path.join(diretorioDeUpload(), linha.path))).resolves.toBeUndefined();
  });

  it('NÃO usa o nome que o cliente mandou — nem quando ele tenta escapar da raiz', async () => {
    const { status, body } = await subirAnexo('../../../etc/passwd.pdf');
    expect(status).toBe(201);

    const linha = await prisma.attachment.findUniqueOrThrow({
      where: { id: body.id },
      select: { path: true },
    });

    // DUAS defesas, e a de fora nem é nossa: o busboy já tira o caminho do
    // `filename` antes de o handler ver, então chega `passwd.pdf`. Não
    // DEPENDEMOS disso — o nome no disco é um uuid nosso, e é essa a garantia
    // que sobrevive a uma troca de biblioteca.
    expect(body.originalName).toBe('passwd.pdf');
    expect(linha.path).not.toContain('..');
    expect(linha.path).toMatch(/^anexos[/\\][0-9a-f-]{36}\.pdf$/);
  });

  it('recusa MIME fora da allowlist com 422, dizendo o que é aceito', async () => {
    const { status, body } = await subirAnexo('script.sh', 'application/x-sh', PDF);
    expect(status).toBe(422);
    expect((body as unknown as { error: string }).error).toMatch(/application\/pdf/);
  });

  it('recusa JSON no lugar de multipart com 415, dizendo o que enviar', async () => {
    // 415 e não 422: a recusa acontece no TRANSPORTE, antes de qualquer
    // handler — o corpo pode estar perfeito, o envelope é que está errado.
    // A mensagem é nossa (core/errors/error-handler.ts), não do Fastify.
    const { status, body } = await api.post<{ error: string }>(
      `/api/assets/${assetId}/attachments`, {},
    );
    expect(status).toBe(415);
    expect(body.error).toMatch(/multipart\/form-data/);
  });

  it('responde 404 para ativo inexistente', async () => {
    const { payload, headers } = multipart('x.pdf', 'application/pdf', PDF);
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/assets/11111111-1111-4111-8111-111111111111/attachments',
      headers: { ...headers, cookie: api.cookie },
      payload,
    });
    expect(resposta.statusCode).toBe(404);
  });
});

describe('download', () => {
  it('devolve os bytes com o nome ORIGINAL no Content-Disposition', async () => {
    const criado = await subirAnexo('nota de compra.pdf');

    const resposta = await api.app.inject({
      method: 'GET',
      url: `/api/attachments/${criado.body.id}/download`,
      headers: { cookie: api.cookie },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-disposition']).toContain('nota de compra.pdf');
    expect(resposta.headers['content-type']).toBe('application/pdf');
    expect(resposta.rawPayload.equals(PDF)).toBe(true);
  });

  it('404 quando a linha existe e o ARQUIVO sumiu', async () => {
    const criado = await subirAnexo('some.pdf');
    const linha = await prisma.attachment.findUniqueOrThrow({
      where: { id: criado.body.id },
      select: { path: true },
    });

    // Alguém limpou o UPLOAD_DIR, ou o backup voltou só o banco.
    await fs.unlink(path.join(diretorioDeUpload(), linha.path));

    const { status } = await api.get(`/api/attachments/${criado.body.id}/download`);
    expect(status).toBe(404);
  });
});

describe('exclusão', () => {
  it('apaga a linha E o arquivo', async () => {
    const criado = await subirAnexo('para-apagar.pdf');
    const linha = await prisma.attachment.findUniqueOrThrow({
      where: { id: criado.body.id },
      select: { path: true },
    });
    const noDisco = path.join(diretorioDeUpload(), linha.path);

    const { status } = await api.delete(`/api/attachments/${criado.body.id}`);
    expect(status).toBe(200);

    expect(await prisma.attachment.findUnique({ where: { id: criado.body.id } })).toBeNull();
    await expect(fs.access(noDisco)).rejects.toThrow();
  });

  it('a LIXEIRA do ativo NÃO apaga arquivo — restaurar tem que devolver a nota fiscal', async () => {
    const criado = await subirAnexo('sobrevive.pdf');
    const linha = await prisma.attachment.findUniqueOrThrow({
      where: { id: criado.body.id },
      select: { path: true },
    });

    const apagou = await api.delete(`/api/assets/${assetId}`);
    expect(apagou.status).toBe(200);

    await expect(
      fs.access(path.join(diretorioDeUpload(), linha.path)),
    ).resolves.toBeUndefined();

    const restaurou = await api.post(`/api/assets/${assetId}/restore`);
    expect(restaurou.status).toBe(200);

    const lista = await api.get<Anexo[]>(`/api/assets/${assetId}/attachments`);
    expect(lista.status).toBe(200);
    expect(lista.body.some((a) => a.id === criado.body.id)).toBe(true);
  });
});

describe('imagem', () => {
  it('aceita PNG, serve com sessão e substitui a anterior apagando o arquivo velho', async () => {
    const { payload, headers } = multipart('foto.png', 'image/png', PNG_1x1);
    const primeira = await api.app.inject({
      method: 'PUT',
      url: `/api/images/asset/${assetId}`,
      headers: { ...headers, cookie: api.cookie },
      payload,
    });
    expect(primeira.statusCode).toBe(200);

    const antes = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { imagePath: true },
    });
    expect(antes.imagePath).toMatch(/^imagens[/\\][0-9a-f-]{36}\.png$/);

    const servida = await api.app.inject({
      method: 'GET',
      url: `/api/images/asset/${assetId}`,
      headers: { cookie: api.cookie },
    });
    expect(servida.statusCode).toBe(200);
    expect(servida.headers['content-type']).toBe('image/png');

    // A SEGUNDA imagem apaga o arquivo da primeira.
    const segunda = await api.app.inject({
      method: 'PUT',
      url: `/api/images/asset/${assetId}`,
      headers: { ...headers, cookie: api.cookie },
      payload,
    });
    expect(segunda.statusCode).toBe(200);

    await expect(
      fs.access(path.join(diretorioDeUpload(), antes.imagePath as string)),
    ).rejects.toThrow();
  });

  it('recusa PDF como imagem — `<img src>` não o renderiza', async () => {
    const { payload, headers } = multipart('nota.pdf', 'application/pdf', PDF);
    const resposta = await api.app.inject({
      method: 'PUT',
      url: `/api/images/asset/${assetId}`,
      headers: { ...headers, cookie: api.cookie },
      payload,
    });
    expect(resposta.statusCode).toBe(422);
  });

  it('recusa alvo fora da allowlist com 422', async () => {
    const { payload, headers } = multipart('foto.png', 'image/png', PNG_1x1);
    const resposta = await api.app.inject({
      method: 'PUT',
      url: `/api/images/usuarios/${assetId}`,
      headers: { ...headers, cookie: api.cookie },
      payload,
    });
    expect(resposta.statusCode).toBe(422);
  });
});
