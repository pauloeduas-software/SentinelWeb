import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
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
   * cada uma com o link para o detalhe do item, onde está o Devolver — como as
   * licenças abaixo, e como a ficha do posto faz com `itens`
   * (`get-workstation.usecase.ts`).
   */
  itens: Awaited<ReturnType<typeof listPersonStock>>;

  /**
   * As licenças entregues A ELA e ainda abertas, cada uma com o link para o
   * detalhe da licença, onde está o Devolver. É o que o 409 da desativação manda
   * devolver — e a ficha é o único lugar que as mostra pela pessoa.
   */
  licencas: ReturnType<typeof comStatus>;
}

/**
 * As posses ABERTAS de alvo PERSON, com o computador embutido.
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
      checkoutNotes: true,
      asset: { select: { id: true, assetTag: true, name: true, model: { select: { name: true } } } },
    },
    // A ordem da recusa (`contarPosseAberta`): pela etiqueta.
    orderBy: { asset: { assetTag: 'asc' } },
  });
}

export async function getPerson(id: string): Promise<PessoaDaFicha> {
  // `findFirst` pelo escopo da lixeira: colaborador excluído responde 404 aqui,
  // como em toda leitura do sistema. Ele volta pela restauração, não por uma
  // URL que alguém guardou.
  const pessoa = await prisma.person.findFirst({ where: { id }, select: PERSON_DETAIL_SELECT });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  const [ativos, itens, licencas] = await Promise.all([
    computadoresDaPessoa(id),
    listPersonStock(id),
    buscarEntregasDaPessoa(id, { abertas: true }),
  ]);
  return { ...pessoa, ativos, itens, licencas: comStatus(licencas) };
}
