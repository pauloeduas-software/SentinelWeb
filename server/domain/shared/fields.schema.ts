import { z } from 'zod';

// Construtores de campo reaproveitados pelos schemas de vários domínios — as
// sete tabelas de catálogo e o ativo. Um lugar só para as regras que se repetem:
// nome, texto livre, cor, e-mail, site, dinheiro, data.
//
// Todos seguem o mesmo padrão: `''` vira `null`
// (o formulário manda string vazia quando o usuário limpa o campo) e ausente
// continua `undefined`, que o Prisma lê como "não mexe neste campo".

export const nomeObrigatorio = (rotulo = 'nome') =>
  z.string(`${rotulo} é obrigatório`)
    .trim()
    .min(1, `${rotulo} não pode ser vazio`)
    .max(200, `${rotulo}: máximo de 200 caracteres`);

export const textoOpcional = (rotulo: string, max = 500) =>
  z.string().trim().max(max, `${rotulo}: máximo de ${max} caracteres`).nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null));

// Cor em hexadecimal, porque ela vai para `style={{ color }}` no frontend — o
// Tailwind não gera classe a partir de string de runtime, então o valor precisa
// ser CSS válido por conta própria.
export const corOpcional = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'cor deve estar no formato #rrggbb')
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null));

// `z.email()` da zod 4 valida ANTES do `.trim()`; por isso o `pipe` (a mesma
// armadilha documentada na Fase 0, em user.schema.ts).
export const emailOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null))
  .pipe(z.email('e-mail inválido').max(200).nullish());

export const urlOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null))
  .pipe(z.url('endereço de site inválido').max(300).nullish());

export const booleano = (rotulo: string) => z.boolean(`${rotulo} deve ser verdadeiro ou falso`);

export const uuidObrigatorio = (rotulo: string) => z.uuid(`${rotulo}: identificador inválido`);

export const uuidOpcional = (rotulo: string) =>
  z.string().trim().nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    .pipe(z.uuid(`${rotulo}: identificador inválido`).nullish());

/**
 * Número de meses opcional.
 *
 * O `preprocess` não é zelo: `z.coerce.number()` roda `Number('')`, que é **0**.
 * Sem ele, deixar "vida útil" em branco no formulário gravaria `eolMonths = 0`
 * — ou seja, "já venceu" — em vez de `null`, e a data de EOL calculada a partir
 * disso sairia errada sem ninguém ver erro nenhum. Testado.
 */
export const mesesOpcional = (rotulo: string) =>
  z.preprocess(
    (valor) => (valor === '' ? null : valor),
    z.coerce.number(`${rotulo} deve ser um número`)
      .int(`${rotulo} deve ser um número inteiro`)
      .min(0, `${rotulo} não pode ser negativo`)
      .max(1200, `${rotulo}: máximo de 1200 meses`)
      .nullish(),
  );

export const mesesObrigatorio = (rotulo: string) =>
  z.coerce.number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser um número inteiro`)
    .min(1, `${rotulo} mínimo é 1`)
    .max(1200, `${rotulo}: máximo de 1200 meses`);

/**
 * Dinheiro. Fica STRING do começo ao fim, de propósito.
 *
 * `z.coerce.number()` converteria para ponto flutuante e reintroduziria o erro
 * de centavo que a coluna `Decimal` existe para evitar (0.1 + 0.2 =
 * 0.30000000000000004). O Prisma aceita string num campo Decimal, então a
 * string do formulário vai direto ao banco sem passar por float em lugar nenhum.
 */
export const valorMonetario = (rotulo: string) =>
  z.string(`${rotulo} é obrigatório`)
    .trim()
    .regex(/^\d{1,10}([.,]\d{1,2})?$/, `${rotulo}: use um valor como 1234.50`)
    .transform((valor) => valor.replace(',', '.'));

/**
 * Data vinda de `<input type="date">`, que manda 'AAAA-MM-DD' ou `''`.
 *
 * Interpretada em UTC de propósito. `new Date('2026-09-22')` já é UTC, mas
 * `new Date('2026-09-22T00:00')` seria hora local — e num fuso a oeste de
 * Greenwich a data gravada voltaria um dia. Data de compra é dia de calendário,
 * não instante.
 */
export const dataOpcional = (rotulo: string) =>
  z.string().trim().nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    .pipe(
      z.union([
        z.null(),
        z.undefined(),
        z.iso.date(`${rotulo}: use uma data no formato AAAA-MM-DD`).transform((valor) => new Date(`${valor}T00:00:00.000Z`)),
      ]),
    );

/** Meia-noite UTC de HOJE — o primeiro instante que ainda é hoje. */
function meiaNoiteUTC(): Date {
  const limite = new Date();
  limite.setUTCHours(0, 0, 0, 0);
  return limite;
}

/** Meia-noite UTC de AMANHÃ — o primeiro instante que já é futuro. */
function amanhaUTC(): Date {
  const limite = meiaNoiteUTC();
  limite.setUTCDate(limite.getUTCDate() + 1);
  return limite;
}

/**
 * As duas bordas do calendário, e elas são a MESMA regra vista dos dois lados.
 *
 * Moram juntas aqui, e não no schema de cada domínio, porque é isso que as
 * mantém simétricas: as duas comparam contra meia-noite UTC — a mesma
 * referência que o `dataOpcional` acima usa para construir o valor —, e duas
 * cópias em arquivos diferentes divergiriam no primeiro ajuste de fuso.
 *
 * `dataNaoFutura` — o começo de um vínculo. Uma ocupação de posto com
 * `endedAt IS NULL` já conta como ocupante ATUAL em toda consulta e no índice
 * único parcial, então "começa semana que vem" gravaria como presente quem
 * ninguém vê no posto, e ainda bloquearia o cadastro de quem está lá hoje.
 * PASSADO aqui é o caso real e aceito: a carga inicial é "a Laura ocupa a Mesa
 * 1 desde março".
 *
 * `dataNaoPassada` — o prazo de um vínculo. Uma entrega com devolução prevista
 * para ontem NASCE VENCIDA: aparece em `GET /api/assignments/overdue` no mesmo
 * segundo e dispara lembrete de algo que acabou de sair do estoque. FUTURO
 * aqui é o caso normal, e HOJE é aceito — "devolve hoje" é prazo legítimo.
 *
 * Nenhuma das duas cobre o valor ausente: campo opcional continua opcional, e
 * `null` passa. Quem exige a presença é o schema que usa o construtor.
 */
export const dataNaoFutura = (rotulo: string) =>
  dataOpcional(rotulo).refine(
    (valor) => !valor || valor < amanhaUTC(),
    `${rotulo} não pode ser uma data futura`,
  );

export const dataNaoPassada = (rotulo: string) =>
  dataOpcional(rotulo).refine(
    (valor) => !valor || valor >= meiaNoiteUTC(),
    `${rotulo} não pode ser uma data passada`,
  );

/** Dinheiro opcional. Mesma regra do obrigatório: string do início ao fim. */
export const valorMonetarioOpcional = (rotulo: string) =>
  z.string().trim().nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    .pipe(
      z.union([
        z.null(),
        z.undefined(),
        z.string().regex(/^\d{1,10}([.,]\d{1,2})?$/, `${rotulo}: use um valor como 1234.50`)
          .transform((valor) => valor.replace(',', '.')),
      ]),
    );
