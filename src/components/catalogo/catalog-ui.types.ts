// A spec de INTERFACE de uma tabela de catálogo: rótulo em português, que campos
// o formulário mostra e que colunas a tabela mostra.
//
// É irmã da spec do servidor (server/modules/catalog/specs/), não a mesma: lá se
// decide o que é válido e o que pode sair na resposta; aqui, como isso aparece
// na tela. Mora em `components/catalogo` porque é decisão de tela — e por isso não importa
// nada de `src/api` (o lint recusa).

import type { LucideIcon } from 'lucide-react';

type TipoCampo =
  | 'text' | 'textarea'
  | 'email' | 'tel' | 'url' // o `type` do input: valida e abre o teclado certo no celular
  | 'select'    // valores fixos, vindos de um enum do banco
  | 'reference'; // valores vindos de outra tabela, por /options

export interface OpcaoFixa {
  value: string;
  label: string;
  /**
   * Uma linha explicando a opção, à vista no formulário ao lado de cada uma.
   *
   * Existe porque o rótulo de uma opção não carrega a diferença entre duas
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
  /** O exemplo dentro do campo vazio. */
  placeholder?: string;
  /** Com a linha em uso, o valor não muda: o servidor recusaria depois do Salvar. */
  travaEmUso?: boolean;
}

type RenderColuna = 'texto' | 'enum' | 'status' | 'ativo' | 'relacao' | 'contagem' | 'link';

export interface ColunaSpec {
  key: string;
  label: string;
  render?: RenderColuna;
  /** `enum` e `status`: para traduzir o valor do banco no rótulo em português */
  opcoes?: readonly OpcaoFixa[];
  /** Some abaixo de `lg`: na tela estreita ficam o nome, a coluna principal e o `⋯`. */
  soNoDesktop?: boolean;
}

/**
 * Uma ação por LINHA além de editar e excluir.
 *
 * Por que isto existe: as sete tabelas são o MESMO CRUD — as seis abas de
 * Configurações e a página Colaboradores —, e foi essa igualdade que permitiu
 * um componente só (`CadastroDoCatalogo`). Duas ações quebram a igualdade sem
 * quebrar o componente, e só Colaboradores as tem: Desativar/Ativar (as seis
 * abas não se desativam, AO); e Ficha, que leva à tela do que está com a pessoa.
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
 * Quem a trata é o `CadastroDoCatalogo`: grava na hora, ou abre a ficha pelo
 * caminho que a página lhe dá.
 */
export type AcaoLinhaId = 'ativacao' | 'ficha';

export interface AcaoLinhaSpec {
  id: AcaoLinhaId;
  /** O nome da ação no `⋯` da linha. */
  titulo: string;
  /**
   * Ação que ALTERNA um booleano da linha — Desativar/Ativar. O `titulo` vale
   * com o campo ligado; `tituloSeDesligado`, com ele desligado. A linha com o
   * campo desligado aparece esmaecida, com a coluna Status, para o estado não depender de
   * abrir o menu.
   */
  alterna?: { campo: string; tituloSeDesligado: string };
}

export interface CatalogUiSpec {
  /** Bate com o slug da rota: 'categories' → /api/categories */
  slug: string;
  /** A aba no endereço: `?aba=modelos`. Em português, como as rotas da tela. */
  chave: string;
  aba: string;
  /** O ícone da aba e da lista vazia. Não repete os do menu. */
  icone: LucideIcon;
  singular: string;
  /**
   * O gênero do `singular`, para o "Novo …"/"Nova …" e o "Nenhum …"/"Nenhuma …".
   *
   * Declarado, e não deduzido da última letra: "Status" e "Fabricante" não
   * terminam em `o` e são masculinos, "Localização" não termina em `a` e é
   * feminina, e "Motivo de baixa" termina em `a` e é masculino.
   */
  genero: 'm' | 'f';
  placeholderBusca: string;
  colunas: readonly ColunaSpec[];
  campos: readonly CampoSpec[];
  /** As ações além de editar e excluir — Desativar e Ficha, só em Colaboradores (AO). Ver `AcaoLinhaSpec`. */
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
  /**
   * A tela abre com os cartões Total, Ativos e Desativados (BT). Bate com
   * `cartoesDeStatus` da spec do servidor — hoje só colaboradores.
   */
  cartoesDeStatus?: boolean;
}

// O BOTÃO DESATIVAR/ATIVAR do colaborador (e o mesmo desenho em Usuários): grava
// só `isActive`. Desativado some das listas de escolha e não recebe nada novo,
// e continua no histórico. As seis abas das Configurações não o têm (AO).
export function desativar(): AcaoLinhaSpec {
  return { id: 'ativacao', titulo: 'Desativar', alterna: { campo: 'isActive', tituloSeDesligado: 'Ativar' } };
}

// "Nova categoria", "Novo status": o mesmo nome no botão e no título do formulário,
// em minúscula como o "Novo item" e a "Nova licença" das outras telas.
export function tituloDoNovo({ singular, genero }: CatalogUiSpec): string {
  return `${genero === 'f' ? 'Nova' : 'Novo'} ${singular.toLowerCase()}`;
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
    ajuda: 'Item por quantidade, sem patrimônio individual: monitor, teclado, mouse, cabo. '
      + 'Vai para um colaborador ou um posto.' },
  { value: 'COMPONENT', label: 'Componente',
    ajuda: 'Item por quantidade que vai para dentro do computador: memória, SSD. '
      + 'Só um computador recebe, e sai dele pelo Retirar.' },
  { value: 'CONSUMABLE', label: 'Consumível',
    ajuda: 'O que se gasta e não volta: toner, pilha. Vai para um colaborador ou um posto, '
      + 'e a entrega tira do total.' },
  { value: 'LICENSE', label: 'Licença',
    ajuda: 'Software, com a quantidade comprada entregue a pessoas ou a máquinas.' },
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
    ajuda: 'Guardado, pronto para entregar. É o único tipo que libera a entrega.' },
  // Tipo próprio, e não uma variação de "indisponível": a diferença entre estar
  // com um colaborador e estar na assistência é a distinção mais cara do
  // inventário — um gera valor, o outro custa (prisma/schema.prisma).
  { value: 'IN_USE', label: 'Em uso',
    ajuda: 'Com um responsável ou instalado em algum lugar. Fora do estoque porque está cumprindo a função dele.' },
  { value: 'PENDING', label: 'Pendente',
    ajuda: 'Fora do estoque por algum impedimento, e volta: conserto, diagnóstico, trânsito, preparo.' },
  { value: 'UNDEPLOYABLE', label: 'Inutilizável',
    ajuda: 'Ainda é seu, mas não serve mais e não volta. Continua nas listagens e nos relatórios.' },
];
