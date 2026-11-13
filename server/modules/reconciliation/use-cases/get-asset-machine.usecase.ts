import { prisma } from '../../../infra/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';
import { AppError } from '../../../infra/errors/app-error';

// ═════════════════════════════════════════════════════════════════════════════
// QUAL MÁQUINA ESTÁ VINCULADA A ESTE ATIVO — o que a aba Máquina precisa saber para
// abrir o painel, que lê o resto em `GET /api/endpoints/:id`, revalidando (BY, BZ).
//
// A ROTA CHAMA `/machine`, e não o nome de um dos conteúdos. É a mesma regra que
// aposentou `/itam` em favor de `/ativos` (hoje `/computadores`) e que fez a tela se
// chamar `/descobertas`: o nome é do que a coisa É, não do que ela era quando nasceu.
// ═════════════════════════════════════════════════════════════════════════════

/** A máquina vinculada a um ativo, ou a resposta vazia. */
export async function obterMaquinaDoAtivo(assetId: string, podeVerLixeira = false) {
  const [endpoint, ativo] = await Promise.all([
    prisma.endpoint.findFirst({ where: { assetId }, select: { id: true, hostname: true } }),
    // `findFirst` e não `findUnique`: é ele que recebe o escopo da lixeira da
    // extension, então ativo excluído só devolve máquina a quem vê a Lixeira (BW).
    prisma.asset.findFirst({ where: { id: assetId, ...(podeVerLixeira ? INCLUINDO_LIXEIRA : {}) }, select: { id: true } }),
  ]);

  if (!ativo || !endpoint) return { endpointId: null, hostname: null };

  return { endpointId: endpoint.id, hostname: endpoint.hostname };
}

/** Prisma global ou o `tx` da transação de quem chama. */
type ClienteDaMaquina = Omit<typeof prisma, `$${string}`>;

/**
 * O computador com MÁQUINA vinculada não recebe baixa nem vai para a lixeira
 * (CL): 409, com a máquina em link para Descobertas, onde mora o Desvincular.
 * Sem a recusa, a máquina seguia ligada a um computador que saiu, e a aba
 * Máquina continuava com a telemetria e os comandos dele.
 *
 * Quem chama trava o computador antes: o vínculo trava a mesma linha
 * (`link-endpoint-asset.usecase.ts`), e não nasce no meio da conta.
 */
export async function assertSemMaquina(
  client: ClienteDaMaquina,
  assetId: string,
  /** Quem a frase cita: a etiqueta, ou "Este computador". */
  sujeito: string,
  /** "dar baixa", "excluir". */
  operacao: string,
): Promise<void> {
  const maquina = await client.endpoint.findFirst({ where: { assetId }, select: { id: true, hostname: true } });
  if (!maquina) return;
  throw new AppError(
    `${sujeito} ainda tem a máquina ${maquina.hostname} vinculada. `
    + `Desvincule pela tela de Descobertas antes de ${operacao}.`,
    409,
    [{ tipo: 'maquina', id: maquina.id, nome: maquina.hostname }],
  );
}
