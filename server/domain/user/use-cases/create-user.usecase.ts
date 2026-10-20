import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';
import { hashSenha } from '../../auth/helpers/password.helper';

interface CreateUserData {
  name: string;
  email: string;
  /** O cargo (D148). Ausente nasce `TECNICO`, pelo `@default` do schema. */
  role?: 'TECNICO' | 'ADMIN';
  /** É com o e-mail e esta senha que a pessoa entra no sistema. */
  password: string;
}

export async function createUser(data: CreateUserData) {
  // O hash FORA da transação: argon2 leva ~50 ms, e segurar uma conexão do
  // pool durante o cálculo é transformar cadastro em fila de banco.
  const passwordHash = await hashSenha(data.password);

  return prisma.$transaction(async (tx) => {
    // O `@unique` do e-mail pegaria a colisão, mas com o "Registro já existe"
    // genérico do P2002; conferir antes devolve a frase que diz o quê.
    const exists = await tx.user.findUnique({ where: { email: data.email } });
    if (exists) throw new AppError('E-mail já está em uso.', 409);

    // Sem `ActivityLog` (X): ninguém lê a trilha de quem opera o sistema.
    return tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        // Ausente cai no `@default(TECNICO)` do schema — e é por isso que aqui
        // não há `?? 'TECNICO'`: o padrão mora num lugar só.
        role: data.role,
        passwordHash,
      },
      select: USER_PUBLIC_SELECT,
    });
  });
}
