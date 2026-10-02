import { z } from 'zod';
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
import { colunasDoExportDeLicenca, exportLicenses } from '../use-cases/export-licenses.usecase';
import { temPermissao } from '../../access/helpers/require-permission';
import { cabecalhosDeCsv } from '../../shared/csv.helper';
import { lerConfiguracaoDoSistema } from '../../settings/helpers/system-settings.helper';
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

// O EXPORT (F10, Etapa C). `strictObject` recusa `page`, `perPage` e `sort`:
// exportar é levar tudo que o filtro alcança, e a ordem é por `id` por causa do
// cursor (ver o use-case). Aceitá-los em silêncio prometeria um recorte que o
// arquivo não tem.
const exportQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
  view: z.enum(['active', 'trashed'], 'view inválida: use active ou trashed').default('active'),
  columns: z.string().trim().max(1_000, 'columns: lista muito longa').optional(),
});

/** `?columns=name,livres` → tokens. Vazio vira `undefined` (o padrão). */
function tokensDeColuna(columns: string | undefined): string[] | undefined {
  if (!columns) return undefined;
  const tokens = columns.split(',').map((token) => token.trim()).filter(Boolean);
  return tokens.length > 0 ? tokens : undefined;
}

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
    return getLicense(id, undefined, temPermissao(request, 'licenses.viewKey'));
  },

  /**
   * O CSV das licenças (F10, Etapa C) — sem a chave de produto.
   *
   * Ela não sai daqui por construção, não por checagem: o export passa pelo
   * mesmo `paraResposta()` da listagem, que a REMOVE por desestruturação
   * (D133). Ver o cabeçalho de `export-licenses.usecase.ts`.
   */
  async export(request: FastifyRequest, reply: FastifyReply) {
    const { q, view, columns } = exportQuerySchema.parse(request.query ?? {});

    // Antes do primeiro byte: depois que a resposta começa não há mais como
    // devolver 422, e o cliente receberia um arquivo truncado com status 200.
    const colunas = colunasDoExportDeLicenca(tokensDeColuna(columns));
    const { csvDelimiter } = await lerConfiguracaoDoSistema();

    return reply
      .headers(cabecalhosDeCsv('licencas'))
      .send(exportLicenses(q, view, colunas, csvDelimiter));
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createLicenseSchema.parse(request.body ?? {});
    const licenca = await createLicense(data, atorDaRequisicao(request), temPermissao(request, 'licenses.viewKey'));
    return reply.status(201).send(licenca);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateLicenseSchema.parse(request.body ?? {});
    return updateLicense(id, data, atorDaRequisicao(request), temPermissao(request, 'licenses.viewKey'));
  },

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    await deleteLicense(id, atorDaRequisicao(request));
    return reply.status(204).send();
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreLicense(id, atorDaRequisicao(request), temPermissao(request, 'licenses.viewKey'));
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
