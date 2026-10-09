import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';

// "NUNCA SEM ADMINISTRADOR" — a rede que impede o sistema de se trancar.
//
// ═══════════════════════════════════════════════════════════════════════════
// A CHECAGEM RODA **DEPOIS** DA ESCRITA, DENTRO DA TRANSAÇÃO.
//
// É contraintuitivo e é o que a torna completa. Tentar prever se uma operação
// vai deixar o sistema sem administrador exigiria simular cada caminho — rebaixar
// o papel, apagar a pessoa, desligá-la — e o terceiro seria o esquecido.
//
// Aplicando e CONTANDO depois, há uma pergunta só: *"ainda existe alguém?"*. Se
// não, o `throw` desfaz a transação inteira e nada aconteceu. Um caminho novo
// que mexa em papel herda a proteção só por chamar isto no fim.
//
// O QUE O D148 SIMPLIFICOU AQUI: a contagem era `unirPermissoes(grupos)` filtrada
// por `access.manage`, em memória, porque uma consulta JsonB seria uma segunda
// definição de "tem a permissão". Com papel, a pergunta é uma coluna — e o banco
// a responde com `count`, sem carregar pessoa nenhuma.
//
// QUEM CONTA COMO ADMINISTRADOR: precisa poder ENTRAR.
//   `passwordHash` não nulo   sem credencial ninguém faz login, e um
//                             "administrador" que não entra não destrava nada.
//                             A base nasceu sem login: a maior parte dos
//                             cadastros existe só para receber equipamento;
//   `isActive`                desligado é recusado no login (F3);
//   fora da lixeira           pelo escopo da extension, sem `where` à mão.
//
// O ESCAPE, e ele é de linha de comando de propósito:
// `npm run acesso:administrador -- <login>`. Uma rota de emergência seria uma
// rota que concede ADMIN sem ser ADMIN — a porta exata que isto existe para
// fechar.
// ═══════════════════════════════════════════════════════════════════════════

const SEM_SAIDA =
  'Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. ' +
  'Dê o papel de Administrador a outra pessoa com login antes de seguir.';

/** Quantas pessoas, HOJE e com login, são administradoras. */
export async function contarAdministradores(client: ClientePosse): Promise<number> {
  return client.user.count({
    where: { role: 'ADMIN', isActive: true, passwordHash: { not: null } },
  });
}

/**
 * Chamada como ÚLTIMA instrução de toda transação que mexe em papel.
 *
 * 409 e não 422: o corpo da requisição está válido — é o ESTADO resultante que
 * é inaceitável. Mesma família do "este colaborador ainda responde por 2
 * ativos" do `DELETE` de usuário.
 */
export async function assertSobraAdministrador(client: ClientePosse): Promise<void> {
  if (await contarAdministradores(client) > 0) return;
  throw new AppError(SEM_SAIDA, 409);
}
