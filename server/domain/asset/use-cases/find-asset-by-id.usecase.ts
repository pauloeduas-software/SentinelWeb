import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { resolverResponsaveis, type PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { assetDetailSelect, ASSET_SELECT } from '../helpers/asset-select.helper';

// `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
// `findUnique` (core/database/soft-delete.extension.ts), e um ativo apagado não
// deve abrir tela de detalhe — ele volta pela restauração, não pela URL.
function buscarAtivo(id: string, podeVerCusto: boolean) {
  return prisma.asset.findFirst({
    // O select DEPENDE DA SESSÃO (D77). Quem não é `ADMIN` não recebe a coluna
    // de custo — ver `assetDetailSelect`.
    where: { id },
    select: assetDetailSelect(podeVerCusto) as typeof ASSET_SELECT,
  });
}

/**
 * O ativo com a responsabilidade resolvida (Camada 3 do docs/referencia/modelo-de-posse.md).
 *
 * DERIVADA, não coluna: a responsabilidade muda quando um evento de posse ou de
 * ocupação acontece, e uma coluna no ativo teria que ser lembrada em cada um.
 */
type AssetDetail = NonNullable<Awaited<ReturnType<typeof buscarAtivo>>> & {
  posse: PosseResolvida;
};

/**
 * UM ativo por id — a leitura que a tela de detalhe (`/ativos/:id`) começa
 * fazendo e que não existia: até aqui o modal recebia a linha que a listagem já
 * tinha em memória, e uma URL colada no navegador não tem essa linha.
 *
 * Devolve pelo `ASSET_SELECT` da listagem — allowlist, nunca `include` — mais
 * a posse resolvida, pelo mesmo `resolverResponsaveis` da listagem. Recalcular
 * a Camada 3 aqui com outra consulta seria uma segunda implementação da mesma
 * regra, e as duas divergiriam no primeiro ajuste.
 *
 * 404 fora da lixeira: "esse id não existe" e "esse ativo está apagado" são a
 * mesma resposta para quem chegou pela URL.
 */
export async function findAssetById(id: string, podeVerCusto: boolean): Promise<AssetDetail> {
  const ativo = await buscarAtivo(id, podeVerCusto);
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  const posse = await resolverResponsaveis(prisma, id);

  return { ...ativo, posse };
}
