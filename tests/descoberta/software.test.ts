import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarLicenca, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// O `installedSoftware` DEIXA DE SER WRITE-ONLY, e vira conformidade.
//
// Até a F7 esse campo era gravado no handshake e nunca lido por nada. Aqui ele
// alimenta a pergunta que paga o módulo de licença: **instalado sem assento** e
// **assento pago sem instalação**.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api) });
});

afterAll(async () => {
  await api.fechar();
});

const OFFICE = { Name: 'Microsoft 365 Apps for enterprise', Version: '16.0.17328', Publisher: 'Microsoft Corporation' };
const CHROME_SEM_FABRICANTE = { Name: 'Google Chrome', Version: '131.0.6778.86' };

async function maquinaComSoftware(hwid: string, assetId: string, software: Record<string, unknown>[]) {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid, InstalledSoftware: software });
  const endpoint = await esperarPor(hwid, async () => {
    const achado = await prisma.endpoint.findUnique({ where: { hwid } });
    return achado?.softwareHash ? achado : null;
  });
  await agente.fechar();

  await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
  return endpoint;
}

describe('a normalização', () => {
  it('cria o catálogo e não duplica o pacote sem fabricante', async () => {
    const ativoA = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'pc-sw-a' });
    const ativoB = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'pc-sw-b' });

    await maquinaComSoftware('sw-a', ativoA.id, [OFFICE, CHROME_SEM_FABRICANTE]);
    await maquinaComSoftware('sw-b', ativoB.id, [CHROME_SEM_FABRICANTE]);

    await rodarReconciliacao();

    // ⚠️ O D100: em Postgres dois NULL não são iguais dentro de um índice único.
    // Com `@@unique([name, version, publisher])`, o Chrome sem fabricante teria
    // entrado DUAS vezes — uma por máquina — e a conformidade contaria duas
    // instalações do que é o mesmo produto.
    const chrome = await prisma.softwarePackage.findMany({ where: { name: 'Google Chrome' } });
    expect(chrome).toHaveLength(1);
    expect(chrome[0].publisher).toBeNull();

    const instalacoes = await prisma.softwareInstallation.count({ where: { packageId: chrome[0].id, removedAt: null } });
    expect(instalacoes).toBe(2);
  });

  it('não refaz o trabalho quando a lista não muda', async () => {
    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'sw-a' } });
    expect(endpoint.softwareNormalizedHash).toBe(endpoint.softwareHash);

    const antes = await prisma.softwareInstallation.findMany({
      where: { endpointId: endpoint.id },
      select: { id: true, lastSeenAt: true },
    });

    await rodarReconciliacao();

    // A guarda é a comparação de DUAS STRINGS. Sem ela, cada rodada
    // diferenciaria ~800 linhas de software por máquina — o caminho mais curto
    // para derrubar o banco numa frota de 500.
    const depois = await prisma.softwareInstallation.findMany({
      where: { endpointId: endpoint.id },
      select: { id: true, lastSeenAt: true },
    });
    expect(depois.map((linha) => linha.lastSeenAt.getTime())).toEqual(antes.map((linha) => linha.lastSeenAt.getTime()));
  });

  it('desinstalar marca `removedAt` e não apaga a linha', async () => {
    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'sw-a' } });

    const agente = await conectarAgente(api, 'sw-a');
    await agente.handshake({ Hostname: 'sw-a', InstalledSoftware: [CHROME_SEM_FABRICANTE] });
    await esperarPor('o hash mudar', async () => {
      const atual = await prisma.endpoint.findUnique({ where: { hwid: 'sw-a' } });
      return atual && atual.softwareHash !== atual.softwareNormalizedHash ? atual : null;
    });
    await agente.fechar();

    await rodarReconciliacao();

    const office = await prisma.softwarePackage.findFirstOrThrow({ where: { name: OFFICE.Name } });
    const instalacao = await prisma.softwareInstallation.findFirstOrThrow({
      where: { endpointId: endpoint.id, packageId: office.id },
    });

    // A linha FICA. "O Office esteve instalado nesta máquina até junho" é a
    // resposta que a auditoria de fornecedor vem procurar, e o `delete` a
    // apagaria — mesmo princípio do `Assignment` e do `LicenseSeatCheckout`.
    expect(instalacao.removedAt).not.toBeNull();
  });
});

describe('a conformidade', () => {
  it('responde as duas perguntas, e só depois da ponte licença↔pacote', async () => {
    const licenca = await criarLicenca(api, {
      categoryId: seed.categoriaLicencaId,
      name: 'Microsoft 365 E3',
      seatsTotal: 2,
    });

    // SEM a ponte, a conformidade não afirma nada — e diz isso explicitamente,
    // em vez de devolver listas vazias que pareceriam "está tudo certo" (D102).
    const semPonte = await api.get<{ semVinculoDeSoftware: boolean }>(`/api/licenses/${licenca.id}/compliance`);
    expect(semPonte.body.semVinculoDeSoftware).toBe(true);

    const office = await prisma.softwarePackage.findFirstOrThrow({ where: { name: OFFICE.Name } });
    const ponte = await api.put(`/api/licenses/${licenca.id}/software`, { packageIds: [office.id] });
    expect(ponte.status).toBe(200);

    // A máquina B recebe o Office e NÃO tem assento.
    const ativoB = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'sw-b' }, select: { assetId: true } });
    const agente = await conectarAgente(api, 'sw-b');
    await agente.handshake({ Hostname: 'sw-b', InstalledSoftware: [OFFICE, CHROME_SEM_FABRICANTE] });
    await esperarPor('o Office na máquina B', async () => {
      const atual = await prisma.endpoint.findUnique({ where: { hwid: 'sw-b' } });
      return atual && atual.softwareHash !== atual.softwareNormalizedHash ? atual : null;
    });
    await agente.fechar();
    await rodarReconciliacao();

    const comInstalacao = await api.get<{
      instaladoSemAssento: { assetId: string }[];
      assentoSemInstalacao: { assetId: string }[];
    }>(`/api/licenses/${licenca.id}/compliance`);

    expect(comInstalacao.body.instaladoSemAssento.map((linha) => linha.assetId)).toEqual([ativoB.assetId]);
    expect(comInstalacao.body.assentoSemInstalacao).toHaveLength(0);

    // Agora o inverso: o assento vai para a máquina A, que NÃO tem mais o Office.
    const ativoA = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'sw-a' }, select: { assetId: true } });
    const entrega = await api.post(`/api/licenses/${licenca.id}/checkout-seat`, {
      assignedAssetId: ativoA.assetId,
    });
    expect(entrega.status).toBe(201);

    const depois = await api.get<{
      instaladoSemAssento: { assetId: string }[];
      assentoSemInstalacao: { assetId: string }[];
    }>(`/api/licenses/${licenca.id}/compliance`);

    // Assento pago, software ausente: é dinheiro parado, e é o relatório que
    // justifica o módulo. O caminho todo passa pelo `assignedAssetId` do
    // CHECKOUT do assento (F6, D40) — um assento que pudesse ir para um POSTO
    // não teria caminho até uma instalação (D39).
    expect(depois.body.assentoSemInstalacao.map((linha) => linha.assetId)).toEqual([ativoA.assetId]);
    expect(depois.body.instaladoSemAssento.map((linha) => linha.assetId)).toEqual([ativoB.assetId]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A PORTA DE ENTRADA DA PONTE — o que faltava para a conformidade EXISTIR.
//
// O bloco acima prova o motor: ligar licença a pacote e cruzar. Mas ele monta a
// ponte pegando o `packageId` direto do Prisma — coisa que nenhuma tela pode
// fazer. Não havia rota para LISTAR pacotes, então `PUT /licenses/:id/software`
// era uma rota sem nenhum caminho de produto até um id válido: `LicenseSoftware`
// nunca recebia linha e a conformidade respondia `semVinculoDeSoftware` para
// sempre — motor completo, resposta vazia.
//
// É o "defeito 1" do docs/TESTES.md na forma mais pura, e é por isso que estes
// testes entram pela API e não pelo use-case.
// ═════════════════════════════════════════════════════════════════════════════

describe('o catálogo de software descoberto', () => {
  it('lista os pacotes com a contagem de instalações, e busca por nome e fabricante', async () => {
    const catalogo = await api.get<{ total: number; rows: { id: string; name: string; instalacoes: number }[] }>(
      '/api/software-packages',
    );
    expect(catalogo.status).toBe(200);

    const office = catalogo.body.rows.find((pacote) => pacote.name === OFFICE.Name);
    expect(office).toBeDefined();
    // A contagem é de instalação VIVA (`removedAt IS NULL`) e é ela que ordena a
    // lista: quem abre o seletor quer saber que licença amarrar primeiro, e em
    // ordem alfabética as primeiras cem nunca são as que importam.
    expect(office!.instalacoes).toBeGreaterThan(0);

    const porFabricante = await api.get<{ rows: { name: string }[] }>('/api/software-packages?q=microsoft');
    expect(porFabricante.body.rows.map((pacote) => pacote.name)).toContain(OFFICE.Name);

    const semResultado = await api.get<{ rows: unknown[] }>('/api/software-packages?q=autocad');
    expect(semResultado.body.rows).toHaveLength(0);
  });

  it('recusa limite acima do teto em vez de montar o catálogo inteiro em memória', async () => {
    const { status } = await api.get('/api/software-packages?limite=999999');
    expect(status).toBe(422);
  });
});

describe('a ponte licença↔pacote, pelo caminho da tela', () => {
  it('abre vazia, recebe o conjunto e devolve o que ficou ligado', async () => {
    const licenca = await criarLicenca(api, {
      categoryId: seed.categoriaLicencaId,
      name: 'Adobe Acrobat Pro',
      seatsTotal: 1,
    });

    // 1. A tela abre e pergunta o que JÁ está ligado — e a resposta é "nada".
    //    Sem esta rota, o formulário não tinha como marcar as caixas certas, e
    //    salvar depois de abrir desligaria tudo em silêncio (o corpo é o
    //    CONJUNTO inteiro).
    const inicial = await api.get<{ total: number; rows: unknown[] }>(`/api/licenses/${licenca.id}/software`);
    expect(inicial.status).toBe(200);
    expect(inicial.body.total).toBe(0);

    // 2. A tela pega os ids do catálogo — pela rota, como uma tela faz.
    const catalogo = await api.get<{ rows: { id: string; name: string }[] }>('/api/software-packages?q=chrome');
    const chrome = catalogo.body.rows.find((pacote) => pacote.name === CHROME_SEM_FABRICANTE.Name);
    expect(chrome).toBeDefined();

    // 3. E liga.
    const ligou = await api.put(`/api/licenses/${licenca.id}/software`, { packageIds: [chrome!.id] });
    expect(ligou.status).toBe(200);

    const depois = await api.get<{ total: number; rows: { id: string }[] }>(`/api/licenses/${licenca.id}/software`);
    expect(depois.body.rows.map((pacote) => pacote.id)).toEqual([chrome!.id]);

    // 4. E a conformidade para de dizer que não sabe nada.
    const conformidade = await api.get<{ semVinculoDeSoftware: boolean }>(`/api/licenses/${licenca.id}/compliance`);
    expect(conformidade.body.semVinculoDeSoftware).toBe(false);

    // 5. O conjunto VAZIO desliga — e é o que o botão "salvar 0 programas" faz.
    //    Ele tem que funcionar: desligar é tão necessário quanto ligar, e o
    //    vínculo de configuração não é histórico que se preserve.
    await api.put(`/api/licenses/${licenca.id}/software`, { packageIds: [] });
    const zerada = await api.get<{ total: number }>(`/api/licenses/${licenca.id}/software`);
    expect(zerada.body.total).toBe(0);
  });

  it('recusa pacote que não existe, em vez de ligar a licença a nada', async () => {
    const licenca = await criarLicenca(api, {
      categoryId: seed.categoriaLicencaId,
      name: 'Licença de teste da ponte',
      seatsTotal: 1,
    });

    const { status } = await api.put(`/api/licenses/${licenca.id}/software`, {
      packageIds: ['00000000-0000-0000-0000-000000000000'],
    });
    expect(status).toBe(404);
  });
});
