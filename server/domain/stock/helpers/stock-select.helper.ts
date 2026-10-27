import { PERSON_PUBLIC_SELECT } from '../../person/helpers/person-select.helper';

// O que do estoque pode sair para o cliente — allowlist, nunca `include`, pelo
// mesmo motivo do `ASSET_SELECT`: coluna nova não aparece em resposta nenhuma
// até alguém escrever o nome dela aqui.

/** O item, com a categoria embutida porque a tabela mostra o NOME dela. */
export const STOCK_ITEM_SELECT = {
  id: true,
  name: true,
  qty: true,
  categoryId: true,
  locationId: true,
  notes: true,
  isActive: true,

  createdAt: true,
  updatedAt: true,

  category: { select: { id: true, name: true, type: true } },
  location: { select: { id: true, name: true } },
} as const;

/** Os campos do item que a auditoria guarda (AB): o retrato no cadastro e na exclusão, o `{ de, para }` na edição. */
export const CAMPOS_AUDITADOS_DO_ITEM = ['name', 'qty', 'categoryId', 'locationId', 'notes', 'isActive'] as const;

/**
 * A unidade, com os três alvos embutidos: a tela mostra PARA QUEM ela foi, não
 * o uuid. `targetPerson` reaproveita `PERSON_PUBLIC_SELECT`: quem decide o que
 * é público de um colaborador é o domínio `person`.
 */
export const STOCK_MOVEMENT_SELECT = {
  id: true,
  itemId: true,

  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  // O nome por escrito do posto excluído — o histórico do item o lê quando
  // `targetWorkstation` vem nulo.
  targetWorkstationName: true,
  targetAssetId: true,

  checkoutAt: true,
  returnedAt: true,
  notes: true,

  createdAt: true,

  targetPerson: { select: PERSON_PUBLIC_SELECT },
  targetWorkstation: { select: { id: true, name: true } },
  // O computador na lixeira continua com etiqueta: a leitura aninhada não
  // passa pelo escopo da lixeira.
  targetAsset: { select: { id: true, assetTag: true, name: true } },
} as const;

/** "ATV-00012 — Dell do financeiro", ou só a etiqueta — como a licença escreve o computador. */
export function rotuloDoComputador(ativo: { assetTag: string; name: string | null }): string {
  return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
}

/** Quem recebeu, por escrito — o colaborador, o posto, o computador, ou o nome que o posto excluído deixou. */
export function rotuloDoAlvo(unidade: {
  targetPerson: { name: string } | null;
  targetWorkstation: { name: string } | null;
  targetWorkstationName: string | null;
  targetAsset?: { assetTag: string; name: string | null } | null;
}): string {
  if (unidade.targetAsset) return rotuloDoComputador(unidade.targetAsset);
  return unidade.targetPerson?.name ?? unidade.targetWorkstation?.name ?? unidade.targetWorkstationName ?? '—';
}
