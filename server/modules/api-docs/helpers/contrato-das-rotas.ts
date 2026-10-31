import type { ZodType } from 'zod';
import { CATALOG_SPECS } from '../../catalog/specs';
import { loginSchema, trocarSenhaSchema } from '../../auth/schemas/auth.schema';
import { createUserSchema, updateOwnProfileSchema, updateUserSchema } from '../../user/schemas/user.schema';
import { createAssetSchema, retireAssetSchema, updateAssetSchema } from '../../asset/schemas/asset.schema';
import { checkinSchema, checkoutSchema } from '../../assignment/schemas/assignment.schema';
import { sendCommandSchema } from '../../endpoint/schemas/endpoint.schema';
import {
  checkinLicenseSchema, checkoutKeySchema, checkoutLicenseSchema, createLicenseSchema, updateLicenseSchema,
} from '../../license/schemas/license.schema';
import {
  addOccupantSchema, endOccupancySchema, updateOccupantShiftSchema,
} from '../../occupancy/schemas/occupancy.schema';
import {
  triagemSchema, vinculoComEntregaSchema, vinculoSchema,
} from '../../reconciliation/schemas/reconciliation.schema';
import { configuracaoDaDescobertaSchema } from '../../settings/schemas/settings.schema';
import {
  checkinStockSchema, checkoutStockSchema, createStockItemSchema, updateStockItemSchema,
} from '../../stock/schemas/stock.schema';
import { createWorkstationSchema, updateWorkstationSchema } from '../../workstation/schemas/workstation.schema';

// O CONTRATO DA API, POR ROTA — o que o Swagger mostra (AS).
//
// Uma tabela `método + rota → o que ela faz`, na mesma chave do mapa de
// permissões (`access/helpers/route-permissions.ts`) e pelo mesmo motivo: rota
// nova sem linha aqui reprova `tests/invariantes/contrato-da-api.test.ts`, então a
// documentação não envelhece em silêncio. O corpo é o MESMO schema Zod que o
// controller valida — não há segunda descrição para divergir.
//
// Só DOCUMENTA: o Fastify não lê esta tabela para validar nada. Quem recusa o
// corpo inválido continua sendo o `parse` do controller, com o 422 de sempre.

export type Tag =
  | 'Sessão' | 'Usuários' | 'Computadores' | 'Postos' | 'Estoque' | 'Licenças'
  | 'Descobertas' | 'Colaboradores' | 'Configurações';

export interface ContratoDaRota {
  tag: Tag;
  resumo: string;
  /** O corpo, quando a rota recebe um. */
  body?: ZodType;
  /** Os parâmetros de query da rota; `'lista'` é a paginação e a busca de toda listagem. */
  query?: ZodType | 'lista';
  /** O status de sucesso, quando não é 200. */
  status?: 201 | 204;
}

export const CONTRATO: Record<string, ContratoDaRota> = {
  // ── Sessão ────────────────────────────────────────────────────────────
  'POST /api/auth/login': { tag: 'Sessão', resumo: 'Entra com e-mail e senha; a sessão vai no cookie httpOnly', body: loginSchema },
  'POST /api/auth/logout': { tag: 'Sessão', resumo: 'Sai: apaga o cookie' },
  'GET /api/auth/me': { tag: 'Sessão', resumo: 'Quem está logado, com o cargo e se a senha temporária está pendente' },
  'PATCH /api/auth/me': { tag: 'Sessão', resumo: 'Minha conta: troca o próprio nome', body: updateOwnProfileSchema },
  'PUT /api/auth/password': { tag: 'Sessão', resumo: 'Minha conta: troca a própria senha (pede a atual); quem trocou segue dentro', body: trocarSenhaSchema },

  // ── Usuários ──────────────────────────────────────────────────────────
  'GET /api/users': { tag: 'Usuários', resumo: 'Lista quem opera o sistema', query: 'lista' },
  'POST /api/users': { tag: 'Usuários', resumo: 'Cadastra um usuário; a resposta traz a senha temporária, que aparece uma vez e a pessoa troca ao entrar', body: createUserSchema, status: 201 },
  'PUT /api/users/:id': { tag: 'Usuários', resumo: 'Edita nome, e-mail e cargo, e desativa ou ativa; senha não passa por aqui', body: updateUserSchema },
  'DELETE /api/users/:id': { tag: 'Usuários', resumo: 'Exclui o usuário (não há lixeira)' },
  'POST /api/users/:id/temporary-password': { tag: 'Usuários', resumo: 'Gera a senha temporária de outra conta; aparece uma vez e a pessoa a troca ao entrar' },

  // ── Computadores ──────────────────────────────────────────────────────
  'GET /api/assets': { tag: 'Computadores', resumo: 'Lista os computadores, com filtros e a lixeira (?view=trashed)', query: 'lista' },
  'GET /api/assets/stats': { tag: 'Computadores', resumo: 'Contagens do inventário' },
  'GET /api/assets/options': { tag: 'Computadores', resumo: 'Opções para um seletor de computador' },
  'GET /api/search': { tag: 'Computadores', resumo: 'Busca global (etiqueta, nome, número de série)' },
  'GET /api/assets/:id': { tag: 'Computadores', resumo: 'A ficha do computador' },
  'GET /api/assets/:id/history': { tag: 'Computadores', resumo: 'O histórico do computador' },
  'GET /api/assets/:id/assignments': { tag: 'Computadores', resumo: 'As posses (entregas e devoluções) do computador' },
  'GET /api/assets/:id/components': { tag: 'Computadores', resumo: 'Os componentes de estoque entregues a ele' },
  'GET /api/assets/:id/licenses': { tag: 'Computadores', resumo: 'As licenças entregues a ele' },
  'GET /api/assets/:id/machine': { tag: 'Computadores', resumo: 'A máquina que o agente descobriu e está vinculada a ele' },
  'POST /api/assets': { tag: 'Computadores', resumo: 'Cadastra um computador', body: createAssetSchema, status: 201 },
  'PUT /api/assets/:id': { tag: 'Computadores', resumo: 'Edita o computador (formulário inteiro)', body: updateAssetSchema },
  'DELETE /api/assets/:id': { tag: 'Computadores', resumo: 'Manda o computador para a lixeira' },
  'POST /api/assets/:id/restore': { tag: 'Computadores', resumo: 'Restaura o computador da lixeira' },
  'POST /api/assets/:id/retire': { tag: 'Computadores', resumo: 'Dá baixa no computador', body: retireAssetSchema },
  'POST /api/assets/:id/unretire': { tag: 'Computadores', resumo: 'Desfaz a baixa' },
  'POST /api/assets/:id/checkout': { tag: 'Computadores', resumo: 'Entrega o computador a um colaborador ou posto', body: checkoutSchema, status: 201 },
  'POST /api/assets/:id/checkin': { tag: 'Computadores', resumo: 'Devolve o computador', body: checkinSchema },

  // ── Postos ────────────────────────────────────────────────────────────
  'GET /api/workstations': { tag: 'Postos', resumo: 'Lista os postos (?view=todos|vagos|ocupados)', query: 'lista' },
  'GET /api/workstations/options': { tag: 'Postos', resumo: 'Opções para um seletor de posto' },
  'GET /api/workstations/:id': { tag: 'Postos', resumo: 'A ficha do posto' },
  'POST /api/workstations': { tag: 'Postos', resumo: 'Cadastra um posto', body: createWorkstationSchema, status: 201 },
  'PUT /api/workstations/:id': { tag: 'Postos', resumo: 'Edita o posto', body: updateWorkstationSchema },
  'DELETE /api/workstations/:id': { tag: 'Postos', resumo: 'Exclui o posto (em uso, 409)' },
  'GET /api/workstations/:id/occupants': { tag: 'Postos', resumo: 'Quem ocupa o posto (?view=)' },
  'POST /api/workstations/:id/occupants': { tag: 'Postos', resumo: 'Põe um colaborador no posto', body: addOccupantSchema, status: 201 },
  'DELETE /api/workstations/:id/occupants/:occupantId': { tag: 'Postos', resumo: 'Encerra a ocupação', body: endOccupancySchema },
  'PATCH /api/workstations/:id/occupants/:occupantId': { tag: 'Postos', resumo: 'Troca o turno do ocupante', body: updateOccupantShiftSchema },

  // ── Estoque ───────────────────────────────────────────────────────────
  'GET /api/stock/items': { tag: 'Estoque', resumo: 'Lista os itens de estoque', query: 'lista' },
  'GET /api/stock/items/:id': { tag: 'Estoque', resumo: 'O item de estoque' },
  'GET /api/stock/items/:id/checkouts': { tag: 'Estoque', resumo: 'As entregas do item', query: 'lista' },
  'GET /api/stock/items/:id/history': { tag: 'Estoque', resumo: 'O histórico do item', query: 'lista' },
  'POST /api/stock/items': { tag: 'Estoque', resumo: 'Cadastra um item', body: createStockItemSchema, status: 201 },
  'PUT /api/stock/items/:id': { tag: 'Estoque', resumo: 'Edita o item (formulário inteiro)', body: updateStockItemSchema },
  'DELETE /api/stock/items/:id': { tag: 'Estoque', resumo: 'Exclui o item (entregue, 409)', status: 204 },
  'POST /api/stock/items/:id/checkout': { tag: 'Estoque', resumo: 'Entrega unidades a um colaborador, posto ou computador', body: checkoutStockSchema, status: 201 },
  'POST /api/stock/checkouts/:id/checkin': { tag: 'Estoque', resumo: 'Devolve unidades de uma entrega', body: checkinStockSchema },

  // ── Licenças ──────────────────────────────────────────────────────────
  'GET /api/licenses': { tag: 'Licenças', resumo: 'Lista as licenças', query: 'lista' },
  'GET /api/licenses/alerts': { tag: 'Licenças', resumo: 'Os alertas de prazo' },
  'GET /api/licenses/:id': { tag: 'Licenças', resumo: 'A licença' },
  'GET /api/licenses/:id/checkouts': { tag: 'Licenças', resumo: 'As entregas da licença', query: 'lista' },
  'GET /api/licenses/:id/history': { tag: 'Licenças', resumo: 'O histórico da licença', query: 'lista' },
  'POST /api/licenses': { tag: 'Licenças', resumo: 'Cadastra uma licença', body: createLicenseSchema, status: 201 },
  'PUT /api/licenses/:id': { tag: 'Licenças', resumo: 'Edita a licença (formulário inteiro)', body: updateLicenseSchema },
  'DELETE /api/licenses/:id': { tag: 'Licenças', resumo: 'Exclui a licença (em uso, 409)', status: 204 },
  'POST /api/licenses/:id/terminate': { tag: 'Licenças', resumo: 'Encerra a licença' },
  'POST /api/licenses/:id/checkout': { tag: 'Licenças', resumo: 'Entrega a licença a um colaborador ou computador', body: checkoutLicenseSchema, status: 201 },
  'POST /api/licenses/checkouts/:id/checkin': { tag: 'Licenças', resumo: 'Devolve uma entrega de licença', body: checkinLicenseSchema },
  'PATCH /api/licenses/checkouts/:id': { tag: 'Licenças', resumo: 'Troca a chave de uma entrega', body: checkoutKeySchema },

  // ── Descobertas ───────────────────────────────────────────────────────
  'GET /api/endpoints': { tag: 'Descobertas', resumo: 'As máquinas que o agente descobriu', query: 'lista' },
  'GET /api/endpoints/:id': { tag: 'Descobertas', resumo: 'A máquina descoberta' },
  'POST /api/endpoints/:id/command': { tag: 'Descobertas', resumo: 'Manda um comando à máquina (desligar, reiniciar)', body: sendCommandSchema },
  'POST /api/endpoints/:id/link': { tag: 'Descobertas', resumo: 'Vincula a máquina a um computador', body: vinculoSchema, status: 201 },
  'DELETE /api/endpoints/:id/link': { tag: 'Descobertas', resumo: 'Desfaz o vínculo' },
  'POST /api/endpoints/:id/link-and-checkout': { tag: 'Descobertas', resumo: 'Vincula e entrega ao posto', body: vinculoComEntregaSchema, status: 201 },
  'PATCH /api/endpoints/:id/review': { tag: 'Descobertas', resumo: 'Triagem da máquina', body: triagemSchema },
  'GET /api/reconciliation/suggestions': { tag: 'Descobertas', resumo: 'A fila de sugestões de vínculo' },
  'GET /api/reconciliation/coverage': { tag: 'Descobertas', resumo: 'A cobertura: quanto do inventário o agente enxerga' },
  'GET /api/reconciliation/idle': { tag: 'Descobertas', resumo: 'Computadores sem sinal do agente (?dias=)' },
  'POST /api/reconciliation/run': { tag: 'Descobertas', resumo: 'Roda a conciliação agora' },
  'POST /api/reconciliation/suggestions/:id/accept': { tag: 'Descobertas', resumo: 'Aceita a sugestão' },
  'POST /api/reconciliation/suggestions/:id/reject': { tag: 'Descobertas', resumo: 'Recusa a sugestão' },

  // ── Colaboradores ─────────────────────────────────────────────────────
  'GET /api/people/:id': { tag: 'Colaboradores', resumo: 'A ficha do colaborador' },
  'GET /api/people/:id/history': { tag: 'Colaboradores', resumo: 'O histórico do colaborador' },
  'GET /api/people/:id/occupancies': { tag: 'Colaboradores', resumo: 'Os postos que o colaborador ocupa' },

  // ── Configurações ─────────────────────────────────────────────────────
  'GET /api/settings/discovery': { tag: 'Configurações', resumo: 'A configuração da descoberta' },
  'PUT /api/settings/discovery': { tag: 'Configurações', resumo: 'Salva a configuração da descoberta', body: configuracaoDaDescobertaSchema },
  'GET /api/settings/next-asset-tag': { tag: 'Configurações', resumo: 'A próxima etiqueta de computador' },

  // As tabelas de catálogo (categorias, status, fabricantes, modelos, localizações e
  // colaboradores) são registradas em laço sobre `CATALOG_SPECS`: a tabela delas
  // também. Os nomes saem da spec, e o corpo é o `createSchema`/`updateSchema` dela.
  ...Object.fromEntries(CATALOG_SPECS.flatMap((spec) => {
    const base = `/api/${spec.slug}`;
    const tag: Tag = spec.slug === 'people' ? 'Colaboradores' : 'Configurações';
    return [
      [`GET ${base}`, { tag, resumo: `Lista (${spec.slug})`, query: 'lista' }],
      [`GET ${base}/options`, { tag, resumo: `Opções para um seletor (${spec.slug})` }],
      [`POST ${base}`, { tag, resumo: `Cadastra (${spec.slug})`, body: spec.createSchema, status: 201 }],
      [`PUT ${base}/:id`, { tag, resumo: `Edita (${spec.slug}), formulário inteiro`, body: spec.updateSchema }],
      [`DELETE ${base}/:id`, { tag, resumo: `Exclui (${spec.slug}); em uso, 409` }],
      ...(spec.lixeira ? [[`POST ${base}/:id/restore`, { tag, resumo: `Restaura da lixeira (${spec.slug})` }]] : []),
    ] as [string, ContratoDaRota][];
  })),
};
