import { pathToFileURL } from 'node:url';
import { prisma, closeDatabase } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';

// A LINHA DE ESCAPE DO ACESSO — comando de linha (F11, Etapa B).
//
// ═════════════════════════════════════════════════════════════════════════════
// O ESTADO QUE ESTE COMANDO CONSERTA, E POR QUE ELE PRECISA EXISTIR.
//
// A autorização da F11 tem uma recusa que impede o pior caso: remover o último
// portador de `access.manage` é 409 (`ultimo-administrador.ts`). Ela cobre o
// caminho da TELA, e não cobre os outros três:
//
//   - alguém apagou o próprio usuário administrador pela rota de pessoas;
//   - o grupo `Administrador` foi esvaziado por `psql` ou por um restore parcial;
//   - a única conta com a chave perdeu a senha E o segundo fator.
//
// Em qualquer um deles o sistema fica de pé e TRANCADO: ninguém alcança a tela de
// grupos para conceder a si mesmo o que falta. Sem este comando, a saída seria
// escrever um `INSERT` no `_GroupToUser` à mão — que é exatamente o tipo de
// operação que produz o estado inconsistente que o `permission-catalog.ts`
// descreve (chave digitada errada, que nega em silêncio).
//
// USO:
//   npm run acesso:administrador -- maria.silva
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('cli:acesso');

export async function concederAdministrador(identificador: string): Promise<void> {
  const alvo = identificador.trim().toLowerCase();

  const pessoa = await prisma.user.findFirst({
    where: { OR: [{ username: alvo }, { email: alvo }] },
    select: { id: true, name: true, username: true, email: true, isActive: true, passwordHash: true },
  });

  if (!pessoa) {
    throw new Error(`Nenhum colaborador com nome de acesso ou e-mail "${identificador}".`);
  }

  await prisma.user.update({
    where: { id: pessoa.id },
    // Uma COLUNA, não um vínculo. Era `groups: { connect: … }` com `connect` e não
    // `set`, para a pessoa continuar nos grupos que já tinha (num comando de
    // emergência, destruir configuração é o oposto do que se quer). Com papel
    // (D148) a questão desaparece: não há vínculo a preservar.
    data: { role: 'ADMIN' },
  });

  logger.warn(`[Acesso] ${pessoa.name} agora é ADMIN.`);

  // OS DOIS AVISOS QUE EVITAM O SEGUNDO CHAMADO: estar no grupo não é poder
  // entrar. Quem não tem senha não faz login (a base nasceu sem login — é o caso
  // do colaborador cadastrado só para receber equipamento), e quem está desligado
  // é recusado com 403 mesmo com a senha certa.
  if (!pessoa.passwordHash) {
    logger.warn(
      '[Acesso] ⚠️ Esta pessoa NÃO tem senha cadastrada e por isso ainda não consegue entrar. '
      + 'Defina uma em Usuários › Definir senha, por alguém que já tenha acesso.',
    );
  }
  if (!pessoa.isActive) {
    logger.warn('[Acesso] ⚠️ Esta pessoa está DESLIGADA: o login dela é recusado com 403.');
  }
}

const executadoDireto =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  const identificador = process.argv[2];

  if (!identificador) {
    logger.error('[Acesso] Uso: npm run acesso:administrador -- <nome-de-acesso|e-mail>');
    process.exitCode = 1;
  } else {
    concederAdministrador(identificador)
      .catch((erro: unknown) => {
        logger.error(`[Acesso] ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exitCode = 1;
      })
      .finally(closeDatabase);
  }
}
