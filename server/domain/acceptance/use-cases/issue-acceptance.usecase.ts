import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { resolverEscalonamento } from '../../assignment/use-cases/resolver-escalonamento.usecase';
import { gerarToken, validadePadrao } from '../helpers/token.helper';

// A EMISSÃO DO TERMO — dentro da transação do checkout.
//
// Chamada por `checkout-asset.usecase.ts` e por mais ninguém: o termo nasce com
// a entrega ou não nasce. Um endpoint "emitir termo" separado permitiria termo
// sem posse, que é um documento sobre um fato que não aconteceu.

/** O que o checkout já leu e passa adiante, para não reler dentro da transação. */
export interface ContextoDaEmissao {
  assignmentId: string;
  assetId: string;
  targetType: 'USER' | 'ASSET' | 'LOCATION';
  targetUserId: string | null;
  targetLocationId: string | null;
  /** Nome do ativo, para a mensagem de erro dizer de qual entrega se fala. */
  assetTag: string;
}

/** Quem assina, resolvido pelo alvo. `null` = não se emite termo. */
interface Signatario {
  userId: string | null;
  name: string;
  email: string;
}

/**
 * Descobre quem assina.
 *
 * `USER`     — a própria pessoa.
 * `LOCATION` — o GESTOR da localidade (D27), encontrado SUBINDO a árvore
 *              (`resolverEscalonamento`, D139): a Mesa 1 sem gestor próprio
 *              dentro de um Andar 2 com gestor resolve no Andar 2.
 * `ASSET`    — ninguém (D87). Devolve `null`, e o chamador não emite.
 */
async function resolverSignatario(
  tx: ClientePosse,
  ctx: ContextoDaEmissao,
): Promise<Signatario | null> {
  if (ctx.targetType === 'ASSET') return null;

  if (ctx.targetType === 'USER') {
    const pessoa = await tx.user.findFirst({
      where: { id: ctx.targetUserId ?? '' },
      select: { id: true, name: true, email: true },
    });
    // O checkout já validou que o alvo existe; chegar aqui sem ele é defeito.
    if (!pessoa) throw new AppError('Colaborador do termo não encontrado.', 422);
    return { userId: pessoa.id, name: pessoa.name, email: pessoa.email };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUEM RESPONDE PELO ESPAÇO SAI DE `resolverEscalonamento()`, E NÃO DE UMA
  // LEITURA DO `managerId` DA FOLHA (F11, Etapa F — D139).
  //
  // ESTE ARQUIVO ERA A SEGUNDA RESPOSTA PARA A MESMA PERGUNTA, e era a pior das
  // duas. Ele lia `Location.manager` da localização EXATA e recusava se fosse
  // nula — sem subir a árvore. Consequência concreta: entregar um notebook com
  // termo de aceite para a "Mesa 1", que não tem gestor próprio, dentro do
  // "Andar 2", que tem, era **409**. O gestor existia, estava cadastrado, e o
  // sistema dizia para cadastrá-lo.
  //
  // A F11 criou a função que sobe a árvore, e deixar esta leitura como estava
  // faria a fase fechar com duas respostas divergentes para *"quem responde
  // pelo espaço?"* — o D16 renascendo na camada de cima (é o precedente do
  // D130: posto vago continua saindo de UM lugar só).
  //
  // O D27 NÃO MUDA: o termo vai para **um** gestor, não para os N ocupantes, e
  // sem gestor em ancestral nenhum o checkout continua sendo recusado. O que
  // muda é que agora "sem gestor" quer dizer *a árvore inteira não tem*, e não
  // *esta folha não tem*.
  //
  // E A AMARRA QUE MANTÉM O MODELO ÍNTEGRO: assinar NÃO torna o gestor
  // responsável resolvido. `resolverResponsaveis()` continua devolvendo só os
  // ocupantes do posto, e o escalonamento continua sendo função separada (D73).
  // ═══════════════════════════════════════════════════════════════════════
  const local = await tx.location.findUnique({
    where: { id: ctx.targetLocationId ?? '' },
    select: { id: true, name: true },
  });
  if (!local) throw new AppError('Localização do termo não encontrada.', 422);

  const escalonamento = await resolverEscalonamento(tx, local.id);

  // SEM GESTOR EM ANCESTRAL NENHUM, O CHECKOUT É RECUSADO (D27). Não se emite
  // termo para ninguém, e não se entrega em silêncio um equipamento que exige
  // assinatura: as duas saídas deixariam o documento sem dono. O 409 diz o que
  // fazer — e agora diz a verdade, porque a árvore inteira foi consultada.
  if (!escalonamento) {
    throw new AppError(
      `Defina o gestor de "${local.name}" (ou de uma localização acima dela) antes de ` +
      'entregar equipamento com termo de aceite.',
      409,
    );
  }

  return {
    userId: escalonamento.userId,
    name: escalonamento.name,
    email: escalonamento.email,
  };
}

/**
 * Emite o termo, se a categoria do modelo exigir.
 *
 * Devolve `null` quando não há o que emitir — categoria sem `requireAcceptance`
 * ou alvo `ASSET` (D87). Quem chama não precisa saber a regra.
 *
 * A CATEGORIA VEM DO MODELO, e não do ativo: `Asset` não tem `categoryId` (ela
 * chega por `AssetModel`), o que já é decisão da F1.
 */
export async function issueAcceptance(
  // O MESMO tipo de cliente que o resto da posse usa (`ClientePosse`): o
  // cliente ESTENDIDO pelo soft delete e o `Prisma.TransactionClient` cru têm
  // delegates de tipos diferentes, e forçar um no outro exigiria um cast — o
  // mesmo que o D13 existe para tornar impossível.
  tx: ClientePosse,
  ctx: ContextoDaEmissao,
): Promise<{ id: string; token: string; signerEmail: string; signerName: string } | null> {
  const ativo = await tx.asset.findFirst({
    where: { id: ctx.assetId },
    select: {
      model: {
        select: {
          category: { select: { requireAcceptance: true, eulaText: true, name: true } },
        },
      },
    },
  });

  const categoria = ativo?.model.category;
  if (!categoria?.requireAcceptance) return null;

  const signatario = await resolverSignatario(tx, ctx);
  if (!signatario) return null;

  const acceptance = await tx.acceptance.create({
    data: {
      assignmentId: ctx.assignmentId,
      assetId: ctx.assetId,
      token: gerarToken(),
      // O EULA É COPIADO (D29). Sem texto na categoria, o termo ainda existe —
      // com um aviso, e não com uma string vazia que pareceria conteúdo.
      eulaSnapshot:
        categoria.eulaText?.trim() ||
        `Termo de responsabilidade — ${categoria.name}.\n\n` +
          'A categoria deste equipamento exige aceite, mas nenhum texto foi cadastrado. ' +
          'Ao aceitar, você declara ter recebido o equipamento descrito acima e assume a ' +
          'responsabilidade pela guarda e uso dele.',
      signerUserId: signatario.userId,
      signerName: signatario.name,
      signerEmail: signatario.email,
      expiresAt: validadePadrao(),
    },
    select: { id: true, token: true, signerEmail: true, signerName: true },
  });

  return acceptance;
}
