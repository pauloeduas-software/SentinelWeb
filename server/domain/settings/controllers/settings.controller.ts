import type { FastifyRequest } from 'fastify';
import { peekNextAssetTag, salvarConfiguracaoDaDescoberta } from '../use-cases/app-settings.usecase';
import { lerConfiguracaoDaDescoberta } from '../../reconciliation/helpers/discovery-settings.helper';
import {
  configuracaoDaDescobertaSchema,
  configuracaoDoSistemaSchema,
} from '../schemas/settings.schema';
import {
  lerConfiguracaoDoSistema, salvarConfiguracaoDoSistema,
} from '../helpers/system-settings.helper';

export const settingsController = {
  async nextAssetTag() {
    return peekNextAssetTag();
  },

  async getDiscovery() {
    return lerConfiguracaoDaDescoberta();
  },

  async saveDiscovery(request: FastifyRequest) {
    const dados = configuracaoDaDescobertaSchema.parse(request.body ?? {});
    return salvarConfiguracaoDaDescoberta(dados);
  },

  // ── A CONFIGURAÇÃO DE SISTEMA (F10) ──────────────────────────────────────
  //
  // Mesma forma do par acima — `GET` do recorte, `PUT` com todos os campos
  // opcionais.

  async getSystem() {
    return lerConfiguracaoDoSistema();
  },

  async saveSystem(request: FastifyRequest) {
    const dados = configuracaoDoSistemaSchema.parse(request.body ?? {});
    return salvarConfiguracaoDoSistema(dados);
  },

};
