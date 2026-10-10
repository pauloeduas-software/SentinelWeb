import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import type { ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';

// NO MÁXIMO UM COMPUTADOR POR POSTO DE TRABALHO.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE É "COMPUTADOR" AQUI, E POR QUE NÃO É A CATEGORIA.
//
// Computador = ativo com MÁQUINA VINCULADA (`Asset.endpoint`). Não é a
// categoria porque categoria é cadastro de texto livre: "Desktop", "desktop" e
// "PC" são três linhas diferentes, e uma regra que recusa com 409 não pode
// depender de alguém ter digitado igual. O vínculo com o endpoint é fato
// observado — o agente respondeu por aquela máquina.
//
// A consequência é assumida: um desktop em que o agente ainda não foi instalado
// não conta, então dois deles cabem no mesmo posto até o agente chegar. O
// contrário — inventar uma marca de "é computador" no catálogo — custaria um
// campo novo, uma migration e uma tela, para decidir o que o vínculo já decide.
//
// MONITOR, TECLADO E PERIFÉRICO ENTRAM SEM LIMITE, e é isso que separa esta
// regra de "um ativo por posto": o modelo de posse descreve a mesa com vários
// ativos, e a Camada 3 resolve os responsáveis de todos eles pelos ocupantes.
//
// SÓ ONDE `isWorkstation` É VERDADE. Numa sala de reunião ou num depósito a
// regra não vale — proibir dois computadores lá quebraria o uso que já existe.
// ═════════════════════════════════════════════════════════════════════════════

/** O ativo-com-máquina que o posto já tem. */
export interface ComputadorDoPosto {
  id: string;
  assetTag: string;
  name: string | null;
}

/**
 * O computador que já está neste posto, ou `null` quando não há nenhum.
 *
 * `null` também quando a localização NÃO é posto de trabalho: quem chama lê a
 * resposta como "pode entrar", e concentrar a leitura do `isWorkstation` aqui é
 * o que evita as duas portas divergirem sobre onde a regra vale.
 *
 * `assetId` é o ativo da operação em curso, e ele é EXCLUÍDO da busca. O caso
 * que exige isso é o re-vínculo idempotente: `vincularEndpointAoAtivo` deixa
 * passar a mesma máquina no mesmo ativo, e se esse ativo já é o computador do
 * posto ele seria encontrado como "o computador que já está lá" — a operação
 * responderia 409 contra si mesma.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA DUAS LINHAS, NESTA ORDEM: o ativo e depois o posto.
 *
 * POR QUE TRAVAR. Estar dentro da transação não bastaria: em READ COMMITTED
 * duas entregas simultâneas de dois computadores ao mesmo posto leem as duas um
 * estado de antes, nenhuma enxerga a posse que a outra não confirmou, e as duas
 * passam pela guarda — o mesmo furo que a `travarUsuario` fecha no
 * desligamento, e pelo mesmo motivo nenhum `if` pega. Aqui não há rede no
 * banco: a regra cruza `assignments`, `assets` e `endpoints`, e índice único é
 * sobre UMA tabela.
 *
 * POR QUE O ATIVO PRIMEIRO, e não só o posto. `update-asset.usecase.ts` grava
 * `locationId`: ele trava a linha do ATIVO no `UPDATE` e depois pede a linha do
 * POSTO, porque o gatilho da FK `assets.locationId` adquire `FOR KEY SHARE` lá
 * — e `FOR KEY SHARE` conflita com `FOR UPDATE`. Travar só o posto aqui
 * inverteria a ordem e fecharia um ciclo: editar o local do ativo A junto com a
 * entrega do ativo A ao local L dava `40P01`, que o error-handler não mapeia e
 * devolve como 500. Com o ativo primeiro, todo caminho do sistema pede ativo
 * antes de posto. O grafo está documentado em `lock-asset.usecase.ts`.
 *
 * A trava do posto é INCONDICIONAL, antes de ler o `isWorkstation`: é uma
 * instrução, sem ramo, e mantém a trava como primeira coisa da função, que é a
 * disciplina de ordem que a `lock-user.usecase.ts` descreve. O custo é quase
 * nada — quem chega aqui já é computador entrando em local, e a contenção é só
 * entre operações que miram o MESMO posto.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function computadorDoPosto(
  client: ClientePosse & ClienteQueTrava,
  locationId: string,
  assetId: string,
): Promise<ComputadorDoPosto | null> {
  await travarAtivoOuFalhar(client, assetId);

  // `${locationId}` vira parâmetro do Postgres, não texto concatenado; o
  // `::uuid` porque o parâmetro chega como texto e a coluna é `uuid`.
  await client.$queryRaw`SELECT id FROM locations WHERE id = ${locationId}::uuid FOR UPDATE`;

  const local = await client.location.findUnique({
    where: { id: locationId },
    select: { isWorkstation: true },
  });
  if (!local?.isWorkstation) return null;

  const posse = await client.assignment.findFirst({
    where: {
      targetLocationId: locationId,
      checkinAt: null,
      asset: {
        // `deletedAt: null` À MÃO, como o `POSSE_ABERTA` deste mesmo diretório
        // também precisa escrever: a `softDeleteExtension` só age no model do
        // TOPO da consulta, e aqui o topo é `assignment`. Sem isto, um ativo
        // mandado para a lixeira com a posse ainda aberta — que é o que o
        // `delete-asset` faz, porque ele só carimba `deletedAt` — trancaria o
        // posto para sempre, recusando todo computador novo com a frase abaixo
        // apontando um ativo que nenhuma tela mostra e que ninguém consegue
        // devolver.
        deletedAt: null,
        endpoint: { isNot: null },
        id: { not: assetId },
      },
    },
    select: { asset: { select: { id: true, assetTag: true, name: true } } },
  });

  return posse?.asset ?? null;
}

/** A frase das duas portas que recusam o segundo computador. */
export function jaTemComputador(computador: ComputadorDoPosto): string {
  const qual = computador.name ? `${computador.assetTag} (${computador.name})` : computador.assetTag;
  return `Este posto de trabalho já tem um computador: ${qual}. Faça a devolução dele antes.`;
}
