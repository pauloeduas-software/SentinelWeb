import { Prisma } from '@prisma/client';

// Escopo automático da lixeira: toda consulta passa a enxergar só o que não foi
// apagado, sem nenhuma query precisar lembrar de filtrar.
//
// POR QUE EXTENSION, E NÃO FILTRO EM CADA QUERY: com `where: { deletedAt: null }`
// escrito à mão, basta alguém esquecer em UMA consulta para a lixeira reaparecer
// na tela — e isso não gera erro nenhum, só um resultado errado em silêncio. O
// esquecimento deixa de ser possível quando o filtro é do cliente, não da query.
//
// POR QUE FICA EM `core`: não sabe o que é um `InventoryItem` nem um `User`. Ele
// pergunta ao DMMF do próprio Prisma quais models têm a coluna `deletedAt` e
// aplica só neles — infraestrutura pura, sem conhecimento de negócio.

const MODELOS_COM_LIXEIRA = new Set(
  Prisma.dmmf.datamodel.models
    .filter(model => model.fields.some(campo => campo.name === 'deletedAt'))
    .map(model => model.name),
);

// Operações que aceitam um `where` livre. `findUnique` fica de fora: o `where`
// dele só admite campo único, e forçar `deletedAt` ali quebraria a busca por id.
// Quem busca por id e precisa respeitar a lixeira usa `findFirst`.
const OPERACOES_ESCOPADAS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

interface ArgsComWhere {
  where?: Record<string, unknown>;
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!MODELOS_COM_LIXEIRA.has(model) || !OPERACOES_ESCOPADAS.has(operation)) {
          return query(args);
        }

        const argumentos = (args ?? {}) as ArgsComWhere;
        const where = argumentos.where ?? {};

        // ESCAPE HATCH: `deletedAt` escrito explicitamente pelo chamador vence.
        // É assim que a lixeira (`deletedAt: { not: null }`), a restauração e o
        // próprio soft delete conseguem alcançar as linhas apagadas — sem
        // precisar de um segundo cliente Prisma sem escopo.
        if ('deletedAt' in where) return query(args);

        return query({ ...argumentos, where: { ...where, deletedAt: null } });
      },
    },
  },
});
