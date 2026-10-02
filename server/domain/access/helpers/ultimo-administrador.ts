import { AppError } from '../../../core/errors/app-error';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { unirPermissoes } from '../use-cases/effective-permissions.usecase';

// "NUNCA SEM ADMINISTRADOR" — a rede que impede o sistema de se trancar.
//
// ═══════════════════════════════════════════════════════════════════════════
// A CHECAGEM RODA **DEPOIS** DA ESCRITA, DENTRO DA TRANSAÇÃO.
//
// É contraintuitivo e é o que a torna completa. Tentar prever se uma operação
// vai deixar o sistema sem administrador exigiria simular a união de permissões
// para cada caminho — tirar `access.manage` de um grupo, apagar o grupo, tirar a
// pessoa do grupo, desligar a pessoa — e o quarto caminho seria o esquecido.
//
// Aplicando e CONTANDO depois, há uma pergunta só: *"ainda existe alguém?"*. Se
// não, o `throw` desfaz a transação inteira e nada aconteceu. Um caminho novo
// que mexa em acesso herda a proteção só por chamar isto no fim.
//
// POR QUE A CONTAGEM REUSA `unirPermissoes()`: porque o que ela conta tem que
// ser exatamente o que o `preHandler` concede. Uma consulta JsonB própria
// (`permissions: { path: ['access.manage'], equals: true }`) seria uma segunda
// definição de "tem a permissão" — e no dia em que a união mudasse, a checagem
// continuaria contando pela regra antiga, autorizando um estado que a
// autorização real não aceita.
//
// QUEM CONTA COMO ADMINISTRADOR: precisa poder ENTRAR.
//   `passwordHash` não nulo   sem credencial ninguém faz login, e um
//                             "administrador" que não entra não destrava nada.
//                             A base nasceu sem login: a maior parte dos
//                             cadastros existe só para receber equipamento;
//   `isActive`                desligado é recusado no login (F3);
//   fora da lixeira           pelo escopo da extension, sem `where` à mão.
//
// O ESCAPE, e ele é de linha de comando de propósito: `npm run db:seed`
// recria o grupo `Administrador` e repõe o administrador do `.env`. Uma rota de
// emergência seria uma rota que concede `access.manage` sem ter `access.manage`
// — a porta exata que isto existe para fechar.
// ═══════════════════════════════════════════════════════════════════════════

const SEM_SAIDA =
  'Esta mudança deixaria o sistema sem nenhum administrador capaz de entrar. ' +
  'Dê "Gerenciar grupos, permissões e tokens de API" a outra pessoa com login antes de seguir.';

/**
 * Quantas pessoas, HOJE e com login, alcançam `access.manage`.
 *
 * Carrega os grupos de cada pessoa e reduz em memória. São dezenas de linhas, não
 * milhares — e a alternativa (filtro no JsonB) duplicaria a regra da união.
 */
export async function contarAdministradores(client: ClientePosse): Promise<number> {
  const pessoas = await client.user.findMany({
    where: { isActive: true, passwordHash: { not: null } },
    select: { groups: { select: { permissions: true } } },
  });

  return pessoas.filter((pessoa) => unirPermissoes(pessoa.groups).has('access.manage')).length;
}

/**
 * Chamada como ÚLTIMA instrução de toda transação que mexe em acesso.
 *
 * 409 e não 422: o corpo da requisição está válido — é o ESTADO resultante que
 * é inaceitável. Mesma família do "este colaborador ainda responde por 2
 * ativos" do `DELETE` de usuário.
 */
export async function assertSobraAdministrador(client: ClientePosse): Promise<void> {
  if (await contarAdministradores(client) > 0) return;
  throw new AppError(SEM_SAIDA, 409);
}
