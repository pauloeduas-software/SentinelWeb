import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { errorCode } from '../../../infra/errors/error-shape';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';

// O VÍNCULO — a afirmação de que esta máquina descoberta e aquele patrimônio são
// a mesma coisa (D45).
//
// A FK mora no `Endpoint` e é `@unique`: o 1:1 é regra do banco, não da
// aplicação. O que este arquivo acrescenta é a MENSAGEM (o P2002 cru viraria
// "Registro já existe", que não diz nada a quem está na tela) e o AuditLog.

const JA_TEM_MAQUINA = 'Este ativo já está vinculado a outra máquina. Desfaça aquele vínculo antes, pela aba Máquina do ativo.';

interface OrigemDoVinculo {
  automatico?: boolean;
  sinal?: string | null;
  /** A sugestão aceita na tela: fecha como `ACCEPTED` na transação do vínculo. */
  sugestaoId?: string;
}

/**
 * Liga endpoint e ativo, e fecha as sugestões que o assunto tornou obsoletas.
 *
 * As sugestões `LINK` pendentes DESTE endpoint viram `SUPERSEDED` na mesma
 * transação — inclusive as que apontavam para OUTROS ativos. Não é limpeza
 * cosmética: uma máquina só é um ativo, então depois do vínculo as outras
 * propostas passaram a ser sobre um mundo que não existe mais. Deixá-las
 * pendentes ofereceria a quem abrisse a fila a chance de "aceitar" um segundo
 * vínculo que o `@unique` recusaria com um erro sem explicação.
 */
export async function vincularEndpointAoAtivo(
  endpointId: string,
  assetId: string,
  /**
   * Quem vincula: a conta que aceitou ou vinculou na tela, ou o job da
   * reconciliação no vínculo automático (`match-endpoint.usecase.ts`).
   */
  ator: Ator,
  origem: OrigemDoVinculo = {},
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // A TRAVA DO ATIVO, primeiro — a mesma da baixa (`lock-asset.usecase.ts`).
      // Sem ela, o vínculo lia o ativo "sem baixa", a baixa confirmava, e a
      // máquina era gravada num ativo que acabou de sair do patrimônio. E a
      // trava da MÁQUINA, depois, sempre nessa ordem (`travarEndpoint`).
      await travarAtivoOuFalhar(tx, assetId);
      await travarEndpoint(tx, endpointId);

      // O ACEITE fecha aqui, antes de o vínculo encerrar as outras como
      // `SUPERSEDED`: numa transação só, ele não fica pela metade — a sugestão
      // aceita e encerrada, apagada pelo expurgo na rodada seguinte. Condicional:
      // dois aceites ao mesmo tempo, e o segundo a encontra resolvida.
      if (origem.sugestaoId) {
        const { count } = await tx.reconciliationSuggestion.updateMany({
          where: { id: origem.sugestaoId, endpointId, state: 'PENDING' },
          data: { state: 'ACCEPTED', resolvedAt: new Date() },
        });
        if (count === 0) throw new AppError('Esta sugestão já foi resolvida.', 409);
      }

      const endpoint = await tx.endpoint.findUnique({
        where: { id: endpointId },
        select: { id: true, hwid: true, hostname: true, assetId: true },
      });
      if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
      if (endpoint.assetId && endpoint.assetId !== assetId) {
        throw new AppError('Esta máquina já está vinculada a outro ativo.', 409);
      }

      // `findFirst`, e não `findUnique`: é ele que recebe o escopo da lixeira da
      // extension. Com `findUnique`, um ativo excluído poderia ser vinculado a
      // uma máquina viva e sumiria da tela levando o vínculo junto.
      const ativo = await tx.asset.findFirst({
        where: { id: assetId },
        select: { id: true, assetTag: true, name: true, retiredAt: true },
      });
      if (!ativo) throw new AppError('Ativo não encontrado.', 404);

      // Ativo BAIXADO não recebe máquina: ele saiu do patrimônio, e o vínculo
      // o traria de volta à cobertura e à telemetria como se fosse da empresa.
      // A máquina que segue mandando sinal de um ativo vendido é um achado, não
      // um vínculo — ela fica sem cadastro, que é onde a tela de descobertas a
      // mostra.
      if (ativo.retiredAt) {
        throw new AppError(`${ativo.assetTag} teve baixa e não recebe máquina. Desfaça a baixa antes.`, 409);
      }

      // JÁ É ESTE O VÍNCULO: nada muda, e nada se grava. A entrega que falhou e
      // é refeita (`link-and-checkout.usecase.ts`) e o duplo clique chegam aqui,
      // e uma linha LINK afirmaria um vínculo novo que já existia.
      if (endpoint.assetId === assetId) return endpoint;

      // O vínculo NÃO passa pela regra do posto: ativo é computador com ou sem
      // máquina vinculada, então a vaga da mesa foi decidida na ENTREGA
      // (`checkout-asset.usecase.ts`). Vincular depois não muda o que o ativo é
      // — só o que a ficha dele consegue mostrar.

      const vinculado = await tx.endpoint.update({
        where: { id: endpointId },
        data: { assetId },
        select: { id: true, hwid: true, hostname: true, assetId: true },
      });

      await tx.reconciliationSuggestion.updateMany({
        where: { endpointId, state: 'PENDING' },
        data: { state: 'SUPERSEDED', resolvedAt: new Date() },
      });

      await recordAudit(tx, {
        entityType: 'Asset',
        entityId: assetId,
        entityLabel: ativo.assetTag,
        action: 'LINK',
        changes: {
          hostname: { de: null, para: endpoint.hostname },
          hwid: { de: null, para: endpoint.hwid },
          origem: { de: null, para: origem.automatico ? 'automatico' : 'manual' },
          sinal: { de: null, para: origem.sinal ?? null },
          ...(origem.sugestaoId ? { sugestaoId: { de: null, para: origem.sugestaoId } } : {}),
        },
      }, ator);

      return vinculado;
    });
  } catch (error) {
    if (errorCode(error) === 'P2002') throw new AppError(JA_TEM_MAQUINA, 409);
    throw error;
  }
}

/**
 * Desfaz o vínculo.
 *
 * Existe porque o vínculo errado é o pior resultado possível desta fase, e
 * corrigi-lo não pode depender de mexer no banco à mão. O `AuditLog` grava o
 * que havia — a mesma linha que, quando o `onDelete: SetNull` desfizer um
 * vínculo sozinho ao apagar um ativo, vai ser a única testemunha do que existia.
 *
 * NÃO encerra sugestão nenhuma, e isso é o que o parque permite: sugestão de
 * vínculo só nasce para máquina SEM ativo (`match-endpoint.usecase.ts`), e o
 * `vincular` acima encerra as pendentes na mesma transação em que grava o
 * `assetId`. Máquina vinculada não tem pendente, então aqui não havia o que
 * encerrar — a rodada seguinte do job é que volta a propor, com a máquina já
 * sem vínculo.
 */
export async function desvincularEndpoint(endpointId: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    await travarEndpoint(tx, endpointId);

    const endpoint = await tx.endpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, hwid: true, hostname: true, assetId: true },
    });
    if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
    if (!endpoint.assetId) throw new AppError('Esta máquina não está vinculada a nenhum ativo.', 409);

    const desvinculado = await tx.endpoint.update({
      where: { id: endpointId },
      data: { assetId: null },
      select: { id: true, hwid: true, hostname: true, assetId: true },
    });

    // A etiqueta por `findUnique`, que a lixeira não esconde: o ativo vinculado
    // pode estar nela, e a auditoria precisa dizer de qual ele foi desligado.
    const ativo = await tx.asset.findUniqueOrThrow({ where: { id: endpoint.assetId }, select: { assetTag: true } });

    await recordAudit(tx, {
      entityType: 'Asset',
      entityId: endpoint.assetId,
      entityLabel: ativo.assetTag,
      action: 'UNLINK',
      changes: {
        hostname: { de: endpoint.hostname, para: null },
        hwid: { de: endpoint.hwid, para: null },
      },
    }, ator);

    return desvinculado;
  });
}

/**
 * Trava a linha da máquina até o fim da transação.
 *
 * A trava do ATIVO não basta: dois vínculos da MESMA máquina para ativos
 * diferentes travam ativos diferentes, os dois leem `assetId` nulo e o segundo
 * sobrescreve o primeiro — a auditoria ficava com dois LINK e nenhum UNLINK. Com
 * a máquina travada, o segundo espera, lê o vínculo do primeiro e recebe o 409.
 * O mesmo vale para duas desvinculações, que gravavam dois UNLINK.
 *
 * Sem o 404 aqui: quem o dá é a leitura seguinte.
 */
async function travarEndpoint(client: ClienteQueTrava, endpointId: string): Promise<void> {
  await client.$queryRaw`SELECT id FROM endpoints WHERE id = ${endpointId}::uuid FOR UPDATE`;
}
