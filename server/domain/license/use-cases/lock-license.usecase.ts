import { AppError } from '../../../core/errors/app-error';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';

// A TRAVA DA LINHA DA LICENÇA — o mutex do contrato.
//
// Quem conta e depois grava sobre a licença trava esta linha antes de contar: a
// entrega (conta as livres e cria a entrega), a edição (conta o piso e grava a
// quantidade), a exclusão (conta as entregas e apaga) e a troca de chave
// (confere a chave e grava). O Encerrar trava para a entrega que chega depois
// encontrar a licença encerrada. Sem ela,
// duas entregas liam "1 livre" e as duas gravavam, e a invariante 22 — em uso
// nunca passa do comprado — quebrava sem erro nenhum.
//
// ORDEM: **alvo antes da licença**, no caminho que trava os dois (a entrega). A
// devolução não trava a licença: ela só fecha uma linha
// de entrega, e travar a licença depois dessa linha fecharia um ciclo com a
// troca de chave, que trava a licença e depois a linha da entrega.

/** Trava a licença até o fim da transação. `false` quando ela não existe. */
export async function travarLicenca(client: ClienteQueTrava, licenseId: string): Promise<boolean> {
  const linhas = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM licenses WHERE id = ${licenseId}::uuid FOR UPDATE
  `;
  return linhas.length > 0;
}

/** Trava a licença até o fim da transação. 404 quando ela não existe. */
export async function travarLicencaOuFalhar(client: ClienteQueTrava, licenseId: string): Promise<void> {
  if (!(await travarLicenca(client, licenseId))) throw new AppError('Nenhuma licença com este identificador.', 404);
}
