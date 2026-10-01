import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, comporConjunto, criarAtivo, criarCampo, criarConjunto, criarFabricante,
  criarModelo, pendurarConjunto,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';
import { colunasCifradasDoAtivo } from '../../server/domain/custom-field/helpers/coluna-cifrada.helper';
import { aadDoCampo } from '../../server/domain/custom-field/helpers/custom-field-value.helper';
import { cifrar } from '../../server/core/crypto/cipher';

// O CAMPO CIFRADO — as portas por onde ele poderia sair, e o AAD.
//
// Cifrar em repouso não serve de nada se o valor escapa por outro caminho. É o
// mesmo mapa da F6 (`licencas/chave.test.ts`), com uma porta a mais e uma
// diferença que só existe aqui:
//
//   1. a RESPOSTA da API        → `comCamposMascarados` é a única saída
//   2. o diff do ActivityLog    → `diffDeCampos`, nunca o objeto cru (D62)
//   3. a rota de revelar        → grava `VIEW_FIELD` antes de responder
//   4. o formulário de volta    → a MÁSCARA reenviada não pode virar o valor
//   5. o AAD por SLUG           → dois segredos na MESMA linha e MESMA coluna
//
// A quarta é a que a F6 não tem: lá a chave de produto é um campo que a tela
// reenvia vazio; aqui o formulário de ativo reenvia TODO campo a cada
// salvamento, então a máscara chega de volta no corpo em toda edição.

const SEGREDO = 'S3nh4-do-BIOS-!@#';

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let campoCifrado: { id: string; slug: string };
let campoComum: { id: string; slug: string };
let ativoId = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  campoCifrado = await criarCampo(api, { name: 'Senha do BIOS', encrypted: true });
  campoComum = await criarCampo(api, { name: 'Hostname' });

  const conjunto = await criarConjunto(api, 'Notebooks com segredo');
  await comporConjunto(api, conjunto, [{ fieldId: campoCifrado.id }, { fieldId: campoComum.id }]);
  await pendurarConjunto(api, { modelId: cenario.modelId }, conjunto);

  const ativo = await criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Notebook com segredo',
  });
  ativoId = ativo.id;

  const gravou = await api.put(`/api/assets/${ativoId}`, {
    customFields: { [campoCifrado.slug]: SEGREDO, [campoComum.slug]: 'PC-ANA' },
  });
  if (gravou.status !== 200) {
    throw new Error(`fixture falhou (${gravou.status}): ${JSON.stringify(gravou.body)}`);
  }
});

afterAll(async () => {
  await api.fechar();
});

describe('em repouso', () => {
  it('o JsonB guarda o pacote cifrado ao lado do valor comum, em claro', async () => {
    const linha = await prisma.asset.findUniqueOrThrow({
      where: { id: ativoId }, select: { customFields: true },
    });
    const campos = linha.customFields as Record<string, string>;

    // É ESTE o caso que obriga o prefixo `enc:` a estar sempre presente (D81,
    // item 1): dentro do MESMO JsonB convivem cifrado e comum, e sem a marca não
    // há como saber qual é qual.
    expect(campos[campoCifrado.slug]).toMatch(/^enc:v1:[0-9a-f]{8}:/);
    expect(campos[campoComum.slug]).toBe('PC-ANA');
  });

  it('nenhuma linha da tabela contém o texto do segredo', async () => {
    // A varredura que um auditor faria. Um `LIKE` sobre a coluna inteira pega
    // tanto um valor gravado em claro por engano quanto um plano B esquecido.
    const emClaro = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM "assets" WHERE "customFields"::text LIKE ${'%BIOS-!@#%'}
    `;
    expect(Number(emClaro[0].total)).toBe(0);
  });
});

describe('na resposta — a máscara é a única saída', () => {
  it('a listagem mascara o cifrado e deixa o comum passar', async () => {
    const { body } = await api.get<{ rows: { id: string; customFields: Record<string, string> | null; temSegredo: boolean }[] }>(
      '/api/assets?perPage=100',
    );
    const linha = body.rows.find((row) => row.id === ativoId)!;

    expect(linha.customFields![campoCifrado.slug]).toBe('••••••');
    expect(linha.customFields![campoComum.slug]).toBe('PC-ANA');
    // É `temSegredo` que faz a tela oferecer o botão de revelar.
    expect(linha.temSegredo).toBe(true);
    expect(JSON.stringify(linha)).not.toContain('BIOS-!@#');
    expect(JSON.stringify(linha)).not.toContain('enc:v1:');
  });

  it('o detalhe mascara igual', async () => {
    const { body } = await api.get<{ customFields: Record<string, string>; temSegredo: boolean }>(
      `/api/assets/${ativoId}`,
    );
    expect(body.customFields[campoCifrado.slug]).toBe('••••••');
    expect(body.temSegredo).toBe(true);
    expect(JSON.stringify(body)).not.toContain('BIOS-!@#');
  });

  it('a resposta da EDIÇÃO também mascara — ela é a que volta ao formulário', async () => {
    const { body } = await api.put<{ customFields: Record<string, string> }>(`/api/assets/${ativoId}`, {
      name: 'Notebook com segredo (renomeado)',
    });
    expect(body.customFields[campoCifrado.slug]).toBe('••••••');
    expect(JSON.stringify(body)).not.toContain('BIOS-!@#');
  });
});

describe('no ActivityLog — o diff não carrega o segredo (D62)', () => {
  it('registra QUE o segredo mudou, com a máscara nos dois lados', async () => {
    await api.put(`/api/assets/${ativoId}`, {
      customFields: { [campoCifrado.slug]: 'outro-segredo-qualquer', [campoComum.slug]: 'PC-ANA' },
    });

    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'Asset', entityId: ativoId, action: 'UPDATE' },
      select: { changes: true },
    });

    // A chave é PLANA e prefixada (`cf.<slug>`): é o que faz a aba Histórico
    // reconhecê-la como mudança, no mesmo formato das colunas nativas. Aninhada
    // sob `customFields`, o leitor genérico a classificava como "detalhe" e
    // imprimia `[object Object]` na tela.
    const chaveNoLog = `cf.${campoCifrado.slug}`;

    const doSegredo = logs
      .map((log) => (log.changes as Record<string, { de: string | null; para: string | null }>)[chaveNoLog])
      .filter(Boolean);

    expect(doSegredo.length).toBeGreaterThan(0);
    // *Quando* um segredo foi trocado é informação de auditoria legítima. *Qual*
    // ele era, não.
    for (const mudanca of doSegredo) {
      expect(mudanca.para).toBe('••••••');
    }

    // A varredura completa: nem o texto nem o pacote em nenhuma linha do log.
    const todos = JSON.stringify(logs);
    expect(todos).not.toContain('BIOS-!@#');
    expect(todos).not.toContain('outro-segredo-qualquer');
    expect(todos).not.toContain('enc:v1:');
  });

  it('o campo COMUM, esse sim, aparece no diff com o valor', async () => {
    // Sem isto, o teste acima passaria com um diff que simplesmente não grava
    // campo customizado nenhum.
    await api.put(`/api/assets/${ativoId}`, {
      customFields: { [campoComum.slug]: 'PC-LAURA' },
    });

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: 'Asset', entityId: ativoId, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { changes: true },
    });

    const changes = log.changes as Record<string, { de: string; para: string }>;
    expect(changes[`cf.${campoComum.slug}`]).toEqual({ de: 'PC-ANA', para: 'PC-LAURA' });
  });
});

describe('a rota de revelar — a única porta', () => {
  it('devolve o valor em claro e GRAVA `VIEW_FIELD` na mesma transação', async () => {
    const antes = await prisma.activityLog.count({
      where: { entityType: 'Asset', entityId: ativoId, action: 'VIEW_FIELD' },
    });

    const { status, body } = await api.get<{ slug: string; value: string }>(
      `/api/assets/${ativoId}/custom-fields/${campoCifrado.slug}/reveal`,
    );

    expect(status).toBe(200);
    expect(body.value).toBe('outro-segredo-qualquer');

    const depois = await prisma.activityLog.findMany({
      where: { entityType: 'Asset', entityId: ativoId, action: 'VIEW_FIELD' },
      select: { changes: true, actorId: true },
    });
    expect(depois.length).toBe(antes + 1);

    // O log diz QUAL campo, QUANDO e QUEM — e nunca o valor.
    const changes = depois[0].changes as { slug: string; revealedAt: string };
    expect(changes.slug).toBe(campoCifrado.slug);
    expect(changes.revealedAt).toBeTruthy();
    expect(depois[0].actorId).toBe(api.adminId);
    expect(JSON.stringify(depois)).not.toContain('segredo');
  });

  it('recusa com 422 revelar campo NÃO cifrado', async () => {
    // Devolver o valor aqui encheria a trilha de auditoria de linhas que ninguém
    // lê — e afogaria justamente as que importam. É a recusa que impede o
    // `VIEW_FIELD` de virar o padrão que o `record-activity` proíbe.
    const { status, body } = await api.get<{ error: string }>(
      `/api/assets/${ativoId}/custom-fields/${campoComum.slug}/reveal`,
    );
    expect(status).toBe(422);
    expect(body.error).toMatch(/não é cifrado/);
  });

  it('404 quando o campo não tem valor gravado, com a etiqueta do ativo', async () => {
    const { status, body } = await api.get<{ error: string }>(
      `/api/assets/${ativoId}/custom-fields/campo_que_nao_existe/reveal`,
    );
    expect(status).toBe(404);
    expect(body.error).toMatch(/não tem valor gravado/);
  });

  it('exige sessão, como toda rota (a porta é fechada por padrão)', async () => {
    const { status } = await api.anonimo.get(
      `/api/assets/${ativoId}/custom-fields/${campoCifrado.slug}/reveal`,
    );
    expect(status).toBe(401);
  });
});

describe('a MÁSCARA reenviada não vira o valor', () => {
  it('reenviar `••••••` mantém o segredo intacto', async () => {
    // O formulário de ativo reenvia TODO campo a cada salvamento, e a leitura
    // devolve a máscara — então ela chega de volta em toda edição. Sem este caso,
    // o segredo real se perderia em silêncio na primeira edição de qualquer outro
    // campo, e a única pista seria alguém tentar revelar meses depois.
    const pacoteAntes = await prisma.asset.findUniqueOrThrow({
      where: { id: ativoId }, select: { customFields: true },
    });

    const { status } = await api.put(`/api/assets/${ativoId}`, {
      name: 'Editado com a máscara de volta',
      customFields: { [campoCifrado.slug]: '••••••', [campoComum.slug]: 'PC-LAURA' },
    });
    expect(status).toBe(200);

    const pacoteDepois = await prisma.asset.findUniqueOrThrow({
      where: { id: ativoId }, select: { customFields: true },
    });

    // O pacote é BYTE A BYTE o mesmo: não houve recifragem nem sobrescrita.
    expect((pacoteDepois.customFields as Record<string, string>)[campoCifrado.slug])
      .toBe((pacoteAntes.customFields as Record<string, string>)[campoCifrado.slug]);

    // E o segredo continua legível.
    const revelado = await api.get<{ value: string }>(
      `/api/assets/${ativoId}/custom-fields/${campoCifrado.slug}/reveal`,
    );
    expect(revelado.body.value).toBe('outro-segredo-qualquer');
  });

  it('a máscara NÃO satisfaz um campo cifrado E obrigatório', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // O FURO QUE ISTO FECHA.
    //
    // Se a máscara fosse descartada só na hora de CIFRAR, ela já teria passado
    // pela conferência de obrigatoriedade como um valor presente — e um campo
    // cifrado e obrigatório seria criado VAZIO mandando `••••••`. O obrigatório
    // driblado por um valor que o próprio sistema imprimiu.
    //
    // Descartá-la no passo 2 (antes do formato e antes do merge) resolve os dois:
    // sem nada gravado, o campo fica nulo e a conferência cobra.
    // ═════════════════════════════════════════════════════════════════════════
    const obrigatorio = await criarCampo(api, { name: 'Senha Obrigatoria', encrypted: true });
    const conjunto = await criarConjunto(api, 'Conjunto do segredo obrigatório');
    await comporConjunto(api, conjunto, [{ fieldId: obrigatorio.id, required: true }]);

    // MODELO PRÓPRIO, e não `cenario.modelId`: repender outro conjunto no modelo
    // compartilhado trocaria o conjunto dos testes seguintes deste arquivo — e a
    // falha apareceria neles, sobre outra coisa. É o mesmo cuidado do `sufixo` do
    // `cenarioDePosse`.
    const fabricante = await criarFabricante(api, 'Fabricante do obrigatório');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId: fabricante, name: 'Modelo do obrigatório',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const comMascara = await api.post<{ error: string; fields: Record<string, string> }>('/api/assets', {
      statusId: cenario.statusDeployableId,
      modelId,
      customFields: { [obrigatorio.slug]: '••••••' },
    });
    expect(comMascara.status).toBe(422);
    expect(comMascara.body.fields[obrigatorio.slug]).toMatch(/obrigatório/);

    // Com um segredo de verdade, passa.
    const comSegredo = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId,
      modelId,
      customFields: { [obrigatorio.slug]: 'segredo-de-verdade' },
    });
    expect(comSegredo.status).toBe(201);

    // E AGORA a máscara passa a significar "não mexi": editar outro campo
    // reenviando `••••••` mantém o segredo e não cobra nada.
    const editou = await api.put(`/api/assets/${comSegredo.body.id}`, {
      name: 'Renomeado com a máscara',
      customFields: { [obrigatorio.slug]: '••••••' },
    });
    expect(editou.status).toBe(200);

    const revelado = await api.get<{ value: string }>(
      `/api/assets/${comSegredo.body.id}/custom-fields/${obrigatorio.slug}/reveal`,
    );
    expect(revelado.body.value).toBe('segredo-de-verdade');
  });

  it('um campo cifrado com formato REGEX não recusa a máscara reenviada', async () => {
    // Descartada só na cifra, a máscara seria validada contra o padrão do
    // segredo — e `••••••` não casa com padrão nenhum. A edição de qualquer OUTRO
    // campo do ativo passaria a responder 422 num campo que ninguém tocou.
    const comPadrao = await criarCampo(api, {
      name: 'Senha Com Padrao', encrypted: true, format: 'REGEX', regexPattern: '^[a-z0-9]{6,}$',
    });
    const conjunto = await criarConjunto(api, 'Conjunto do padrão cifrado');
    await comporConjunto(api, conjunto, [{ fieldId: comPadrao.id }]);

    const fabricante = await criarFabricante(api, 'Fabricante do padrão');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId: fabricante, name: 'Modelo do padrão',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const criado = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId,
      modelId,
      customFields: { [comPadrao.slug]: 'abc123' },
    });
    expect(criado.status).toBe(201);

    // O padrão continua valendo para valor NOVO.
    const foraDoPadrao = await api.put(`/api/assets/${criado.body.id}`, {
      customFields: { [comPadrao.slug]: 'AB' },
    });
    expect(foraDoPadrao.status).toBe(422);

    // E a máscara passa, sem tocar no padrão.
    const comMascara = await api.put(`/api/assets/${criado.body.id}`, {
      name: 'Renomeado', customFields: { [comPadrao.slug]: '••••••' },
    });
    expect(comMascara.status).toBe(200);
  });

  it('reenviar um PACOTE cifrado também é tratado como "não mexi"', async () => {
    const pacote = (await prisma.asset.findUniqueOrThrow({
      where: { id: ativoId }, select: { customFields: true },
    }).then((linha) => linha.customFields)) as Record<string, string>;

    await api.put(`/api/assets/${ativoId}`, {
      customFields: { [campoCifrado.slug]: pacote[campoCifrado.slug] },
    });

    // Recifrar um pacote produziria cifra de cifra, e decifrar devolveria
    // `enc:v1:…` como se fosse o segredo.
    const revelado = await api.get<{ value: string }>(
      `/api/assets/${ativoId}/custom-fields/${campoCifrado.slug}/reveal`,
    );
    expect(revelado.body.value).toBe('outro-segredo-qualquer');
  });
});

describe('o AAD amarra o valor ao LUGAR — linha E campo', () => {
  it('um segredo copiado de OUTRO ativo não é revelado como legítimo', async () => {
    const outro = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Outro notebook',
    });
    await api.put(`/api/assets/${outro.id}`, {
      customFields: { [campoCifrado.slug]: 'segredo-do-outro' },
    });

    const pacoteDoOutro = (await prisma.asset.findUniqueOrThrow({
      where: { id: outro.id }, select: { customFields: true },
    }).then((l) => l.customFields)) as Record<string, string>;

    // O ataque: com acesso ao banco, colar o pacote do outro ativo aqui.
    await prisma.asset.update({
      where: { id: ativoId },
      data: { customFields: { [campoCifrado.slug]: pacoteDoOutro[campoCifrado.slug] } },
    });

    const { status, body } = await api.get<{ error: string }>(
      `/api/assets/${ativoId}/custom-fields/${campoCifrado.slug}/reveal`,
    );
    // A tag de autenticação não confere, porque o AAD carrega o id da linha.
    expect(status).toBe(500);
    expect(body.error).toMatch(/adulterado, ou não pertence a este registro/);
  });

  it('um segredo copiado do CAMPO VIZINHO da mesma linha também não', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // É A DIFERENÇA EM RELAÇÃO AO D81 LITERAL, e ela existe por causa da forma
    // desta coluna.
    //
    // O D81 fala de `"<tabela>:<coluna>:<id da linha>"`. Numa coluna dedicada há
    // UM segredo por linha, e isso basta. Aqui convivem N segredos na MESMA
    // coluna da MESMA linha — a senha do BIOS e a chave do Wi-Fi do mesmo
    // notebook. Sem o `slug` no AAD, os dois teriam endereço idêntico, e trocar
    // um pelo outro por dentro do banco faria o sistema revelar um como se fosse
    // o outro.
    // ═════════════════════════════════════════════════════════════════════════
    const wifi = await criarCampo(api, { name: 'Chave do Wifi', encrypted: true });
    const conjunto = await criarConjunto(api, 'Conjunto de dois segredos');
    await comporConjunto(api, conjunto, [{ fieldId: campoCifrado.id }, { fieldId: wifi.id }]);
    await pendurarConjunto(api, { modelId: cenario.modelId }, conjunto);

    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Dois segredos',
    });

    // Cifrado com o AAD do campo VIZINHO, e gravado sob o slug do BIOS.
    const pacoteDoWifi = cifrar('senha-do-wifi', aadDoCampo(ativo.id, wifi.slug));
    await prisma.asset.update({
      where: { id: ativo.id },
      data: { customFields: { [campoCifrado.slug]: pacoteDoWifi } },
    });

    const { status, body } = await api.get<{ error: string }>(
      `/api/assets/${ativo.id}/custom-fields/${campoCifrado.slug}/reveal`,
    );
    expect(status).toBe(500);
    expect(body.error).toMatch(/adulterado, ou não pertence a este registro/);

    // Sob o slug CERTO, o mesmo pacote abre — é a prova de que o que barrou foi
    // o AAD, e não o pacote estar corrompido.
    await prisma.asset.update({
      where: { id: ativo.id },
      data: { customFields: { [wifi.slug]: pacoteDoWifi } },
    });
    const certo = await api.get<{ value: string }>(
      `/api/assets/${ativo.id}/custom-fields/${wifi.slug}/reveal`,
    );
    expect(certo.body.value).toBe('senha-do-wifi');
  });
});

describe('o canário do boot enxerga esta coluna', () => {
  it('devolve os `kid` guardados em `assets.customFields`, e nunca os valores', async () => {
    // Uma coluna que fique de fora da lista faz o boot concluir "o chaveiro abre
    // tudo" quando não abre — e o valor dela só se descobre ilegível quando
    // alguém o pedir. O `canary.ts` previa esta coluna em comentário.
    const colunas = colunasCifradasDoAtivo();
    expect(colunas.map((coluna) => coluna.descricao)).toEqual(['assets.customFields']);

    const kids = await colunas[0].kidsGuardados();
    expect(kids.length).toBeGreaterThan(0);
    // Todo `kid` é o rótulo público de 8 hex — nunca um valor.
    for (const kid of kids) expect(kid).toMatch(/^[0-9a-f]{8}$/);
  });
});
