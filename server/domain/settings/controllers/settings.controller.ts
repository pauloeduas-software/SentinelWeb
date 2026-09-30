import type { FastifyRequest } from 'fastify';
import { peekNextAssetTag, salvarConfiguracaoDaDescoberta } from '../use-cases/app-settings.usecase';
import { lerConfiguracaoDaDescoberta } from '../../reconciliation/helpers/discovery-settings.helper';
import {
  configuracaoDaDescobertaSchema, configuracaoDoCicloDeVidaSchema,
} from '../schemas/settings.schema';
import {
  lerConfiguracaoDoCicloDeVida, salvarConfiguracaoDoCicloDeVida,
} from '../helpers/lifecycle-settings.helper';

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

  // ── O CICLO DE VIDA (F8) ─────────────────────────────────────────────────
  //
  // `PUT` e não `PATCH`, como o da descoberta: o corpo é o conjunto da
  // configuração e todos os campos são opcionais, porque a tela salva um de cada
  // vez — mandar os dez para mudar um seria pedir ao cliente que conhecesse os
  // outros nove.

  async getLifecycle() {
    return lerConfiguracaoDoCicloDeVida();
  },

  async saveLifecycle(request: FastifyRequest) {
    const dados = configuracaoDoCicloDeVidaSchema.parse(request.body ?? {});
    return salvarConfiguracaoDoCicloDeVida(dados);
  },
};
