import { SlidersHorizontal } from 'lucide-react';
import CadastroDoCatalogo from '../../components/catalogo/CadastroDoCatalogo';
import { CATALOG_UI_SPECS } from './specs';

// As tabelas de referência do ITAM — o menu *Settings* do Snipe-IT: categorias,
// status, fabricantes, modelos e localizações, cinco abas de um cadastro só.
// Colaboradores, a sexta tabela do catálogo, tem página própria (decisão AH).
export default function ConfiguracoesPage() {
  return <CadastroDoCatalogo titulo="Configurações" icone={SlidersHorizontal} specs={CATALOG_UI_SPECS} />;
}
