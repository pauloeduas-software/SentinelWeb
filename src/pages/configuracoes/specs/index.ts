import {
  ELEMENTOS_DE_CAMPO, FORMATOS_DE_CAMPO, TIPOS_CATEGORIA, TIPOS_RESIDUAL, TIPOS_STATUS,
  type CatalogUiSpec,
} from './catalog-ui.types';

// As NOVE abas da tela de Configurações, na ordem em que aparecem: do que se
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
    { key: 'requireAcceptance', label: 'Exige aceite', render: 'booleano' },
    { key: 'checkinEmail', label: 'Avisa na devolução', render: 'booleano' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Notebook' },
    { key: 'type', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPOS_CATEGORIA },
    { key: 'color', label: 'Cor', tipo: 'color' },
    { key: 'requireAcceptance', label: 'Exigir aceite na entrega', tipo: 'checkbox',
      ajuda: 'Guardado agora. Passa a valer quando a entrega com assinatura existir.' },
    { key: 'checkinEmail', label: 'Avisar por e-mail na devolução', tipo: 'checkbox',
      ajuda: 'Guardado agora. Depende do envio de e-mail, que ainda não existe.' },
    { key: 'eulaText', label: 'Termo de uso (EULA)', tipo: 'textarea', largura: 'inteira',
      placeholder: 'Texto apresentado ao colaborador no aceite...',
      ajuda: 'Guardado agora. É o texto que o colaborador vai assinar quando o aceite existir.' },
    // A ÂNCORA PADRÃO do conjunto de campos customizados (F9, D58).
    { key: 'customFieldsetId', label: 'Conjunto de campos customizados', tipo: 'reference',
      rota: 'custom-fieldsets', largura: 'inteira',
      ajuda: 'Os campos extras que todo ativo desta categoria pede. Um MODELO pode ter conjunto próprio, e ele sobrepõe este.' },
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
    { key: 'eolMonths', label: 'Vida útil', render: 'meses' },
  ],
  campos: [
    { key: 'name', label: 'Nome do modelo', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Latitude 5450' },
    { key: 'modelNumber', label: 'Número do modelo', tipo: 'text', placeholder: 'Ex: P173G' },
    { key: 'manufacturerId', label: 'Fabricante', tipo: 'reference', rota: 'manufacturers', obrigatorio: true },
    // Só categorias de ATIVO: um modelo de equipamento não pertence a uma
    // categoria de licença.
    { key: 'categoryId', label: 'Categoria', tipo: 'reference', rota: 'categories', filtroTipo: 'ASSET', obrigatorio: true },
    { key: 'eolMonths', label: 'Vida útil (meses)', tipo: 'number', placeholder: 'Ex: 48',
      ajuda: 'Todo ativo deste modelo herda este prazo, e pode sobrescrever.' },
    // A ÂNCORA QUE SOBREPÕE A CATEGORIA (F9, D58). É o único jeito de expressar
    // o campo que só existe num modelo — o IMEI do tablet 4G.
    { key: 'customFieldsetId', label: 'Conjunto de campos customizados', tipo: 'reference',
      rota: 'custom-fieldsets', largura: 'inteira',
      ajuda: 'Em branco, vale o conjunto da CATEGORIA. Preenchido, este sobrepõe o dela — não soma com ele.' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
};

const fornecedor: CatalogUiSpec = {
  slug: 'suppliers',
  aba: 'Fornecedores',
  singular: 'Fornecedor',
  descricao: 'De quem se compra. Usado nos dados de compra do ativo e nas manutenções.',
  placeholderBusca: 'Buscar fornecedor, contato ou cidade...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'contactName', label: 'Contato' },
    { key: 'phone', label: 'Telefone' },
    { key: 'city', label: 'Cidade' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true },
    { key: 'contactName', label: 'Pessoa de contato', tipo: 'text' },
    { key: 'phone', label: 'Telefone', tipo: 'text' },
    { key: 'email', label: 'E-mail', tipo: 'text' },
    { key: 'url', label: 'Site', tipo: 'text', placeholder: 'https://...' },
    { key: 'zip', label: 'CEP', tipo: 'text' },
    { key: 'address', label: 'Endereço', tipo: 'text', largura: 'inteira' },
    { key: 'city', label: 'Cidade', tipo: 'text' },
    { key: 'state', label: 'Estado', tipo: 'text' },
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

const depreciacao: CatalogUiSpec = {
  slug: 'depreciations',
  aba: 'Depreciação',
  singular: 'Regra de depreciação',
  descricao: 'Em quantos meses o ativo perde valor e qual o piso. Alimenta o valor contábil, que é sempre calculado — nunca coluna.',
  placeholderBusca: 'Buscar regra...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'months', label: 'Período', render: 'meses' },
    { key: 'floorValue', label: 'Valor residual', render: 'moeda', campoTipo: 'floorType' },
    { key: 'floorType', label: 'Tipo de residual', render: 'enum', opcoes: TIPOS_RESIDUAL },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Notebook — 36 meses' },
    { key: 'months', label: 'Período (meses)', tipo: 'number', obrigatorio: true, placeholder: 'Ex: 36',
      ajuda: 'Em quantos meses o ativo chega ao valor residual.' },
    { key: 'floorValue', label: 'Valor residual', tipo: 'money', obrigatorio: true, placeholder: 'Ex: 10.00' },
    { key: 'floorType', label: 'Tipo de residual', tipo: 'select', obrigatorio: true, opcoes: TIPOS_RESIDUAL },
  ],
};

// ── O DEPARTAMENTO (F11, Etapa D) ───────────────────────────────────────────

const departamento: CatalogUiSpec = {
  slug: 'departments',
  aba: 'Departamentos',
  singular: 'Departamento',
  // A DESCRIÇÃO DIZ O QUE ELE **NÃO** FAZ, de propósito: é a dúvida que leva
  // alguém a procurar "entregar para o Comercial" e não achar (D72).
  descricao: 'Agrupa pessoas para relatório e rateio de custo. Um departamento NÃO recebe ativo — entregar é para uma pessoa ou para um posto.',
  placeholderBusca: 'Buscar departamento...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'code', label: 'Código' },
    { key: 'manager', label: 'Gestor', render: 'relacao' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Comercial' },
    { key: 'code', label: 'Código', tipo: 'text', placeholder: 'Ex: CC-1020',
      ajuda: 'O centro de custo, quando a empresa tem um.' },
    { key: 'managerId', label: 'Gestor', tipo: 'reference', rota: 'users',
      ajuda: 'Recebe aviso e aprova baixa. NÃO responde pelos ativos de quem está no departamento.' },
  ],
};

// ── OS CAMPOS CUSTOMIZADOS (F9) ─────────────────────────────────────────────

const campoCustomizado: CatalogUiSpec = {
  slug: 'custom-fields',
  aba: 'Campos',
  singular: 'Campo customizado',
  descricao: 'O dado que não cabe no cadastro padrão: IP fixo, hostname, número do patrimônio da contabilidade, IMEI. O ELEMENTO decide como o campo aparece no formulário; o FORMATO decide o que ele aceita. O identificador é gerado a partir do nome e NÃO muda depois — ele é a chave do valor dentro de cada ativo.',
  placeholderBusca: 'Buscar campo ou identificador...',
  colunas: [
    { key: 'name', label: 'Nome' },
    // O identificador na tabela porque é por ELE que se escreve o filtro
    // `?cf[slug]=` e é ele que não pode mudar: quem vai usar precisa vê-lo.
    { key: 'slug', label: 'Identificador' },
    { key: 'element', label: 'Elemento', render: 'enum', opcoes: ELEMENTOS_DE_CAMPO },
    { key: 'format', label: 'Formato', render: 'enum', opcoes: FORMATOS_DE_CAMPO },
    { key: 'listValues', label: 'Opções', render: 'lista' },
    { key: 'encrypted', label: 'Cifrado', render: 'booleano' },
    { key: 'showInListView', label: 'Coluna na lista', render: 'booleano' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: IP Fixo' },
    { key: 'slug', label: 'Identificador', tipo: 'text', placeholder: 'em branco, sai do nome',
      ajuda: 'A chave do valor dentro de cada ativo, e do filtro ?cf[identificador]=. NÃO muda depois de criado: trocá-lo seria reescrever o valor em todos os ativos. O nome visível, esse sim, pode ser editado.' },
    { key: 'element', label: 'Elemento do formulário', tipo: 'select', opcoes: ELEMENTOS_DE_CAMPO },
    { key: 'format', label: 'Formato aceito', tipo: 'select', opcoes: FORMATOS_DE_CAMPO },
    { key: 'listValues', label: 'Opções da lista', tipo: 'lista', largura: 'inteira',
      ajuda: 'Um valor por linha. Obrigatório para "Lista de opções" e "Botões de opção". Tirar um valor daqui NÃO apaga o que já está gravado nos ativos: a tela o mostra marcado como fora da lista.' },
    { key: 'regexPattern', label: 'Expressão regular', tipo: 'text', largura: 'inteira',
      placeholder: 'Ex: ^[A-Z]{3}-\\d{4}$',
      ajuda: 'Só para o formato "Expressão regular própria". Padrão com quantificador aninhado — como (a+)+ — é recusado: ele pode travar o servidor inteiro numa entrada de poucas dezenas de caracteres.' },
    { key: 'helpText', label: 'Texto de ajuda', tipo: 'text', largura: 'inteira',
      ajuda: 'Aparece sob o campo no formulário do ativo.' },
    { key: 'encrypted', label: 'Cifrar em repouso', tipo: 'checkbox',
      ajuda: 'Para segredo (senha do BIOS, chave do Wi-Fi). O valor volta mascarado em toda leitura e só aparece pela ação de revelar, que fica registrada. Só vale para campo de texto, não pode virar coluna da lista, e NÃO pode ser ligado nem desligado depois que algum ativo já tem valor.' },
    { key: 'showInListView', label: 'Mostrar como coluna na lista de ativos', tipo: 'checkbox' },
    { key: 'displayInUserView', label: 'Mostrar para o colaborador', tipo: 'checkbox',
      ajuda: 'Guardado agora. Passa a valer quando a visão do colaborador existir.' },
    { key: 'showInEmail', label: 'Incluir no e-mail de entrega', tipo: 'checkbox',
      ajuda: 'Guardado agora. Passa a valer quando o corpo do e-mail for configurável.' },
  ],
};

const conjuntoDeCampos: CatalogUiSpec = {
  slug: 'custom-fieldsets',
  aba: 'Conjuntos',
  singular: 'Conjunto de campos',
  descricao: 'Um conjunto agrupa os campos que uma CATEGORIA ou um MODELO pede. O modelo sobrepõe a categoria quando os dois têm conjunto. A obrigatoriedade e a ordem são do VÍNCULO, não do campo — o mesmo "Centro de custo" é obrigatório em Notebooks e opcional em Periféricos. Use o botão de composição na linha para montar a lista.',
  placeholderBusca: 'Buscar conjunto...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'fields', label: 'Campos', render: 'contagem', contagemDe: 'fields' },
    // As duas âncoras (D58), separadas: "usado por 2 categorias e 0 modelos"
    // responde onde mexer; um total somado não responde nada.
    { key: 'categories', label: 'Categorias', render: 'contagem', contagemDe: 'categories' },
    { key: 'assetModels', label: 'Modelos', render: 'contagem', contagemDe: 'assetModels' },
  ],
  campos: [
    { key: 'name', label: 'Nome', tipo: 'text', obrigatorio: true, placeholder: 'Ex: Notebooks corporativos' },
  ],
  // A SEGUNDA aba com ação própria, e pelo mesmo motivo da primeira: a
  // composição de um conjunto não é um campo do formulário — ela tem ordem,
  // obrigatoriedade por vínculo e um contador de quantos ativos quebrariam.
  acoes: [
    { id: 'campos-do-conjunto', titulo: 'Campos do conjunto' },
  ],
};

export const CATALOG_UI_SPECS: readonly CatalogUiSpec[] = [
  categoria, status, fabricante, modelo, fornecedor, localizacao, depreciacao,
  // A DÉCIMA, DA F11 (D75). Depois das de inventário porque é cadastro de GENTE:
  // quem abre Configurações está quase sempre atrás de categoria, modelo ou
  // local. Mesma ordem do `CATALOG_SPECS` do servidor — as duas listas são
  // percorridas em paralelo pela tela e pelo maestro, e divergir faria a aba
  // apontar para a spec errada.
  departamento,
  // As duas da F9, por último: o cliente cria os campos uma vez e depois só
  // preenche valores. Mesma ordem do `CATALOG_SPECS` do servidor.
  campoCustomizado, conjuntoDeCampos,
];
