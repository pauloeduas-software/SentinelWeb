import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
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
 * `LOCATION` — o GESTOR da localidade (D27). `Location.managerId` existe desde
 *              a F1 e esta é a primeira regra que o LÊ para decidir algo.
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

  const local = await tx.location.findUnique({
    where: { id: ctx.targetLocationId ?? '' },
    select: { name: true, manager: { select: { id: true, name: true, email: true } } },
  });
  if (!local) throw new AppError('Localização do termo não encontrada.', 422);

  // SEM GESTOR, O CHECKOUT É RECUSADO (D27). Não se emite termo para ninguém, e
  // não se entrega em silêncio um equipamento que exige assinatura: as duas
  // saídas deixariam o documento sem dono. O 409 diz o que fazer.
  if (!local.manager) {
    throw new AppError(
      `Defina o gestor de "${local.name}" antes de entregar equipamento com termo de aceite.`,
      409,
    );
  }

  return { userId: local.manager.id, name: local.manager.name, email: local.manager.email };
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
