import type { FastifyRequest } from 'fastify';
import { peekNextAssetTag, salvarConfiguracaoDaDescoberta } from '../use-cases/app-settings.usecase';
import { lerConfiguracaoDaDescoberta } from '../../reconciliation/helpers/discovery-settings.helper';
import { configuracaoDaDescobertaSchema } from '../schemas/settings.schema';

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
};
