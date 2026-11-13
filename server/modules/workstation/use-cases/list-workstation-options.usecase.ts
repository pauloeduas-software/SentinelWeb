import { listCatalogOptions, type CatalogOption } from '../../catalog/use-cases/list-catalog-options.usecase';
import { workstationSpec } from '../specs/workstation.spec';

/**
 * As opções do seletor de posto: as do catálogo, e com `semComputador`, só o
 * posto sem computador entregue agora. É o Entregar do computador e o "E
 * entregar ao posto" de `/descobertas`: o posto que já tem um recusa a entrega
 * (um computador por posto, `ativo-do-posto.helper.ts`), então a lista nem
 * oferece. A entrega de estoque e a ocupação pedem sem o recorte.
 */
export function listWorkstationOptions(q: string | undefined, { semComputador }: { semComputador: boolean }): Promise<CatalogOption[]> {
  return listCatalogOptions(
    workstationSpec,
    q,
    undefined,
    semComputador ? { assignments: { none: { checkinAt: null } } } : undefined,
  );
}
