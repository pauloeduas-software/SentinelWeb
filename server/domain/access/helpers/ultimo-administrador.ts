import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';

// "NUNCA SEM ADMINISTRADOR" — a rede que impede o sistema de se trancar.
//
// ═══════════════════════════════════════════════════════════════════════════
// A CHECAGEM RODA **DEPOIS** DA ESCRITA, DENTRO DA TRANSAÇÃO.
//
// É contraintuitivo e é o que a torna completa. Tentar prever se uma operação
// vai deixar o sistema sem administrador exigiria simular cada caminho — rebaixar
// o cargo, apagar a pessoa, desligá-la — e o terceiro seria o esquecido.
//
// Aplicando e CONTANDO depois, há uma pergunta só: *"ainda existe alguém?"*. Se
// não, o `throw` desfaz a transação inteira e nada aconteceu. Um caminho novo
// que mexa em cargo herda a proteção só por chamar isto no fim.
//
// QUEM CONTA COMO ADMINISTRADOR: precisa poder ENTRAR.
//   `passwordHash` não nulo   sem credencial ninguém faz login, e um
//                             "administrador" que não entra não destrava nada.
//                             A base nasceu sem login: a maior parte dos
//                             cadastros existe só para receber equipamento;
//   `isActive`                desativado é recusado no login;
//   fora da lixeira           pelo escopo da extension, sem `where` à mão.
//
// O ESCAPE, e ele é de linha de comando de propósito:
// `npm run acesso:administrador -- <login>`. Uma rota de emergência seria uma
// rota que concede ADMIN sem ser ADMIN — a porta exata que isto existe para
// fechar.
// ═══════════════════════════════════════════════════════════════════════════

const SEM_SAIDA =
  'Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. ' +
  'Dê o cargo de Administrador a outra pessoa com login antes de seguir.';

/** Quantas pessoas, HOJE e com login, são administradoras. */
/**
 * A TRAVA DA ADMINISTRAÇÃO — a primeira instrução de toda transação que pode
 * tirar um administrador do jogo (rebaixar, desativar, excluir).
 *
 * Sem ela, dois administradores rebaixados ao mesmo tempo contavam, cada um,
 * "sobra 1" — a outra escrita ainda não confirmada — e as duas transações
 * passavam, deixando o sistema sem ninguém. Uma trava de transação do Postgres
 * (`pg_advisory_xact_lock`) põe essas operações em fila: a segunda só conta
 * depois que a primeira confirmou. É tomada ANTES de qualquer trava de linha,
 * sempre na mesma ordem, e por isso não abre ciclo com a entrega (que trava
 * usuário → ativo e nunca esta). Solta sozinha no fim da transação.
 */
export async function travarAdministracao(client: { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> }): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ultimo-administrador'))`;
}

async function contarAdministradores(client: ClientePosse): Promise<number> {
  return client.user.count({
    where: { role: 'ADMIN', isActive: true, passwordHash: { not: null } },
  });
}

/**
 * Chamada como ÚLTIMA instrução de toda transação que mexe em cargo.
 *
 * 409 e não 422: o corpo da requisição está válido — é o ESTADO resultante que
 * é inaceitável. Mesma família do "este colaborador ainda responde por 2
 * ativos" do `DELETE` de usuário.
 */
export async function assertSobraAdministrador(client: ClientePosse): Promise<void> {
  if (await contarAdministradores(client) > 0) return;
  throw new AppError(SEM_SAIDA, 409);
}
