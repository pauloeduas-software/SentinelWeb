import CadastroDoCatalogo from '../../components/catalogo/CadastroDoCatalogo';
import { CATALOG_UI_SPECS } from './specs';

// As tabelas de referência do ITAM — o menu *Settings* do Snipe-IT: categorias,
// fabricantes, modelos, localizações e status, cinco abas de um cadastro só.
// Colaboradores, a sexta tabela do catálogo, tem página própria (decisão AH).
export default function ConfiguracoesPage() {
  return <CadastroDoCatalogo titulo="Configurações" specs={CATALOG_UI_SPECS} />;
}
