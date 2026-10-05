import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { resolverResponsaveis, type PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';
import {
  resolverEscalonamento, type Escalonamento,
} from '../../assignment/use-cases/resolver-escalonamento.usecase';
import { assetDetailSelect, ASSET_DETAIL_SELECT, comCamposMascarados } from '../helpers/asset-select.helper';
import { calcularValorContabil, type ValorContabil } from '../helpers/depreciacao.helper';

// `findFirst`, nunca `findUnique`: o escopo da lixeira não alcança o
// `findUnique` (core/database/soft-delete.extension.ts), e um ativo apagado não
// deve abrir tela de detalhe — ele volta pela restauração, não pela URL.
function buscarAtivo(id: string, podeVerCusto: boolean) {
  return prisma.asset.findFirst({
    // O select DEPENDE DA SESSÃO (D77). Sem `assets.viewCost` não vêm nem a
    // coluna de custo nem a REGRA de depreciação — ver `assetDetailSelect`.
    where: { id },
    select: assetDetailSelect(podeVerCusto) as typeof ASSET_DETAIL_SELECT,
  });
}

/**
 * O ativo com a responsabilidade resolvida (Camada 3 do docs/referencia/modelo-de-posse.md) e
 * o valor contábil calculado (F8, D55).
 *
 * Os dois são DERIVADOS e nenhum é coluna, pelo mesmo motivo com um detalhe
 * invertido: a responsabilidade muda quando um evento acontece, e o valor
 * contábil muda quando nada acontece. O segundo é o que torna a coluna
 * impossível — ela envelheceria sozinha.
 */
export type AssetDetail = ReturnType<
  typeof comCamposMascarados<NonNullable<Awaited<ReturnType<typeof buscarAtivo>>>>
> & {
  posse: PosseResolvida;
  valorContabil: ValorContabil;
  /**
   * PARA QUEM LIGAR por este ativo (F11, Etapa F — D73).
   *
   * Sai AQUI, ao lado de `posse.postoVago`, e não em rota irmã: quem pergunta
   * "para quem eu ligo?" está olhando a ficha que acabou de dizer "posto vago".
   * Uma segunda requisição para a resposta óbvia da primeira seria dois cliques
   * para uma pergunta.
   *
   * ⚠️ ELE NÃO É RESPONSÁVEL. O gestor da localidade não está com o
   * equipamento, não assinou nada por ele e NÃO aparece em
   * `posse.responsaveis`. São perguntas diferentes, e misturá-las reabre o D72
   * por efeito colateral.
   *
   * `null` quando não há gestor em ancestral nenhum — e isso não é erro: é o
   * buraco do escalonamento, que o desligamento com `substitutoId` existe para
   * não criar.
   */
  escalonamento: Escalonamento | null;
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
export async function findAssetById(id: string, podeVerCusto: boolean): Promise<AssetDetail> {
  const ativo = await buscarAtivo(id, podeVerCusto);
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  // FORA de transação: são leituras e nenhuma decisão depende de elas serem do
  // mesmo instante — a tela recarrega inteira a cada invalidação.
  //
  // EM PARALELO porque são independentes: a responsabilidade sai da posse
  // aberta, o escalonamento sai da árvore de localizações, e nenhuma das duas
  // lê o resultado da outra. Em série, a ficha pagaria a soma das duas.
  const [posse, escalonamento] = await Promise.all([
    resolverResponsaveis(prisma, id),
    resolverEscalonamento(prisma, ativo.locationId),
  ]);

  // Calculado na LEITURA, não gravado: é o D55, e a regra já veio embutida no
  // `ASSET_DETAIL_SELECT` (`model.depreciation`) para isto não custar outra
  // consulta — e ela fica FORA do select compartilhado, que nove outros
  // consumidores usam sem calcular valor contábil nenhum.
  //
  // SEM `assets.viewCost` NÃO HÁ O QUE CALCULAR, e não é preciso um `if` para
  // isso: o select não trouxe `purchaseCost` nem `model.depreciation`, então a
  // função recebe os dois indefinidos e devolve o mesmo `null` que já devolvia
  // para ativo sem custo cadastrado. "Sem permissão" é o terceiro motivo do
  // mesmo nulo, e nenhuma tela precisa distinguir os três.
  const valorContabil = calcularValorContabil({
    purchaseCost: ativo.purchaseCost ?? null,
    purchaseDate: ativo.purchaseDate,
    regra: ativo.model.depreciation ?? null,
  });

  // `comCamposMascarados` é a ÚNICA saída de uma linha com `customFields`: o
  // pacote cifrado vira `••••••` e `temSegredo` diz à tela se oferece o botão de
  // revelar (F9, Etapa E).
  return { ...comCamposMascarados(ativo), posse, valorContabil, escalonamento };
}
