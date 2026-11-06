import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A DOCUMENTAÇÃO NÃO APONTA PARA O VAZIO (BC).
//
// Link quebrado não dá erro em lugar nenhum: o arquivo muda de nome, a seção
// muda de título, e o texto segue apontando para algo que não existe. Aqui cada
// link de Markdown é conferido até a âncora, e cada `docs/*.md` citado em
// comentário de código, até o arquivo.

const RAIZ = resolve(import.meta.dirname, '../..');

function arquivosDe(pasta: string, extensoes: string[]): string[] {
  return readdirSync(join(RAIZ, pasta), { recursive: true, encoding: 'utf8' })
    .filter((caminho) => extensoes.includes(extname(caminho)))
    .map((caminho) => join(pasta, caminho));
}

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');
const semBlocoDeCodigo = (texto: string) => texto.replace(/^```[\s\S]*?^```/gm, '');

// A mesma conta do GitHub: minúsculas, sem pontuação, cada espaço vira um hífen.
// É por isso que o travessão de `D164 — O DEFAULT` deixa dois hífens na âncora.
function ancoraDoTitulo(titulo: string): string {
  return titulo
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function ancorasDe(caminho: string): Set<string> {
  const vistas = new Map<string, number>();
  const ancoras = new Set<string>();

  for (const [, titulo = ''] of semBlocoDeCodigo(ler(caminho)).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const ancora = ancoraDoTitulo(titulo);
    const repeticoes = vistas.get(ancora) ?? 0;
    vistas.set(ancora, repeticoes + 1);
    ancoras.add(repeticoes === 0 ? ancora : `${ancora}-${repeticoes}`);
  }
  return ancoras;
}

describe('a documentação não aponta para o vazio', () => {
  const documentos = ['CLAUDE.md', 'README.md', ...arquivosDe('docs', ['.md'])];

  it('todo link de Markdown chega ao arquivo e à seção', () => {
    const quebrados: string[] = [];

    for (const documento of documentos) {
      const texto = semBlocoDeCodigo(ler(documento)).replace(/`[^`\n]*`/g, '');

      for (const [, destino = ''] of texto.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^[a-z]+:/.test(destino)) continue;

        const [caminho = '', ancora] = decodeURI(destino).split('#');
        const alvo = caminho ? relative(RAIZ, resolve(RAIZ, dirname(documento), caminho)) : documento;

        if (!existsSync(join(RAIZ, alvo))) quebrados.push(`${documento}: ${destino}`);
        else if (ancora && extname(alvo) === '.md' && !ancorasDe(alvo).has(ancora)) quebrados.push(`${documento}: ${destino}`);
      }
    }

    expect(quebrados).toEqual([]);
  });

  it('todo documento citado num comentário de código existe', () => {
    const codigo = ['server', 'src', 'tests', 'prisma'].flatMap((pasta) => arquivosDe(pasta, ['.ts', '.tsx', '.prisma']));
    const quebrados = codigo.flatMap((arquivo) =>
      [...ler(arquivo).matchAll(/\bdocs\/[\w/.-]+\.md\b/g)]
        .map(([citado]) => citado)
        .filter((citado) => !existsSync(join(RAIZ, citado)))
        .map((citado) => `${arquivo}: ${citado}`),
    );

    expect(quebrados).toEqual([]);
  });
});
