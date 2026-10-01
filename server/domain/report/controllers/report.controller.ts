import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { relatorioDeDepreciacao } from '../use-cases/depreciation-report.usecase';
import { relatorioDePrazos } from '../use-cases/warranty-report.usecase';
import { relatorioDeAuditorias } from '../use-cases/audit-report.usecase';
import { resumirManutencoes } from '../../maintenance/use-cases/summarize-maintenances.usecase';
import { responsibilityReport } from '../use-cases/responsibility-report.usecase';
import { customReport } from '../use-cases/custom-report.usecase';
import { REPORT_TOKENS, REPORT_TOKENS_AGRUPAVEIS } from '../helpers/report-columns';

/**
 * O corpo do builder (F10, Etapa F).
 *
 * `strictObject` como em todo corpo do sistema, e o TOKEN é validado DUAS
 * vezes: aqui na forma (string, tamanho, quantidade) e no use-case contra a
 * allowlist de `report-columns.ts`, que é quem conhece os fragmentos. A segunda
 * é a que importa — ela devolve 422 com a lista dos válidos (D67).
 */
const customReportSchema = z.strictObject({
  columns: z
    .array(z.string().trim().min(1, 'coluna não pode ser vazia').max(60, 'coluna: máximo de 60 caracteres'))
    .min(1, 'escolha ao menos uma coluna')
    .max(15, 'no máximo 15 colunas'),
  agruparPor: z.string().trim().min(1).max(60).optional(),
  limit: z.number().int('limite deve ser inteiro').min(1).max(2_000).optional(),
});

// Só HTTP, e nas quatro primeiras abas nem há o que ler da requisição: elas são
// leitura agregada sem parâmetro — os limiares vêm da CONFIGURAÇÃO, não da
// query string.
//
// É de propósito: `?dias=90` na URL faria o relatório contradizer o alerta, que
// usa o valor configurado. Quem quer outro limiar muda a configuração, e as duas
// telas passam a concordar.

export const reportController = {
  async depreciacao() {
    return relatorioDeDepreciacao();
  },

  async prazos() {
    return relatorioDePrazos();
  },

  async auditorias() {
    return relatorioDeAuditorias();
  },

  /**
   * O resumo vem do DOMÍNIO de manutenção, não de um `groupBy` daqui.
   *
   * Relatório lê do domínio; ele não reimplementa o domínio. A regra de o que
   * conta como custo — ativo vivo, `Decimal` somado, garantia contada à parte —
   * mora num lugar só, e duas cópias divergiriam no primeiro ajuste.
   */
  async manutencoes() {
    return resumirManutencoes();
  },

  // ── A CAMADA 3 AGREGADA (F10, Etapa F) ───────────────────────────────────

  /**
   * O que cada pessoa responde, direto × por posto.
   *
   * Sem parâmetro, como as quatro abas acima: é a frota inteira agregada por
   * pessoa, e um recorte na query string faria a tela discordar do número que o
   * cabeçalho mostra.
   */
  async responsabilidade() {
    return responsibilityReport();
  },

  /**
   * O relatório montado pelo usuário (D67).
   *
   * `POST` e não `GET`, apesar de ser leitura: a lista de colunas é um ARRAY e
   * `?columns=a&columns=b&columns=…` com quinze itens estoura o limite prático
   * de URL de alguns proxies — e o corpo é onde um array se escreve sem
   * ambiguidade. Nada aqui grava.
   */
  async custom(request: FastifyRequest) {
    const pedido = customReportSchema.parse(request.body ?? {});
    return customReport(pedido);
  },

  /** O que o builder aceita — a tela monta o seletor com isto, sem adivinhar. */
  async camposDoBuilder() {
    return { colunas: REPORT_TOKENS, agrupaveis: REPORT_TOKENS_AGRUPAVEIS };
  },
};
