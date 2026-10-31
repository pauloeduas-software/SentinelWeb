import { desativar, type CatalogUiSpec } from '../../../components/catalogo/catalog-ui.types';

// QUEM RECEBE EQUIPAMENTO — ativo, posto, licença, estoque. Não
// entra no sistema: quem opera é usuário, na tela Usuários, e um não vira o
// outro. É a sexta tabela do catálogo, com página própria (decisão AH): o
// cadastro é o mesmo das cinco abas de Configurações, e as duas coisas a mais
// são a FICHA, a única tabela com tela de detalhe — é lá que se vê o que está
// com a pessoa e o que já esteve —, e a LIXEIRA: o histórico de posse é dela, e
// restaurar devolve a mesma pessoa com ele.
export const colaborador: CatalogUiSpec = {
  slug: 'people',
  aba: 'Colaboradores',
  singular: 'Colaborador',
  genero: 'm',
  descricao: 'Quem recebe equipamento: ativo, posto, licença e estoque. Não entra no sistema — quem opera o painel fica em Usuários. Excluir manda para a lixeira; só não se exclui quem está com algo agora.',
  placeholderBusca: 'Buscar por nome ou e-mail...',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
  ],
  campos: [
    { key: 'name', label: 'Nome completo', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    { key: 'email', label: 'E-mail', tipo: 'text', largura: 'inteira',
      ajuda: 'Opcional. O colaborador não entra no sistema; o e-mail só ajuda a separar dois nomes iguais.' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  acoes: [
    desativar(false),
    { id: 'ficha', titulo: 'Ficha do colaborador' },
  ],
  lixeira: true,
};
