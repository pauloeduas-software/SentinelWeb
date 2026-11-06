import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';
import { createRetireReasonSchema, updateRetireReasonSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

// O motivo da baixa (BE). A baixa não se edita: quem usa o motivo só o solta ao
// ser revertido. O computador baixado na lixeira conta porque continua apontando
// para cá e ainda pode ser restaurado.
export const retireReasonSpec: CatalogSpec = {
  slug: 'retire-reasons',
  entityType: 'RetireReason',
  tabela: 'retire_reasons',
  rotulo: 'motivo de baixa',
  naoEncontrado: 'Motivo da baixa não encontrado.',

  delegate: (client) => client.retireReason as unknown as CatalogDelegate,
  createSchema: createRetireReasonSchema,
  updateSchema: updateRetireReasonSchema,

  select: { id: true, name: true, createdAt: true, updatedAt: true },
  searchable: ['name'],
  audited: ['name'],

  nomeUnicoPor: [],
  // Sem Desativar (AO): o motivo em uso fica, e sai quando nada o usa.
  dicaEmUso: 'Reverta a baixa desses computadores e exclua de novo.',

  mostraUso: true,
  countUsages: (client, id) => client.asset.count({ where: { retiredReasonId: id, ...INCLUINDO_LIXEIRA } }),
};
