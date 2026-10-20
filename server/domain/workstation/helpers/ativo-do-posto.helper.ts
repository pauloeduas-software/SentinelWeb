import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';

// NO MÁXIMO UM ATIVO POR POSTO DE TRABALHO.
//
// ═════════════════════════════════════════════════════════════════════════════
// ATIVO É COMPUTADOR. Nada que não seja máquina é cadastrado em /ativos: monitor,
// teclado, mouse e cabo são ESTOQUE, por quantidade, sem patrimônio individual.
// Com essa definição a regra do posto é sobre o ativo, e não sobre "ativo com
// máquina vinculada" — o agente instalado ou não instalado não muda o que o
// equipamento é, só o que a ficha dele consegue mostrar.
//
// Vale para TODO posto: só posto recebe entrega de ativo (decisão Y). A sala de
// reunião com dois computadores não é posto — os dois ficam GUARDADOS nela
// (`Asset.locationId`), e a localização não tem limite.
// ═════════════════════════════════════════════════════════════════════════════

/** O ativo que o posto já tem. */
export interface AtivoDoPosto {
  id: string;
  assetTag: string;
  name: string | null;
}

/**
 * O ativo que já está neste posto, ou `null` quando não há nenhum.
 *
 * `assetId` é o ativo da operação em curso, e ele é EXCLUÍDO da busca: na
 * restauração da lixeira o ativo já tem a posse aberta apontando para o posto, e
 * sem a exclusão ele seria encontrado como "o ativo que já está lá" — a operação
 * responderia 409 contra si mesma.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA DUAS LINHAS, NESTA ORDEM: o ativo e depois o posto.
 *
 * POR QUE TRAVAR. Estar dentro da transação não bastaria: em READ COMMITTED
 * duas entregas simultâneas de dois ativos ao mesmo posto leem as duas um
 * estado de antes, nenhuma enxerga a posse que a outra não confirmou, e as duas
 * passam pela guarda — o mesmo furo que a `travarPessoa` fecha na exclusão de
 * pessoa, e pelo mesmo motivo nenhum `if` pega. Aqui não há rede no banco: a
 * regra cruza `assignments` e `assets`, e o índice único da posse aberta é por
 * ATIVO, não por posto.
 *
 * POR QUE O ATIVO PRIMEIRO, e não só o posto: é a ordem do sistema inteiro —
 * usuário → ativo → posto (`lock-asset.usecase.ts`). Quem trava os dois em
 * ordem oposta fecha um ciclo, e o `40P01` que sai dele o error-handler não
 * mapeia: vira 500. A contenção é só entre operações que miram o MESMO posto.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function ativoDoPosto(
  client: ClientePosse & ClienteQueTrava,
  workstationId: string,
  assetId: string,
): Promise<AtivoDoPosto | null> {
  await travarAtivoOuFalhar(client, assetId);

  // `${workstationId}` vira parâmetro do Postgres, não texto concatenado; o
  // `::uuid` porque o parâmetro chega como texto e a coluna é `uuid`.
  await client.$queryRaw`SELECT id FROM workstations WHERE id = ${workstationId}::uuid FOR UPDATE`;

  const posse = await client.assignment.findFirst({
    where: {
      targetWorkstationId: workstationId,
      checkinAt: null,
      asset: {
        // `deletedAt: null` À MÃO: a `softDeleteExtension` só age no model do
        // TOPO da consulta, e aqui o topo é `assignment`. Sem isto, um ativo
        // mandado para a lixeira com a posse ainda aberta — que é o que o
        // `delete-asset` faz, porque ele só carimba `deletedAt` — trancaria o
        // posto para sempre, recusando todo ativo novo com a frase abaixo
        // apontando um ativo que nenhuma tela mostra e que ninguém consegue
        // devolver. É a restauração que reconfere (`restore-asset.usecase.ts`).
        deletedAt: null,
        id: { not: assetId },
      },
    },
    select: { asset: { select: { id: true, assetTag: true, name: true } } },
  });

  return posse?.asset ?? null;
}

/** A frase das portas que recusam o segundo ativo. */
export function jaTemAtivo(ativo: AtivoDoPosto): string {
  const qual = ativo.name ? `${ativo.assetTag} (${ativo.name})` : ativo.assetTag;
  return `Este posto de trabalho já tem um ativo: ${qual}. Faça a devolução dele antes.`;
}
