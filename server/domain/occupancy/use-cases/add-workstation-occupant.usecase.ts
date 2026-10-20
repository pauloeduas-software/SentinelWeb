import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';
import { travarPessoa } from '../../person/use-cases/lock-person.usecase';
import { assertPostoRecebe } from '../../catalog/helpers/catalog-lock.helper';

interface AddOccupantData {
  personId: string;
  shift?: string | null;
  notes?: string | null;
  startedAt?: Date | null;
}

const CAMPOS_AUDITADOS = ['workstationId', 'personId', 'shift', 'startedAt', 'notes'] as const;

/** A mesma frase nos dois caminhos — ver a nota sobre a dupla guarda abaixo. */
const JA_OCUPA = 'Esta pessoa já ocupa este posto.';

/**
 * Coloca uma pessoa num posto de trabalho.
 *
 * As três guardas, na ordem em que importam:
 *
 * 1. **Posto e pessoa existem e estão vivos.** 404 separado para cada um, com
 *    mensagem própria: "não encontrado" genérico obrigaria quem chamou a
 *    adivinhar qual dos dois uuids estava errado.
 * 2. **Duplicata.** A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo
 *    tempo — dois vínculos abertos idênticos não significam nada e quebrariam
 *    a contagem de ocupantes da Camada 3.
 * 3. **Transação com o `ActivityLog`.** Gravado fora, o histórico registraria
 *    uma ocupação que depois falhou.
 *
 * SOBRE A DUPLA GUARDA DA DUPLICATA: a checagem em SQL e o `catch` do `P2002`
 * não são redundância. Entre o `findFirst` e o `create` cabe outra requisição —
 * é READ COMMITTED, não serializável —, então a checagem sozinha deixa passar a
 * corrida e o índice único parcial
 * `workstation_occupants_um_aberto_por_pessoa_posto` é quem de fato garante a
 * regra. Mas o `P2002` cru vira "Registro já existe" no error-handler
 * (core/errors/error-handler.ts), que não diz nada a quem está na tela. Então:
 * a checagem é pela MENSAGEM, o índice é a GARANTIA, e o `catch` traduz o
 * segundo para a primeira.
 */
export async function addWorkstationOccupant(
  workstationId: string,
  data: AddOccupantData,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // A TRAVA na linha do colaborador, antes de lê-lo. Ocupar um posto é
      // assumir responsabilidade derivada por tudo que está nele, então a
      // corrida com a desativação é a mesma da entrega: sem a trava, a
      // ocupação nasce no intervalo entre o `PUT /api/people/:id` ler a pessoa
      // e gravar `isActive: false`, e o desativado volta a responder pela Mesa
      // 1 (`lock-person.usecase.ts`).
      await travarPessoa(tx, data.personId);

      // O posto existe e ainda recebe ocupante? Desativado, não — continua no
      // histórico, mas ninguém novo passa a responder por ele. Lido `FOR SHARE`
      // DEPOIS da trava da pessoa: é a ordem do grafo (`pessoa → ativo →
      // posto`, `lock-asset.usecase.ts`). Ao contrário — posto antes da
      // pessoa —, esta ocupação, uma entrega à mesma pessoa e uma entrega do
      // mesmo ativo ao posto fechavam um ciclo de três e o Postgres matava uma
      // com `40P01`.
      await assertPostoRecebe(tx, workstationId, 'ocupante novo');

      // `findFirst`: só ele recebe o escopo da lixeira da extension — com
      // `findUnique`, um colaborador excluído voltaria a ocupar um posto. A
      // trava acima não substitui esta leitura: ela serializa, não filtra.
      const pessoa = await tx.person.findFirst({
        where: { id: data.personId },
        select: { id: true, name: true, isActive: true },
      });
      if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

      // DESATIVADO é diferente de APAGADO, e os dois são recusados aqui — a
      // mesma guarda do `checkoutAsset` (D32), pela mesma razão e com o mesmo
      // código. A assimetria durou até aqui: a entrega de ativo recusava quem
      // saiu da empresa, e o posto de trabalho aceitava. Como responsável de
      // ativo em posto é DERIVADO da ocupação (`resolverResponsaveis`), a
      // brecha reabria por outro caminho exatamente a posse que a desativação
      // fecha — e sem nunca passar por um checkout.
      //
      // 409 e não 404: a pessoa existe, o estado dela é que recusa.
      if (!pessoa.isActive) {
        throw new AppError(`${pessoa.name} está desativado(a) e não pode ocupar um posto de trabalho.`, 409);
      }

      const aberta = await tx.workstationOccupant.findFirst({
        where: { workstationId, personId: data.personId, endedAt: null },
        select: { id: true },
      });
      if (aberta) throw new AppError(JA_OCUPA, 409);

      const ocupacao = await tx.workstationOccupant.create({
        data: {
          workstationId,
          personId: data.personId,
          shift: data.shift ?? null,
          notes: data.notes ?? null,
          // `undefined` faz o Prisma NÃO mandar a coluna, e aí quem preenche é
          // o `@default(now())` do banco. Trocar por `new Date()` colocaria o
          // relógio da aplicação no lugar do relógio do banco — que é o mesmo
          // que carimba o `endedAt`, e comparar os dois precisa da mesma fonte.
          startedAt: data.startedAt ?? undefined,
        },
        select: OCCUPANT_SELECT,
      });

      await recordActivity(tx, {
        entityType: 'WorkstationOccupant',
        entityId: ocupacao.id,
        action: 'CREATE',
        changes: buildSnapshot(ocupacao, CAMPOS_AUDITADOS),
      });

      return ocupacao;
    });
  } catch (error) {
    if (errorCode(error) === 'P2002') throw new AppError(JA_OCUPA, 409);
    throw error;
  }
}
