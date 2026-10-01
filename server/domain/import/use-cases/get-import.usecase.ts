import type { ImportRowStatus } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';

// A LEITURA DO RELATÓRIO (F10, Etapa D).
//
// O CABEÇALHO E AS LINHAS SÃO DUAS ROTAS, e isso não é purismo REST: um arquivo
// de 20.000 linhas não cabe numa resposta que a tela do dry-run precisa abrir em
// menos de um segundo. O cabeçalho traz os totais — que é o que decide o clique
// em "aplicar" — e as linhas vêm paginadas e FILTRADAS por situação, porque a
// pergunta real é "me mostre só os erros".

const IMPORT_SELECT = {
  id: true,
  filename: true,
  target: true,
  status: true,
  mapping: true,
  delimiter: true,
  totalLinhas: true,
  ok: true,
  erro: true,
  ignorada: true,
  appliedUpTo: true,
  ganhamResponsavel: true,
  perdemResponsavel: true,
  actorId: true,
  createdAt: true,
  appliedAt: true,
} as const;

export async function getImport(id: string) {
  const importacao = await prisma.import.findUnique({ where: { id }, select: IMPORT_SELECT });
  if (!importacao) throw new AppError('Importação não encontrada.', 404);

  return importacao;
}

export const IMPORT_SORTABLE = ['createdAt', 'filename'] as const;
export type ImportSortable = (typeof IMPORT_SORTABLE)[number];

export async function listImports(
  query: ListQuery<ImportSortable>,
): Promise<ListEnvelope<Awaited<ReturnType<typeof getImport>>>> {
  const where = query.q
    ? { filename: { contains: query.q, mode: 'insensitive' as const } }
    : {};

  // `$transaction` para o total e a página saírem do MESMO instante, como em
  // toda listagem do sistema.
  const [total, rows] = await prisma.$transaction([
    prisma.import.count({ where }),
    prisma.import.findMany({
      where,
      select: IMPORT_SELECT,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows };
}

export interface FiltroDeLinhas {
  status?: ImportRowStatus;
}

export async function listImportRows(
  id: string,
  query: ListQuery<'lineNumber'>,
  filtro: FiltroDeLinhas,
) {
  // 404 do PAI antes da página vazia: "importação não encontrada" e "importação
  // sem linhas" são respostas diferentes, e a segunda esconderia um id errado.
  await getImport(id);

  const where = { importId: id, ...(filtro.status ? { status: filtro.status } : {}) };

  const [total, rows] = await prisma.$transaction([
    prisma.importRow.count({ where }),
    prisma.importRow.findMany({
      where,
      select: { id: true, lineNumber: true, raw: true, status: true, message: true, entityId: true },
      orderBy: { lineNumber: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows };
}
