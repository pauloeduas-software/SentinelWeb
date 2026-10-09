import type { FastifyRequest } from 'fastify';
import { relatorioDePrazos } from '../use-cases/warranty-report.usecase';
import { responsibilityReport } from '../use-cases/responsibility-report.usecase';
import { temPapel } from '../../access/helpers/require-permission';


// Só HTTP, e nas duas abas que sobraram (D154) nem há o que ler da requisição:
// elas são leitura agregada sem parâmetro — os limiares vêm da CONFIGURAÇÃO, não da
// query string.
//
// É de propósito: `?dias=90` na URL faria o relatório contradizer o alerta, que
// usa o valor configurado. Quem quer outro limiar muda a configuração, e as duas
// telas passam a concordar.

export const reportController = {
  /** Garantia e fim de vida vencendo — os limiares vêm da configuração. */
  async prazos() {
    return relatorioDePrazos();
  },

  // ── A CAMADA 3 AGREGADA (F10, Etapa F) ───────────────────────────────────

  /**
   * O que cada pessoa responde, direto × por posto.
   *
   * Sem parâmetro, como a aba de prazos: é a frota inteira agregada por
   * pessoa, e um recorte na query string faria a tela discordar do número que o
   * cabeçalho mostra.
   */
  async responsabilidade(request: FastifyRequest) {
    return responsibilityReport(temPapel(request, 'ADMIN'));
  },

};
