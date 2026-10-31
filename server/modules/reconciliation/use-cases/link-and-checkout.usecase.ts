import { AppError } from '../../../infra/errors/app-error';
import type { Ator } from '../../audit/audit.types';
import { checkoutAsset } from '../../assignment/use-cases/checkout-asset.usecase';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';

// VINCULAR A MÁQUINA AO ATIVO E ENTREGAR O ATIVO AO POSTO — numa operação só.
//
// É o cadastro de um computador novo contado de ponta a ponta: a máquina
// apareceu em `/descobertas`, o ativo foi cadastrado, e a mesa dele é a Mesa 1.
// São duas operações do sistema (o vínculo, da convergência; a entrega, da
// posse), e esta função só as encadeia — nada aqui escreve direto.
//
// ─────────────────────────────────────────────────────────────────────────────
// NÃO É UMA TRANSAÇÃO, e isso é limite declarado, não esquecimento.
//
// `vincularEndpointAoAtivo` e `checkoutAsset` abrem cada um a SUA `$transaction`,
// e o Prisma não suporta aninhar uma na outra (o aviso em caixa alta está no
// `upsert-suggestion.usecase.ts`). A escolha é agir em sequência, e deixar a
// ordem errar para o lado certo.
//
// A ORDEM É VINCULAR PRIMEIRO. Se a entrega falhar, o que fica é um vínculo
// verdadeiro — esta máquina É aquele patrimônio — sem posse, que é um estado
// normal do sistema (todo ativo com agente começa assim). O contrário deixaria
// um ativo entregue a uma mesa sem a máquina que motivou a entrega. E a guarda
// da invariante 19 vale na ENTREGA: o vínculo não muda o que o ativo é, e é a
// entrega que o posto com ativo recusa.
//
// A RESPOSTA DIZ O QUE ACONTECEU. Quando a entrega falha, a recusa sobe com o
// status dela e a frase diz que o vínculo ficou: quem clicou precisa saber que
// metade aconteceu. Repetir a operação funciona: o vínculo ao mesmo ativo não
// muda nada nem grava linha, e só a entrega é tentada de novo.
// ─────────────────────────────────────────────────────────────────────────────

export async function vincularEEntregar(
  endpointId: string,
  assetId: string,
  targetWorkstationId: string,
  ator: Ator,
) {
  const endpoint = await vincularEndpointAoAtivo(endpointId, assetId, ator);

  try {
    const entrega = await checkoutAsset(assetId, { targetType: 'WORKSTATION', targetWorkstationId }, ator);
    return { endpoint, assignment: entrega.assignment, asset: entrega.asset };
  } catch (erro) {
    if (erro instanceof AppError) {
      throw new AppError(
        `A máquina foi vinculada ao ativo, mas a entrega ao posto não aconteceu: ${erro.message}`,
        erro.status,
      );
    }
    throw erro;
  }
}
