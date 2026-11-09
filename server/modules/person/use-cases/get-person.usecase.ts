import { prisma } from '../../../infra/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';
import { AppError } from '../../../infra/errors/app-error';
import { listPersonStock } from '../../stock/use-cases/list-workstation-stock.usecase';
import { buscarEntregasDaPessoa, comStatus } from '../../license/use-cases/list-target-checkouts.usecase';
import { PERSON_DETAIL_SELECT } from '../helpers/person-select.helper';

/**
 * UM colaborador, para a ficha.
 *
 * A listagem paginada (a página Colaboradores) não serve para abrir uma pessoa
 * por id — buscar 25 para usar 1 é o que faz a ficha depender de por qual
 * página se chegou nela (e quebrar no F5).
 */
interface PessoaDaFicha {
  id: string;
  name: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Preenchido só na ficha aberta da Lixeira, pelo Supervisor (CF). */
  deletedAt: Date | null;
  isActive: boolean;
  notes: string | null;

  /**
   * Os computadores entregues A ELA e ainda com ela, uma linha por posse, cada
   * um com o link para a ficha do computador, onde está o Devolver. Só os de
   * alvo PERSON: o computador do posto que ela ocupa fica na ficha do posto,
   * como o estoque da mesa.
   */
  ativos: Awaited<ReturnType<typeof computadoresDaPessoa>>;

  /**
   * O estoque no NOME dela, uma linha por ENTREGA ("Mouse USB · 2 unidades"),
   * cada uma com o link para a ficha do item, onde está o Devolver — como as
   * licenças abaixo, e como a ficha do posto faz com `itens`
   * (`get-workstation.usecase.ts`).
   */
  itens: Awaited<ReturnType<typeof listPersonStock>>;

  /**
   * As licenças entregues A ELA e ainda abertas, cada uma com o link para a
   * ficha da licença, onde está o Devolver. É o que o 409 da desativação manda
   * devolver — e a ficha é o único lugar que as mostra pela pessoa.
   */
  licencas: ReturnType<typeof comStatus>;
}

/**
 * As posses ABERTAS de alvo PERSON, com o computador embutido.
 *
 * O computador vem com o que a aba mostra no posto também (CE): a série, o modelo
 * com o fabricante e a categoria, e o status.
 *
 * Sem filtro de lixeira: o computador entregue não vai para ela (AL).
 */
function computadoresDaPessoa(personId: string) {
  return prisma.assignment.findMany({
    where: { targetType: 'PERSON', targetPersonId: personId, checkinAt: null },
    select: {
      id: true,
      checkoutAt: true,
      expectedCheckinAt: true,
      asset: {
        select: {
          id: true,
          assetTag: true,
          serial: true,
          model: { select: { name: true, manufacturer: { select: { name: true } }, category: { select: { name: true } } } },
          status: { select: { name: true, type: true } },
        },
      },
    },
    // A ordem da recusa (`contarPosseAberta`): pela etiqueta.
    orderBy: { asset: { assetTag: 'asc' } },
  });
}

export async function getPerson(id: string, podeVerLixeira = false): Promise<PessoaDaFicha> {
  // `findFirst` pelo escopo da lixeira: o colaborador excluído só abre para quem
  // vê a Lixeira, e só para consulta (CF), como o computador (BW). Para os outros
  // ele é 404, e nenhuma escrita o alcança: ele volta pela restauração.
  const pessoa = await prisma.person.findFirst({
    where: { id, ...(podeVerLixeira ? INCLUINDO_LIXEIRA : {}) },
    select: PERSON_DETAIL_SELECT,
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  const [ativos, itens, licencas] = await Promise.all([
    computadoresDaPessoa(id),
    listPersonStock(id),
    buscarEntregasDaPessoa(id, { abertas: true }),
  ]);
  return { ...pessoa, ativos, itens, licencas: comStatus(licencas) };
}
