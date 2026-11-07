import { test, expect } from '@playwright/test';
import { criarAtivo, vigiarConsole } from './helpers';

// A FICHA DO COMPUTADOR (BR): os campos moram no card, como em toda ficha, e cada aba é
// o que está com ele. O cadastro já está provado em `tests/invariantes`; aqui é a tela.

test('o card traz todo o cadastro, e a ficha abre em Responsáveis', async ({ page, request }) => {
  const conferirConsole = vigiarConsole(page);
  const sufixo = Date.now();

  const categoria = await request.post('/api/categories', { data: { name: `Notebook ${sufixo}`, type: 'ASSET' } });
  const { id: categoryId } = (await categoria.json()) as { id: string };
  const fabricante = await request.post('/api/manufacturers', {
    data: {
      name: `Fabricante ${sufixo}`,
      url: 'https://suporte.exemplo.com.br/garantia',
      supportPhone: '0800 970 3355',
      supportEmail: 'suporte@exemplo.com.br',
    },
  });
  const { id: manufacturerId } = (await fabricante.json()) as { id: string };
  const modelo = await request.post('/api/asset-models', { data: { name: `Modelo ${sufixo}`, manufacturerId, categoryId } });
  const { id: modelId } = (await modelo.json()) as { id: string };
  const situacoes = await request.get('/api/status-labels/options?type=DEPLOYABLE');
  const [disponivel] = (await situacoes.json()) as { id: string }[];
  const ativo = await request.post('/api/assets', {
    data: {
      modelId,
      statusId: disponivel.id,
      orderNumber: 'PC-2025-066',
      purchaseDate: '2025-06-10',
      purchaseCost: '2950.00',
      notes: 'Tela trocada na garantia.',
    },
  });
  expect(ativo.status()).toBe(201);
  const { id } = (await ativo.json()) as { id: string };

  await page.goto(`/computadores/${id}`);

  await expect(page.getByRole('tab', { name: 'Detalhes' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Responsáveis/ })).toHaveAttribute('aria-selected', 'true');

  const campos = [
    ['Modelo', `Modelo ${sufixo}`],
    ['Fabricante', `Fabricante ${sufixo}`],
    ['Categoria', `Notebook ${sufixo}`],
    ['Número do pedido', 'PC-2025-066'],
    ['Data da compra', '10/06/2025'],
    ['Valor da compra', 'R$ 2.950,00'],
    ['Site de suporte', 'https://suporte.exemplo.com.br/garantia'],
    ['Telefone de suporte', '0800 970 3355'],
    ['E-mail de suporte', 'suporte@exemplo.com.br'],
    ['Notas', 'Tela trocada na garantia.'],
  ];
  for (const [rotulo, valor] of campos) {
    await expect(page.getByRole('term').filter({ hasText: new RegExp(`^${rotulo}$`) })
      .locator('xpath=following-sibling::dd')).toHaveText(valor);
  }

  // O único link do card é o site, que sai do sistema (BS).
  await expect(page.getByRole('main').locator('dl').getByRole('link')).toHaveText(['https://suporte.exemplo.com.br/garantia']);

  conferirConsole();
});

test('o link antigo da aba Detalhes abre a ficha em Responsáveis', async ({ page, request }) => {
  const id = await criarAtivo(request);

  await page.goto(`/computadores/${id}?aba=detalhes`);
  await expect(page.getByRole('tab', { name: /^Responsáveis/ })).toHaveAttribute('aria-selected', 'true');
});
