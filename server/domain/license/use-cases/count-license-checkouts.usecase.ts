import type { prisma } from '../../../core/database/prismaClient';
import { SEM_USO, type UsoDaLicenca } from '../helpers/license-count.helper';

// QUANTO DE CADA LICENÇA ESTÁ EM USO — contado nas entregas abertas —, e se
// ela já foi entregue alguma vez.

export type ClienteLicenca = Omit<typeof prisma, `$${string}`>;

/**
 * O uso de VÁRIAS licenças, em UMA consulta.
 *
 * Em lote e não por linha pelo mesmo motivo do `contarFora` do estoque: a
 * listagem mostra até 100 licenças, e uma consulta por linha seria N+1 para
 * pintar a coluna principal da tela.
 */
export async function contarUso(
  client: ClienteLicenca,
  licenseIds: readonly string[],
): Promise<Map<string, UsoDaLicenca>> {
  const uso = new Map<string, UsoDaLicenca>();
  if (licenseIds.length === 0) return uso;

  const [abertas, entregues] = await Promise.all([
    client.licenseCheckout.groupBy({
      by: ['licenseId'],
      where: { licenseId: { in: [...licenseIds] }, checkinAt: null },
      _count: { _all: true },
    }),
    // Abertas e devolvidas: a licença tem passado (`jaEntregue`).
    client.licenseCheckout.groupBy({
      by: ['licenseId'],
      where: { licenseId: { in: [...licenseIds] } },
    }),
  ]);

  const emUso = new Map(abertas.map((grupo) => [grupo.licenseId, grupo._count._all]));
  // `licenseId` nunca é nulo aqui — o filtro é por ele —, mas o tipo da coluna é.
  for (const { licenseId } of entregues) {
    if (licenseId) uso.set(licenseId, { emUso: emUso.get(licenseId) ?? 0, jaEntregue: true });
  }
  return uso;
}

/** O de uma licença só. Atalho sobre a versão em lote — uma implementação, uma conta. */
export async function contarUsoDe(client: ClienteLicenca, licenseId: string): Promise<UsoDaLicenca> {
  return (await contarUso(client, [licenseId])).get(licenseId) ?? SEM_USO;
}

/** Uma licença que está com alguém, como a frase da recusa a cita. */
export interface LicencaComAlguem {
  id: string;
  nome: string;
}

async function licencasAbertas(
  client: ClienteLicenca,
  alvo: { assignedPersonId: string } | { assignedAssetId: string },
): Promise<LicencaComAlguem[]> {
  const entregas = await client.licenseCheckout.findMany({
    where: { ...alvo, checkinAt: null },
    select: { license: { select: { id: true, name: true } } },
    orderBy: { license: { name: 'asc' } },
  });
  // A entrega em uso sempre tem licença (CHECK `license_checkouts_licenca_presente`).
  return entregas.flatMap(({ license }) => (license ? [{ id: license.id, nome: license.name }] : []));
}

/**
 * As licenças abertas NO NOME da pessoa — para a recusa dizer QUAIS voltam.
 *
 * SÓ `assignedPersonId`. As licenças entregues a um ATIVO não entram: são da
 * máquina, não dela. A Laura sai e o desktop da Mesa 1 continua com o mesmo
 * Office — contá-las aqui faria a desativação responder 409 sobre licença que
 * ela não tem como devolver. É a mesma linha do `itensDaPessoa` do estoque.
 *
 * Recebe o cliente de transação porque quem lê é a desativação e a exclusão,
 * DENTRO da transação que grava, com a pessoa já travada.
 */
export function licencasDaPessoa(client: ClienteLicenca, personId: string): Promise<LicencaComAlguem[]> {
  return licencasAbertas(client, { assignedPersonId: personId });
}

/**
 * As licenças abertas NESTE ATIVO.
 *
 * É o que recusa a baixa e a exclusão de uma máquina que ainda tem licença: a
 * licença continuaria descontada do contrato, presa a um equipamento que saiu.
 */
export function licencasDoAtivo(client: ClienteLicenca, assetId: string): Promise<LicencaComAlguem[]> {
  return licencasAbertas(client, { assignedAssetId: assetId });
}

/** "Office, VPN e AutoCAD" — os nomes que a recusa escreve. */
export function nomesDasLicencas(licencas: readonly LicencaComAlguem[]): string {
  const nomes = licencas.map((licenca) => licenca.nome);
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** As licenças como `refs` do erro: a tela põe um link em cada uma. */
export function comoReferencias(licencas: readonly LicencaComAlguem[]) {
  return licencas.map((licenca) => ({ tipo: 'licenca' as const, id: licenca.id, nome: licenca.nome }));
}
