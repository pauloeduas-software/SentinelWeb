import {
  TIPOS_CATEGORIA, TIPOS_STATUS,
  type CatalogUiSpec,
} from './catalog-ui.types';

// As CINCO abas da tela de Configurações, na ordem em que aparecem: do que se
// mexe mais para o que se mexe menos. A ordem espelha CATALOG_SPECS do servidor.

const categoria: CatalogUiSpec = {
  slug: 'categories',
  aba: 'Categorias',
  singular: 'Categoria',
  descricao: 'O NOME é seu. O TIPO diz a que módulo a categoria pertence — uma categoria de Ativo não agrupa licenças. Aqui também se define se a entrega exige aceite do colaborador.',
  placeholderBusca: 'Buscar categoria...',
  colunas: [
    { key: 'name', label: 'Nome', render: 'cor' },
    { key: 'type', label: 'Tipo', render: 'enum', opcoes: TIPOS_CATEGORIA },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Notebook' },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_CATEGORIA },
    { key: 'color', label: 'Cor', tipo: 'color' },
  ],
};

const status: CatalogUiSpec = {
  slug: 'status-labels',
  aba: 'Status',
  singular: 'Status',
  descricao: 'O NOME é seu — crie quantos quiser. O TIPO é uma de cinco caixas que o sistema entende: é ele que decide se o ativo pode ser entregue a alguém e se ainda conta como patrimônio.',
  placeholderBusca: 'Buscar status...',
  colunas: [
    { key: 'name', label: 'Nome', render: 'cor' },
    { key: 'type', label: 'Tipo', render: 'enum', opcoes: TIPOS_STATUS },
    { key: 'showInNav', label: 'Em destaque', render: 'booleano' },
    { key: 'notes', label: 'Notas' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Pronto p/ Uso' },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_STATUS },
    { key: 'color', label: 'Cor', tipo: 'color' },
    { key: 'showInNav', label: 'Destacar no painel de ativos (aparece mesmo com zero)', tipo: 'checkbox' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};

const fabricante: CatalogUiSpec = {
  slug: 'manufacturers',
  aba: 'Fabricantes',
  singular: 'Fabricante',
  descricao: 'Quem fabrica o equipamento, com os canais de suporte para abrir chamado de garantia.',
  placeholderBusca: 'Buscar fabricante...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'supportPhone', label: 'Telefone de suporte' },
    { key: 'supportEmail', label: 'E-mail de suporte' },
    { key: 'url', label: 'Site' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Dell' },
    { key: 'url', label: 'Site', tipo: 'text', placeholder: 'https://...' },
    { key: 'supportPhone', label: 'Telefone de suporte', tipo: 'text' },
    { key: 'supportEmail', label: 'E-mail de suporte', tipo: 'text' },
    { key: 'supportUrl', label: 'Portal de suporte', tipo: 'text', largura: 'inteira', placeholder: 'https://...' },
  ],
};

const modelo: CatalogUiSpec = {
  slug: 'asset-models',
  aba: 'Modelos',
  singular: 'Modelo',
  descricao: 'O catálogo de equipamentos. O ativo herda daqui a categoria e a vida útil.',
  placeholderBusca: 'Buscar modelo ou número...',
  colunas: [
    { key: 'name', label: 'Modelo' },
    { key: 'manufacturer', label: 'Fabricante', render: 'relacao' },
    { key: 'category', label: 'Categoria', render: 'relacao' },
    { key: 'modelNumber', label: 'Número' },
  ],
  campos: [
    { key: 'name', label: 'Nome do modelo', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Latitude 5450' },
    { key: 'modelNumber', label: 'Número do modelo', tipo: 'text', placeholder: 'Ex: P173G' },
    { key: 'manufacturerId', label: 'Fabricante', tipo: 'reference', rota: 'manufacturers', obrigatorio: true },
    // Só categorias de ATIVO: um modelo de equipamento não pertence a uma
    // categoria de licença.
    { key: 'categoryId', label: 'Categoria', tipo: 'reference', rota: 'categories', filtroTipo: 'ASSET', obrigatorio: true },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};
const localizacao: CatalogUiSpec = {
  slug: 'locations',
  aba: 'Localizações',
  singular: 'Localização',
  descricao: 'Onde o ativo fica. É hierárquica: matriz › prédio › andar › sala. A folha da árvore é o POSTO DE TRABALHO — a Mesa 1 —, e quem ocupa um posto responde pelos ativos entregues a ele. Posto tem TELA PRÓPRIA em Postos: é lá que se cria a mesa, se vê quem está em cada turno e o que cada uma segura. Esta aba é para a hierarquia inteira, filial incluída.',
  placeholderBusca: 'Buscar localização, cidade ou endereço...',
  colunas: [
    { key: 'name', label: 'Nome' },
    // A marca vem ANTES do resto: é ela que diz se as colunas de filial
    // (cidade, telefone) querem dizer alguma coisa nesta linha.
    { key: 'isWorkstation', label: 'É posto', render: 'booleano' },
    { key: 'parent', label: 'Dentro de', render: 'relacao' },
    { key: 'manager', label: 'Gestor', render: 'relacao' },
    { key: 'city', label: 'Cidade' },
    { key: 'phone', label: 'Telefone' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Matriz — 2º andar' },
    { key: 'parentId', label: 'Dentro de', tipo: 'reference', rota: 'locations',
      ajuda: 'A localização que contém esta. Ex.: a Sala 12 fica dentro do 2º Andar.' },
    { key: 'managerId', label: 'Gestor', tipo: 'reference', rota: 'users' },
    { key: 'isWorkstation', label: 'É posto de trabalho (mesa, bancada, guichê)', tipo: 'checkbox',
      ajuda: 'Marcado, a localização aparece na tela Postos — com os ocupantes de cada turno e o aviso de posto vago. É só apresentação: desmarcar não tira ninguém do posto nem devolve ativo.' },
    { key: 'phone', label: 'Telefone', tipo: 'text' },
    { key: 'zip', label: 'CEP', tipo: 'text' },
    { key: 'address', label: 'Endereço', tipo: 'text', largura: 'inteira' },
    { key: 'city', label: 'Cidade', tipo: 'text' },
    { key: 'state', label: 'Estado', tipo: 'text' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  // A ÚNICA aba com ação própria: um posto tem ocupantes, e nenhuma outra
  // tabela de catálogo tem (docs/referencia/modelo-de-posse.md, Camada 2). As outras seis
  // omitem `acoes` e seguem com editar/excluir, como sempre.
  acoes: [
    { id: 'ocupantes', titulo: 'Ocupantes do posto' },
  ],
};


// ── O DEPARTAMENTO (F11, Etapa D) ───────────────────────────────────────────
// Mesma ordem do `CATALOG_SPECS` do servidor — as duas listas são percorridas
// em paralelo pela tela e pelo maestro, e divergir faria a aba apontar para a
// spec errada.
export const CATALOG_UI_SPECS: readonly CatalogUiSpec[] = [
  categoria, status, fabricante, modelo, localizacao,
];
