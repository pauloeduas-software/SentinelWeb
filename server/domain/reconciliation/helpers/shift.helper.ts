import { horaLocalEm } from '../../../core/time/local-day';

// O TURNO INFERIDO PELA HORA EM QUE A PESSOA APARECE — função pura.
//
// ─────────────────────────────────────────────────────────────────────────────
// A PRIMEIRA ARMADILHA: os timestamps do banco são UTC, e o turno é da hora
// LOCAL. Inferir sobre UTC joga o começo do expediente (7h em São Paulo) para as
// 10h, e o turno da noite para a madrugada do dia seguinte — rotulando tudo
// errado, com a confiança de quem fez uma conta.
//
// Por isso a conversão é explícita e o fuso é um parâmetro com padrão, nunca o
// `getHours()` do `Date`, que usa o fuso do PROCESSO: o servidor roda em UTC em
// produção e no fuso de quem desenvolve na máquina local, e o mesmo dado
// produziria rótulos diferentes nos dois.
// ─────────────────────────────────────────────────────────────────────────────
// A SEGUNDA ARMADILHA, e ela custou um rótulo sistematicamente errado: **hora é
// grandeza CIRCULAR, e média de grandeza circular não significa nada.**
//
// A primeira versão tirava a média aritmética das horas e cortava em 12 e 18.
// Para quem trabalha 22h–2h as horas observadas são `[22, 23, 0, 1]` — média
// 11,5, e o plantão da noite era rotulado **"Manhã"**. Não é caso de borda: é o
// turno da noite comum, todas as noites, e o erro é do tipo que ninguém
// contesta porque o sistema apresentou um número.
//
// Agora cada hora é classificada no turno a que ela pertence e o rótulo é a
// MODA — o turno que mais aparece. Classificar antes e contar depois é o que
// faz a meia-noite deixar de ser um precipício no meio da conta.
// ─────────────────────────────────────────────────────────────────────────────

// O FUSO PADRÃO — e a partir da F8 ele é só o PADRÃO, não a verdade (D123).
//
// `AppSetting.timezone` passou a existir, e quem chama a inferência de turno
// entrega o valor configurado (o job lê a configuração uma vez por rodada e o
// propaga). A constante fica porque esta é uma função PURA — ela não pode
// consultar o banco — e porque um parâmetro obrigatório aqui só empurraria a
// mesma decisão para cada chamador de teste.
export const FUSO_PADRAO = 'America/Sao_Paulo';

/**
 * A hora do dia (0–23) naquele fuso, para um instante em UTC.
 *
 * A conversão em si mora em `core/time/local-day.ts` desde a F8: a janela do job
 * diário precisa da mesma travessia (hora de parede ↔ instante UTC), e duas
 * implementações de `Intl` divergiriam justamente no caso que ninguém testa — a
 * virada do horário de verão.
 */
export function horaLocal(instante: Date, fuso: string = FUSO_PADRAO): number {
  return horaLocalEm(instante, fuso);
}

export type Turno = 'Manhã' | 'Tarde' | 'Noite';

/**
 * A que turno pertence uma hora do dia.
 *
 * **A MADRUGADA É NOITE**, e é essa linha que corrige o defeito: 0h–5h é a
 * continuação do plantão que começou às 22h, não o começo da manhã. A versão
 * anterior punha 0h–11h em "Manhã" porque comparava `hora < 12`, e com isso
 * metade das horas de um turno noturno contava para o turno oposto.
 */
export function turnoDaHora(hora: number): Turno {
  if (hora >= 6 && hora < 12) return 'Manhã';
  if (hora >= 12 && hora < 18) return 'Tarde';
  return 'Noite';
}

/**
 * O rótulo mais provável para uma faixa de horas — ou `null` quando não há um.
 *
 * `shift` é TEXTO LIVRE (D15) e isto devolve só um palpite: quem confirma é
 * gente. O que mudou é que o palpite agora é a MODA dos turnos observados, e não
 * a média das horas.
 *
 * **EMPATE DEVOLVE `null`, e isso é o D46 aplicado ao turno.** Uma escala 12x36
 * produz horas em dois turnos com a mesma frequência (`[7, 19]`): a média dizia
 * "Tarde", que está errado para os dois lados; escolher um dos dois empatados
 * seria inventar precisão que a evidência não tem. Sem rótulo, a ocupação nasce
 * sem turno e quem cadastra escreve o que é — que é exatamente o motivo de a
 * coluna ser texto e não enum.
 */
export function turnoPelaHora(horas: number[]): Turno | null {
  if (horas.length === 0) return null;

  const contagem = new Map<Turno, number>();
  for (const hora of horas) {
    const turno = turnoDaHora(hora);
    contagem.set(turno, (contagem.get(turno) ?? 0) + 1);
  }

  const ordenada = [...contagem.entries()].sort(([, a], [, b]) => b - a);
  const [turno, vezes] = ordenada[0];

  // Mais de um turno com a contagem máxima: não há moda, e a resposta honesta é
  // "não sei".
  if (ordenada.some(([outro, quantas]) => outro !== turno && quantas === vezes)) return null;

  return turno;
}
