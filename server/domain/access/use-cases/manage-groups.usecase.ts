import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import type { ListQuery } from '../../../core/http/list-query';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { assertSobraAdministrador } from '../helpers/ultimo-administrador';

// GRUPO — listar, ler, criar, editar, apagar.
//
// NÃO É UMA SPEC DE CATÁLOGO, e a diferença é a coluna `permissions`. O CRUD
// genérico (`catalog/use-cases/`) grava o corpo validado direto no delegate; aqui
// cada escrita tem que terminar conferindo se o sistema continua tendo
// administrador (`assertSobraAdministrador`), e isso é regra que a spec não
// expressa. Um `beforeWrite` não serviria: a checagem roda DEPOIS da escrita, de
// propósito (ver o helper).

/** A allowlist de ordenação, espelhando a do controller. */
export type GroupSortable = 'name' | 'createdAt';

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  permissions: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Grupo de sistema é DO CÓDIGO: as permissões dele vêm do catálogo e o seed as
 * repõe (ver o comentário da coluna `isSystem` no schema).
 *
 * O que a recusa protege: se dessem para editar, o próximo `db:seed` desfaria a
 * edição — e um sistema que silenciosamente reverte o que a tela gravou é pior
 * do que um que recusa gravar. Apagar é recusado pelo mesmo motivo com a
 * consequência maior: sem o grupo, voltar a ter acesso dependeria de linha de
 * comando.
 *
 * O QUE CONTINUA PERMITIDO: a composição. Entrar e sair do grupo é a forma de
 * conceder e tirar acesso total, e é por isso que a recusa é das PERMISSÕES e
 * do nome, não dos membros.
 */
function assertEditavel(grupo: { name: string; isSystem: boolean }, data: GroupData): void {
  if (!grupo.isSystem) return;
  if (data.permissions === undefined && data.name === undefined) return;

  throw new AppError(
    `"${grupo.name}" é um grupo de sistema: as permissões dele vêm do código e o seed as repõe. ` +
    'Para dar menos acesso a alguém, tire a pessoa deste grupo ou crie um grupo próprio.',
    409,
  );
}

/** A contagem de membros sai em consulta agregada, não em `include` de usuários. */
const GROUP_SELECT_COM_CONTAGEM = {
  ...GROUP_SELECT,
  // `_count` e não `users: { select: { id: true } }`: a tela mostra "4 membros",
  // e trazer as quatro linhas para contá-las no cliente é carregar o que não se
  // usa — num grupo com a empresa inteira, é a empresa inteira.
  _count: { select: { users: true } },
} as const;

export async function listGroups(query: ListQuery<GroupSortable>) {
  const where: Prisma.GroupWhereInput = query.q
    ? { name: { contains: query.q, mode: 'insensitive' } }
    : {};

  // `$transaction` para a contagem e a página saírem do MESMO instante, como em
  // toda listagem do projeto: em duas consultas soltas, um grupo criado entre
  // uma e outra faz o total não bater com o que a página mostra.
  const [total, rows] = await prisma.$transaction([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      select: GROUP_SELECT_COM_CONTAGEM,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  // `{ total, rows }` — o `ListEnvelope` do `core/http/list-query.ts`, que TODA
  // listagem do sistema devolve. Um `{ data: … }` próprio aqui obrigaria a tela
  // de grupos a ter um leitor diferente das outras quinze.
  return { total, rows };
}

/** Lista enxuta para as caixas de seleção da tela de acesso de uma pessoa. */
export async function listGroupOptions() {
  return prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

export async function getGroup(id: string) {
  const grupo = await prisma.group.findUnique({ where: { id }, select: GROUP_SELECT_COM_CONTAGEM });
  if (!grupo) throw new AppError('Registro não encontrado', 404);
  return grupo;
}

export interface GroupData {
  name?: string;
  description?: string | null;
  /** Já convertido pelo schema: `{ "assets.view": true }`. */
  permissions?: Record<string, true>;
}

export async function createGroup(data: GroupData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const grupo = await tx.group.create({
      data: {
        name: data.name!,
        description: data.description ?? null,
        permissions: data.permissions ?? {},
        // `isSystem` NÃO vem do corpo e não está no schema de entrada: grupo de
        // sistema é criado pelo seed, nunca pela rota. Se viesse, qualquer um
        // com `access.manage` criaria um grupo que ninguém mais consegue
        // editar nem apagar.
        isSystem: false,
      },
      select: GROUP_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'Group',
      entityId: grupo.id,
      action: 'CREATE',
      // As CHAVES, não o objeto: `{"assets.view": true}` repetido trinta vezes
      // no log é ilegível, e o `true` não informa nada — a lista de chaves é o
      // fato.
      changes: { name: grupo.name, permissoes: Object.keys(data.permissions ?? {}).sort() },
    }, actorId);

    // Criar grupo não pode tirar administrador de ninguém, mas a checagem roda
    // aqui também: é uma consulta barata, e o dia em que a criação ganhar um
    // "mover membros para cá" ela já está no lugar.
    await assertSobraAdministrador(tx);
    return grupo;
  });
}

export async function updateGroup(id: string, data: GroupData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.group.findUnique({ where: { id }, select: GROUP_SELECT });
    if (!antes) throw new AppError('Registro não encontrado', 404);
    assertEditavel(antes, data);

    const grupo = await tx.group.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
      },
      select: GROUP_SELECT,
    });

    // O diff das CHAVES, nos dois sentidos: "o que esse grupo perdeu" é a
    // pergunta de quem investiga um 403 que apareceu ontem, e um log que só
    // guardasse a lista nova obrigaria a comparar duas linhas à mão.
    const chavesAntes = Object.keys(antes.permissions as object).sort();
    const chavesDepois = Object.keys(grupo.permissions as object).sort();
    await recordActivity(tx, {
      entityType: 'Group',
      entityId: id,
      action: 'UPDATE',
      changes: {
        ...(data.name && data.name !== antes.name ? { name: { de: antes.name, para: data.name } } : {}),
        ...(data.permissions
          ? {
              concedidas: chavesDepois.filter((chave) => !chavesAntes.includes(chave)),
              removidas: chavesAntes.filter((chave) => !chavesDepois.includes(chave)),
            }
          : {}),
      },
    }, actorId);

    await assertSobraAdministrador(tx);
    return grupo;
  });
}

/**
 * Apaga o grupo. SEM lixeira, como o catálogo (D8).
 *
 * O vínculo com as pessoas cai junto, pelo `onDelete: Cascade` da N:M implícita
 * — e é o comportamento certo: o vínculo não tem significado sem o grupo. O que
 * protege de apagar o grupo errado não é um `Restrict`, é a contagem de membros
 * que a tela mostra ao lado do nome, mais a checagem de administrador aqui.
 */
export async function deleteGroup(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const grupo = await tx.group.findUnique({
      where: { id },
      select: { name: true, permissions: true, isSystem: true, _count: { select: { users: true } } },
    });
    if (!grupo) throw new AppError('Registro não encontrado', 404);

    // Apagar o grupo de sistema deixaria o `assertSobraAdministrador` como
    // única rede, e a recuperação seria `db:seed` — linha de comando para
    // desfazer um clique.
    if (grupo.isSystem) {
      throw new AppError(
        `"${grupo.name}" é um grupo de sistema e não pode ser excluído. ` +
        'Tire as pessoas dele se quiser revogar o acesso total.',
        409,
      );
    }

    await tx.group.delete({ where: { id } });

    await recordActivity(tx, {
      entityType: 'Group',
      entityId: id,
      action: 'DELETE',
      changes: {
        name: grupo.name,
        // Quantas pessoas perderam acesso com isto. É o número que a pergunta
        // "por que ninguém consegue mais exportar?" procura.
        membros: grupo._count.users,
        permissoes: Object.keys(grupo.permissions as object).sort(),
      },
    }, actorId);

    await assertSobraAdministrador(tx);
  });
}
