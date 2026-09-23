import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { apagar, gravar } from '../../../core/storage/storage';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import type { ArquivoRecebido } from './upload-attachment.usecase';

// A IMAGEM DAS QUATRO TABELAS que a têm — ativo, modelo, fabricante e
// categoria — num use-case só.
//
// Uma função por tabela seriam quatro cópias do mesmo par de operações
// (trocar o caminho, apagar o arquivo antigo) divergindo no primeiro ajuste. É
// o mesmo raciocínio do D9, que fez sete tabelas de catálogo compartilharem um
// domínio em vez de virarem sete fatias verticais quase idênticas.
//
// A DIFERENÇA ENTRE IMAGEM E ANEXO, e é ela que justifica o arquivo separado:
// anexo é uma LISTA (N notas fiscais por ativo) e imagem é um CAMPO (uma foto,
// que a próxima substitui). Por isso não há `Image` model: é uma coluna.

/** As tabelas com `imagePath`, e como cada uma se chama para o operador. */
const ALVOS = {
  asset: { rotulo: 'Ativo', entityType: 'Asset' },
  'asset-models': { rotulo: 'Modelo', entityType: 'AssetModel' },
  manufacturers: { rotulo: 'Fabricante', entityType: 'Manufacturer' },
  categories: { rotulo: 'Categoria', entityType: 'Category' },
} as const;

export type AlvoDeImagem = keyof typeof ALVOS;
export const ALVOS_DE_IMAGEM = Object.keys(ALVOS) as AlvoDeImagem[];

/**
 * Cliente aceito aqui: tanto o global quanto o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão que o cliente de transação não tem —
 * é a mesma definição do `ClienteCatalogo` (catalog/specs/catalog-spec.types.ts),
 * repetida em vez de importada porque `attachment` não depende de `catalog`.
 */
type ClienteComImagem = Omit<typeof prisma, `$${string}`>;

/**
 * O delegate de cada alvo.
 *
 * `as` estreito e de propósito: os quatro delegates do Prisma têm tipos
 * diferentes que não unificam sozinhos, e a alternativa seria um `switch` com
 * quatro blocos idênticos. O `select` é fixo e mínimo (id + imagePath), o que
 * mantém a conversão presa a esta função — mesmo desenho do `CatalogDelegate`.
 */
function delegate(tx: ClienteComImagem, alvo: AlvoDeImagem) {
  const mapa = {
    asset: tx.asset,
    'asset-models': tx.assetModel,
    manufacturers: tx.manufacturer,
    categories: tx.category,
  };
  return mapa[alvo] as {
    findFirst: (args: unknown) => Promise<{ id: string; imagePath: string | null } | null>;
    update: (args: unknown) => Promise<{ id: string; imagePath: string | null }>;
  };
}

async function trocarCaminho(
  alvo: AlvoDeImagem,
  id: string,
  novoCaminho: string | null,
  actorId: string | null,
): Promise<{ anterior: string | null; imagePath: string | null }> {
  return prisma.$transaction(async (tx) => {
    const tabela = delegate(tx, alvo);

    // `findFirst`, não `findUnique`: só ele recebe o escopo da lixeira da
    // extension. Ativo excluído não ganha foto nova.
    const antes = await tabela.findFirst({ where: { id }, select: { id: true, imagePath: true } });
    if (!antes) throw new AppError(`${ALVOS[alvo].rotulo} não encontrado.`, 404);

    const depois = await tabela.update({
      where: { id },
      data: { imagePath: novoCaminho },
      select: { id: true, imagePath: true },
    });

    await recordActivity(tx, {
      entityType: ALVOS[alvo].entityType,
      entityId: id,
      action: 'UPDATE',
      changes: { imagePath: { de: antes.imagePath, para: novoCaminho } },
    }, actorId);

    return { anterior: antes.imagePath, imagePath: depois.imagePath };
  });
}

/**
 * Define a imagem, substituindo a anterior.
 *
 * O ARQUIVO ANTIGO SAI DEPOIS DO COMMIT. Apagá-lo antes deixaria, numa
 * transação que reverte, a coluna apontando para um arquivo que não existe
 * mais — e a tela mostraria um quadrado quebrado sem ninguém ter feito nada.
 */
export async function setImage(
  alvo: AlvoDeImagem,
  id: string,
  arquivo: ArquivoRecebido,
  actorId: string | null,
) {
  const gravado = await gravar('imagens', arquivo.mimeType, arquivo.bytes);

  let resultado;
  try {
    resultado = await trocarCaminho(alvo, id, gravado.path, actorId);
  } catch (error) {
    await apagar(gravado.path);
    throw error;
  }

  await apagar(resultado.anterior);
  return { id, imagePath: resultado.imagePath };
}

/** Remove a imagem: limpa a coluna e apaga o arquivo, nessa ordem. */
export async function clearImage(alvo: AlvoDeImagem, id: string, actorId: string | null) {
  const resultado = await trocarCaminho(alvo, id, null, actorId);
  await apagar(resultado.anterior);
  return { id, imagePath: null };
}

/**
 * Abre a imagem para transmissão — mesma porta fechada do anexo (D84).
 *
 * Foto de equipamento parece inofensiva, e não é: a etiqueta de patrimônio
 * aparece nela, e um parque inteiro fotografado diz quanto a empresa tem e
 * onde. Serve pela mesma rota autenticada.
 *
 * `switch` em vez do `delegate` acima, e não é descuido: o cliente estendido
 * (com a extension de soft delete) e o `Prisma.TransactionClient` têm tipos de
 * delegate DIFERENTES, e forçar um no outro exigiria um `as unknown as` — que é
 * exatamente o cast que esconde erro de model trocado, o defeito que o D13
 * inteiro existe para tornar impossível. Quatro linhas honestas custam menos.
 */
export async function getImagePath(alvo: AlvoDeImagem, id: string): Promise<string> {
  const where = { id };
  const select = { imagePath: true } as const;

  const linha =
    alvo === 'asset' ? await prisma.asset.findFirst({ where, select })
    : alvo === 'asset-models' ? await prisma.assetModel.findFirst({ where, select })
    : alvo === 'manufacturers' ? await prisma.manufacturer.findFirst({ where, select })
    : await prisma.category.findFirst({ where, select });

  if (!linha) throw new AppError(`${ALVOS[alvo].rotulo} não encontrado.`, 404);
  if (!linha.imagePath) throw new AppError(`${ALVOS[alvo].rotulo} não tem imagem.`, 404);

  return linha.imagePath;
}
