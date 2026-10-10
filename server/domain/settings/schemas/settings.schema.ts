import { z } from 'zod';

// Contrato da configuração da descoberta (F7).
//
// Os tetos e os pisos não são decoração: são o que impede uma configuração de
// transformar o painel inteiro em alarme. `ghostDays: 0` faria toda a frota
// virar fantasma no dia seguinte; `shadowHours: 0` faria cada máquina nova
// nascer como Shadow IT antes de o primeiro handshake terminar de chegar.
const inteiroEntre = (rotulo: string, min: number, max: number) =>
  z
    .number(`${rotulo} deve ser um número`)
    .int(`${rotulo} deve ser inteiro`)
    .min(min, `${rotulo}: mínimo de ${min}`)
    .max(max, `${rotulo}: máximo de ${max}`);

export const configuracaoDaDescobertaSchema = z.strictObject({
  discoveryMode: z.enum(['OFF', 'SUGGEST', 'ON'], 'modo de descoberta inválido').optional(),
  ghostDays: inteiroEntre('dias para ativo fantasma', 1, 365).optional(),
  shadowHours: inteiroEntre('horas para Shadow IT', 1, 720).optional(),
});



// ── A CONFIGURAÇÃO DE SISTEMA (F10, D65) ───────────────────────────────────
//
// Marca e formato. Os grupos de validação daqui têm o mesmo
// objetivo e ele não é zelo: `locale`, `dateFormat` e `currency` são lidos pela
// TELA para formatar número e data. Um valor que o `Intl` não conhece não vira
// texto errado — ele LANÇA `RangeError` no primeiro `toLocaleString`, e a tela
// que estava mostrando a lista de ativos fica em branco. Validar aqui é a
// diferença entre um 422 no campo e uma página morta.

/** Os formatos que a tela sabe desenhar. String livre aqui viraria `Invalid Date`. */
const FORMATOS_DE_DATA = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

export const configuracaoDoSistemaSchema = z.strictObject({


  /**
   * O idioma, conferido contra o banco de locales do próprio Node.
   *
   * `Intl.NumberFormat` em vez de uma lista nossa: a lista envelheceria, e a
   * checagem por exceção aceita exatamente o que a tela vai conseguir usar —
   * que é o critério que importa aqui.
   */
  locale: z
    .string()
    .trim()
    .min(2, 'idioma não pode ser vazio')
    .max(35, 'idioma: máximo de 35 caracteres')
    .refine((valor) => {
      try {
        new Intl.NumberFormat(valor);
        return true;
      } catch {
        return false;
      }
    }, 'idioma desconhecido: use um código como pt-BR')
    .optional(),

  dateFormat: z
    .enum(FORMATOS_DE_DATA, `formato de data inválido: use ${FORMATOS_DE_DATA.join(', ')}`)
    .optional(),

  /**
   * Moeda ISO 4217, conferida contra a LISTA de moedas do Node.
   *
   * `new Intl.NumberFormat(locale, { currency })` NÃO serve aqui, e isso foi
   * medido: ele aceita `XQZ` sem reclamar — a especificação só exige que o
   * código seja bem-formado (três letras), não que exista. O primeiro teste
   * desta aba passou com uma moeda inventada, e a mensagem dizia "moeda
   * desconhecida" sem ter conferido nada.
   *
   * `Intl.supportedValuesOf('currency')` são as 162 moedas que o runtime
   * conhece de verdade. O `catch` cobre runtime sem o método: aí vale a
   * checagem de forma, que é melhor que recusar tudo.
   */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'moeda: use o código de três letras, como BRL')
    .refine((valor) => {
      try {
        return Intl.supportedValuesOf('currency').includes(valor);
      } catch {
        return /^[A-Z]{3}$/.test(valor);
      }
    }, 'moeda desconhecida: use um código como BRL, USD ou EUR')
    .optional(),

});
