import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { ehPermissaoConhecida, type Permissao } from '../helpers/permission-catalog';

// A PERMISSÃO EFETIVA — a UNIÃO das permissões dos grupos da pessoa (D76).
//
// ═══════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO NÃO FAZ CONSULTA NO CAMINHO QUENTE, e isso é o ponto do D136.
//
// A tentação é exportar `permissoesEfetivas(userId)` e chamá-la no `preHandler`.
// Seria uma consulta A MAIS em **toda requisição autenticada** — e a releitura
// de sessão (`auth/use-cases/current-user.usecase.ts`) já é o caminho mais
// quente do sistema. Dobrar as idas ao banco por requisição para ler uma coluna
// que cabia no `include` da consulta que já estava acontecendo é o oposto do
// cuidado que aquele arquivo documenta ter tido com o `tokenVersion`.
//
// Então a divisão é esta:
//   `GRUPOS_PARA_PERMISSAO`  o fragmento de `select` que a consulta de sessão
//                            embute. Mora aqui porque a FORMA do dado é deste
//                            domínio;
//   `unirPermissoes()`       memória pura, sobre o que aquela consulta trouxe;
//   `permissoesDoUsuario()`  a versão com consulta própria, para quem NÃO está
//                            no caminho quente — a tela de acesso de um
//                            colaborador, que pergunta sobre OUTRA pessoa.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O fragmento que a consulta de sessão embute.
 *
 * SÓ `permissions`: nome e id do grupo não são usados na autorização, e viriam
 * em toda requisição para serem descartados. Quem quer o nome do grupo é a tela
 * de acesso, que usa `permissoesDoUsuario()`.
 */
export const GRUPOS_PARA_PERMISSAO = { select: { permissions: true } } as const;

/** O que a consulta devolve por grupo — só a coluna que a união lê. */
export interface GrupoComPermissoes {
  permissions: Prisma.JsonValue;
}

/**
 * Une as permissões de N grupos num conjunto.
 *
 * TRÊS FILTROS, e cada um fecha um jeito de o JsonB mentir:
 *
 * 1. **só valor `true`** — `{"assets.edit": false}` NÃO concede. Não é `deny`
 *    (que o D76 descartou): é que o formato aceita qualquer JSON, e uma tela
 *    que grave `false` em vez de remover a chave não pode virar concessão. A
 *    ausência e o `false` significam a mesma coisa — não concedido —, e é isso
 *    que mantém "permissão é união" verdadeiro;
 *
 * 2. **só chave do catálogo** — chave desconhecida é descartada em silêncio
 *    aqui, mas NÃO em silêncio no sistema: a gravação a recusa com 422
 *    (`group.schema.ts`) e o teste de invariante confere o banco. Este filtro é
 *    a terceira rede, para a linha que entrou por `psql`;
 *
 * 3. **só objeto** — `permissions` podia ser `null`, um array ou um número e o
 *    Postgres aceitaria: `Json` não é `Record`. `Object.keys(3)` devolve `[]` e
 *    não estoura, mas `Object.keys(null)` estoura — e um boot que cai porque um
 *    grupo tem `null` numa coluna é pior do que um grupo que não concede nada.
 */
export function unirPermissoes(grupos: readonly GrupoComPermissoes[]): Set<Permissao> {
  const efetivas = new Set<Permissao>();

  for (const grupo of grupos) {
    const bruto = grupo.permissions;
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) continue;

    for (const [chave, valor] of Object.entries(bruto)) {
      if (valor !== true) continue;
      if (!ehPermissaoConhecida(chave)) continue;
      efetivas.add(chave);
    }
  }

  return efetivas;
}

/**
 * As permissões de UMA pessoa, com consulta própria.
 *
 * Para a tela de acesso (`GET /api/users/:id/permissions`), que responde "o que
 * esta pessoa alcança, e por qual grupo" — e por isso traz o NOME do grupo, que
 * o fragmento do caminho quente não traz.
 *
 * `findFirst` e não `findUnique`: respeita o escopo da lixeira da extension.
 * Perguntar o acesso de um cadastro apagado tem que devolver vazio, não o
 * acesso que ele tinha.
 */
export async function permissoesDoUsuario(userId: string): Promise<{
  permissoes: Permissao[];
  grupos: { id: string; name: string }[];
}> {
  const pessoa = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      groups: { select: { id: true, name: true, permissions: true }, orderBy: { name: 'asc' } },
    },
  });

  if (!pessoa) return { permissoes: [], grupos: [] };

  return {
    // Ordenado para a resposta ser estável entre duas chamadas iguais: a tela
    // lista as chaves, e ordem instável faz a lista "piscar" entre refreshes.
    permissoes: [...unirPermissoes(pessoa.groups)].sort(),
    grupos: pessoa.groups.map(({ id, name }) => ({ id, name })),
  };
}
