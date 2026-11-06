import CadastroDoCatalogo from '../../components/catalogo/CadastroDoCatalogo';
import { CATALOG_UI_SPECS } from './specs';

// As tabelas de referência do ITAM — o menu *Settings* do Snipe-IT: categorias,
// fabricantes, modelos, localizações, status e motivos de baixa, seis abas de um
// cadastro só. Colaboradores, a sétima tabela do catálogo, tem página própria
// (decisão AH).
export default function ConfiguracoesPage() {
  return <CadastroDoCatalogo titulo="Configurações" specs={CATALOG_UI_SPECS} />;
}
