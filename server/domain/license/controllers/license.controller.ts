import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { LICENSE_SORTABLE } from '../helpers/license-audited.helper';
import {
  checkinSeatSchema, checkoutSeatSchema,
  createLicenseSchema, updateLicenseSchema,
} from '../schemas/license.schema';
import { listLicenses } from '../use-cases/list-licenses.usecase';
import { getLicense } from '../use-cases/get-license.usecase';
import { createLicense } from '../use-cases/create-license.usecase';
import { updateLicense } from '../use-cases/update-license.usecase';
import { deleteLicense } from '../use-cases/delete-license.usecase';
import { restoreLicense } from '../use-cases/restore-license.usecase';
import { listLicenseSeats } from '../use-cases/list-license-seats.usecase';
import { checkoutSeat } from '../use-cases/checkout-seat.usecase';
import { checkinSeat } from '../use-cases/checkin-seat.usecase';
import { revealProductKey } from '../use-cases/reveal-product-key.usecase';
import { listLicenseHistory } from '../use-cases/license-history.usecase';
import { listAssetSeats } from '../use-cases/list-asset-seats.usecase';

// Só HTTP: lê a requisição, chama o use-case, responde.
//
// Sem try/catch em lugar nenhum — no Fastify, handler async que rejeita cai
// sozinho no `errorHandler`. O `parse` do schema devolve 422 com o campo que
// falhou, e os `AppError` dos use-cases (409 de sem assento, 404 de licença
// inexistente, 422 de chave sem criptografia) saem pelo mesmo caminho.

export const licenseController = {
  async list(request: FastifyRequest) {
    const query = parseListQuery(request.query, {
      sortable: LICENSE_SORTABLE,
      defaultSort: 'name',
      defaultOrder: 'asc',
      // A licença TEM lixeira, como o estoque (D36) e pelo mesmo motivo: apagar
      // de verdade levaria junto o histórico de quem ocupou cada assento, que é
      // a única coisa da fase que não se reconstrói.
      trashable: true,
    });

    return listLicenses(query);
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getLicense(id);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createLicenseSchema.parse(request.body ?? {});
    const licenca = await createLicense(data, atorDaRequisicao(request));
    return reply.status(201).send(licenca);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateLicenseSchema.parse(request.body ?? {});
    return updateLicense(id, data, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    await deleteLicense(id, atorDaRequisicao(request));
    return reply.status(204).send();
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreLicense(id, atorDaRequisicao(request));
  },

  /** A grade de assentos: livre · pessoa · ativo · queimado · aposentado. */
  async seats(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listLicenseSeats(id);
  },

  /**
   * 201: a entrega CRIA uma ocupação. Quem escolhe o assento é o SERVIDOR — o
   * corpo não tem `seatId`, e não tê-lo é o que fecha a corrida.
   */
  async checkoutSeat(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutSeatSchema.parse(request.body ?? {});
    const checkout = await checkoutSeat(id, data, atorDaRequisicao(request));
    return reply.status(201).send(checkout);
  },

  /**
   * 200, e não 201: a devolução FECHA a ocupação que já existia.
   *
   * O `:id` aqui é o do ASSENTO, não o da ocupação: a tela tem a grade de
   * assentos na mão e clica no quadrado. É também o que a queima exige — ela
   * escreve na linha do assento.
   */
  async checkinSeat(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkinSeatSchema.parse(request.body ?? {});
    return checkinSeat(id, data, atorDaRequisicao(request));
  },

  /** Revela a chave — e grava `VIEW_KEY` na MESMA transação. */
  async productKey(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return revealProductKey(id, atorDaRequisicao(request));
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return listLicenseHistory(id, limit);
  },

  /** A aba Licenças da tela do ativo. O `:id` é o do ATIVO. */
  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetSeats(id);
  },
};
