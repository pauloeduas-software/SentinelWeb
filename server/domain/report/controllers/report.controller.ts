import { relatorioDeDepreciacao } from '../use-cases/depreciation-report.usecase';
import { relatorioDePrazos } from '../use-cases/warranty-report.usecase';
import { relatorioDeAuditorias } from '../use-cases/audit-report.usecase';
import { resumirManutencoes } from '../../maintenance/use-cases/summarize-maintenances.usecase';

// Só HTTP, e aqui nem há o que ler da requisição: as quatro abas são leitura
// agregada sem parâmetro — os limiares vêm da CONFIGURAÇÃO, não da query string.
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
};
