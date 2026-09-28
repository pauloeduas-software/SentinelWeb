import { prisma } from '../../../core/database/prismaClient';
import { horaLocal, turnoPelaHora } from '../helpers/shift.helper';

// O RESUMO DA JANELA — quem apareceu nesta máquina, em quantos dias, em que
// faixa de hora.
//
// Uma leitura, dois clientes: a sugestão de posse (Etapa E) e a detecção de
// posto compartilhado (Etapa F) fazem a MESMA pergunta ao banco e discordam só
// na resposta. Duas consultas iguais em dois arquivos divergiriam no primeiro
// ajuste da janela — e aí "recorrente" passaria a significar duas coisas.

/** A janela que define "recorrente". 14 dias cobre duas semanas de escala. */
export const DIAS_DA_JANELA = 14;

/**
 * Quantos dias distintos uma pessoa precisa aparecer para contar.
 *
 * Três, e não um: uma pessoa que logou UMA vez na máquina de outra para imprimir
 * um documento não é ocupante de nada. O número é baixo o bastante para pegar
 * quem trabalha ali e alto o bastante para descartar a visita.
 */
export const DIAS_PARA_SER_RECORRENTE = 3;

export interface PresencaObservada {
  userKey: string;
  /** Null quando a conta não casou com ninguém do cadastro (D46). */
  userId: string | null;
  dias: number;
  amostras: number;
  /** Hora LOCAL em que a pessoa costuma aparecer — a base do turno. */
  horas: number[];
  turnoSugerido: string | null;
  primeiroDia: Date;
  ultimoDia: Date;
}

/**
 * As presenças da janela, ordenadas da mais recorrente para a menos.
 *
 * `chavesIgnoradas` é a allowlist do D101, aplicada AQUI e não em quem chama:
 * o técnico de TI que loga em 40 máquinas para dar suporte não deve gerar
 * sugestão de posse nem de posto compartilhado, e são dois chamadores — filtrar
 * num só deixaria o outro com a fila cheia de ruído.
 */
export async function resumirObservacoes(
  endpointId: string,
  chavesIgnoradas: Set<string>,
  dias: number = DIAS_DA_JANELA,
): Promise<PresencaObservada[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const linhas = await prisma.endpointUserDaily.findMany({
    where: { endpointId, day: { gte: desde } },
    select: { userKey: true, userId: true, day: true, firstSeenAt: true, lastSeenAt: true, samples: true },
    orderBy: { day: 'asc' },
  });

  const porChave = new Map<string, PresencaObservada>();

  for (const linha of linhas) {
    if (chavesIgnoradas.has(linha.userKey)) continue;

    const atual = porChave.get(linha.userKey);
    // A hora do PRIMEIRO contato do dia é a que descreve o turno: a última pode
    // ser a máquina esquecida ligada de madrugada, e a média entre as duas
    // transformaria manhã + esquecimento em "Tarde".
    const hora = horaLocal(linha.firstSeenAt);

    if (!atual) {
      porChave.set(linha.userKey, {
        userKey: linha.userKey,
        userId: linha.userId,
        dias: 1,
        amostras: linha.samples,
        horas: [hora],
        turnoSugerido: null,
        primeiroDia: linha.day,
        ultimoDia: linha.day,
      });
      continue;
    }

    atual.dias += 1;
    atual.amostras += linha.samples;
    atual.horas.push(hora);
    atual.ultimoDia = linha.day;
    // O casamento mais recente vence: se a pessoa ganhou `username` no cadastro
    // ontem, é o de ontem que vale.
    atual.userId = linha.userId ?? atual.userId;
  }

  const presencas = [...porChave.values()];
  for (const presenca of presencas) presenca.turnoSugerido = turnoPelaHora(presenca.horas);

  return presencas.sort((a, b) => b.dias - a.dias || b.amostras - a.amostras);
}

/** Só quem apareceu o suficiente para não ser visita. */
export function recorrentes(presencas: PresencaObservada[]): PresencaObservada[] {
  return presencas.filter((presenca) => presenca.dias >= DIAS_PARA_SER_RECORRENTE);
}
