// A spec de INTERFACE de uma tabela de catálogo: rótulo em português, que campos
// o formulário mostra e que colunas a tabela mostra.
//
// É irmã da spec do servidor (server/domain/catalog/specs/), não a mesma: lá se
// decide o que é válido e o que pode sair na resposta; aqui, como isso aparece
// na tela. Mora em `pages/` porque é decisão de tela — e por isso não importa
// nada de `core/api` (o lint recusa).

type TipoCampo =
  | 'text' | 'textarea'
  | 'select'    // valores fixos, vindos de um enum do banco
  | 'reference'; // valores vindos de outra tabela, por /options

export interface OpcaoFixa {
  value: string;
  label: string;
  /**
   * Uma linha explicando a opção, mostrada no formulário quando ela está
   * selecionada.
   *
   * Existe porque rótulo de `<select>` não carrega a diferença entre duas
   * opções parecidas — e as quatro de `StatusLabel.type` são exatamente isso.
   * A dúvida aparece na hora de escolher, então a resposta vai ali.
   */
  ajuda?: string;
}

export interface CampoSpec {
  key: string;
  label: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  /** `select`: a lista fixa */
  opcoes?: readonly OpcaoFixa[];
  /** `reference`: de onde vêm as opções ('manufacturers', 'people'…) */
  rota?: string;
  /** `reference`: filtra o /options (só categorias de ATIVO, por exemplo) */
  filtroTipo?: string;
  /** Ocupa a linha inteira do formulário em vez de meia */
  largura?: 'inteira';
  /** Uma linha sob o campo, explicando o que o rótulo não cabe. */
  ajuda?: string;
}

type RenderColuna = 'texto' | 'enum' | 'relacao';

export interface ColunaSpec {
  key: string;
  label: string;
  render?: RenderColuna;
  /** `enum`: para traduzir o valor do banco no rótulo em português */
  opcoes?: readonly OpcaoFixa[];
}

/**
 * Uma ação por LINHA além de editar e excluir.
 *
 * Por que isto existe: as seis abas são o MESMO CRUD, e foi essa igualdade que
 * permitiu uma tela só. Três ações quebram a igualdade sem quebrar a tela:
 * Desativar/Ativar, que as seis abas declaram (com a marca no gênero de cada
 * uma); e Ficha, que só Colaboradores tem, e que leva à tela do que está com a
 * pessoa.
 *
 * As duas saídas ruins eram: uma tela separada por aba diferente (volta a
 * duplicação que a spec eliminou) ou um `if (slug === 'people')` no meio do
 * componente genérico (a exceção escondida, que a próxima pessoa copia). A
 * saída é esta: a tabela desenha as ações que a SPEC declarar, e uma aba que
 * não declarasse nenhuma ficaria só com editar e excluir — sem botão a mais,
 * sem `if`.
 *
 * O `id` é uma união fechada, e não `string`, de propósito: quem adicionar uma
 * ação nova é obrigado pelo compilador a dar a ela um ícone (`CatalogTable`).
 * Quem a trata é a tela de Configurações, que grava na hora ou abre a ficha.
 */
export type AcaoLinhaId = 'ativacao' | 'ficha';

export interface AcaoLinhaSpec {
  id: AcaoLinhaId;
  /** Vira o `title` do botão — é o que o usuário lê ao passar o mouse. */
  titulo: string;
  /**
   * Ação que ALTERNA um booleano da linha — Desativar/Ativar. O `titulo` vale
   * com o campo ligado; `tituloSeDesligado`, com ele desligado. A linha com o
   * campo desligado aparece esmaecida e marcada, para o estado não depender de
   * passar o mouse no botão.
   */
  alterna?: { campo: string; tituloSeDesligado: string; marcaSeDesligado: string };
}

export interface CatalogUiSpec {
  /** Bate com o slug da rota: 'categories' → /api/categories */
  slug: string;
  aba: string;
  singular: string;
  /**
   * O gênero do `singular`, para o título "Novo …"/"Nova …" do formulário.
   *
   * Declarado, e não deduzido da última letra: "Status" e "Fabricante" não
   * terminam em `o` e são masculinos, "Localização" não termina em `a` e é
   * feminina. A regra da letra erraria três das seis abas.
   */
  genero: 'm' | 'f';
  descricao: string;
  placeholderBusca: string;
  colunas: readonly ColunaSpec[];
  campos: readonly CampoSpec[];
  /** As ações além de editar e excluir — Desativar nas seis abas. Ver `AcaoLinhaSpec`. */
  acoes?: readonly AcaoLinhaSpec[];
  /**
   * A aba tem LIXEIRA: excluir manda para lá, e a barra ganha a aba Lixeira com
   * Restaurar. Bate com `lixeira` da spec do servidor — hoje só colaboradores.
   */
  lixeira?: boolean;
  /**
   * Botões que recortam a listagem por um campo de valores fixos — o tipo da
   * categoria. O servidor só aceita o campo que a spec dele declara em
   * `optionFilter`; aqui ficam os rótulos.
   */
  filtroPorTipo?: { campo: string; opcoes: readonly OpcaoFixa[] };
}

// Traduções dos enums do banco. Ficam aqui, num lugar só, porque a tabela e o
// formulário precisam das MESMAS listas — separadas, divergiriam no primeiro
// valor novo.
// O tipo da categoria diz a que MÓDULO ela pertence: uma categoria de Ativo não
// agrupa licenças.
export const TIPOS_CATEGORIA: readonly OpcaoFixa[] = [
  { value: 'ASSET', label: 'Ativo',
    ajuda: 'Computador, com etiqueta e número de série. Uma linha por máquina.' },
  { value: 'STOCK', label: 'Estoque',
    ajuda: 'Item por quantidade, sem patrimônio individual: monitor, teclado, mouse, cabo.' },
  { value: 'LICENSE', label: 'Licença',
    ajuda: 'Software, com assentos atribuídos a pessoas ou a máquinas.' },
];

// Os quatro tipos de status, em palavras distintas entre si. As distinções que
// confundem são estas:
//
//   Em uso       — fora do estoque porque está CUMPRINDO a função. Gera valor.
//   Pendente     — fora do estoque por IMPEDIMENTO, e volta. Custa dinheiro.
//   Inutilizável — ainda é SEU, mas não serve. Continua nas listagens e nos
//                  relatórios, porque custou dinheiro e precisa ser auditado.
//
// O que SAI de vez (vendido, descartado, doado) não é tipo de status: é a
// baixa do ativo (`retiredAt`).
export const TIPOS_STATUS: readonly OpcaoFixa[] = [
  { value: 'DEPLOYABLE', label: 'Disponível',
    ajuda: 'Em estoque, pronto para entregar. É o único tipo que libera a entrega.' },
  // Tipo próprio, e não uma variação de "indisponível": a diferença entre estar
  // com um colaborador e estar na assistência é a distinção mais cara do
  // inventário — um gera valor, o outro custa (prisma/schema.prisma).
  { value: 'IN_USE', label: 'Em uso',
    ajuda: 'Com um colaborador ou instalado em algum lugar. Fora do estoque porque está cumprindo a função dele.' },
  { value: 'PENDING', label: 'Pendente',
    ajuda: 'Fora do estoque por algum impedimento, e volta: conserto, diagnóstico, trânsito, preparo.' },
  { value: 'UNDEPLOYABLE', label: 'Inutilizável',
    ajuda: 'Ainda é seu, mas não serve mais e não volta. Continua nas listagens e nos relatórios.' },
];
