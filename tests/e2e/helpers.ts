import { expect, type Locator, type Page } from '@playwright/test';

export { ADMIN_DE_TESTE } from '../setup/admin-de-teste';

/**
 * O título da página: o `<h2>` do conteúdo. O cabeçalho repete o nome da página
 * noutro `<h2>` (AppHeader), e um localizador sem o `main` acharia os dois.
 */
export function tituloDaPagina(page: Page, nome: string): Locator {
  return page.getByRole('main').getByRole('heading', { level: 2, name: nome, exact: true });
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
