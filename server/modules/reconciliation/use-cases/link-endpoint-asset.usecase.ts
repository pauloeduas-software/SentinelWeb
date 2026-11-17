import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { errorCode } from '../../../infra/errors/error-shape';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import { normalizeSerial } from '../helpers/normalize-identity.helper';

// O VÍNCULO — a afirmação de que esta máquina descoberta e aquele patrimônio são
// a mesma coisa (D45).
//
// A FK mora no `Endpoint` e é `@unique`: o 1:1 é regra do banco, não da
// aplicação. O que este arquivo acrescenta é a MENSAGEM (o P2002 cru viraria
// "Registro já existe.", que não diz nada a quem está na tela) e o AuditLog.

const JA_TEM_MAQUINA = 'Este computador já está vinculado a outra máquina. Desfaça aquele vínculo antes, em Agentes.';

interface OrigemDoVinculo {
  automatico?: boolean;
  sinal?: string | null;
}

/**
 * Liga endpoint e ativo.
 *
 * O vínculo à mão religa o automático da máquina (`autoLinkOff`): quem vinculou
 * decidiu qual computador ela é. O automático desiste da máquina que alguém
 * desvinculou no meio, e devolve `null` sem gravar nada (DC).
 */
export async function vincularEndpointAoAtivo(
  endpointId: string,
  assetId: string,
  /**
   * Quem vincula: a conta que vinculou na tela, ou o sistema no vínculo
   * automático (`auto-link-endpoint.usecase.ts`).
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

      const endpoint = await tx.endpoint.findUnique({
        where: { id: endpointId },
        select: { id: true, hwid: true, hostname: true, assetId: true, autoLinkOff: true, biosSerial: true },
      });
      if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
      // A máquina já estava travada: o Desvincular que confirmou depois de a
      // regra ler a máquina chega aqui, e ela não volta sozinha.
      if (origem.automatico && endpoint.autoLinkOff) return null;
      if (endpoint.assetId && endpoint.assetId !== assetId) {
        throw new AppError('Esta máquina já está vinculada a outro computador.', 409);
      }

      // `findFirst`, e não `findUnique`: é ele que recebe o escopo da lixeira da
      // extension. Com `findUnique`, um ativo excluído poderia ser vinculado a
      // uma máquina viva e sumiria da tela levando o vínculo junto.
      const ativo = await tx.asset.findFirst({
        where: { id: assetId },
        select: { id: true, assetTag: true, name: true, retiredAt: true, serial: true },
      });
      if (!ativo) throw new AppError('Computador não encontrado.', 404);
      // A regra leu as séries fora da trava: a do computador editada no meio
      // não liga pela série antiga.
      const serie = normalizeSerial(endpoint.biosSerial);
      if (origem.automatico && (!serie || normalizeSerial(ativo.serial) !== serie)) return null;

      // Ativo BAIXADO não recebe máquina: ele saiu do patrimônio, e o vínculo
      // o traria de volta à cobertura e à telemetria como se fosse da empresa.
      // A máquina que segue mandando sinal de um ativo vendido é um achado, não
      // um vínculo — ela fica sem computador, que é onde a tela Agentes a
      // mostra.
      if (ativo.retiredAt) {
        throw new AppError(`${ativo.assetTag} teve baixa e não recebe máquina. Reverta a baixa antes.`, 409);
      }

      // JÁ É ESTE O VÍNCULO: nada muda, e nada se grava. A entrega que falhou e
      // é refeita (`link-and-checkout.usecase.ts`) e o duplo clique chegam aqui,
      // e uma linha LINK afirmaria um vínculo novo que já existia.
      if (endpoint.assetId === assetId) return { id: endpoint.id, hwid: endpoint.hwid, hostname: endpoint.hostname, assetId };

      // O vínculo NÃO passa pela regra do posto: ativo é computador com ou sem
      // máquina vinculada, então a vaga da mesa foi decidida na ENTREGA
      // (`checkout-asset.usecase.ts`). Vincular depois não muda o que o ativo é
      // — só o que a ficha dele consegue mostrar.

      const vinculado = await tx.endpoint.update({
        where: { id: endpointId },
        data: { assetId, autoLinkOff: false },
        select: { id: true, hwid: true, hostname: true, assetId: true },
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
 * Existe porque o vínculo errado é o pior resultado possível, e
 * corrigi-lo não pode depender de mexer no banco à mão. O `AuditLog` grava o
 * que havia — a mesma linha que, quando o `onDelete: SetNull` desfizer um
 * vínculo sozinho ao apagar um ativo, vai ser a única testemunha do que existia.
 *
 * Desliga o automático da máquina (`autoLinkOff`): sem isso, o próximo
 * handshake a ligaria de novo ao mesmo computador pela série, e o vínculo errado
 * não teria correção. Quem a liga de novo é o Vincular (DC).
 */
export async function desvincularEndpoint(endpointId: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    await travarEndpoint(tx, endpointId);

    const endpoint = await tx.endpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, hwid: true, hostname: true, assetId: true },
    });
    if (!endpoint) throw new AppError('Máquina não encontrada.', 404);
    if (!endpoint.assetId) throw new AppError('Esta máquina não está vinculada a nenhum computador.', 409);

    const desvinculado = await tx.endpoint.update({
      where: { id: endpointId },
      data: { assetId: null, autoLinkOff: true },
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
