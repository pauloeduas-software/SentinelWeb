import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarFabricante, criarLocal, criarModelo,
} from '../helpers/fixtures';

// O FLUXO DE ACEITE — as Etapas A e B da F4, e as duas decisões que elas
// tomaram e que nenhum ITAM de prateleira precisa tomar.
//
// D87 — entrega com alvo `ASSET` NÃO emite termo. O detentor é um equipamento,
//       e não há pessoa para assinar. O documento segue o ativo que o segura.
//
// D88 — aceite pendente NÃO bloqueia a entrega. O equipamento já está na mão de
//       quem o recebeu; o fato é do mundo, não do banco. Pendência é linha de
//       relatório, e é o relatório que impede que ela seja esquecida.
//
// E o D27: com alvo `LOCATION`, quem assina é o GESTOR da localidade — um termo,
// não N. Sem gestor, a entrega é RECUSADA, porque emitir termo sem signatário
// deixaria o documento sem dono e entregar em silêncio esconderia a falta.

interface Termo {
  id: string;
  signerName: string;
  signerEmail: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  asset: { assetTag: string };
}

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
/** Modelo cuja CATEGORIA exige aceite — é a categoria que decide (F1). */
let modeloComTermo = '';
let localSemGestor = '';
let localComGestor = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  const categoria = await api.post<{ id: string }>('/api/categories', {
    name: 'Notebook com termo',
    type: 'ASSET',
    requireAcceptance: true,
    eulaText: 'Declaro ter recebido o equipamento e assumo a guarda dele.',
  });
  expect(categoria.status).toBe(201);

  const fabricante = await criarFabricante(api, 'Fabricante do termo');
  modeloComTermo = await criarModelo(api, {
    categoriaId: categoria.body.id,
    fabricanteId: fabricante,
    name: 'Modelo com termo',
  });

  localSemGestor = await criarLocal(api, { name: 'Sala sem gestor', isWorkstation: true });

  const gestor = await criarColaborador(api, { name: 'Gestor da Sala', email: 'gestor@teste.local' });
  localComGestor = await criarLocal(api, { name: 'Sala com gestor', isWorkstation: true });
  const vinculou = await api.put(`/api/locations/${localComGestor}`, {
    name: 'Sala com gestor',
    managerId: gestor,
  });
  expect(vinculou.status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

/** Um ativo NOVO do modelo que exige termo. */
async function ativoComTermo() {
  const { id } = await criarAtivo(api, {
    statusId: cenario.statusDeployableId,
    modelId: modeloComTermo,
  });
  return id;
}

/** Um ativo novo do modelo comum — categoria SEM `requireAcceptance`. */
async function ativoSemTermo() {
  const { id } = await criarAtivo(api, {
    statusId: cenario.statusDeployableId,
    modelId: cenario.modelId,
  });
  return id;
}

async function tokenDoAtivo(assetId: string): Promise<string> {
  const termo = await prisma.acceptance.findFirstOrThrow({
    where: { assetId },
    select: { token: true },
    orderBy: { createdAt: 'desc' },
  });
  return termo.token;
}

describe('emissão', () => {
  it('categoria que EXIGE aceite gera o termo no checkout, com o EULA copiado', async () => {
    const assetId = await ativoComTermo();

    const { status } = await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });
    expect(status).toBe(201);

    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });
    expect(termo.signerName).toBe('Laura Souza');
    // D29: o texto é CÓPIA. Editar o EULA da categoria não pode mudar, no
    // retroativo, o que alguém já assinou.
    expect(termo.eulaSnapshot).toContain('assumo a guarda');
    expect(termo.acceptedAt).toBeNull();
  });

  it('categoria que NÃO exige não gera termo nenhum', async () => {
    const assetId = await ativoSemTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    expect(await prisma.acceptance.count({ where: { assetId } })).toBe(0);
  });

  it('alvo ASSET não emite termo, mesmo com a categoria exigindo (D87)', async () => {
    const detentor = await ativoSemTermo();
    const preso = await ativoComTermo();

    const { status } = await api.post(`/api/assets/${preso}/checkout`, {
      targetType: 'ASSET',
      targetAssetId: detentor,
    });
    expect(status).toBe(201);

    // Não há pessoa para assinar: o detentor é um equipamento, e quem responde
    // por ele pode mudar amanhã por um checkout que não menciona este ativo.
    expect(await prisma.acceptance.count({ where: { assetId: preso } })).toBe(0);
  });
});

describe('alvo LOCATION — quem assina é o gestor (D27)', () => {
  it('emite UM termo, para o gestor da localidade', async () => {
    const assetId = await ativoComTermo();

    const { status } = await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: localComGestor,
    });
    expect(status).toBe(201);

    const termos = await prisma.acceptance.findMany({ where: { assetId } });
    // UM, não um por ocupante: N documentos para um fato deixariam o ativo
    // "parcialmente aceito" enquanto um dos N não assina.
    expect(termos).toHaveLength(1);
    expect(termos[0].signerName).toBe('Gestor da Sala');
  });

  it('SEM gestor, a entrega é RECUSADA com 409 que diz o que fazer', async () => {
    const assetId = await ativoComTermo();

    const { status, body } = await api.post<{ error: string }>(
      `/api/assets/${assetId}/checkout`,
      { targetType: 'LOCATION', targetLocationId: localSemGestor },
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/gestor/i);
    expect(body.error).toMatch(/Sala sem gestor/);

    // E a TRANSAÇÃO INTEIRA voltou atrás: nada de posse aberta com termo órfão.
    expect(await prisma.assignment.count({ where: { assetId } })).toBe(0);
    expect(await prisma.acceptance.count({ where: { assetId } })).toBe(0);
  });

  it('categoria SEM termo entrega normalmente em posto sem gestor', async () => {
    // A recusa acima é sobre o DOCUMENTO, não sobre o posto: sem termo a
    // exigir assinatura, não há quem procurar.
    const assetId = await ativoSemTermo();
    const { status } = await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'LOCATION', targetLocationId: localSemGestor,
    });
    expect(status).toBe(201);
  });
});

describe('a entrega não espera a assinatura (D88)', () => {
  it('a posse abre, o status vai para IN_USE e o ativo já responde pela pessoa', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });

    const ativo = await api.get<{ posse: { responsaveis: { name: string }[] } }>(`/api/assets/${assetId}`);
    expect(ativo.status).toBe(200);
    // Com o termo PENDENTE, a Camada 3 já devolve quem responde: o equipamento
    // está com a pessoa, assinado ou não.
    expect(ativo.body.posse.responsaveis.map((r) => r.name)).toContain('Ana Lima');

    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });
    expect(termo.acceptedAt).toBeNull();
  });
});

describe('a página pública', () => {
  it('abre sem sessão e mostra o termo daquele equipamento', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const token = await tokenDoAtivo(assetId);

    const { status, body } = await api.anonimo.get<{ eulaSnapshot: string; asset: { assetTag: string } }>(
      `/api/aceite/${token}`,
    );
    expect(status).toBe(200);
    expect(body.eulaSnapshot).toContain('assumo a guarda');
  });

  it('token inexistente responde 404, e mal formado responde 422 sem tocar o banco', async () => {
    expect((await api.anonimo.get(`/api/aceite/${'x'.repeat(43)}`)).status).toBe(404);
    expect((await api.anonimo.get('/api/aceite/curto')).status).toBe(422);
  });

  it('aceitar grava a data, gera o PDF e o token não serve duas vezes', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const token = await tokenDoAtivo(assetId);

    const primeira = await api.anonimo.post(`/api/aceite/${token}/aceitar`, {});
    expect(primeira.status).toBe(200);

    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });
    expect(termo.acceptedAt).toBeInstanceOf(Date);
    // D30: o PDF nasce NO ACEITE e fica guardado. Nunca é regenerado.
    expect(termo.pdfPath).toMatch(/^termos[/\\][0-9a-f-]{36}\.pdf$/);

    // USO ÚNICO: a segunda tentativa não gera um segundo PDF com outra data.
    const segunda = await api.anonimo.post(`/api/aceite/${token}/aceitar`, {});
    expect(segunda.status).toBe(409);
  });

  it('o PDF sai pelo token — quem assinou pode não ter conta no sistema', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const token = await tokenDoAtivo(assetId);
    await api.anonimo.post(`/api/aceite/${token}/aceitar`, {});

    const pdf = await api.app.inject({ method: 'GET', url: `/api/aceite/${token}/pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('recusar NÃO gera PDF, e o termo não pode mais ser aceito', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const token = await tokenDoAtivo(assetId);

    const recusa = await api.anonimo.post(`/api/aceite/${token}/recusar`, { motivo: 'Não foi o que pedi' });
    expect(recusa.status).toBe(200);

    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });
    expect(termo.declinedAt).toBeInstanceOf(Date);
    expect(termo.declineReason).toBe('Não foi o que pedi');
    expect(termo.pdfPath).toBeNull();

    expect((await api.anonimo.post(`/api/aceite/${token}/aceitar`, {})).status).toBe(409);
  });
});

describe('o termo segue o ciclo da entrega', () => {
  // O buraco que estes testes fecham: o aceite NÃO bloqueia a entrega (D88),
  // então o ativo pode ser devolvido com o termo por assinar. Sem esta regra, o
  // termo ficaria pendente para sempre — acumulando no relatório de cobrança e,
  // pior, ainda assinável: alguém produziria um PDF declarando a guarda de um
  // equipamento que já devolveu, com a data de hoje.
  //
  // O estado é DERIVADO de `Assignment.checkinAt`, não uma quarta coluna: a
  // posse já diz que a entrega acabou, e um `canceledAt` seria uma segunda
  // verdade sobre o mesmo fato (D16 aplicado ao documento).

  async function termoDeAtivoDevolvido() {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const token = await tokenDoAtivo(assetId);

    const devolveu = await api.post(`/api/assets/${assetId}/checkin`, {});
    expect(devolveu.status).toBe(200);

    return { assetId, token };
  }

  it('não pode mais ser aceito depois da devolução', async () => {
    const { token } = await termoDeAtivoDevolvido();

    const { status, body } = await api.anonimo.post<{ error: string }>(`/api/aceite/${token}/aceitar`, {});
    expect(status).toBe(409);
    expect(body.error).toMatch(/devolvido/i);
  });

  it('nem recusado, nem cobrado', async () => {
    const { assetId, token } = await termoDeAtivoDevolvido();

    expect((await api.anonimo.post(`/api/aceite/${token}/recusar`, {})).status).toBe(409);

    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });
    const { status } = await api.post(`/api/acceptances/${termo.id}/remind`);
    expect(status).toBe(409);
  });

  it('sai da lista de PENDENTES e aparece em OBSOLETOS', async () => {
    const { assetId } = await termoDeAtivoDevolvido();
    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });

    const pendentes = await api.get<{ rows: Termo[] }>('/api/acceptances?view=pendentes');
    expect(pendentes.body.rows.some((t) => t.id === termo.id)).toBe(false);

    // Continua visível: não é cobrança, é a prova de que o processo deixou
    // passar — e alguém precisa poder olhar.
    const obsoletos = await api.get<{ rows: Termo[] }>('/api/acceptances?view=obsoletos');
    expect(obsoletos.body.rows.some((t) => t.id === termo.id)).toBe(true);
  });

  it('a página pública diz o que aconteceu, em vez de oferecer um botão que falha', async () => {
    const { token } = await termoDeAtivoDevolvido();

    const { status, body } = await api.anonimo.get<{ entregaEncerrada: boolean }>(`/api/aceite/${token}`);
    expect(status).toBe(200);
    expect(body.entregaEncerrada).toBe(true);
  });
});

describe('a página e a API não colidem', () => {
  it('`/aceite/:token` NÃO é rota do servidor — ela é da SPA', () => {
    // A colisão que este teste trava: com a API registrada em `/aceite/:token`,
    // o Fastify a resolveria ANTES do `/*` que entrega o `index.html`, e em
    // produção o navegador receberia JSON no lugar da tela. Em desenvolvimento
    // não apareceria — o proxy do Vite só encaminha `/api` —, então o defeito
    // nasceria invisível para quem o introduzisse.
    expect(api.app.hasRoute({ method: 'GET', url: '/aceite/:token' })).toBe(false);
    expect(api.app.hasRoute({ method: 'GET', url: '/api/aceite/:token' })).toBe(true);
  });
});

describe('o relatório de pendências', () => {
  it('lista os não assinados e exige sessão', async () => {
    expect((await api.anonimo.get('/api/acceptances')).status).toBe(401);

    const { status, body } = await api.get<{ total: number; rows: Termo[] }>('/api/acceptances');
    expect(status).toBe(200);
    // Existem pendentes deste arquivo inteiro: o relatório é o que impede o
    // D88 de virar "ninguém assina e ninguém percebe".
    expect(body.total).toBeGreaterThan(0);
    expect(body.rows.every((t) => t.acceptedAt === null && t.declinedAt === null)).toBe(true);
  });

  it('reenviar carimba `remindedAt` sem criar um segundo termo', async () => {
    const assetId = await ativoComTermo();
    await api.post(`/api/assets/${assetId}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    const termo = await prisma.acceptance.findFirstOrThrow({ where: { assetId } });

    const { status } = await api.post(`/api/acceptances/${termo.id}/remind`);
    expect(status).toBe(200);

    const depois = await prisma.acceptance.findMany({ where: { assetId } });
    // UM termo, com a data da cobrança. Dois pendentes seriam dois tokens
    // válidos para o mesmo fato — o que o índice parcial impede no banco.
    expect(depois).toHaveLength(1);
    expect(depois[0].remindedAt).toBeInstanceOf(Date);
  });
});
