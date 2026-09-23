import { prisma } from '../../../core/database/prismaClient';

// Mesmo teto do `location-cycle.helper.ts`: nenhuma empresa precisa de 32
// níveis de "Matriz › Prédio › Andar › Sala", e o número existe sobretudo para
// a subida terminar mesmo se um ciclo escapar da guarda da aplicação — o BANCO
// não impede A→B→A (testado; ver o helper do catálogo).
const MAX_PROFUNDIDADE = 32;

interface Ancestral {
  name: string;
  parentId: string | null;
}

function unicos(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/**
 * O CAMINHO na árvore de cada posto — "Sede › Andar 2 › Sala 3".
 *
 * Por que é use-case e não helper: ele vai ao banco, e `helpers/` são puros
 * (docs/ARQUITETURA.md). E é arquivo próprio porque a listagem e o detalhe
 * fazem a MESMA pergunta — é o critério 2 da "regra de corte".
 *
 * NÃO é uma consulta por linha, e também não é a tabela inteira em memória: a
 * subida é por NÍVEL. Uma consulta traz todos os pais da página de uma vez, a
 * seguinte traz os avós ainda desconhecidos, e assim por diante. O número de
 * viagens ao banco é a PROFUNDIDADE da árvore (~4), não o tamanho da página —
 * venham 1 ou 100 postos.
 *
 * A chave do mapa é o id do PAI, não o do posto: mesas da mesma sala
 * compartilham o caminho, e indexar pelo pai dá a elas o mesmo array em vez de
 * um por linha.
 */
export async function resolverCaminhos(
  parentIds: (string | null)[],
): Promise<Map<string, string[]>> {
  const ancestrais = new Map<string, Ancestral>();

  let pendentes = unicos(parentIds);
  let nivel = 0;

  while (pendentes.length > 0 && nivel < MAX_PROFUNDIDADE) {
    // `location` não tem `deletedAt`: o catálogo não tem lixeira (D8), então
    // não há escopo de exclusão a respeitar aqui.
    const linhas = await prisma.location.findMany({
      where: { id: { in: pendentes } },
      select: { id: true, name: true, parentId: true },
    });

    for (const linha of linhas) ancestrais.set(linha.id, { name: linha.name, parentId: linha.parentId });

    pendentes = unicos(linhas.map((linha) => linha.parentId)).filter((id) => !ancestrais.has(id));
    nivel += 1;
  }

  const caminhos = new Map<string, string[]>();
  for (const parentId of unicos(parentIds)) caminhos.set(parentId, montarCaminho(parentId, ancestrais));

  return caminhos;
}

/**
 * Sobe do pai até a raiz e devolve os nomes na ordem de leitura (raiz primeiro).
 *
 * O `visitados` não é zelo: se um ciclo existir no banco, a subida sem ele seria
 * laço infinito DENTRO do processo — o pior modo de falha possível para uma
 * listagem, porque não há erro para o error-handler traduzir.
 */
function montarCaminho(parentId: string, ancestrais: Map<string, Ancestral>): string[] {
  const nomes: string[] = [];
  const visitados = new Set<string>();

  let atual: string | null = parentId;

  while (atual && !visitados.has(atual)) {
    visitados.add(atual);

    const ancestral: Ancestral | undefined = ancestrais.get(atual);
    // Acima do teto de profundidade o mapa acaba antes da raiz: o caminho sai
    // truncado, e truncado é melhor que errado — quem lê vê os níveis que
    // couberam, não um nome inventado.
    if (!ancestral) break;

    nomes.push(ancestral.name);
    atual = ancestral.parentId;
  }

  return nomes.reverse();
}
