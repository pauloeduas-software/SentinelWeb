import { Building2, CircleDot, Factory, Laptop, Tag } from 'lucide-react';
import {
  TIPOS_CATEGORIA, TIPOS_STATUS,
  type CatalogUiSpec, type ColunaSpec,
} from '../../../components/catalogo/catalog-ui.types';

// As CINCO abas da tela de Configurações, na ordem em que se cadastra: modelo pede
// categoria e fabricante, e Status vem por último porque já nasce semeado. A ordem
// espelha CATALOG_SPECS do servidor.
// A sexta tabela do catálogo, colaboradores, tem página própria
// (`src/pages/colaboradores`, decisão AH).

// O mesmo número que recusaria o Excluir (`mostraUso` da spec do servidor, AZ).
const EM_USO: ColunaSpec = { key: 'usos', label: 'Em uso', render: 'contagem', soNoDesktop: true };

const categoria: CatalogUiSpec = {
  slug: 'categories',
  chave: 'categorias',
  aba: 'Categorias',
  icone: Tag,
  singular: 'Categoria',
  genero: 'f',
  placeholderBusca: 'Buscar categoria…',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'type', label: 'Tipo', render: 'enum', opcoes: TIPOS_CATEGORIA },
    EM_USO,
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_CATEGORIA, largura: 'inteira', travaEmUso: true },
  ],
  filtroPorTipo: { campo: 'type', opcoes: TIPOS_CATEGORIA },
};

const status: CatalogUiSpec = {
  slug: 'status-labels',
  chave: 'status',
  aba: 'Status',
  icone: CircleDot,
  singular: 'Status',
  genero: 'm',
  placeholderBusca: 'Buscar status…',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'type', label: 'Tipo', render: 'status', opcoes: TIPOS_STATUS },
    EM_USO,
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_STATUS, largura: 'inteira', travaEmUso: true },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};

const fabricante: CatalogUiSpec = {
  slug: 'manufacturers',
  chave: 'fabricantes',
  aba: 'Fabricantes',
  icone: Factory,
  singular: 'Fabricante',
  genero: 'm',
  placeholderBusca: 'Buscar fabricante…',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'supportPhone', label: 'Telefone de suporte', soNoDesktop: true },
    { key: 'supportEmail', label: 'E-mail de suporte', soNoDesktop: true },
    { key: 'url', label: 'Site', render: 'link' },
    EM_USO,
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    // UM endereço só, de preferência a página de suporte: é onde se abre o
    // chamado de garantia. O servidor recusa "dell.com" sem o esquema; com `url`,
    // o navegador avisa antes, e a ajuda já diz o que falta.
    { key: 'url', label: 'Site', tipo: 'url', largura: 'inteira',
      ajuda: 'Completo, com https://. De preferência a página de suporte.' },
    { key: 'supportPhone', label: 'Telefone de suporte', tipo: 'tel' },
    { key: 'supportEmail', label: 'E-mail de suporte', tipo: 'email' },
  ],
};

const modelo: CatalogUiSpec = {
  slug: 'asset-models',
  chave: 'modelos',
  aba: 'Modelos',
  icone: Laptop,
  singular: 'Modelo',
  genero: 'm',
  placeholderBusca: 'Buscar modelo ou número…',
  colunas: [
    { key: 'name', label: 'Modelo' },
    { key: 'modelNumber', label: 'Número', soNoDesktop: true },
    { key: 'manufacturer', label: 'Fabricante', render: 'relacao' },
    { key: 'category', label: 'Categoria', render: 'relacao', soNoDesktop: true },
    EM_USO,
  ],
  campos: [
    { key: 'name', label: 'Nome do modelo', tipo: 'text', obrigatorio: true },
    { key: 'modelNumber', label: 'Número do modelo', tipo: 'text' },
    { key: 'manufacturerId', label: 'Fabricante', tipo: 'reference', rota: 'manufacturers', obrigatorio: true,
      ajuda: 'Não achou? Cadastre antes na aba Fabricantes.' },
    // Só categorias de ATIVO: um modelo de equipamento não pertence a uma
    // categoria de licença.
    { key: 'categoryId', label: 'Categoria', tipo: 'reference', rota: 'categories', filtroTipo: 'ASSET', obrigatorio: true,
      ajuda: 'O computador herda daqui a categoria.' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};
const localizacao: CatalogUiSpec = {
  slug: 'locations',
  chave: 'localizacoes',
  aba: 'Localizações',
  icone: Building2,
  singular: 'Localização',
  genero: 'f',
  placeholderBusca: 'Buscar localização, cidade ou endereço…',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'Estado', soNoDesktop: true },
    { key: 'phone', label: 'Telefone', soNoDesktop: true },
    EM_USO,
  ],
  campos: [
    // Largura inteira: sem "Dentro de" ao lado, o nome é quem carrega onde o
    // lugar fica — e ele é único no sistema todo.
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, largura: 'inteira',
      placeholder: 'Ex.: matriz, filial, depósito, home office' },
    { key: 'phone', label: 'Telefone', tipo: 'tel' },
    { key: 'zip', label: 'CEP', tipo: 'text' },
    { key: 'address', label: 'Endereço', tipo: 'text', largura: 'inteira' },
    { key: 'city', label: 'Cidade', tipo: 'text' },
    { key: 'state', label: 'Estado', tipo: 'text' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};

export const CATALOG_UI_SPECS: readonly CatalogUiSpec[] = [
  categoria, fabricante, modelo, localizacao, status,
];
