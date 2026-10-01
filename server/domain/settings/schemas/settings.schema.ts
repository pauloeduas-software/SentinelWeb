import { z } from 'zod';
import { corObrigatoria } from '../../shared/fields.schema';

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
  userDailyRetentionDays: inteiroEntre('retenção da observação de uso', 7, 365).optional(),

  /**
   * A allowlist de contas ignoradas (D101).
   *
   * Teto de 100 entradas: passou disso, o que existe não é uma lista de exceções
   * e sim uma política — e política de conta de serviço não se escreve numa
   * caixa de texto.
   */
  ignoredUserKeys: z
    .array(z.string().trim().min(1, 'conta ignorada não pode ser vazia').max(64, 'conta ignorada: máximo de 64 caracteres'))
    .max(100, 'no máximo 100 contas ignoradas')
    .optional(),
});


// ── O CICLO DE VIDA E OS ALERTAS (F8) ──────────────────────────────────────
//
// Os tetos e os pisos têm a mesma função dos da descoberta: impedir que uma
// configuração transforme o painel em alarme. `warrantyAlertDays: 0` faria o
// aviso chegar no dia do vencimento, quando não há mais o que fazer;
// `auditIntervalMonths: 0` faria a frota inteira nascer com conferência vencida.

export const configuracaoDoCicloDeVidaSchema = z.strictObject({
  alertsEnabled: z.boolean('alertas ligados deve ser verdadeiro ou falso').optional(),

  /**
   * Os destinatários. Cada um validado como e-mail, e o teto é de DEZ.
   *
   * Passou de dez, o que existe não é uma lista de avisados: é uma lista de
   * distribuição, e lista de distribuição se administra no servidor de e-mail — não
   * numa caixa de texto que ninguém revisa.
   */
  alertEmails: z
    .array(z.string().trim().pipe(z.email('destinatário inválido: use um e-mail')))
    .max(10, 'no máximo 10 destinatários')
    .optional(),

  /**
   * O webhook. Validado na FORMA aqui e no DESTINO a cada envio (D126).
   *
   * Recusar `http` já nesta borda é o que dá a mensagem certa para quem está
   * digitando — o job só poderia recusar em silêncio, num log que a tela não
   * mostra. As duas validações existem porque a coluna também é escrita por
   * caminhos que não passam por aqui (um dump restaurado, um UPDATE à mão).
   */
  alertWebhookUrl: z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor === undefined ? undefined : valor || null))
    .pipe(
      z.union([
        z.null(),
        z.undefined(),
        z.url('endereço de webhook inválido')
          .max(500, 'webhook: máximo de 500 caracteres')
          .refine(
            // `new URL().protocol`, e NÃO `startsWith('https://')`.
            //
            // Esquema de URL é case-INSENSITIVE por especificação, e o `startsWith`
            // não é: `HTTPS://hooks.slack.com/x` era recusado aqui com a frase
            // "somente https é aceito" — dita a quem acabou de digitar https. Pior,
            // a validação de runtime (`destino-seguro.ts`) usa `url.protocol` e
            // ACEITAVA a mesma string, então as duas metades do D126 discordavam:
            // a borda era mais estrita que a defesa, e estrita pelo motivo errado.
            //
            // O `try` é formalidade — o `z.url()` acima já garantiu que parseia —,
            // mas um `refine` que pode lançar viraria 500 em vez de 422.
            (valor) => {
              try {
                return new URL(valor).protocol === 'https:';
              } catch {
                return false;
              }
            },
            'somente https é aceito no webhook de alertas',
          ),
      ]),
    )
    .optional(),

  warrantyAlertDays: inteiroEntre('antecedência do aviso de garantia', 1, 365).optional(),
  eolAlertDays: inteiroEntre('antecedência do aviso de fim de vida', 1, 730).optional(),
  maintenanceOpenDays: inteiroEntre('dias para manutenção em aberto virar alerta', 1, 365).optional(),
  auditIntervalMonths: inteiroEntre('intervalo de auditoria em meses', 1, 120).optional(),
  auditWarningDays: inteiroEntre('antecedência do aviso de auditoria', 1, 365).optional(),

  alertHour: inteiroEntre('hora do disparo', 0, 23).optional(),

  /**
   * O FUSO, validado contra o banco de fusos do próprio Node.
   *
   * `Intl.supportedValuesOf('timeZone')` seria a lista, e a checagem por exceção é
   * mais barata e cobre os apelidos que a lista não traz. Um fuso inválido aqui
   * faria o job calcular a janela com `RangeError` a cada tick — e o alerta pararia
   * de sair sem ninguém mexer em nada.
   */
  timezone: z
    .string()
    .trim()
    .min(1, 'fuso horário não pode ser vazio')
    .max(64, 'fuso horário: máximo de 64 caracteres')
    .refine((valor) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: valor });
        return true;
      } catch {
        return false;
      }
    }, 'fuso horário desconhecido: use um nome como America/Sao_Paulo')
    .optional(),
});


// ── A CONFIGURAÇÃO DE SISTEMA (F10, D65) ───────────────────────────────────
//
// Marca, formato e backup. Os três grupos de validação daqui têm o mesmo
// objetivo e ele não é zelo: `locale`, `dateFormat` e `currency` são lidos pela
// TELA para formatar número e data. Um valor que o `Intl` não conhece não vira
// texto errado — ele LANÇA `RangeError` no primeiro `toLocaleString`, e a tela
// que estava mostrando a lista de ativos fica em branco. Validar aqui é a
// diferença entre um 422 no campo e uma página morta.

/** Os formatos que a tela sabe desenhar. String livre aqui viraria `Invalid Date`. */
const FORMATOS_DE_DATA = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

/**
 * Os delimitadores que o export escreve e o import oferece.
 *
 * Lista fechada, e curta de propósito: um delimitador de dois caracteres, ou um
 * `"`, produziria um CSV que nenhum programa lê de volta — e o export é a
 * entrada do importador (D69).
 */
const DELIMITADORES = [';', ',', '|', '\t'] as const;

export const configuracaoDoSistemaSchema = z.strictObject({
  companyName: z
    .string('nome da empresa é obrigatório')
    .trim()
    .min(1, 'nome da empresa não pode ser vazio')
    .max(200, 'nome da empresa: máximo de 200 caracteres')
    .optional(),

  primaryColor: corObrigatoria('cor de destaque').optional(),

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

  csvDelimiter: z
    .enum(DELIMITADORES, 'delimitador inválido: use ; , | ou tabulação')
    .optional(),

  /**
   * A retenção do backup, em dias.
   *
   * Piso de 1 e não de 0: `0` apagaria o dump no mesmo expurgo que roda depois
   * de criá-lo, e "backup com retenção zero" é uma forma elaborada de não ter
   * backup. O teto de 3650 (dez anos) existe para o número continuar sendo uma
   * política e não um esquecimento.
   */
  backupRetentionDays: inteiroEntre('retenção do backup em dias', 1, 3650).optional(),
});
