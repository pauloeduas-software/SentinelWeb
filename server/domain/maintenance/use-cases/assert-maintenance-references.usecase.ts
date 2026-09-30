import { AppError } from '../../../core/errors/app-error';
import { prisma } from '../../../core/database/prismaClient';

/** O cliente da transação, sem os `$`. Mesmo alias do estoque e da licença. */
export type ClienteManutencao = Omit<typeof prisma, `$${string}`>;

// AS REFERÊNCIAS EXISTEM?
//
// POR QUE CONFERIR ANTES EM VEZ DE DEIXAR A FK FALHAR: o `Restrict` do
// fornecedor faz o Postgres recusar um id inexistente com P2003, e o
// error-handler traduz TODO P2003 em 409 "Registro está em uso por outro
// cadastro" — que não é nem o status nem a frase certa para "esse fornecedor não
// existe". Conferir custa uma consulta e devolve 404 com o nome do que faltou.
// Mesmo desenho do `assertReferenciasDaLicenca` (F6) e do item de estoque (F5).

/**
 * O ativo existe e NÃO está na lixeira.
 *
 * O `findFirst` (e não `findUnique`) é o que faz a `softDeleteExtension` entrar
 * no caminho: abrir manutenção num ativo que alguém acabou de mandar para a
 * lixeira criaria uma linha que a listagem global nunca mostra — o filtro
 * `asset: { deletedAt: null }` a esconderia para sempre, e o custo dela sumiria
 * do relatório sem nenhum erro aparecer.
 */
export async function assertAtivoDaManutencao(
  client: ClienteManutencao,
  assetId: string,
): Promise<{ id: string; assetTag: string }> {
  const ativo = await client.asset.findFirst({
    where: { id: assetId },
    select: { id: true, assetTag: true },
  });

  if (!ativo) throw new AppError('Ativo não encontrado.', 404);
  return ativo;
}

/** O fornecedor, só quando vem PREENCHIDO: `null` é "limpar o campo". */
export async function assertFornecedorDaManutencao(
  client: ClienteManutencao,
  supplierId: string | null | undefined,
): Promise<void> {
  if (!supplierId) return;

  const fornecedor = await client.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true },
  });

  if (!fornecedor) throw new AppError('Fornecedor não encontrado.', 404);
}

/**
 * Encerrar não pode anteceder abrir.
 *
 * A checagem é do ESTADO FINAL, e é por isso que ela não cabe no schema: a
 * edição é parcial, então quem manda só `completionDate` não diz qual é o
 * `startDate`, e quem manda só `startDate` não diz qual é o encerramento. As duas
 * datas só existem juntas aqui, com a linha atual em mãos — é o mesmo motivo do
 * `beforeWrite` da depreciação.
 *
 * O MESMO DIA PASSA: abrir e encerrar no mesmo dia é o caso comum de um reparo
 * rápido, e as duas datas chegam como meia-noite UTC do dia de calendário.
 */
export function assertDatasDaManutencao(inicio: Date, fim: Date | null | undefined): void {
  if (!fim) return;

  if (fim < inicio) {
    throw new AppError(
      'A data de encerramento não pode ser anterior à de abertura.',
      422,
      { campo: 'completionDate' },
    );
  }
}
