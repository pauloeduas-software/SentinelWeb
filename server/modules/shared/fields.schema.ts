import { z } from 'zod';
import { hojeNoBrasil } from './hoje.helper';

// Construtores de campo reaproveitados pelos schemas de vários domínios — as
// seis tabelas de catálogo e o ativo. Um lugar só para as regras que se repetem:
// nome, texto livre, e-mail, site, dinheiro, data.
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

// `z.email()` da zod 4 valida ANTES do `.trim()`; por isso o `pipe` (a mesma
// armadilha documentada na Fase 0, em user.schema.ts).
export const emailOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null))
  .pipe(z.email('e-mail inválido').max(200, 'e-mail: máximo de 200 caracteres').nullish());

// Construtor, e não constante: a tela mostra só a mensagem, e "endereço
// inválido" sem o rótulo não diz de qual campo é — o rótulo entra na frase.
//
// Só `http`/`https`: o `z.url()` sozinho aceita `javascript:` e `data:`, que
// viram XSS armazenado no dia em que o campo for exibido como link. E sem
// completar o esquema: `dell.com` é recusado, quem digita escreve o endereço
// inteiro.
export const urlOpcional = (rotulo: string) => z
  .string()
  .trim()
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null))
  .pipe(
    z.url({ protocol: /^https?$/, error: `${rotulo} inválido: use o endereço completo, com https://` })
      .max(300, `${rotulo}: máximo de 300 caracteres`)
      .nullish(),
  );

export const booleano = (rotulo: string) => z.boolean(`${rotulo} deve ser verdadeiro ou falso`);

export const uuidObrigatorio = (rotulo: string) => z.uuid(`${rotulo}: identificador inválido`);

export const uuidOpcional = (rotulo: string) =>
  z.string().trim().nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    .pipe(z.uuid(`${rotulo}: identificador inválido`).nullish());

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
    // `.nullish()` no fim, e não `z.union([z.null(), z.undefined(), …])`: a união
    // que falha em todos os ramos responde só "Invalid input", e a frase do
    // campo se perde.
    .pipe(
      z.iso.date(`${rotulo}: use uma data no formato AAAA-MM-DD`)
        .transform((valor) => new Date(`${valor}T00:00:00.000Z`))
        .nullish(),
    );

/**
 * As duas bordas do calendário, e elas são a MESMA regra vista dos dois lados —
 * as duas contra o dia de HOJE em Brasília (`hojeNoBrasil`), e não contra a
 * meia-noite UTC, que vira às 21h de Brasília: "hoje" passava a ser recusado
 * como passado, e "amanhã", aceito como presente.
 *
 * `diaNaoFuturo` — o DIA de uma entrega, de uma devolução, do começo ou do fim
 * de uma ocupação, de uma baixa, de uma compra ou de um encerramento (AN).
 * PASSADO é o caso real e aceito: a carga inicial é "a Laura está com o
 * notebook desde março". FUTURO é recusado: a ocupação ou a entrega aberta já
 * conta como presente em toda consulta, então "começa semana que vem" gravaria
 * como atual o que ninguém vê; e a compra ou o encerramento futuros descrevem o
 * que ainda não aconteceu.
 *
 * `dataNaoPassada` — o prazo de um vínculo. Uma entrega com devolução prevista
 * para ontem NASCE VENCIDA: o prazo expira no mesmo segundo em que o
 * equipamento sai, que é um cadastro que ninguém quis fazer. FUTURO aqui é o
 * caso normal, e HOJE é aceito — "devolve hoje" é prazo legítimo.
 *
 * Nenhuma das duas cobre o valor ausente: campo opcional continua opcional, e
 * `null` passa. Quem exige a presença é o schema que usa o construtor.
 */
export const diaNaoFuturo = (rotulo: string) =>
  dataOpcional(rotulo).refine(
    (valor) => !valor || valor <= hojeNoBrasil(),
    `${rotulo} não pode ser uma data futura`,
  );

export const dataNaoPassada = (rotulo: string) =>
  dataOpcional(rotulo).refine(
    (valor) => !valor || valor >= hojeNoBrasil(),
    `${rotulo} não pode ser uma data passada`,
  );

/**
 * Dinheiro opcional. Fica STRING do começo ao fim, de propósito.
 *
 * `z.coerce.number()` converteria para ponto flutuante e reintroduziria o erro
 * de centavo que a coluna `Decimal` existe para evitar (0.1 + 0.2 =
 * 0.30000000000000004). O Prisma aceita string num campo Decimal, então a
 * string do formulário vai direto ao banco sem passar por float em lugar nenhum.
 */
export const valorMonetarioOpcional = (rotulo: string) =>
  z.string().trim().nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    // `.nullish()` no fim pelo mesmo motivo do `dataOpcional`: a frase do campo.
    .pipe(
      z.string().regex(/^\d{1,10}([.,]\d{1,2})?$/, `${rotulo}: use um valor como 1234.50`)
        .transform((valor) => valor.replace(',', '.'))
        .nullish(),
    );

/**
 * A VERSÃO QUE O FORMULÁRIO LEU (AF) — o `updatedAt` do registro quando o Editar
 * abriu, devolvido como veio. Ausente, a edição não confere: é o Desativar, o
 * Reabrir, quem chama a API por fora. A conferência é `assertVersaoLida`.
 */
export const versaoLida = z.iso.datetime({ offset: true, error: 'updatedAt: use a data e hora que a leitura devolveu' })
  .transform((valor) => new Date(valor))
  .optional();
