import type { FastifyReply, FastifyRequest } from 'fastify';
import { SEM_PARAMETROS } from '../../../core/http/sem-parametros';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import {
  checkinLicenseSchema, checkoutKeySchema, checkoutLicenseSchema,
  createLicenseSchema, licenseFiltersSchema, updateLicenseSchema,
} from '../schemas/license.schema';
import { listLicenses } from '../use-cases/list-licenses.usecase';
import { getLicense } from '../use-cases/get-license.usecase';
import { createLicense } from '../use-cases/create-license.usecase';
import { updateLicense } from '../use-cases/update-license.usecase';
import { deleteLicense } from '../use-cases/delete-license.usecase';
import { terminateLicense } from '../use-cases/terminate-license.usecase';
import { listLicenseCheckouts } from '../use-cases/list-license-checkouts.usecase';
import { checkoutLicense } from '../use-cases/checkout-license.usecase';
import { checkinLicense } from '../use-cases/checkin-license.usecase';
import { updateCheckoutKey } from '../use-cases/update-checkout-key.usecase';
import { listLicenseHistory } from '../use-cases/license-history.usecase';
import { listAssetLicenses } from '../use-cases/list-target-checkouts.usecase';

// Só HTTP: lê a requisição, chama o use-case, responde.
//
// Sem try/catch em lugar nenhum — no Fastify, handler async que rejeita cai
// sozinho no `errorHandler`. O `parse` do schema devolve 422 com o campo que
// falhou, e os `AppError` dos use-cases (409 de sem licença livre, 404 de
// licença inexistente) saem pelo mesmo caminho.

/** As duas listas do detalhe — com quem está e o histórico — andam de 15 em 15. */
const POR_PAGINA_NO_DETALHE = 15;

export const licenseController = {
  async list(request: FastifyRequest) {
    // A query tem DOIS donos e é separada antes de qualquer `parse`, como no
    // `workstation.controller.ts`: `categoryId`, `view`, `status` e `emUso` são
    // nossos, o resto é do `parseListQuery`, que é estrito e responderia 422 a
    // uma chave que não conhece. Sem `trashable` — a licença não tem lixeira (AA).
    const { categoryId, view, status, emUso, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;
    const filtros = licenseFiltersSchema.parse({
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(view === undefined ? {} : { view }),
      ...(status === undefined ? {} : { status }),
      ...(emUso === undefined ? {} : { emUso }),
    });

    return listLicenses(parseListQuery(paginacao), filtros);
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getLicense(id);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createLicenseSchema.parse(request.body ?? {});
    const licenca = await createLicense(data);
    return reply.status(201).send(licenca);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateLicenseSchema.parse(request.body ?? {});
    return updateLicense(id, data);
  },

  /** Exclusão DEFINITIVA — para o cadastro errado. A licença que acabou se encerra. */
  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    await deleteLicense(id);
    return reply.status(204).send();
  },

  async terminate(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    SEM_PARAMETROS.parse(request.body ?? {});
    return terminateLicense(id);
  },

  /** Quem está com a licença agora — 15 por página, com busca pelo nome. */
  async checkouts(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listLicenseCheckouts(id, parseListQuery(request.query, { perPage: POR_PAGINA_NO_DETALHE }));
  },

  /** 201: a entrega CRIA uma linha. */
  async checkout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutLicenseSchema.parse(request.body ?? {});
    const entrega = await checkoutLicense(id, data);
    return reply.status(201).send(entrega);
  },

  /** 200: a devolução FECHA a entrega que já existia. O `:id` é o da ENTREGA. */
  async checkin(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // Só a data da devolução, e opcional: ausente é hoje.
    return checkinLicense(id, checkinLicenseSchema.parse(request.body ?? {}));
  },

  /** Troca SÓ a chave de uma entrega aberta. O `:id` é o da ENTREGA. */
  async checkoutKey(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return updateCheckoutKey(id, checkoutKeySchema.parse(request.body ?? {}));
  },

  /** Por onde a licença passou — 15 por página, sem busca. */
  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listLicenseHistory(id, parseListQuery(request.query, { perPage: POR_PAGINA_NO_DETALHE, searchable: false }));
  },

  /** A aba Licenças da tela do ativo. O `:id` é o do ATIVO. */
  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetLicenses(id);
  },
};
