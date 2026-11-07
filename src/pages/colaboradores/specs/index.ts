import { Users } from 'lucide-react';
import { desativar, type CatalogUiSpec } from '../../../components/catalogo/catalog-ui.types';

// QUEM RECEBE EQUIPAMENTO — ativo, posto, licença, estoque. Não
// entra no sistema: quem opera é usuário, na tela Usuários, e um não vira o
// outro. É a sétima tabela do catálogo, com página própria (decisão AH): o
// cadastro é o mesmo das seis abas de Configurações, e as duas coisas a mais
// são a FICHA, a única tabela com tela de detalhe — é lá que se vê o que está
// com a pessoa e o que já esteve —, e a LIXEIRA: o histórico de posse é dela, e
// restaurar devolve a mesma pessoa com ele.
export const colaborador: CatalogUiSpec = {
  slug: 'people',
  chave: 'colaboradores',
  aba: 'Colaboradores',
  icone: Users,
  singular: 'Colaborador',
  genero: 'm',
  placeholderBusca: 'Buscar por nome ou e-mail…',
  colunas: [
    { key: 'name', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'isActive', label: 'Status', render: 'ativo' },
  ],
  campos: [
    { key: 'name', label: 'Nome completo', tipo: 'text', obrigatorio: true, largura: 'inteira' },
    { key: 'email', label: 'E-mail', tipo: 'email', largura: 'inteira',
      ajuda: 'Opcional. O colaborador não entra no sistema; o e-mail só ajuda a separar dois nomes iguais.' },
    { key: 'notes', label: 'Notas', tipo: 'textarea', largura: 'inteira' },
  ],
  acoes: [
    desativar(),
    { id: 'ficha', titulo: 'Ficha do colaborador' },
  ],
  lixeira: true,
  cartoesDeStatus: true,
};
