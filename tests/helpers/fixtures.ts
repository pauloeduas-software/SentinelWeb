import { prisma } from '../../server/core/database/prismaClient';
import type { ApiDeTeste } from './app';

// O CENÁRIO de cada teste, montado PELA API.
//
// A regra do arquivo: o que o teste vai EXERCITAR nasce por HTTP; o que ele só
// precisa CONSULTAR (os ids do catálogo que o seed e o harness criaram) sai do
// Prisma direto.
//
// A distinção importa. Criar o ativo com `prisma.asset.create` pularia o zod da
// borda, o `strictObject`, a etiqueta automática e o `ActivityLog` — e o teste
// passaria a provar coisas sobre um ativo que nenhum usuário consegue criar.
// Já buscar o id de um status `DEPLOYABLE` não é operação nenhuma: é o mesmo
// que ler a tela antes de clicar.

interface Criado {
  id: string;
}

/** Explode com o corpo do erro em vez de um `undefined` três linhas adiante. */
function exigir201<T>(o_que: string, resposta: { status: number; body: unknown }): T {
  if (resposta.status !== 201 && resposta.status !== 200) {
    throw new Error(`fixture "${o_que}" falhou (${resposta.status}): ${JSON.stringify(resposta.body)}`);
  }
  return resposta.body as T;
}

/** Os ids que o seed e o harness (`tests/setup/database.ts`) deixam prontos. Lidos, nunca criados. */
export async function idsDoSeed() {
  const [
    deployable, emUso, categoria, licenca, estoque,
  ] = await Promise.all([
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'DEPLOYABLE' }, select: { id: true } }),
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'IN_USE' }, select: { id: true } }),
    prisma.category.findFirstOrThrow({ where: { type: 'ASSET' }, select: { id: true } }),
    // A da licença. O seed cria as famílias ("Sistema operacional",
    // "Produtividade"…) com `type: 'LICENSE'`, e é o TIPO que o use-case
    // confere: categoria de ASSET numa licença é 422.
    prisma.category.findFirstOrThrow({ where: { type: 'LICENSE' }, select: { id: true } }),
    // A do estoque: "Periférico", "Monitor"… nascem `STOCK` no seed, e é o tipo
    // que o use-case confere — categoria de ATIVO num item de estoque é 422.
    prisma.category.findFirstOrThrow({ where: { type: 'STOCK' }, select: { id: true } }),
  ]);

  return {
    statusDeployableId: deployable.id,
    statusEmUsoId: emUso.id,
    categoriaId: categoria.id,
    categoriaLicencaId: licenca.id,
    categoriaEstoqueId: estoque.id,
  };
}

/**
 * Um item de estoque, pela API — nunca por `prisma.stockItem.create`.
 *
 * O motivo é o do topo deste arquivo: criar pelo Prisma pularia o zod da borda,
 * a guarda de tipo da categoria, a ENTRADA inicial e o `ActivityLog`, e o teste
 * passaria a provar coisas sobre um item que nenhum usuário consegue cadastrar.
 *
 * O NOME é único entre os vivos, então quem chama passa um nome próprio por
 * caso.
 */
export async function criarItemDeEstoque(
  api: ApiDeTeste,
  opcoes: { name: string; categoryId: string; qty?: number; notes?: string },
): Promise<{ id: string; name: string; qty: number }> {
  const corpo: Record<string, unknown> = { name: opcoes.name, categoryId: opcoes.categoryId };
  if (opcoes.qty !== undefined) corpo.qty = opcoes.qty;
  if (opcoes.notes !== undefined) corpo.notes = opcoes.notes;

  return exigir201('item de estoque', await api.post('/api/stock/items', corpo));
}

/**
 * Uma licença, pela API — nunca por `prisma.license.create`.
 *
 * Criar pelo Prisma pularia o zod da borda, a guarda de tipo da categoria, a
 * criação dos assentos na
 * mesma transação. O teste passaria a provar coisas sobre uma licença de 5
 * assentos com zero linhas em `license_seats`, que nenhum usuário consegue
 * cadastrar.
 *
 * O NOME é único por índice parcial, então quem chama passa um sufixo próprio
 * quando cria mais de uma no mesmo arquivo.
 */
export async function criarLicenca(
  api: ApiDeTeste,
  opcoes: {
    name: string;
    categoryId: string;
    seatsTotal: number;
    reassignable?: boolean;
    minSeats?: number;
    expirationDate?: string;
    terminationDate?: string;
  },
): Promise<{ id: string; seatsTotal: number; livres: number; hasProductKey: boolean }> {
  const corpo: Record<string, unknown> = {
    name: opcoes.name,
    categoryId: opcoes.categoryId,
    seatsTotal: opcoes.seatsTotal,
  };
  for (const chave of ['reassignable', 'minSeats', 'expirationDate', 'terminationDate'] as const) {
    if (opcoes[chave] !== undefined) corpo[chave] = opcoes[chave];
  }

  return exigir201('licença', await api.post('/api/licenses', corpo));
}

/** Os assentos de uma licença, como a grade da tela os mostra. */
export async function assentosDa(api: ApiDeTeste, licenseId: string) {
  const resposta = await api.get<{
    id: string; seatNumber: number; burnedAt: string | null; retiredAt: string | null;
    checkouts: { id: string; assignedUserId: string | null; assignedAssetId: string | null }[];
  }[]>(`/api/licenses/${licenseId}/seats`);
  return exigir201<typeof resposta.body>('assentos', resposta);
}

export async function criarFabricante(api: ApiDeTeste, name = 'Fabricante de Teste'): Promise<string> {
  const criado = exigir201<Criado>('fabricante', await api.post('/api/manufacturers', { name }));
  return criado.id;
}

export async function criarModelo(
  api: ApiDeTeste,
  opcoes: { categoriaId: string; fabricanteId: string; name?: string },
): Promise<string> {
  const criado = exigir201<Criado>('modelo', await api.post('/api/asset-models', {
    name: opcoes.name ?? 'Modelo de Teste',
    manufacturerId: opcoes.fabricanteId,
    categoryId: opcoes.categoriaId,
  }));
  return criado.id;
}

/**
 * Uma localização, pela API.
 *
 * `parentId` e `managerId` são opcionais e só viajam quando vêm preenchidos: o
 * `strictObject` da borda aceita os dois, mas mandar `undefined` explícito muda
 * o corpo do PUT de "não mencionei" para "apaguei" em alguns schemas — e aqui
 * quem chama sem eles quer uma localização solta, não uma com pai nulo.
 *
 * ⚠️ `parentId` passa pelo `assertSemCicloDeLocalizacao`: não há como MONTAR um
 * ciclo por este caminho, e é de propósito. Quem precisa de uma árvore cíclica
 * para exercitar o teto de profundidade grava pelo Prisma direto, porque é só
 * assim que ela existe (`tests/listagens/escalonamento.test.ts`).
 */
export async function criarLocal(
  api: ApiDeTeste,
  opcoes: { name: string; isWorkstation?: boolean; parentId?: string; managerId?: string },
): Promise<string> {
  const corpo: Record<string, unknown> = {
    name: opcoes.name,
    isWorkstation: opcoes.isWorkstation ?? false,
  };
  if (opcoes.parentId !== undefined) corpo.parentId = opcoes.parentId;
  if (opcoes.managerId !== undefined) corpo.managerId = opcoes.managerId;

  const criado = exigir201<Criado>('localização', await api.post('/api/locations', corpo));
  return criado.id;
}

export async function criarColaborador(
  api: ApiDeTeste,
  opcoes: { name: string; email: string },
): Promise<string> {
  const criado = exigir201<Criado>('colaborador', await api.post('/api/users', opcoes));
  return criado.id;
}

export async function criarAtivo(
  api: ApiDeTeste,
  opcoes: { statusId: string; modelId: string; assetTag?: string; name?: string; serial?: string; locationId?: string },
): Promise<{ id: string; assetTag: string }> {
  const corpo: Record<string, unknown> = { statusId: opcoes.statusId, modelId: opcoes.modelId };
  if (opcoes.assetTag !== undefined) corpo.assetTag = opcoes.assetTag;
  if (opcoes.name !== undefined) corpo.name = opcoes.name;
  // `serial` e `locationId` entram na CRIAÇÃO e não por um PUT depois: é o
  // caminho que o formulário usa, e é pelo serial que a reconciliação da F7
  // encontra o ativo.
  if (opcoes.serial !== undefined) corpo.serial = opcoes.serial;
  if (opcoes.locationId !== undefined) corpo.locationId = opcoes.locationId;

  return exigir201<{ id: string; assetTag: string }>('ativo', await api.post('/api/assets', corpo));
}

/**
 * O cenário completo do modelo de posse, em uma chamada.
 *
 * Um ativo disponível, duas pessoas e um posto de trabalho — que é o mínimo
 * para exercitar as três camadas do `docs/referencia/modelo-de-posse.md`, incluindo o caso
 * que nenhum ITAM de prateleira modela: DUAS pessoas no MESMO posto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O `sufixo` E POR QUE O PADRÃO DELE É VAZIO.
 *
 * `Manufacturer.name` e `Location.name` são `@unique`, e `User.email` tem índice
 * único parcial. Chamar esta função DUAS vezes no mesmo arquivo colide nos três —
 * 409 "Registro já existe" vindo de dentro do fixture, que se lê como defeito da
 * aplicação e não do teste. Foi o que aconteceu com `ciclo-de-vida/auditoria.test.ts`,
 * que a monta uma vez por `it`.
 *
 * O padrão fica VAZIO de propósito: quatro testes já passando dependem dos nomes
 * LITERAIS que ela produz — `invariantes/posse.test.ts` compara
 * `['Ana Lima', 'Laura Souza']`, `aceite/fluxo.test.ts` confere o `signerName` e
 * `listagens/historico-da-pessoa.test.ts` espera `locationLabel === 'Mesa 1'`.
 * Trocar os nomes por gerados quebraria os quatro para consertar um. Quem chama
 * mais de uma vez passa o sufixo; quem chama uma vez não muda nada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function cenarioDePosse(api: ApiDeTeste, sufixo = '') {
  const seed = await idsDoSeed();

  // O SUFIXO DO E-MAIL É SANITIZADO AQUI, e não na responsabilidade de quem chama.
  //
  // Nome de fabricante e de posto aceitam qualquer texto; a parte local de um
  // e-mail não. Um sufixo legível como " (posto-vago)" produz
  // `laura (posto-vago)@teste.local`, que o zod da borda recusa com 422 — e o teste
  // morre dizendo "e-mail inválido", que não tem nada a ver com o que ele testa.
  //
  // Sanitizar aqui é a mesma escolha do `method` na auditoria pelo agente: a regra
  // mora onde ninguém pode esquecer dela, porque quem chama é quem erra.
  const parteDeEmail = sufixo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const noEmail = parteDeEmail ? `.${parteDeEmail}` : '';

  const fabricanteId = await criarFabricante(api, `Fabricante de Teste${sufixo}`);
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const [mesa1, laura, ana, ativo] = await Promise.all([
    criarLocal(api, { name: `Mesa 1${sufixo}`, isWorkstation: true }),
    criarColaborador(api, { name: `Laura Souza${sufixo}`, email: `laura${noEmail}@teste.local` }),
    criarColaborador(api, { name: `Ana Lima${sufixo}`, email: `ana${noEmail}@teste.local` }),
    criarAtivo(api, { statusId: seed.statusDeployableId, modelId }),
  ]);

  return { ...seed, modelId, fabricanteId, mesa1, laura, ana, ativo };
}

// ── O CICLO DE VIDA (F8) ────────────────────────────────────────────────────

/** `AAAA-MM-DD` de N dias atrás — o que os testes de prazo precisam. */
export function diasAtras(dias: number): string {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

/** `AAAA-MM-DD` de N dias à frente. */
export function diasAFrente(dias: number): string {
  return diasAtras(-dias);
}

// ── CAMPOS CUSTOMIZADOS (F9) ────────────────────────────────────────────────
