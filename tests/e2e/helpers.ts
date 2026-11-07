import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export { ADMIN_DE_TESTE } from '../setup/admin-de-teste';

/**
 * O título da página: o `<h2>` que ela desenha no cabeçalho.
 */
export function tituloDaPagina(page: Page, nome: string): Locator {
  return page.getByRole('banner').getByRole('heading', { level: 2, name: nome, exact: true });
}

/**
 * Guarda o que a página escreveu de errado no console — `console.error` e
 * exceção não tratada — para o spec conferir no fim.
 *
 * Chame ANTES de navegar: o que acontece antes da escuta não entra. A função
 * devolvida é a conferência; chamá-la no fim do teste é o que faz um `500` em
 * segundo plano ou um erro de render derrubarem um spec que, pela tela, parecia
 * ter passado.
 */
export function vigiarConsole(page: Page): () => void {
  const erros: string[] = [];
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(mensagem.text());
  });
  page.on('pageerror', (erro) => erros.push(erro.message));
  return () => expect(erros, 'erros no console da página').toEqual([]);
}

/** Um posto de verdade, com a localização que ele exige. Devolve o id. */
export async function criarPosto(request: APIRequestContext, nome: string): Promise<string> {
  const local = await request.post('/api/locations', { data: { name: `Local de ${nome}` } });
  expect(local.status()).toBe(201);
  const { id: locationId } = (await local.json()) as { id: string };

  const posto = await request.post('/api/workstations', { data: { name: nome, locationId } });
  expect(posto.status()).toBe(201);
  return ((await posto.json()) as { id: string }).id;
}

export async function criarColaborador(request: APIRequestContext, nome: string): Promise<string> {
  const pessoa = await request.post('/api/people', { data: { name: nome } });
  expect(pessoa.status()).toBe(201);
  return ((await pessoa.json()) as { id: string }).id;
}

/** Uma conta de Técnico, com um e-mail que não se repete. Devolve o id. */
export async function criarUsuario(request: APIRequestContext, nome: string): Promise<string> {
  const conta = await request.post('/api/users', { data: { name: nome, email: `conta.${Date.now()}@teste.local`, role: 'TECNICO' } });
  expect(conta.status()).toBe(201);
  return ((await conta.json()) as { id: string }).id;
}

/** Um item de estoque, com a categoria que diz o tipo dele. Devolve o id. */
export async function criarItem(
  request: APIRequestContext,
  nome: string,
  tipo: 'STOCK' | 'COMPONENT' | 'CONSUMABLE' = 'STOCK',
): Promise<string> {
  const categoria = await request.post('/api/categories', { data: { name: `Categoria de ${nome}`, type: tipo } });
  expect(categoria.status()).toBe(201);
  const { id: categoryId } = (await categoria.json()) as { id: string };
  const item = await request.post('/api/stock/items', { data: { name: nome, categoryId, qty: 5 } });
  expect(item.status()).toBe(201);
  return ((await item.json()) as { id: string }).id;
}

/** Uma licença de três, com as chaves pedidas. Devolve o id. */
export async function criarLicenca(request: APIRequestContext, nome: string, chaves: readonly string[] = []): Promise<string> {
  const categoria = await request.post('/api/categories', { data: { name: `Categoria de ${nome}`, type: 'LICENSE' } });
  expect(categoria.status()).toBe(201);
  const { id: categoryId } = (await categoria.json()) as { id: string };
  const licenca = await request.post('/api/licenses', {
    data: { name: nome, categoryId, seatsTotal: 3, keys: chaves.map((productKey) => ({ productKey, seats: 1 })) },
  });
  expect(licenca.status()).toBe(201);
  return ((await licenca.json()) as { id: string }).id;
}

/**
 * O modelo dos computadores de teste, UM por execução. O e2e roda com o teto de escrita
 * ligado (40 por minuto, por rota, `write-rate-limit.ts`), e criar categoria, fabricante e
 * modelo a cada ativo estourava `POST /api/categories` no meio da suíte.
 */
let modeloDoAtivo: Promise<string> | undefined;

async function criarModeloDoAtivo(request: APIRequestContext): Promise<string> {
  const sufixo = Date.now();
  const categoria = await request.post('/api/categories', { data: { name: `Categoria ${sufixo}`, type: 'ASSET' } });
  expect(categoria.status()).toBe(201);
  const { id: categoryId } = (await categoria.json()) as { id: string };
  const fabricante = await request.post('/api/manufacturers', { data: { name: `Fabricante ${sufixo}` } });
  expect(fabricante.status()).toBe(201);
  const { id: manufacturerId } = (await fabricante.json()) as { id: string };
  const modelo = await request.post('/api/asset-models', { data: { name: `Modelo ${sufixo}`, manufacturerId, categoryId } });
  expect(modelo.status()).toBe(201);
  return ((await modelo.json()) as { id: string }).id;
}

/** Um ativo de verdade, com o modelo que ele exige. Devolve o id. */
export async function criarAtivo(request: APIRequestContext, dados: Record<string, unknown> = {}): Promise<string> {
  modeloDoAtivo ??= criarModeloDoAtivo(request);
  const modelId = await modeloDoAtivo;

  const opcoes = await request.get('/api/status-labels/options?type=DEPLOYABLE');
  const [disponivel] = (await opcoes.json()) as { id: string }[];

  const ativo = await request.post('/api/assets', { data: { modelId, statusId: disponivel.id, ...dados } });
  expect(ativo.status()).toBe(201);
  return ((await ativo.json()) as { id: string }).id;
}
