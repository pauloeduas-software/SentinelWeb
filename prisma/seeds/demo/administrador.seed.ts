import { prisma } from '../../../server/infra/database/prismaClient';
import { hashSenha } from '../../../server/modules/auth/helpers/password.helper';
import { logger, type Seeder } from '../seeder';

// A CONTA DE DESENVOLVIMENTO — admin@sentinel.com, senha "admin".
//
// Só aqui, e nunca no seed principal (decisão T): aquele roda em produção, e
// uma senha publicada no código seria a porta de qualquer banco de cliente.
// Aqui é o login de quem abre o ambiente de desenvolvimento pela primeira vez.
//
// A senha tem menos de 12 caracteres, o mínimo do CADASTRO pela tela
// (`auth.schema.ts`); o login não confere tamanho, e por isso ela entra.
const ADMINISTRADOR = { name: 'Administrador', email: 'admin@sentinel.com', role: 'ADMIN' } as const;
const SENHA = 'admin';

export const administradorDemo: Seeder = {
  name: 'Administrador (demonstração)',
  run: async () => {
    // Pelo e-mail, que é o login. Se a conta existe, nada muda: nem a senha
    // nem o nome que alguém trocou pela tela.
    const existe = await prisma.user.findUnique({ where: { email: ADMINISTRADOR.email }, select: { id: true } });
    if (existe) {
      logger.info(`[Seed demo] Administrador: ${ADMINISTRADOR.email} já existia.`);
      return;
    }

    await prisma.user.create({ data: { ...ADMINISTRADOR, passwordHash: await hashSenha(SENHA) } });
    logger.info(`[Seed demo] Administrador: ${ADMINISTRADOR.email} criado, senha "${SENHA}".`);
  },
};
