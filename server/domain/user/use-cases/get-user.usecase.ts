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
 * As duas contagens vêm JUNTAS, e não em rota separada, porque é delas que o
 * botão de desligamento tira o que mostrar antes de confirmar, e porque são as
 * mesmas duas do 409 do `DELETE`: a tela e a recusa passam a falar o mesmo
 * número, lido da mesma função (`contarPosseAberta`).
 */
export interface UsuarioComPosse {
  id: string;
  name: string;
  email: string;
  department: string | null;
  createdAt: Date;
  isActive: boolean;
  terminatedAt: Date | null;
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
