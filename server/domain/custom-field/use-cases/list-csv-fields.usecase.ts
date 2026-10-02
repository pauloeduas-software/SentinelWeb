import { prisma } from '../../../core/database/prismaClient';

// OS CAMPOS CUSTOMIZADOS QUE O CSV CONHECE (F9, o item que esperava a F10).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ESTA LISTA É DIFERENTE DA DE `/custom-fields/list-view`.
//
// Aquela responde "quais campos viram COLUNA DA TABELA", e por isso filtra
// `showInListView`, exclui cifrado e exclui `TEXTAREA` — uma coluna de duas mil
// palavras arruína a tabela, e uma de `••••••` repetido não informa nada.
//
// Esta responde "quais campos EXISTEM", porque numa planilha as três exclusões
// deixam de fazer sentido: observação longa é exatamente o que alguém quer num
// arquivo, e um campo que a tela não mostra continua sendo dado do cliente. É o
// mesmo princípio que fez a allowlist do export de ativos ser um SUPERCONJUNTO
// das colunas da tela (D71).
//
// O CIFRADO VEM NA LISTA, com a marca. Ele NÃO é exportável — ver
// `asset-export-columns.helper.ts` —, e vir marcado é o que permite a recusa
// dizer *por que* em vez de "coluna desconhecida": quem pede `cf:senha_bios`
// precisa ouvir que aquele campo não vai para planilha, não que ele não existe.
// ═════════════════════════════════════════════════════════════════════════════

/** O prefixo do token de campo customizado, no CSV e no mapeamento do import. */
export const PREFIXO_CSV = 'cf:';

export interface CampoParaCsv {
  slug: string;
  /** O rótulo que vira cabeçalho da coluna. */
  name: string;
  /** Cifrado em repouso (D81): não exporta, e não importa. */
  encrypted: boolean;
}

/** O token de uma coluna de campo customizado: `cf:<slug>`. */
export function tokenDoCampo(slug: string): string {
  return `${PREFIXO_CSV}${slug}`;
}

/** O slug dentro do token, ou `null` quando o token não é de campo customizado. */
export function slugDoToken(token: string): string | null {
  return token.startsWith(PREFIXO_CSV) ? token.slice(PREFIXO_CSV.length) : null;
}

/**
 * Todos os campos customizados, para o CSV.
 *
 * UMA consulta, chamada UMA vez por requisição de export ou de mapeamento — e
 * nunca por linha. São dezenas de campos no pior caso, e o resultado é a
 * allowlist: ele tem de estar pronto ANTES do primeiro byte do arquivo, porque
 * depois dele não há mais como responder 422.
 */
export async function listarCamposParaCsv(): Promise<CampoParaCsv[]> {
  return prisma.customField.findMany({
    orderBy: { name: 'asc' },
    select: { slug: true, name: true, encrypted: true },
  });
}
