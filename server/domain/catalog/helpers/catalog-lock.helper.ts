import type { $Enums } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import type { ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';

// AS TRAVAS DAS LINHAS DE CATÁLOGO que outro domínio LÊ para decidir.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ELAS FECHAM — a mesma corrida em três lugares:
//
//   T1 (troca o tipo de "Monitor"   trava? não. conta usos → 0, segue
//       de STOCK para ASSET)
//   T2 (cadastra item de estoque)   lê "Monitor" → STOCK, aprova
//   T1                              grava type = ASSET               → COMMIT
//   T2                              grava o item (a FK só quer que a
//                                   linha EXISTA)                   → COMMIT
//
// Resultado: um item de estoque numa categoria de ATIVO, que nenhuma guarda
// recusou. O mesmo vale para o tipo do status (um ativo entregue com status de
// estoque) e para a localização desativada (uma entrega a um local que não
// recebe mais nada).
//
// A FK NÃO cobre: o `FOR KEY SHARE` que ela toma não conflita com o `UPDATE`
// de uma coluna que não é chave. Por isso os DOIS lados travam de verdade:
//   - quem MUDA o que os outros leem (o tipo, o `isActive`) trava `FOR UPDATE`
//     antes de contar ou de gravar;
//   - quem LÊ para decidir trava `FOR SHARE` — e, se esperou, relê o valor já
//     confirmado, que é o que faz a guarda recusar em vez de aprovar o velho.
// ─────────────────────────────────────────────────────────────────────────────
//
// NO GRAFO DE TRAVAS (`asset/use-cases/lock-asset.usecase.ts`) as linhas de
// catálogo vêm por último: usuário → ativo → posto → status, item → posto,
// item → categoria, licença → categoria. A troca de tipo trava `FOR UPDATE` e
// só CONTA depois — não espera mais nada. A exceção é a ocupação de posto, que
// lê o local ANTES de travar o usuário; a escrita de localização trava só a
// própria linha e não pede usuário nenhum, então as duas não se cruzam.

/** Trava a linha para quem vai MUDAR o tipo — antes de contar os usos. */
export async function travarCategoriaParaEscrita(client: ClienteQueTrava, id: string): Promise<void> {
  await client.$queryRaw`SELECT id FROM categories WHERE id = ${id}::uuid FOR UPDATE`;
}

/** Mesma trava, no status. */
export async function travarStatusParaEscrita(client: ClienteQueTrava, id: string): Promise<void> {
  await client.$queryRaw`SELECT id FROM status_labels WHERE id = ${id}::uuid FOR UPDATE`;
}

/**
 * Trava TODOS os status de um tipo, em ordem de id.
 *
 * Para a guarda do "último ativo do tipo": desativar dois "Disponível" ao mesmo
 * tempo, cada um travando só a própria linha, contaria "sobra o outro" nos dois
 * lados e deixaria zero. Travar o tipo inteiro serializa — e na MESMA ordem
 * (`ORDER BY id`) para as duas não se travarem uma à outra.
 */
export async function travarStatusDoTipo(client: ClienteQueTrava, tipo: $Enums.StatusLabelType): Promise<void> {
  await client.$queryRaw`
    SELECT id FROM status_labels WHERE type = ${tipo}::"StatusLabelType" ORDER BY id FOR UPDATE
  `;
}

/**
 * Trava a localização para escrita.
 *
 * É o que serializa "marcar como posto" com a entrega a este local — a entrega
 * trava o posto `FOR UPDATE` (`ativo-do-posto.helper.ts`), e sem a trava daqui
 * a marca contava os ativos ANTES de uma entrega simultânea confirmar. E é o
 * que faz a desativação esperar quem está lendo a marca `FOR SHARE`.
 *
 * `FOR NO KEY UPDATE`, e não `FOR UPDATE` como a troca de tipo: `FOR UPDATE`
 * conflitaria com o `FOR KEY SHARE` que toda FK escrita para este local toma —
 * o ativo guardado aqui, a saída de estoque —, criando arestas novas no grafo
 * de travas. `NO KEY UPDATE` conflita com o que precisa (`SHARE` e `UPDATE`) e
 * deixa as FKs passarem.
 */
export async function travarLocalParaEscrita(client: ClienteQueTrava, id: string): Promise<void> {
  await client.$queryRaw`SELECT id FROM locations WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
}

export interface StatusLido {
  id: string;
  name: string;
  type: $Enums.StatusLabelType;
  isActive: boolean;
}

/**
 * Lê o status para DECIDIR com ele, travando `FOR SHARE` — ou 404.
 *
 * É a porta de todo caminho que grava `assets.statusId` (cadastro, edição,
 * entrega, devolução). O 404 substitui o P2003 genérico ("Registro está em uso
 * por outro cadastro") que a FK daria a um status inexistente.
 */
export async function lerStatusTravado(client: ClienteQueTrava, id: string): Promise<StatusLido> {
  const linhas = await client.$queryRaw<StatusLido[]>`
    SELECT id, name, type::text AS type, "isActive" FROM status_labels WHERE id = ${id}::uuid FOR SHARE
  `;
  if (linhas.length === 0) throw new AppError('Status não encontrado.', 404);
  return linhas[0];
}

export interface CategoriaLida {
  id: string;
  name: string;
  type: $Enums.CategoryType;
  isActive: boolean;
}

/** Lê a categoria para decidir com ela, travando `FOR SHARE`. `null` se não existe. */
export async function lerCategoriaTravada(client: ClienteQueTrava, id: string): Promise<CategoriaLida | null> {
  const linhas = await client.$queryRaw<CategoriaLida[]>`
    SELECT id, name, type::text AS type, "isActive" FROM categories WHERE id = ${id}::uuid FOR SHARE
  `;
  return linhas[0] ?? null;
}

/**
 * A localização existe e ainda RECEBE coisa nova? 404 / 409.
 *
 * `finalidade` completa a frase do 409 — "não recebe <finalidade>" —, para a
 * recusa dizer o que foi tentado.
 *
 * `modo`: `SHARE` para quem só lê a marca; `UPDATE` para a entrega de ativo,
 * que logo depois trava o posto `FOR UPDATE` na invariante 19 — subir de
 * `SHARE` para `UPDATE` na mesma linha é o deadlock clássico entre duas
 * entregas ao mesmo posto, então ela trava forte desde o começo.
 */
export async function assertLocalRecebe(
  client: ClienteQueTrava,
  id: string,
  finalidade: string,
  modo: 'SHARE' | 'UPDATE' = 'SHARE',
): Promise<void> {
  const linhas = modo === 'UPDATE'
    ? await client.$queryRaw<{ name: string; isActive: boolean }[]>`
        SELECT name, "isActive" FROM locations WHERE id = ${id}::uuid FOR UPDATE`
    : await client.$queryRaw<{ name: string; isActive: boolean }[]>`
        SELECT name, "isActive" FROM locations WHERE id = ${id}::uuid FOR SHARE`;

  if (linhas.length === 0) throw new AppError('Localização não encontrada.', 404);
  if (!linhas[0].isActive) {
    throw new AppError(`"${linhas[0].name}" está desativada e não recebe ${finalidade}.`, 409);
  }
}

export interface RegistroLido {
  id: string;
  name: string;
  isActive: boolean;
}

/** Lê o fabricante para decidir com ele, travando `FOR SHARE`. `null` se não existe. */
export async function lerFabricanteTravado(client: ClienteQueTrava, id: string): Promise<RegistroLido | null> {
  const linhas = await client.$queryRaw<RegistroLido[]>`
    SELECT id, name, "isActive" FROM manufacturers WHERE id = ${id}::uuid FOR SHARE
  `;
  return linhas[0] ?? null;
}

/** Lê o modelo para decidir com ele, travando `FOR SHARE`. `null` se não existe. */
export async function lerModeloTravado(client: ClienteQueTrava, id: string): Promise<RegistroLido | null> {
  const linhas = await client.$queryRaw<RegistroLido[]>`
    SELECT id, name, "isActive" FROM asset_models WHERE id = ${id}::uuid FOR SHARE
  `;
  return linhas[0] ?? null;
}

/**
 * Registro DESATIVADO não é escolhido de novo — 409.
 *
 * É a outra metade do botão Desativar das Configurações: ele tira o registro
 * das listas de escolha (`optionsWhere`), e esta guarda recusa quem chega pela
 * API ou com a tela aberta desde antes. Quem CHAMA decide quando: só quando o
 * vínculo MUDA — o formulário reenvia todo campo, e o modelo que já era da
 * Dell não pode ficar impedido de editar o próprio nome porque a Dell foi
 * desativada.
 *
 * A leitura vem travada `FOR SHARE` (as funções acima): a desativação
 * simultânea espera, ou é esperada, em vez de a escolha aprovar o valor velho.
 */
export function assertEscolhaAtiva(
  registro: { name: string; isActive: boolean },
  quem: { rotulo: string; feminino?: boolean },
): void {
  if (registro.isActive) return;
  const o = quem.feminino ? 'a' : 'o';
  throw new AppError(
    `${quem.rotulo} "${registro.name}" está desativad${o} e não pode ser escolhid${o}. `
      + `Reative em Configurações ou escolha outr${o}.`,
    409,
  );
}
