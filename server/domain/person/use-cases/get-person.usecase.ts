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

  /**
   * O estoque no NOME dela, uma linha por SAÍDA ("Mouse USB · 2 unidades"),
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

export async function getPerson(id: string): Promise<PessoaDaFicha> {
  // `findFirst` pelo escopo da lixeira: colaborador excluído responde 404 aqui,
  // como em toda leitura do sistema. Ele volta pela restauração, não por uma
  // URL que alguém guardou.
  const pessoa = await prisma.person.findFirst({ where: { id }, select: PERSON_DETAIL_SELECT });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  const [itens, licencas] = await Promise.all([
    listPersonStock(id),
    buscarEntregasDaPessoa(id, { abertas: true }),
  ]);
  return { ...pessoa, itens, licencas: comStatus(licencas) };
}
