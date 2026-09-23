// A spec de INTERFACE de uma tabela de catálogo: rótulo em português, que campos
// o formulário mostra e que colunas a tabela mostra.
//
// É irmã da spec do servidor (server/domain/catalog/specs/), não a mesma: lá se
// decide o que é válido e o que pode sair na resposta; aqui, como isso aparece
// na tela. Mora em `pages/` porque é decisão de tela — e por isso não importa
// nada de `core/api` (o lint recusa).

export type TipoCampo =
  | 'text' | 'textarea' | 'color' | 'number' | 'checkbox'
  | 'select'    // valores fixos, vindos de um enum do banco
  | 'reference' // valores vindos de outra tabela, por /options
  | 'money';

export interface OpcaoFixa {
  value: string;
  label: string;
  /**
   * Uma linha explicando a opção, mostrada no formulário quando ela está
   * selecionada.
   *
   * Existe porque rótulo de `<select>` não carrega a diferença entre duas
   * opções parecidas — e as cinco de `StatusLabel.type` são exatamente isso.
   * A dúvida aparece na hora de escolher, então a resposta vai ali.
   */
  ajuda?: string;
}

export interface CampoSpec {
  key: string;
  label: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  placeholder?: string;
  /** `select`: a lista fixa */
  opcoes?: readonly OpcaoFixa[];
  /** `reference`: de onde vêm as opções ('manufacturers', 'users'…) */
  rota?: string;
  /** `reference`: filtra o /options (só categorias de ATIVO, por exemplo) */
  filtroTipo?: string;
  /** Ocupa a linha inteira do formulário em vez de meia */
  largura?: 'inteira';
  /**
   * Uma linha sob o campo. Usada sobretudo para marcar o que ainda NÃO tem
   * efeito: um checkbox que grava o dado mas não muda comportamento nenhum é
   * tão enganoso quanto um rótulo errado.
   */
  ajuda?: string;
}

export type RenderColuna = 'texto' | 'cor' | 'enum' | 'relacao' | 'booleano' | 'meses' | 'moeda';

export interface ColunaSpec {
  key: string;
  label: string;
  render?: RenderColuna;
  /** `enum`: para traduzir o valor do banco no rótulo em português */
  opcoes?: readonly OpcaoFixa[];
  /** `moeda`: o campo irmão que diz se é % ou R$ */
  campoTipo?: string;
}

/**
 * Uma ação por LINHA além de editar e excluir.
 *
 * Por que isto existe: as sete abas são o MESMO CRUD, e foi essa igualdade que
 * permitiu uma tela só. Localizações quebrou a igualdade em UM ponto — um posto
 * tem ocupantes (docs/MODELO-POSSE.md, Camada 2), e as outras seis tabelas não
 * têm nada parecido.
 *
 * As duas saídas ruins eram: uma tela separada só para Localizações (volta a
 * duplicação que a spec eliminou) ou um `if (slug === 'locations')` no meio do
 * componente genérico (a exceção escondida, que a próxima pessoa copia). A
 * saída é esta: a tabela desenha as ações que a SPEC declarar, e a aba que não
 * declara nenhuma continua exatamente como era — sem botão, sem coluna a mais,
 * sem `if`.
 *
 * O `id` é uma união fechada, e não `string`, de propósito: quem adicionar uma
 * ação nova é obrigado pelo compilador a tratá-la no `switch` de quem abre o
 * modal. Ação declarada e não tratada vira erro de tipo, não botão morto.
 */
export type AcaoLinhaId = 'ocupantes';

export interface AcaoLinhaSpec {
  id: AcaoLinhaId;
  /** Vira o `title` do botão — é o que o usuário lê ao passar o mouse. */
  titulo: string;
}

export interface CatalogUiSpec {
  /** Bate com o slug da rota: 'categories' → /api/categories */
  slug: string;
  aba: string;
  singular: string;
  descricao: string;
  placeholderBusca: string;
  colunas: readonly ColunaSpec[];
  campos: readonly CampoSpec[];
  /** Ausente nas seis abas que só têm o CRUD. Ver `AcaoLinhaSpec`. */
  acoes?: readonly AcaoLinhaSpec[];
}

// Traduções dos enums do banco. Ficam aqui, num lugar só, porque a tabela e o
// formulário precisam das MESMAS listas — separadas, divergiriam no primeiro
// valor novo.
// O tipo da categoria diz a que MÓDULO ela pertence: uma categoria de Ativo não
// agrupa licenças, e a diferença entre acessório, consumível e componente é o
// que acontece na devolução.
export const TIPOS_CATEGORIA: readonly OpcaoFixa[] = [
  { value: 'ASSET', label: 'Ativo',
    ajuda: 'Equipamento único, com etiqueta e número de série. Uma linha por equipamento.' },
  { value: 'ACCESSORY', label: 'Acessório',
    ajuda: 'Tem quantidade. Empresta para uma pessoa e volta. Ex.: mouse, headset, dock.' },
  { value: 'CONSUMABLE', label: 'Consumível',
    ajuda: 'Tem quantidade. Sai do estoque e NÃO volta. Ex.: toner, cabo, pilha.' },
  { value: 'COMPONENT', label: 'Componente',
    ajuda: 'Tem quantidade. Vai DENTRO de um ativo. Ex.: pente de RAM, SSD, placa de vídeo.' },
  { value: 'LICENSE', label: 'Licença',
    ajuda: 'Software, com assentos atribuídos a pessoas ou a máquinas.' },
];

// Os cinco tipos de status, em palavras distintas entre si.
//
// A versão anterior tinha DOIS rótulos começando com "Parado —", o que os
// tornava indistinguíveis de relance, e não explicava a diferença entre
// "não volta" e "fora de operação". As distinções que confundem são estas:
//
//   Em uso       — fora do estoque porque está CUMPRINDO a função. Gera valor.
//   Pendente     — fora do estoque por IMPEDIMENTO, e volta. Custa dinheiro.
//   Inutilizável — ainda é SEU, mas não serve. Continua nas listagens e nos
//                  relatórios, porque custou dinheiro e precisa ser auditado.
//   Arquivado    — SAIU da operação (vendido, descartado, doado). Some das
//                  listagens do dia a dia e fica só no histórico.
export const TIPOS_STATUS: readonly OpcaoFixa[] = [
  { value: 'DEPLOYABLE', label: 'Disponível',
    ajuda: 'Em estoque, pronto para entregar. É o único tipo que libera a entrega.' },
  // Tipo próprio, e não uma variação de "indisponível": a diferença entre estar
  // com um colaborador e estar na assistência é a distinção mais cara do
  // inventário — um gera valor, o outro custa (prisma/schema.prisma).
  { value: 'IN_USE', label: 'Em uso',
    ajuda: 'Com um colaborador ou instalado em algum lugar. Fora do estoque porque está cumprindo a função dele.' },
  { value: 'PENDING', label: 'Pendente',
    ajuda: 'Fora do estoque por algum impedimento, e volta. Ex.: em conserto, em diagnóstico, em trânsito, falta formatar.' },
  { value: 'UNDEPLOYABLE', label: 'Inutilizável',
    ajuda: 'Ainda é seu, mas não serve mais. Continua nas listagens e nos relatórios. Ex.: danificado, perdido, roubado.' },
  { value: 'ARCHIVED', label: 'Arquivado',
    ajuda: 'Saiu da operação: vendido, descartado ou doado. Some das listagens do dia a dia e fica só no histórico.' },
];

export const TIPOS_RESIDUAL: readonly OpcaoFixa[] = [
  { value: 'PERCENT', label: 'Percentual (%)',
    ajuda: 'O piso é uma porcentagem do valor de compra. Ex.: 10% de R$ 5.000 = R$ 500.' },
  { value: 'AMOUNT', label: 'Valor fixo (R$)',
    ajuda: 'O piso é um valor em reais, igual para todos os ativos que usarem esta regra.' },
];
