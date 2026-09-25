import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLicenca } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
import { sanitizeForLog } from '../../server/core/logger/sanitize';

// A CHAVE DE PRODUTO — as quatro portas por onde ela poderia sair.
//
// Cifrar em repouso não serve de nada se o valor escapa por outro caminho, e os
// caminhos são quatro:
//
//   1. a RESPOSTA da API       → allowlist de `LICENSE_SELECT` + `paraResposta`
//   2. o diff do ActivityLog   → `productKey` fora de `LICENSE_AUDITED` (D42)
//   3. o LOG estruturado       → o regex de `sanitize.ts`, que NÃO casava
//   4. o export CSV da F10     → não existe ainda; anotado no TODO daquela fase
//
// As três primeiras são provadas aqui. A terceira é a que quase passou: o
// `SENSITIVE_KEY` original (`senha|password|token|secret|apikey|…`) não casa com
// `productKey`, então um `logger.error({ dados })` publicaria a chave em claro
// depois de todo o trabalho de cifrá-la.

const CHAVE = 'AAAA-BBBB-CCCC-AB12';

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let licencaId: string;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  const licenca = await criarLicenca(api, {
    name: 'Office 2024', categoryId: cenario.categoriaLicencaId, seatsTotal: 5,
    productKey: CHAVE,
  });
  licencaId = licenca.id;
});

afterAll(async () => {
  await api.fechar();
});

describe('em repouso', () => {
  it('a coluna guarda o pacote cifrado, nunca o texto', async () => {
    const linha = await prisma.license.findUniqueOrThrow({
      where: { id: licencaId }, select: { productKey: true },
    });

    expect(linha.productKey).toMatch(/^enc:v1:[0-9a-f]{8}:/);
    expect(linha.productKey).not.toContain('AAAA');
  });

  it('nenhuma linha da tabela contém o texto da chave', async () => {
    // A varredura que um auditor faria. Um `LIKE` sobre a coluna inteira pega
    // tanto um valor gravado em claro por engano quanto um plano B esquecido.
    const emClaro = await prisma.license.count({
      where: { productKey: { contains: 'AAAA' } },
    });
    expect(emClaro).toBe(0);
  });
});

describe('na resposta', () => {
  it('a listagem leva hasProductKey e NÃO leva a chave nem a máscara', async () => {
    const { body } = await api.get<{ rows: Record<string, unknown>[] }>('/api/licenses');
    const linha = body.rows.find((l) => l.id === licencaId)!;

    expect(linha).toMatchObject({ hasProductKey: true, productKeyMask: null });
    // A chave nem como propriedade existe: quem a remove é o TIPO de
    // `paraResposta`, não um `delete` que alguém possa apagar.
    expect(linha).not.toHaveProperty('productKey');
    expect(JSON.stringify(linha)).not.toContain('AAAA');
  });

  it('o detalhe leva a MÁSCARA, e a máscara preserva a pontuação', async () => {
    const { body } = await api.get<Record<string, unknown>>(`/api/licenses/${licencaId}`);

    expect(body).toMatchObject({ hasProductKey: true, productKeyMask: '••••-••••-••••-AB12' });
    expect(body).not.toHaveProperty('productKey');
    expect(JSON.stringify(body)).not.toContain('AAAA');
  });
});

describe('no ActivityLog', () => {
  it('o diff NÃO carrega a chave — nem no CREATE, nem no UPDATE', async () => {
    await api.put(`/api/licenses/${licencaId}`, { productKey: 'ZZZZ-YYYY-XXXX-CD34' });

    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'License', entityId: licencaId },
      select: { action: true, changes: true },
    });

    const tudo = JSON.stringify(logs);
    expect(tudo).not.toContain('AAAA');
    expect(tudo).not.toContain('ZZZZ');
    expect(tudo).not.toContain('enc:v1:');
  });

  it('mas registra QUE existe chave, e que ela foi trocada', async () => {
    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'License', entityId: licencaId },
      select: { action: true, changes: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(JSON.stringify(logs[0].changes)).toContain('hasProductKey');
    expect(JSON.stringify(logs)).toContain('productKeyTrocada');
  });
});

describe('no log estruturado', () => {
  it('sanitizeForLog esconde productKey — o furo que a F6 fechou', () => {
    // Antes da F6 este teste FALHAVA: o regex de `SENSITIVE_KEY` não continha
    // `chave|productkey`, e `productKey` não casa com `apikey` nem com nenhum
    // outro termo da lista. A cifra em repouso seria enfeite.
    const limpo = sanitizeForLog({ productKey: CHAVE, nome: 'Office' }) as Record<string, unknown>;
    expect(limpo.productKey).toBe('[oculto]');
    expect(limpo.nome).toBe('Office');
  });

  it('esconde em qualquer profundidade e em qualquer grafia', () => {
    const limpo = sanitizeForLog({
      licenca: { product_key: CHAVE, chaveDeProduto: CHAVE },
    }) as { licenca: Record<string, unknown> };

    expect(limpo.licenca.product_key).toBe('[oculto]');
    expect(limpo.licenca.chaveDeProduto).toBe('[oculto]');
  });
});

describe('revelar', () => {
  it('devolve a chave e grava VIEW_KEY na mesma transação', async () => {
    const resposta = await api.get<{ productKey: string }>(`/api/licenses/${licencaId}/product-key`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.productKey).toBe('ZZZZ-YYYY-XXXX-CD34');

    const ultimo = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: 'License', entityId: licencaId },
      orderBy: { createdAt: 'desc' },
      select: { action: true, changes: true, actorId: true },
    });

    expect(ultimo.action).toBe('VIEW_KEY');
    // O ATOR sai da sessão (D23) — é o que faz a pergunta "quem viu esta
    // chave?" ter resposta.
    expect(ultimo.actorId).toBe(api.adminId);
    // E o log NÃO carrega o valor: seria trocar um segredo cifrado numa coluna
    // por um segredo em claro numa tabela de auditoria.
    expect(JSON.stringify(ultimo.changes)).not.toContain('ZZZZ');
  });

  it('licença sem chave responde 404, nunca 200 com null', async () => {
    const semChave = await criarLicenca(api, {
      name: 'Licença sem chave', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });

    const resposta = await api.get<{ error: string }>(`/api/licenses/${semChave.id}/product-key`);
    // 200 com corpo vazio faria a tela mostrar "chave: —" como se a revelação
    // tivesse acontecido.
    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('não tem chave');
  });
});

describe('o AAD amarra a chave à linha (D91)', () => {
  it('chave copiada de outra licença NÃO é revelada como legítima', async () => {
    const outra = await criarLicenca(api, {
      name: 'Licença vizinha', categoryId: cenario.categoriaLicencaId, seatsTotal: 1,
    });

    // O ataque: quem tem acesso ao banco copia a coluna cifrada. Sem o AAD, a
    // cifra continuaria válida — nada nela diria de onde veio — e o sistema
    // revelaria o segredo de uma licença através de outra.
    const origem = await prisma.license.findUniqueOrThrow({
      where: { id: licencaId }, select: { productKey: true },
    });
    await prisma.license.update({
      where: { id: outra.id }, data: { productKey: origem.productKey },
    });

    const resposta = await api.get<{ error: string }>(`/api/licenses/${outra.id}/product-key`);
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toMatch(/não pertence a este registro|adulterado/);
  });

  it('e a máscara do detalhe também recusa, sem derrubar a tela', async () => {
    const outra = await prisma.license.findFirstOrThrow({
      where: { name: 'Licença vizinha' }, select: { id: true },
    });

    // A tela CONTINUA ABRINDO: a máscara vira `null` e o log registra. Um erro
    // de criptografia aparecer com todas as letras é papel da revelação, onde
    // alguém pediu o valor.
    const { status, body } = await api.get<Record<string, unknown>>(`/api/licenses/${outra.id}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ hasProductKey: true, productKeyMask: null });
  });
});
