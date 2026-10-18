import { pathToFileURL } from 'node:url';
import { prisma, closeDatabase } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';

// A LINHA DE ESCAPE DO ACESSO — comando de linha (F11, Etapa B).
//
// ═════════════════════════════════════════════════════════════════════════════
// O ESTADO QUE ESTE COMANDO CONSERTA, E POR QUE ELE PRECISA EXISTIR.
//
// A autorização da F11 tem uma recusa que impede o pior caso: rebaixar,
// desativar ou excluir o último administrador é 409 (`ultimo-administrador.ts`).
// Ela cobre o caminho da TELA, e não cobre o resto:
//
//   - o cargo foi rebaixado por `psql` ou por um restore parcial;
//   - o banco é novo e ainda não tem administrador (o seed não cria conta).
//
// Este comando só dá o cargo: a pessoa precisa já ter uma senha. Se a única
// conta ADMIN perdeu a senha, a saída é trocá-la direto no banco.
//
// Em qualquer um deles o sistema fica de pé e TRANCADO: ninguém alcança a tela de
// pessoas para conceder a si mesmo o cargo que falta. Sem este comando, a saída
// seria um `UPDATE users SET role` à mão.
//
// USO:
//   npm run acesso:administrador -- maria.silva@empresa.com
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('cli:acesso');

async function concederAdministrador(email: string): Promise<void> {
  // O e-mail é o login: o mesmo que a pessoa digita na tela de entrada.
  const pessoa = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, isActive: true, passwordHash: true },
  });

  if (!pessoa) {
    throw new Error(`Nenhum colaborador com o e-mail "${email}".`);
  }

  await prisma.user.update({
    where: { id: pessoa.id },
    // Uma COLUNA, não um vínculo: não há nada mais a preservar além do cargo.
    data: { role: 'ADMIN' },
  });

  logger.warn(`[Acesso] ${pessoa.name} agora é ADMIN.`);

  // OS DOIS AVISOS QUE EVITAM O SEGUNDO CHAMADO: ter o cargo não é poder
  // entrar. Quem não tem senha não faz login (a base nasceu sem login — é o caso
  // do colaborador cadastrado só para receber equipamento), e quem está
  // desativado é recusado com 403 mesmo com a senha certa.
  if (!pessoa.passwordHash) {
    logger.warn(
      '[Acesso] ⚠️ Esta pessoa NÃO tem senha cadastrada e por isso ainda não consegue entrar. '
      + 'Alguém que já tenha acesso define a senha na edição do usuário, em Usuários.',
    );
  }
  if (!pessoa.isActive) {
    logger.warn('[Acesso] ⚠️ Esta pessoa está DESATIVADA: o login dela é recusado com 403.');
  }
}

const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  const email = process.argv[2];

  if (!email) {
    logger.error('[Acesso] Uso: npm run acesso:administrador -- <e-mail>');
    process.exitCode = 1;
  } else {
    concederAdministrador(email)
      .catch((erro: unknown) => {
        logger.error(`[Acesso] ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exitCode = 1;
      })
      .finally(closeDatabase);
  }
}
