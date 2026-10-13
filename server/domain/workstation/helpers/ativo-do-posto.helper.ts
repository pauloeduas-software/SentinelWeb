import type { prisma } from '../../../core/database/prismaClient';
import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { travarAtivoOuFalhar } from '../../asset/use-cases/lock-asset.usecase';
import type { ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';

// NO MÁXIMO UM ATIVO POR POSTO DE TRABALHO.
//
// ═════════════════════════════════════════════════════════════════════════════
// ATIVO É COMPUTADOR. Nada que não seja máquina é cadastrado em /ativos: monitor,
// teclado, mouse e cabo são ESTOQUE, por quantidade, sem patrimônio individual.
// Com essa definição a regra do posto é sobre o ativo, e não sobre "ativo com
// máquina vinculada" — o agente instalado ou não instalado não muda o que o
// equipamento é, só o que a ficha dele consegue mostrar.
//
// SÓ ONDE `isWorkstation` É VERDADE. Numa sala de reunião ou num depósito a
// regra não vale — proibir dois computadores lá quebraria o uso que já existe.
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
 * `null` também quando a localização NÃO é posto de trabalho: quem chama lê a
 * resposta como "pode entrar", e concentrar a leitura do `isWorkstation` aqui é
 * o que evita as portas divergirem sobre onde a regra vale.
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
 * passam pela guarda — o mesmo furo que a `travarUsuario` fecha na exclusão de
 * pessoa, e pelo mesmo motivo nenhum `if` pega. Aqui não há rede no banco: a
 * regra cruza `assignments`, `assets` e `locations`, e índice único é sobre UMA
 * tabela.
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
 * disciplina de ordem que a `lock-user.usecase.ts` descreve. A contenção é só
 * entre operações que miram o MESMO posto.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function ativoDoPosto(
  client: ClientePosse & ClienteQueTrava,
  locationId: string,
  assetId: string,
): Promise<AtivoDoPosto | null> {
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

/**
 * QUANTOS ativos estão entregues a este local, posto de trabalho ou não.
 *
 * Irmão do `ativoDoPosto`, e as diferenças são as que a porta da marca exige:
 * ela CONTA em vez de devolver o primeiro (é a diferença entre "tem um" e "tem
 * três"); não tem ativo em operação para excluir; e NÃO olha o `isWorkstation`,
 * porque quem chama está justamente no ato de ligar a marca — o irmão devolveria
 * `null` aqui, sempre.
 *
 * Sem trava: ligar a marca é operação de cadastro, feita uma vez por mesa, e a
 * guarda existe para impedir o erro de quem marca o local errado — não uma
 * corrida. As portas de posse continuam sendo as que travam.
 */
export async function contarAtivosNoLocal(
  client: Pick<typeof prisma, 'assignment'>,
  locationId: string,
): Promise<number> {
  return client.assignment.count({
    where: {
      targetLocationId: locationId,
      checkinAt: null,
      // O MESMO `deletedAt` do irmão, pelo mesmo motivo: o topo é `assignment`.
      asset: { deletedAt: null },
    },
  });
}

/** A frase das portas que recusam o segundo ativo. */
export function jaTemAtivo(ativo: AtivoDoPosto): string {
  const qual = ativo.name ? `${ativo.assetTag} (${ativo.name})` : ativo.assetTag;
  return `Este posto de trabalho já tem um ativo: ${qual}. Faça a devolução dele antes.`;
}
