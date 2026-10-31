import fs from 'node:fs';
import path from 'node:path';

/**
 * Lê o `.env.test` para um objeto: o ambiente dos dois harnesses, o Vitest
 * (vitest.config.ts) e o Playwright (playwright.config.ts).
 *
 * Um leitor próprio, e não o `process.loadEnvFile()` do Node: ele não devolve
 * os valores, só os pendura no `process.env` sem sobrescrever o que já existe
 * — e cada config precisa do OBJETO para injetar no lugar certo (os workers do
 * vitest, o webServer do Playwright), por cima do que a shell trouxer.
 */
export function lerEnvDeTeste(): Record<string, string> {
  const arquivo = path.resolve(import.meta.dirname, '../../.env.test');
  if (!fs.existsSync(arquivo)) {
    throw new Error('.env.test não encontrado na raiz do projeto. Ele é versionado — confira o checkout.');
  }

  const valores: Record<string, string> = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (limpa === '' || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual === -1) continue;
    const chave = limpa.slice(0, igual).trim();
    valores[chave] = limpa.slice(igual + 1).trim().replace(/^"|"$/g, '');
  }
  return valores;
}
