import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { resolverResponsaveis, type PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { ASSET_DETAIL_SELECT } from '../helpers/asset-select.helper';
import { calcularValorContabil, type ValorContabil } from '../helpers/depreciacao.helper';

// `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
// `findUnique` (core/database/soft-delete.extension.ts), e um ativo apagado não
// deve abrir tela de detalhe — ele volta pela restauração, não pela URL.
function buscarAtivo(id: string) {
  return prisma.asset.findFirst({ where: { id }, select: ASSET_DETAIL_SELECT });
}

/**
 * O ativo com a responsabilidade resolvida (Camada 3 do docs/MODELO-POSSE.md) e
 * o valor contábil calculado (F8, D55).
 *
 * Os dois são DERIVADOS e nenhum é coluna, pelo mesmo motivo com um detalhe
 * invertido: a responsabilidade muda quando um evento acontece, e o valor
 * contábil muda quando nada acontece. O segundo é o que torna a coluna
 * impossível — ela envelheceria sozinha.
 */
export type AssetDetail = NonNullable<Awaited<ReturnType<typeof buscarAtivo>>> & {
  posse: PosseResolvida;
  valorContabil: ValorContabil;
};

/**
 * UM ativo por id — a leitura que a tela de detalhe (`/ativos/:id`) começa
 * fazendo e que não existia: até aqui o modal recebia a linha que a listagem já
 * tinha em memória, e uma URL colada no navegador não tem essa linha.
 *
 * Devolve pelo `ASSET_DETAIL_SELECT` — o `ASSET_SELECT` da listagem mais a regra
 * de depreciação, que só esta leitura usa. Allowlist, nunca
 * `include` — mais a posse resolvida, pelo mesmo `resolverResponsaveis` da
 * listagem. Recalcular a Camada 3 aqui com outra consulta seria uma segunda
 * implementação da mesma regra, e as duas divergiriam no primeiro ajuste.
 *
 * 404 fora da lixeira: "esse id não existe" e "esse ativo está apagado" são a
 * mesma resposta para quem chegou pela URL.
 */
export async function findAssetById(id: string): Promise<AssetDetail> {
  const ativo = await buscarAtivo(id);
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  // FORA de transação: são duas leituras e nenhuma decisão depende de elas
  // serem do mesmo instante — a tela recarrega inteira a cada invalidação.
  const posse = await resolverResponsaveis(prisma, id);

  // Calculado na LEITURA, não gravado: é o D55, e a regra já veio embutida no
  // `ASSET_DETAIL_SELECT` (`model.depreciation`) para isto não custar outra
  // consulta — e ela fica FORA do select compartilhado, que nove outros
  // consumidores usam sem calcular valor contábil nenhum.
  const valorContabil = calcularValorContabil({
    purchaseCost: ativo.purchaseCost,
    purchaseDate: ativo.purchaseDate,
    regra: ativo.model.depreciation,
  });

  return { ...ativo, posse, valorContabil };
}
