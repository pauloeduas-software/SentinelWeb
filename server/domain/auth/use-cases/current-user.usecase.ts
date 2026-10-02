import { prisma } from '../../../core/database/prismaClient';
import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';
import {
  GRUPOS_PARA_PERMISSAO, unirPermissoes,
} from '../../access/use-cases/effective-permissions.usecase';
import type { Permissao } from '../../access/helpers/permission-catalog';
import type { SessionUser } from '../auth.types';

/**
 * O usuário por trás de um token — relido do banco a CADA requisição.
 *
 * Parece caro e é a defesa principal contra o token que sobrevive ao usuário:
 * mandar alguém para a lixeira não apaga o JWT que ele já tem no navegador, e
 * sem esta consulta ele continuaria operando até o token expirar. Aqui a
 * extension de soft delete joga a favor — `findFirst` já não enxerga o apagado,
 * sem código nenhum a mais (server/core/database/soft-delete.extension.ts).
 *
 * `isActive: false` (desligado, F11) cai junto: quem saiu da empresa continua
 * no histórico de posse e nos relatórios, mas não opera mais.
 *
 * O `select` é o `USER_PUBLIC_SELECT`, o mesmo de toda rota que devolve
 * usuário: é ele que garante que `passwordHash`, `failedLoginCount` e
 * `lockedUntil` não saiam por aqui.
 */
export function carregarUsuarioDaSessao(id: string): Promise<SessionUser | null> {
  return prisma.user.findFirst({
    where: { id, isActive: true },
    select: USER_PUBLIC_SELECT,
  });
}

/**
 * O mesmo usuário, mais a GERAÇÃO da sessão dele — para o `preHandler` conferir
 * contra o número que veio assinado no token.
 *
 * Existe separado, e o `tokenVersion` NÃO entra no `USER_PUBLIC_SELECT`, porque
 * aquela allowlist é o contrato do que sai para o cliente: um mecanismo interno
 * de sessão não tem o que fazer no corpo de `/api/auth/me` nem embutido em toda
 * posse de ativo. Aqui o número é lido, comparado e descartado — quem segue
 * viagem para `request.user` é só a parte pública.
 *
 * Uma consulta só, e não duas: a releitura por requisição já era o caminho
 * quente do sistema inteiro, e buscar o `tokenVersion` à parte dobraria o
 * número de idas ao banco em TODA requisição autenticada.
 */
export async function carregarSessaoParaValidacao(
  id: string,
): Promise<{ usuario: SessionUser; tokenVersion: number; permissoes: Set<Permissao> } | null> {
  const linha = await prisma.user.findFirst({
    where: { id, isActive: true },
    // OS GRUPOS VÊM NA MESMA CONSULTA (D136), e é por isso que a permissão não
    // custa uma segunda ida ao banco por requisição. O `include` acrescenta um
    // join à consulta mais quente do sistema — é o preço mínimo possível, e a
    // alternativa (um `effective-permissions` chamado à parte no `preHandler`)
    // dobraria a contagem de consultas de TODA requisição autenticada.
    select: { ...USER_PUBLIC_SELECT, tokenVersion: true, groups: GRUPOS_PARA_PERMISSAO },
  });
  if (!linha) return null;

  // `tokenVersion` e `groups` saem do objeto antes de ele virar `usuario`: os
  // dois são lidos, usados e DESCARTADOS. É a mesma mecânica para os dois, e
  // pelo mesmo motivo — nenhum dos dois é dado de usuário para exibir, e o
  // `USER_PUBLIC_SELECT` continua sendo a única porta de saída do que o cliente
  // vê.
  const { tokenVersion, groups, ...usuario } = linha;
  return { usuario, tokenVersion, permissoes: unirPermissoes(groups) };
}
