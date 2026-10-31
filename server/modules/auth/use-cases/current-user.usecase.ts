import { prisma } from '../../../infra/database/prismaClient';
import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';
import type { Cargo } from '../../access/helpers/cargo';
import type { SessionUser } from '../auth.types';

/**
 * O usuário por trás de um token — relido do banco a CADA requisição.
 *
 * Parece caro e é a defesa principal contra o token que sobrevive ao usuário:
 * excluir alguém não apaga o JWT que ele já tem no navegador, e sem esta
 * consulta ele continuaria operando até o token expirar. A exclusão apaga a
 * linha (W), então aqui o excluído simplesmente não é encontrado.
 *
 * `isActive: false` (desativado) cai junto: quem saiu da empresa continua
 * no histórico de posse e nos relatórios, mas não opera mais.
 *
 * O `select` é o `USER_PUBLIC_SELECT`, o mesmo de toda rota que devolve
 * usuário: é ele que garante que `passwordHash`, `failedLoginCount` e
 * `lockedUntil` não saiam por aqui.
 *
 * Vem com a GERAÇÃO da sessão — para o `preHandler` conferir contra o número
 * que veio assinado no token.
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
  // A transação do login, que relê a conta junto com a escrita e a auditoria.
  client: Pick<typeof prisma, 'user'> = prisma,
): Promise<{ usuario: SessionUser; tokenVersion: number; cargo: Cargo; mustChangePassword: boolean } | null> {
  const linha = await client.user.findFirst({
    where: { id, isActive: true },
    // O CARGO VEM NA MESMA CONSULTA, por ser uma COLUNA: a releitura por
    // requisição é o caminho mais quente do sistema, e um join a mais nela
    // custaria em toda requisição autenticada.
    select: { ...USER_PUBLIC_SELECT, tokenVersion: true, role: true, mustChangePassword: true },
  });
  if (!linha) return null;

  // `tokenVersion` e `role` saem do objeto antes de ele virar `usuario`: os dois
  // são lidos, usados e DESCARTADOS. É a mesma mecânica para os dois, e pelo
  // mesmo motivo — nenhum dos dois é dado de usuário para exibir, e o
  // `USER_PUBLIC_SELECT` continua sendo a única porta de saída do que o cliente vê.
  //
  // `mustChangePassword` é o terceiro da mesma mecânica: a sessão com a troca de
  // senha pendente só alcança três rotas (`authenticate-request.helper.ts`), e o
  // painel pergunta por ele em `/api/auth/me` para mostrar a tela de troca.
  const { tokenVersion, role, mustChangePassword, ...usuario } = linha;
  return { usuario, tokenVersion, cargo: role, mustChangePassword };
}
