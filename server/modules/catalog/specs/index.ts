import { assetModelSpec } from './asset-model.spec';
import { categorySpec } from './category.spec';
import { locationSpec } from './location.spec';
import { manufacturerSpec } from './manufacturer.spec';
import { personSpec } from './person.spec';
import { statusLabelSpec } from './status-label.spec';
import type { CatalogSpec } from './catalog-spec.types';

// O registro das tabelas de catálogo. O maestro percorre esta lista — acrescentar
// uma tabela nova é escrever a spec e incluí-la aqui; nenhuma rota é escrita à mão.
//
// A ordem é a que a tela de Configurações usa nas abas: do que é mais usado para
// o que é mais raro. O colaborador, o último, tem página própria (AH).
export const CATALOG_SPECS: readonly CatalogSpec[] = [
  categorySpec,
  statusLabelSpec,
  manufacturerSpec,
  assetModelSpec,
  locationSpec,
  personSpec,
];
