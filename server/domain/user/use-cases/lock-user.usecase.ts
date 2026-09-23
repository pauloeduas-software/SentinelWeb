import { AppError } from '../../../core/errors/app-error';

// A TRAVA DA LINHA DO COLABORADOR — o que faz o desligamento e a entrega
// pararem de se atropelar.
//
// ─────────────────────────────────────────────────────────────────────────────
// O BUG QUE ISTO FECHA, passo a passo
//
//   T1 (entrega)        lê o usuário  → `isActive: true`, segue
//   T2 (desligamento)   lê as posses  → não há nenhuma, fecha nada
//   T2                  grava `isActive = false`, `terminatedAt`  → COMMIT
//   T1                  cria a `Assignment`                        → COMMIT
//
// Resultado: um colaborador DESLIGADO com posse aberta. Os dois caminhos
// fizeram exatamente o que está escrito neles, e o estado final é o que os dois
// existem para impedir.
//
// E ele é invisível: nada falha, nada é logado como erro, e a pessoa some das
// listagens de ativos levando um equipamento no nome. Quem descobre é o
// `DELETE`, meses depois, respondendo 409 "ainda responde por 1 ativo" para um
// cadastro que a tela mostra como desligado — sem que ninguém entenda por quê.
//
// Em READ COMMITTED (o padrão do Postgres, e o nosso) NENHUM `if` pega isso: as
// duas transações leem um estado consistente de antes, e nenhuma enxerga o que
// a outra ainda não confirmou.
// ─────────────────────────────────────────────────────────────────────────────
//
// A SAÍDA é serializar as duas na linha que as duas disputam. `FOR UPDATE`
// bloqueia a segunda transação até a primeira confirmar; quando ela destrava, a
// releitura enxerga `isActive = false` e a guarda que já existe no
// `checkout-asset.usecase.ts` faz o trabalho dela.
//
// ORDEM DE TRAVAMENTO: **usuário antes de ativo**, em todo caminho que trave os
// dois. Duas transações que travam os mesmos dois recursos em ordens opostas
// travam uma à outra (deadlock), e o Postgres mata uma delas com erro. Por isso
// esta chamada é a PRIMEIRA instrução de cada transação que a usa — antes de
// ler ativo, antes de contar posse.

/**
 * O mínimo que um cliente precisa ter para travar: só o SQL cru.
 *
 * Estrutural, e não `PrismaClient`, porque quem chama é sempre o `tx` de dentro
 * de uma `$transaction` — e o tipo do cliente de transação não é o do cliente
 * global. Fora de uma transação o `FOR UPDATE` seria liberado no mesmo
 * instante e não protegeria nada.
 */
export interface ClienteQueTrava {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Trava a linha do colaborador até o fim da transação atual.
 *
 * Devolve `false` quando não existe linha nenhuma com aquele id — quem chama
 * decide se isso é 404 ("colaborador não encontrado") ou se já tinha conferido
 * antes. `travarUsuarioOuFalhar` cobre o caso comum.
 *
 * NÃO filtra `deletedAt`: travar é sobre a LINHA, e um cadastro na lixeira
 * continua sendo uma linha que o restore vai disputar. Quem decide o que fazer
 * com a lixeira é a consulta seguinte, que passa pelo escopo da extension.
 */
export async function travarUsuario(client: ClienteQueTrava, userId: string): Promise<boolean> {
  // `$queryRaw` com template tag: o `${userId}` vira parâmetro do Postgres, não
  // texto concatenado. O `::uuid` é necessário porque o parâmetro chega como
  // texto e a coluna é `uuid`.
  const linhas = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE
  `;
  return linhas.length > 0;
}

/** A mesma trava, com o 404 que todo chamador daria. */
export async function travarUsuarioOuFalhar(client: ClienteQueTrava, userId: string): Promise<void> {
  if (!(await travarUsuario(client, userId))) {
    throw new AppError('Colaborador não encontrado.', 404);
  }
}
