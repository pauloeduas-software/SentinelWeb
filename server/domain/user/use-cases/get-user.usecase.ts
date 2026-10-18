import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { listUserStock } from '../../stock/use-cases/list-location-stock.usecase';
import { USER_DETAIL_SELECT } from '../helpers/user-select.helper';

/**
 * UM colaborador, para a tela de perfil.
 *
 * Nasce com a tela de perfil: a listagem paginada não serve para abrir uma
 * pessoa por id — buscar 25 para usar 1 é o que faz a tela de detalhe depender
 * de por qual página o usuário chegou nela (e quebrar no F5).
 */
interface UsuarioDaFicha {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  isActive: boolean;

  /**
   * As unidades de estoque no NOME dela, por LINHA: é o que a ficha precisa
   * para desenhar "o que está com esta pessoa" e oferecer a devolução por
   * unidade, como a ficha do posto já faz com `itens`
   * (`get-workstation.usecase.ts`).
   */
  itens: Awaited<ReturnType<typeof listUserStock>>;
}

export async function getUser(id: string): Promise<UsuarioDaFicha> {
  // `findFirst` pelo escopo da lixeira: colaborador apagado responde 404 aqui,
  // como em toda leitura do sistema. Ele volta pela restauração, não por uma
  // URL que alguém guardou.
  const usuario = await prisma.user.findFirst({ where: { id }, select: USER_DETAIL_SELECT });
  if (!usuario) throw new AppError('Registro não encontrado', 404);

  return { ...usuario, itens: await listUserStock(id) };
}
