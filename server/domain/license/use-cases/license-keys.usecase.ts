import { AppError } from '../../../core/errors/app-error';
import type { ChaveNoCorpo } from '../schemas/license.schema';
import type { ClienteLicenca } from './count-license-checkouts.usecase';

// AS CHAVES DA LICENÇA (AC) — a lista que o cadastro grava e de onde a entrega
// escolhe.
//
// ═════════════════════════════════════════════════════════════════════════════
// Cada chave cobre `seats` licenças: 1 na chave individual, mais na de volume.
// As chaves somam no máximo o que foi comprado, e nenhuma vai para mais
// entregas abertas do que cobre (invariante 24). As duas contas cruzam tabelas
// e moram aqui, sob a trava da licença; que a chave da entrega é da própria
// licença, a FK composta garante no banco.
//
// O TEXTO DA CHAVE não sai daqui em frase nenhuma: as recusas falam da chave
// sem repeti-la, e a auditoria conta quantas entraram, mudaram e saíram.
// ═════════════════════════════════════════════════════════════════════════════

/** O uso de uma chave: entregas abertas agora, e se já teve alguma. */
interface UsoDaChave {
  emUso: number;
  jaEntregue: boolean;
}

const CHAVE_SEM_USO: UsoDaChave = { emUso: 0, jaEntregue: false };

/** Uma chave como o detalhe a devolve: o texto, quanto cobre e o uso. */
export interface ChaveNaResposta extends UsoDaChave {
  id: string;
  productKey: string;
  seats: number;
}

/**
 * O que a auditoria guarda de uma lista que mudou — sem o texto de nenhuma.
 * `type` e não `interface`: o JSON da auditoria pede assinatura de índice.
 */
export type MudancaDasChaves = {
  incluidas?: number;
  alteradas?: number;
  removidas?: number;
};

/**
 * O uso de cada chave da licença, em duas consultas — as abertas e as que já
 * tiveram entrega —, como o `contarUso` da licença. `excetoEntregaId` deixa uma
 * entrega fora da conta: a troca de chave não disputa lugar consigo mesma.
 */
async function usoDasChaves(
  client: ClienteLicenca,
  licenseId: string,
  excetoEntregaId?: string,
): Promise<Map<string, UsoDaChave>> {
  const fora = excetoEntregaId ? { id: { not: excetoEntregaId } } : {};
  const [abertas, entregues] = await Promise.all([
    client.licenseCheckout.groupBy({
      by: ['licenseKeyId'],
      where: { licenseId, licenseKeyId: { not: null }, checkinAt: null, ...fora },
      _count: { _all: true },
    }),
    client.licenseCheckout.groupBy({
      by: ['licenseKeyId'],
      where: { licenseId, licenseKeyId: { not: null } },
    }),
  ]);

  const emUso = new Map(abertas.map((grupo) => [grupo.licenseKeyId, grupo._count._all]));
  const uso = new Map<string, UsoDaChave>();
  for (const { licenseKeyId } of entregues) {
    if (licenseKeyId) uso.set(licenseKeyId, { emUso: emUso.get(licenseKeyId) ?? 0, jaEntregue: true });
  }
  return uso;
}

/**
 * As chaves da licença, na ordem em que foram digitadas, com o uso de cada uma.
 * É a única leitura que devolve o texto: a do detalhe.
 */
export async function listarChaves(client: ClienteLicenca, licenseId: string): Promise<ChaveNaResposta[]> {
  const [chaves, uso] = await Promise.all([
    client.licenseKey.findMany({
      where: { licenseId },
      select: { id: true, productKey: true, seats: true },
      // `id` fecha o desempate, para a ordem não mudar de uma leitura para outra.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    usoDasChaves(client, licenseId),
  ]);
  return chaves.map((chave) => ({ ...chave, ...(uso.get(chave.id) ?? CHAVE_SEM_USO) }));
}

function quantas(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/** A soma do que as chaves cobrem não passa do comprado — e a frase da recusa. */
export function assertChavesCabem(nome: string, seatsTotal: number, cobertas: number, status: 409 | 422): void {
  if (cobertas <= seatsTotal) return;
  throw new AppError(
    status === 409
      ? `Não dá para reduzir "${nome}" para ${seatsTotal}: as chaves cobrem ${cobertas}. `
        + 'Tire uma chave ou diminua o que ela cobre antes.'
      : `As chaves cobrem ${cobertas}, mais do que ${quantas(seatsTotal, 'comprada', 'compradas')} em "${nome}". `
        + 'Aumente a quantidade comprada ou diminua o que as chaves cobrem.',
    status,
  );
}

/** Quanto as chaves gravadas da licença cobrem juntas. */
export async function somaDasChaves(client: ClienteLicenca, licenseId: string): Promise<number> {
  const soma = await client.licenseKey.aggregate({ where: { licenseId }, _sum: { seats: true } });
  return soma._sum.seats ?? 0;
}

/**
 * GRAVA A LISTA como ela ficará — o cadastro e a edição.
 *
 * Quem chama segura a trava da licença (a edição) ou acabou de criá-la (o
 * cadastro): a conta de uso de cada chave não muda no meio.
 *
 * - a chave com `id` já existe: o texto (a correção de digitação) e o "cobre"
 *   podem mudar, mas ela não cobre menos do que as entregas abertas com ela;
 * - a sem `id` é nova;
 * - a que ficou fora da lista sai — e só a que nunca foi entregue: a já
 *   entregue tem o histórico de quem a usou, como a licença.
 *
 * A ORDEM é a da lista: o `createMany` grava o mesmo instante em todas, e um
 * milissegundo a mais em cada uma guarda a ordem em que foram digitadas.
 */
export async function gravarChaves(
  tx: ClienteLicenca,
  licenca: { id: string; name: string; seatsTotal: number },
  lista: readonly ChaveNoCorpo[],
): Promise<MudancaDasChaves> {
  const textos = new Set(lista.map((chave) => chave.productKey));
  if (textos.size < lista.length) throw new AppError('A mesma chave aparece duas vezes na lista.', 422);

  assertChavesCabem(licenca.name, licenca.seatsTotal, lista.reduce((soma, chave) => soma + chave.seats, 0), 422);

  const existentes = new Map((await listarChaves(tx, licenca.id)).map((chave) => [chave.id, chave]));
  const mantidas = new Set<string>();
  const mudanca: MudancaDasChaves = {};

  for (const chave of lista) {
    if (!chave.id) continue;
    const atual = existentes.get(chave.id);
    if (!atual || mantidas.has(chave.id)) throw new AppError('Chave não encontrada nesta licença.', 404);
    mantidas.add(chave.id);

    if (chave.seats < atual.emUso) {
      throw new AppError(
        `Uma chave não cobre menos do que as entregas abertas com ela: ${quantas(atual.emUso, 'está', 'estão')} `
        + 'com ela. Devolva para liberar.',
        409,
      );
    }
  }

  const removidas = [...existentes.values()].filter((chave) => !mantidas.has(chave.id));
  if (removidas.some((chave) => chave.jaEntregue)) {
    throw new AppError(
      'Uma chave que já foi entregue não sai da lista: o histórico de quem a usou depende dela.',
      409,
    );
  }

  // Sai antes de mudar e de entrar: a chave removida libera o texto para a nova.
  if (removidas.length > 0) {
    await tx.licenseKey.deleteMany({ where: { id: { in: removidas.map((chave) => chave.id) } } });
    mudanca.removidas = removidas.length;
  }

  const mudadas = lista.flatMap((chave) => {
    const atual = chave.id ? existentes.get(chave.id) : undefined;
    if (!atual || (atual.productKey === chave.productKey && atual.seats === chave.seats)) return [];
    return [{ atual, chave }];
  });

  // O TEXTO QUE PASSA DE UMA CHAVE PARA OUTRA (a troca, o deslocamento) colidiria
  // no índice único no meio do caminho: o Postgres confere linha a linha, e a
  // lista final só é única no fim. Antes, as que mudam de texto saem do caminho
  // com um provisório — com quebra de linha, que nenhuma chave de verdade tem.
  const mudamDeTexto = mudadas.filter(({ atual, chave }) => atual.productKey !== chave.productKey);
  if (mudamDeTexto.length > 1) {
    for (const { atual } of mudamDeTexto) {
      await tx.licenseKey.update({ where: { id: atual.id }, data: { productKey: `\n${atual.id}` } });
    }
  }

  for (const { atual, chave } of mudadas) {
    await tx.licenseKey.update({ where: { id: atual.id }, data: { productKey: chave.productKey, seats: chave.seats } });
  }
  if (mudadas.length > 0) mudanca.alteradas = mudadas.length;

  const novas = lista.filter((chave) => !chave.id);
  if (novas.length > 0) {
    const agora = Date.now();
    await tx.licenseKey.createMany({
      data: novas.map((chave, indice) => ({
        licenseId: licenca.id,
        productKey: chave.productKey,
        seats: chave.seats,
        createdAt: new Date(agora + indice),
      })),
    });
    mudanca.incluidas = novas.length;
  }

  return mudanca;
}

/**
 * A CHAVE DA ENTREGA: da própria licença, e com lugar. Devolve o id a gravar —
 * nulo na licença sem chave cadastrada.
 *
 * Quando a licença tem chaves, a entrega escolhe uma: é o que diz qual chave
 * está com cada pessoa ou computador. Quem chama segura a trava da licença, e
 * duas entregas não tomam juntas o último lugar da mesma chave.
 *
 * `excetoEntregaId` é a troca de chave: a entrega que troca não conta contra a
 * própria chave.
 */
export async function chaveDaEntrega(
  tx: ClienteLicenca,
  licenca: { id: string; name: string },
  licenseKeyId: string | undefined,
  excetoEntregaId?: string,
): Promise<string | null> {
  const chaves = await tx.licenseKey.findMany({ where: { licenseId: licenca.id }, select: { id: true, seats: true } });

  if (chaves.length === 0) {
    if (licenseKeyId) throw new AppError('Chave não encontrada nesta licença.', 404);
    return null;
  }

  const uso = await usoDasChaves(tx, licenca.id, excetoEntregaId);
  const temLugar = (chave: { id: string; seats: number }) => (uso.get(chave.id)?.emUso ?? 0) < chave.seats;

  if (!licenseKeyId) {
    if (!chaves.some(temLugar)) {
      throw new AppError(
        `Todas as chaves de "${licenca.name}" estão em uso. Cadastre a chave da próxima licença, `
        + 'em Editar, antes de entregar.',
        409,
      );
    }
    throw new AppError(`Escolha a chave desta entrega: "${licenca.name}" tem chaves cadastradas.`, 422);
  }

  const chave = chaves.find((candidata) => candidata.id === licenseKeyId);
  if (!chave) throw new AppError('Chave não encontrada nesta licença.', 404);
  if (!temLugar(chave)) {
    throw new AppError(
      chave.seats === 1
        ? `Esta chave já está em outra entrega aberta de "${licenca.name}". Escolha outra.`
        : `Esta chave de "${licenca.name}" cobre ${chave.seats}, e as ${chave.seats} estão em uso. Escolha outra.`,
      409,
    );
  }
  return chave.id;
}
