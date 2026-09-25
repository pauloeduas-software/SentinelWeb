import { AppError } from '../../../core/errors/app-error';
import {
  contarAssentosDe, travarTodosOsAssentos,
  type ClienteLicenca, type ClienteQueTrava,
} from '../helpers/license-seats.helper';

// A RECONCILIAÇÃO DO CONTRATO — `seatsTotal` e as linhas, sempre juntos.
//
// ═════════════════════════════════════════════════════════════════════════════
// A INVARIANTE 11, e ela é a razão deste arquivo existir:
//
//     COUNT(assentos sem `retiredAt`) = `seatsTotal`, SEMPRE.
//
// É a única das invariantes da F6 que o banco NÃO garante sozinho — ela
// atravessa duas tabelas, e um CHECK não enxerga a outra. Então ela mora aqui,
// numa função só, e é provada por `tests/licencas/reconciliacao.test.ts`.
//
// Atualizar a licença e mexer nos assentos em dois passos deixaria a janela em
// que o relatório mostra 50 comprados e 40 existentes. Por isso esta função
// recebe o `tx` e NUNCA abre transação própria.
// ═════════════════════════════════════════════════════════════════════════════
//
// ─────────────────────────────────────────────────────────────────────────────
// QUEM RECONCILIA TRAVA TUDO (D90)
//
// `travarTodosOsAssentos` é a primeira coisa que acontece, e sem ela esta
// função está errada de um jeito que nenhum teste de um usuário pega: ela lê
// "2 livres", marca os dois `retiredAt`, e uma entrega simultânea — que trava
// O ASSENTO, não a licença — leva um deles no meio. O assento termina ocupado e
// aposentado ao mesmo tempo: fora da conta de livres, fora da conta de
// comprados, e na mão de alguém.
//
// Depois de segurar os N assentos, nenhum checkout pode estar em voo: o que
// começou antes já confirmou (e a contagem abaixo o enxerga, porque em READ
// COMMITTED a consulta seguinte à aquisição do lock lê o estado confirmado), e
// o que chegar depois vê tudo travado, pula tudo e recebe o 409 de "sem assento
// livre" — o mesmo falso 409 que o D41 já declara como preço.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoDaReconciliacao {
  criados: number;
  aposentados: number;
}

/**
 * Deixa o número de assentos NÃO APOSENTADOS igual a `seatsTotal`.
 *
 * Chamada pela criação (de zero a N) e pela edição (de N para M). Idempotente:
 * chamada com o número que já vale, não faz nada e devolve zeros.
 */
export async function reconciliarAssentos(
  tx: ClienteLicenca & ClienteQueTrava,
  licenseId: string,
  seatsTotal: number,
): Promise<ResultadoDaReconciliacao> {
  await travarTodosOsAssentos(tx, licenseId);

  const vivos = await tx.licenseSeat.count({ where: { licenseId, retiredAt: null } });

  if (vivos === seatsTotal) return { criados: 0, aposentados: 0 };
  if (vivos < seatsTotal) return { criados: await criarAssentos(tx, licenseId, seatsTotal - vivos), aposentados: 0 };

  return { criados: 0, aposentados: await aposentarAssentos(tx, licenseId, vivos - seatsTotal) };
}

/**
 * Insere os assentos que faltam, numerando a partir de `MAX(seatNumber) + 1`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `MAX + 1`, NUNCA `COUNT + 1`.
 *
 * A linha APOSENTADA continua na tabela — é isso que separa `retiredAt` de um
 * `DELETE` —, então a contagem de vivos não diz qual número está livre. Um
 * contrato que foi 5 → 3 → 5 tem os números 1..5 gravados, dois deles
 * aposentados; `COUNT + 1` tentaria criar 4 e 5 de novo e colidiria com
 * `license_seats_numero`. O P2002 resultante viraria "Registro já existe" pelo
 * error-handler — uma frase que não ensina nada a quem só aumentou o contrato.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `createMany` e não N `create`: são N linhas idênticas menos o número, e um
 * laço faria N viagens ao banco dentro de uma transação que já segura travas.
 */
async function criarAssentos(
  tx: ClienteLicenca,
  licenseId: string,
  quantos: number,
): Promise<number> {
  const { _max } = await tx.licenseSeat.aggregate({
    where: { licenseId },
    _max: { seatNumber: true },
  });
  const proximo = (_max.seatNumber ?? 0) + 1;

  await tx.licenseSeat.createMany({
    data: Array.from({ length: quantos }, (_, i) => ({ licenseId, seatNumber: proximo + i })),
  });

  return quantos;
}

/**
 * Aposenta os assentos LIVRES de maior número.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÓ ASSENTO LIVRE É APOSENTADO, e as duas consequências disso são desejadas:
 *
 * 1. `burnedAt` e `retiredAt` ficam DISJUNTOS na prática, sem precisar de um
 *    CHECK para isso — um assento queimado não é livre, então nunca é escolhido
 *    aqui. É o que faz a conta do D92 fechar: `queimados` conta só os não
 *    aposentados, e nenhum assento cai nas duas listas.
 *
 * 2. Encolher o contrato abaixo do que está EM USO é recusado com 409, com os
 *    números na frase. A alternativa — aposentar um assento ocupado — tiraria
 *    silenciosamente de alguém uma licença que ele está usando, e o inventário
 *    não teria como mostrar isso: o assento sumiria da conta com a ocupação
 *    ainda aberta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DE MAIOR NÚMERO PARA MENOR (`desc`): encolher de 8 para 6 aposenta os
 * assentos 8 e 7, deixando a numeração dos vivos contígua a partir de 1. O
 * contrário deixaria o contrato com os assentos 3 e 4 vivos e o 1 e o 2
 * aposentados — legível para o banco, incompreensível na grade da tela.
 */
async function aposentarAssentos(
  tx: ClienteLicenca & ClienteQueTrava,
  licenseId: string,
  quantos: number,
): Promise<number> {
  const contagem = await contarAssentosDe(tx, licenseId);

  if (contagem.livres < quantos) {
    // A SAÍDA DEPENDE DE QUEM ESTÁ BLOQUEANDO, e mandar a frase errada faz o
    // operador tentar uma ação que não existe. Faltando assento livre, ou há
    // ocupação a devolver, ou o que sobrou é QUEIMA — e queima não volta: um
    // contrato com 3 assentos queimados não desce abaixo de 3 sem apagar o
    // registro da perda, que é exatamente o que `burnedAt` existe para guardar
    // (D43). Aposentar um queimado também quebraria a disjunção que a conta do
    // D92 assume.
    const saida = contagem.ocupados > 0
      ? 'Devolva assentos antes de reduzir.'
      : `${contagem.queimados} ${contagem.queimados === 1 ? 'assento está queimado' : 'assentos estão queimados'} `
        + 'e não voltam ao contrato: este é o piso do contrato enquanto a perda estiver registrada.';

    throw new AppError(
      `Não há assentos livres suficientes para reduzir o contrato: ${quantos} precisariam ser `
      + `aposentados e só ${contagem.livres} ${contagem.livres === 1 ? 'está livre' : 'estão livres'}. `
      + saida,
      409,
      { precisaAposentar: quantos, ...contagem },
    );
  }

  // Os LIVRES: sem aposentadoria, sem queima e sem ocupação aberta. As três
  // condições são a mesma definição do `pegarAssentoLivre` — e têm que
  // continuar sendo, senão a contagem acima autoriza aposentar um assento que
  // esta consulta não encontra e o `updateMany` afeta menos linhas do que
  // deveria, em silêncio.
  const livres = await tx.licenseSeat.findMany({
    where: {
      licenseId,
      retiredAt: null,
      burnedAt: null,
      checkouts: { none: { checkinAt: null } },
    },
    select: { id: true },
    orderBy: { seatNumber: 'desc' },
    take: quantos,
  });

  const aposentadoEm = new Date();
  const { count } = await tx.licenseSeat.updateMany({
    where: { id: { in: livres.map((assento) => assento.id) } },
    data: { retiredAt: aposentadoEm },
  });

  // Defesa contra a divergência acima virar silêncio. Chegar aqui significa que
  // a contagem e a busca discordaram — o que só é possível se alguém mudar uma
  // sem a outra — e a transação inteira volta atrás em vez de deixar
  // `seatsTotal` apontando para um número de linhas que não existe.
  if (count !== quantos) {
    throw new AppError(
      'Falha ao reduzir o contrato: a contagem de assentos livres mudou durante a operação. '
      + 'Tente novamente.',
      409,
      { esperado: quantos, aposentados: count },
    );
  }

  return count;
}
