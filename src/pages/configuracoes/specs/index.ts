import {
  TIPOS_CATEGORIA, TIPOS_STATUS,
  type AcaoLinhaSpec, type CatalogUiSpec,
} from './catalog-ui.types';

// O BOTÃO DESATIVAR/ATIVAR, igual nas cinco abas (e em Usuários): grava só
// `isActive`. Desativado some das listas de escolha e não é escolhido de novo —
// o servidor recusa —, e continua no histórico e em tudo que já o usa. É a
// saída de quem não pode ser excluído por ter uso.
function desativar(feminino: boolean): AcaoLinhaSpec {
  return {
    id: 'ativacao',
    titulo: 'Desativar',
    alterna: { campo: 'isActive', tituloSeDesligado: 'Ativar', marcaSeDesligado: feminino ? 'desativada' : 'desativado' },
  };
}

// As CINCO abas da tela de Configurações, na ordem em que aparecem: do que se
// mexe mais para o que se mexe menos. A ordem espelha CATALOG_SPECS do servidor.

const categoria: CatalogUiSpec = {
  slug: 'categories',
  aba: 'Categorias',
  singular: 'Categoria',
  genero: 'f',
  descricao: 'O NOME é seu. O TIPO diz a que módulo a categoria pertence — uma categoria de Ativo não agrupa licenças.',
  placeholderBusca: 'Buscar categoria...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'type', label: 'Tipo', render: 'enum', opcoes: TIPOS_CATEGORIA },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_CATEGORIA },
  ],
  filtroPorTipo: { campo: 'type', opcoes: TIPOS_CATEGORIA },
  acoes: [desativar(true)],
};

const status: CatalogUiSpec = {
  slug: 'status-labels',
  aba: 'Status',
  singular: 'Status',
  genero: 'm',
  descricao: 'O NOME é seu — crie quantos quiser. O TIPO é uma de quatro caixas que o sistema entende: é ele que decide se o ativo pode ser entregue a alguém.',
  placeholderBusca: 'Buscar status...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'type', label: 'Tipo', render: 'enum', opcoes: TIPOS_STATUS },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_STATUS },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  acoes: [desativar(false)],
};

const fabricante: CatalogUiSpec = {
  slug: 'manufacturers',
  aba: 'Fabricantes',
  singular: 'Fabricante',
  genero: 'm',
  descricao: 'Quem fabrica o equipamento, com os canais de suporte para abrir chamado de garantia.',
  placeholderBusca: 'Buscar fabricante...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'supportPhone', label: 'Telefone de suporte' },
    { key: 'supportEmail', label: 'E-mail de suporte' },
    { key: 'url', label: 'Site' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true },
    // UM endereço só, de preferência a página de suporte: é onde se abre o
    // chamado de garantia. A ajuda diz que é o endereço COMPLETO porque o
    // servidor recusa "dell.com" sem o esquema — e a recusa chegava só depois
    // do Salvar, sem a pessoa saber o que faltava.
    { key: 'url', label: 'Site', tipo: 'text', largura: 'inteira',
      ajuda: 'O endereço completo, começando com https://. De preferência a página de suporte, onde se abre o chamado de garantia.' },
    { key: 'supportPhone', label: 'Telefone de suporte', tipo: 'text' },
    { key: 'supportEmail', label: 'E-mail de suporte', tipo: 'text' },
  ],
  acoes: [desativar(false)],
};

const modelo: CatalogUiSpec = {
  slug: 'asset-models',
  aba: 'Modelos',
  singular: 'Modelo',
  genero: 'm',
  descricao: 'O catálogo de equipamentos. O ativo herda daqui a categoria.',
  placeholderBusca: 'Buscar modelo ou número...',
  colunas: [
    { key: 'name', label: 'Modelo' },
    { key: 'modelNumber', label: 'Número' },
    { key: 'manufacturer', label: 'Fabricante', render: 'relacao' },
    { key: 'category', label: 'Categoria', render: 'relacao' },
  ],
  campos: [
    { key: 'name', label: 'Nome do modelo', tipo: 'text', obrigatorio: true },
    { key: 'modelNumber', label: 'Número do modelo', tipo: 'text' },
    { key: 'manufacturerId', label: 'Fabricante', tipo: 'reference', rota: 'manufacturers', obrigatorio: true },
    // Só categorias de ATIVO: um modelo de equipamento não pertence a uma
    // categoria de licença.
    { key: 'categoryId', label: 'Categoria', tipo: 'reference', rota: 'categories', filtroTipo: 'ASSET', obrigatorio: true },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  acoes: [desativar(false)],
};
const localizacao: CatalogUiSpec = {
  slug: 'locations',
  aba: 'Localizações',
  singular: 'Localização',
  genero: 'f',
  descricao: 'Onde o ativo fica: a filial, a sala, o depósito, a mesa. Os postos de trabalho se criam e se acompanham na tela Postos. Localização em uso não se exclui: se desativa.',
  placeholderBusca: 'Buscar localização, cidade ou endereço...',
  colunas: [
    // Lista GERAL: sem coluna de "é posto" nem de "ativa". A localização
    // desativada aparece esmaecida e marcada (a ação `ativacao` abaixo), e o
    // posto se gerencia na tela Postos.
    { key: 'name', label: 'Nome' },
    { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'Estado' },
    { key: 'phone', label: 'Telefone' },
  ],
  campos: [
    // Largura inteira: sem "Dentro de" ao lado, o nome é quem carrega onde o
    // lugar fica — e ele é único no sistema todo.
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    { key: 'phone', label: 'Telefone', tipo: 'text' },
    { key: 'zip', label: 'CEP', tipo: 'text' },
    { key: 'address', label: 'Endereço', tipo: 'text', largura: 'inteira' },
    { key: 'city', label: 'Cidade', tipo: 'text' },
    { key: 'state', label: 'Estado', tipo: 'text' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  // Além do Desativar, os ocupantes: um posto tem, e nenhuma outra tabela de
  // catálogo tem (docs/referencia/modelo-de-posse.md, Camada 2).
  acoes: [
    desativar(true),
    { id: 'ocupantes', titulo: 'Ocupantes do posto', visivelSe: 'isWorkstation' },
  ],
};

// Mesma ordem do `CATALOG_SPECS` do servidor — as duas listas são percorridas
// em paralelo pela tela e pelo maestro, e divergir faria a aba apontar para a
// spec errada.
export const CATALOG_UI_SPECS: readonly CatalogUiSpec[] = [
  categoria, status, fabricante, modelo, localizacao,
];
