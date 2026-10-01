import { prisma } from '../../server/core/database/prismaClient';
import type { ApiDeTeste } from './app';

// O CENÁRIO de cada teste, montado PELA API.
//
// A regra do arquivo: o que o teste vai EXERCITAR nasce por HTTP; o que ele só
// precisa CONSULTAR (os ids do catálogo que o seed criou) sai do Prisma direto.
//
// A distinção importa. Criar o ativo com `prisma.asset.create` pularia o zod da
// borda, o `strictObject`, a etiqueta automática e o `ActivityLog` — e o teste
// passaria a provar coisas sobre um ativo que nenhum usuário consegue criar.
// Já buscar o id do status "Pronto p/ Uso" não é operação nenhuma: é o mesmo
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

/** Os ids que o seed deixa prontos. Lidos, nunca criados. */
export async function idsDoSeed() {
  const [
    deployable, emUso, arquivado, categoria, acessorio, consumivel, componente, licenca,
  ] = await Promise.all([
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'DEPLOYABLE' }, select: { id: true } }),
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'IN_USE' }, select: { id: true } }),
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'ARCHIVED' }, select: { id: true } }),
    prisma.category.findFirstOrThrow({ where: { type: 'ASSET' }, select: { id: true } }),
    // As três do estoque (F5). O seed cria uma por tipo, e é o TIPO que o
    // use-case confere: categoria de ASSET num acessório é 422.
    prisma.category.findFirstOrThrow({ where: { type: 'ACCESSORY' }, select: { id: true } }),
    prisma.category.findFirstOrThrow({ where: { type: 'CONSUMABLE' }, select: { id: true } }),
    prisma.category.findFirstOrThrow({ where: { type: 'COMPONENT' }, select: { id: true } }),
    // A da F6. O seed cria "Licença" com `type: 'LICENSE'`, e é o TIPO que o
    // use-case confere: categoria de ASSET numa licença é 422.
    prisma.category.findFirstOrThrow({ where: { type: 'LICENSE' }, select: { id: true } }),
  ]);

  return {
    statusDeployableId: deployable.id,
    statusEmUsoId: emUso.id,
    statusArquivadoId: arquivado.id,
    categoriaId: categoria.id,
    categoriaAcessorioId: acessorio.id,
    categoriaConsumivelId: consumivel.id,
    categoriaComponenteId: componente.id,
    categoriaLicencaId: licenca.id,
  };
}

/**
 * Uma licença, pela API — nunca por `prisma.license.create`.
 *
 * Criar pelo Prisma pularia o zod da borda, a guarda de tipo da categoria, a
 * CIFRA da chave de produto e — o que mais importa — a criação dos assentos na
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
    productKey?: string;
    expirationDate?: string;
    terminationDate?: string;
  },
): Promise<{ id: string; seatsTotal: number; livres: number; hasProductKey: boolean }> {
  const corpo: Record<string, unknown> = {
    name: opcoes.name,
    categoryId: opcoes.categoryId,
    seatsTotal: opcoes.seatsTotal,
  };
  for (const chave of ['reassignable', 'minSeats', 'productKey', 'expirationDate', 'terminationDate'] as const) {
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

/**
 * Um item de estoque, pela API — nunca por `prisma.accessory.create`.
 *
 * O motivo é o do topo deste arquivo: criar pelo Prisma pularia o zod da borda,
 * a guarda de tipo da categoria e o `ActivityLog`, e o teste passaria a provar
 * coisas sobre um item que nenhum usuário consegue cadastrar.
 *
 * O NOME é único por índice parcial nos três tipos, então quem chama passa um
 * sufixo próprio quando cria mais de um no mesmo arquivo.
 */
export async function criarItemDeEstoque(
  api: ApiDeTeste,
  slug: 'accessories' | 'consumables' | 'components',
  opcoes: { name: string; categoryId: string; qty: number; minQty?: number },
): Promise<{ id: string; qty: number; disponivel: number }> {
  const corpo: Record<string, unknown> = {
    name: opcoes.name,
    categoryId: opcoes.categoryId,
    qty: opcoes.qty,
  };
  if (opcoes.minQty !== undefined) corpo.minQty = opcoes.minQty;

  return exigir201(slug, await api.post(`/api/${slug}`, corpo));
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

export async function criarLocal(
  api: ApiDeTeste,
  opcoes: { name: string; isWorkstation?: boolean } ,
): Promise<string> {
  const criado = exigir201<Criado>('localização', await api.post('/api/locations', {
    name: opcoes.name,
    isWorkstation: opcoes.isWorkstation ?? false,
  }));
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
 * Um ativo no estoque, duas pessoas e um posto de trabalho — que é o mínimo
 * para exercitar as três camadas do `docs/MODELO-POSSE.md`, incluindo o caso
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

/** Um fornecedor, pela API. O nome é `@unique`, então quem chama passa o próprio. */
export async function criarFornecedor(api: ApiDeTeste, name: string): Promise<string> {
  const criado = exigir201<Criado>('fornecedor', await api.post('/api/suppliers', { name }));
  return criado.id;
}

/**
 * Uma regra de depreciação, pela API — nunca por `prisma.depreciation.create`.
 *
 * Criar pelo Prisma pularia o `beforeWrite` da spec, que é justamente o que limita
 * o piso `PERCENT` a 100% — e o teste do valor contábil existe para provar o que
 * acontece quando o piso `AMOUNT` passa do custo, que é o caso que aquele
 * `beforeWrite` NÃO cobre.
 */
export async function criarDepreciacao(
  api: ApiDeTeste,
  opcoes: { name: string; months: number; floorValue: string; floorType: 'PERCENT' | 'AMOUNT' },
): Promise<string> {
  const criado = exigir201<Criado>('depreciação', await api.post('/api/depreciations', opcoes));
  return criado.id;
}

/** Pendura a regra no MODELO — é ali que ela ancora (a categoria vem do modelo). */
export async function pendurarDepreciacao(
  api: ApiDeTeste,
  modelId: string,
  depreciationId: string,
): Promise<void> {
  exigir201('depreciação no modelo', await api.put(`/api/asset-models/${modelId}`, { depreciationId }));
}

/** Uma manutenção, pela rota do ATIVO: ela nasce sempre pendurada num. */
export async function criarManutencao(
  api: ApiDeTeste,
  assetId: string,
  opcoes: {
    type?: 'MANUTENCAO' | 'REPARO' | 'UPGRADE' | 'CALIBRACAO' | 'SUPORTE';
    title: string;
    startDate: string;
    completionDate?: string;
    cost?: string;
    isWarranty?: boolean;
    supplierId?: string;
  },
): Promise<{ id: string; cost: string | null; emAberto: boolean }> {
  const corpo: Record<string, unknown> = {
    type: opcoes.type ?? 'REPARO',
    title: opcoes.title,
    startDate: opcoes.startDate,
  };
  if (opcoes.completionDate !== undefined) corpo.completionDate = opcoes.completionDate;
  if (opcoes.cost !== undefined) corpo.cost = opcoes.cost;
  if (opcoes.isWarranty !== undefined) corpo.isWarranty = opcoes.isWarranty;
  if (opcoes.supplierId !== undefined) corpo.supplierId = opcoes.supplierId;

  return exigir201('manutenção', await api.post(`/api/assets/${assetId}/maintenances`, corpo));
}

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

/**
 * Um campo customizado, pela API — nunca por `prisma.customField.create`.
 *
 * Criar pelo Prisma pularia a derivação do `slug` a partir do nome, as três
 * guardas do `beforeWrite` (slug imutável, cifra que não vira, coerência entre
 * elemento e formato) e o `ActivityLog` — e o teste passaria a provar coisas
 * sobre um campo que nenhum administrador consegue cadastrar.
 *
 * O `slug` é `@unique` e nasce do NOME, então quem cria mais de um no mesmo
 * arquivo passa nomes distintos.
 */
export async function criarCampo(
  api: ApiDeTeste,
  opcoes: {
    name: string;
    slug?: string;
    element?: 'TEXT' | 'TEXTAREA' | 'LISTBOX' | 'CHECKBOX' | 'RADIO' | 'DATE';
    format?: string;
    regexPattern?: string;
    listValues?: string[];
    helpText?: string;
    encrypted?: boolean;
    showInListView?: boolean;
  },
): Promise<{ id: string; slug: string }> {
  return exigir201('campo customizado', await api.post('/api/custom-fields', opcoes));
}

/** Um conjunto vazio. A composição entra por `comporConjunto`. */
export async function criarConjunto(api: ApiDeTeste, name: string): Promise<string> {
  const criado = exigir201<Criado>('conjunto de campos', await api.post('/api/custom-fieldsets', { name }));
  return criado.id;
}

/**
 * A composição INTEIRA de um conjunto — a ordem é a do array.
 *
 * Pela rota própria, e não pelo `PUT /api/custom-fieldsets/:id` do catálogo: a
 * spec genérica grava um `data` plano e não sabe expressar ordem nem
 * obrigatoriedade por vínculo (D64).
 */
export async function comporConjunto(
  api: ApiDeTeste,
  fieldsetId: string,
  fields: { fieldId: string; required?: boolean; defaultValue?: string | null }[],
): Promise<ComposicaoNaResposta> {
  return exigir201(
    'composição do conjunto',
    await api.put(`/api/custom-fieldsets/${fieldsetId}/fields`, {
      fields: fields.map((campo) => ({
        fieldId: campo.fieldId,
        required: campo.required ?? false,
        ...(campo.defaultValue !== undefined ? { defaultValue: campo.defaultValue } : {}),
      })),
    }),
  );
}

export interface ComposicaoNaResposta {
  id: string;
  name: string;
  modelosAlcancados: number;
  fields: {
    fieldId: string; slug: string; name: string; required: boolean;
    defaultValue: string | null; ordem: number; quebrariam: number;
  }[];
}

/** Pendura o conjunto numa das DUAS âncoras do D58 — a categoria ou o modelo. */
export async function pendurarConjunto(
  api: ApiDeTeste,
  onde: { categoriaId: string } | { modelId: string },
  customFieldsetId: string | null,
): Promise<void> {
  const rota = 'categoriaId' in onde
    ? `/api/categories/${onde.categoriaId}`
    : `/api/asset-models/${onde.modelId}`;
  exigir201('conjunto na âncora', await api.put(rota, { customFieldsetId }));
}
