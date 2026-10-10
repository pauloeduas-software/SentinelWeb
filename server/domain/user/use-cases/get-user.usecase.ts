import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { USER_DETAIL_SELECT } from '../helpers/user-select.helper';
import { contarPosseAberta, type PosseAbertaDoUsuario } from './count-user-posse.usecase';

/**
 * UM colaborador, com o placar do que ainda o prende ao inventário.
 *
 * Nasce com a tela de perfil: a listagem paginada não serve para abrir uma
 * pessoa por id — buscar 25 para usar 1 é o que faz a tela de detalhe depender
 * de por qual página o usuário chegou nela (e quebrar no F5).
 *
 * AS CONTAGENS VÊM JUNTAS, e não em rota separada, porque são as mesmas que o
 * 409 do `DELETE` usa: a tela e a recusa passam a falar o mesmo número, lido da
 * mesma função (`contarPosseAberta`).
 */
export interface UsuarioComPosse {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  isActive: boolean;

  // A IDENTIDADE (F11, Etapa E). Só nesta leitura — ver `USER_DETAIL_SELECT`.
  employeeNumber: string | null;
  jobTitle: string | null;
  phone: string | null;
  address: string | null;
  hiredAt: Date | null;

  /**
   * O que prende esta pessoa ao inventário, nas TRÊS pontas: ativos em posse
   * direta, postos ocupados e assentos de licença (`count-user-posse`).
   */
  posseAberta: PosseAbertaDoUsuario;
}

export async function getUser(id: string): Promise<UsuarioComPosse> {
  // `findFirst` pelo escopo da lixeira: colaborador apagado responde 404 aqui,
  // como em toda leitura do sistema. Ele volta pela restauração, não por uma
  // URL que alguém guardou.
  const usuario = await prisma.user.findFirst({ where: { id }, select: USER_DETAIL_SELECT });
  if (!usuario) throw new AppError('Registro não encontrado', 404);

  return { ...usuario, posseAberta: await contarPosseAberta(prisma, id) };
}
