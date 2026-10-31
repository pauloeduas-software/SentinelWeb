import { styleText } from 'node:util';

// OS ENDEREÇOS DO BACK, no formato das linhas do Vite — para os dois blocos do
// `bun run dev` se lerem do mesmo jeito: o do front com o Local, o do back com a
// API e o Swagger, um embaixo do outro. Os avisos do ambiente vêm logo depois.
//
// Só em desenvolvimento: em produção o log é JSON, e um bloco de texto solto no
// meio dele quebraria quem o lê. Lá sai a linha de sempre, pelo logger.
//
// `styleText` tira a cor sozinho quando a saída não é terminal, e respeita o
// NO_COLOR e o FORCE_COLOR (que o `concurrently` repassa ao processo).

interface Endereco {
  rotulo: string;
  url: string;
}

export function imprimirBanner(enderecos: Endereco[]): void {
  const largura = Math.max(...enderecos.map((e) => e.rotulo.length)) + 1;
  const linhas = [
    '',
    ...enderecos.map(({ rotulo, url }) =>
      `  ${styleText('magenta', '➜')}  ${styleText('bold', `${rotulo}:`.padEnd(largura))} ${styleText('cyan', url)}`),
    '',
  ];
  process.stdout.write(`${linhas.join('\n')}\n`);
}
