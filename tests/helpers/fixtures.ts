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
  const [deployable, emUso, arquivado, categoria] = await Promise.all([
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'DEPLOYABLE' }, select: { id: true } }),
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'IN_USE' }, select: { id: true } }),
    prisma.statusLabel.findFirstOrThrow({ where: { type: 'ARCHIVED' }, select: { id: true } }),
    prisma.category.findFirstOrThrow({ where: { type: 'ASSET' }, select: { id: true } }),
  ]);

  return {
    statusDeployableId: deployable.id,
    statusEmUsoId: emUso.id,
    statusArquivadoId: arquivado.id,
    categoriaId: categoria.id,
  };
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
  opcoes: { statusId: string; modelId: string; assetTag?: string; name?: string },
): Promise<{ id: string; assetTag: string }> {
  const corpo: Record<string, unknown> = { statusId: opcoes.statusId, modelId: opcoes.modelId };
  if (opcoes.assetTag !== undefined) corpo.assetTag = opcoes.assetTag;
  if (opcoes.name !== undefined) corpo.name = opcoes.name;

  return exigir201<{ id: string; assetTag: string }>('ativo', await api.post('/api/assets', corpo));
}

/**
 * O cenário completo do modelo de posse, em uma chamada.
 *
 * Um ativo no estoque, duas pessoas e um posto de trabalho — que é o mínimo
 * para exercitar as três camadas do `docs/MODELO-POSSE.md`, incluindo o caso
 * que nenhum ITAM de prateleira modela: DUAS pessoas no MESMO posto.
 */
export async function cenarioDePosse(api: ApiDeTeste) {
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api);
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const [mesa1, laura, ana, ativo] = await Promise.all([
    criarLocal(api, { name: 'Mesa 1', isWorkstation: true }),
    criarColaborador(api, { name: 'Laura Souza', email: 'laura@teste.local' }),
    criarColaborador(api, { name: 'Ana Lima', email: 'ana@teste.local' }),
    criarAtivo(api, { statusId: seed.statusDeployableId, modelId }),
  ]);

  return { ...seed, modelId, fabricanteId, mesa1, laura, ana, ativo };
}
