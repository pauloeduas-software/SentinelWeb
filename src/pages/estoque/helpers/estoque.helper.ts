import type {
  ItemDeEstoque, MotivoDoAjuste, MovimentoDoItem, StockKind, StockSlug,
} from '../../../domain/shared/stock.types';

// As três abas e a leitura de uma linha de estoque — funções e dados PUROS,
// sem I/O e fora do JSX (docs/ARQUITETURA.md).
//
// Fica em `helpers/` também porque um arquivo que exporta componente E
// constante quebra o fast refresh do Vite, e o lint reprova.

export interface AbaDeEstoque {
  kind: StockKind;
  slug: StockSlug;
  rotulo: string;
  /**
   * O mesmo nome no singular, DECLARADO — não derivado do plural.
   *
   * Tirar a última letra de "Consumíveis" dá "Consumívei". Português não
   * pluraliza por sufixo único, e qualquer regra que eu escrevesse aqui erraria
   * na próxima palavra: um rótulo é DADO, e dado se escreve, não se calcula.
   */
  singular: string;
  /** O que a aba é, em uma linha — some a dúvida "onde cadastro o mouse?". */
  descricao: string;
  /** O verbo da saída. Os três são diferentes, e é essa a fase inteira. */
  acao: string;
}

export const ABAS_DE_ESTOQUE: readonly AbaDeEstoque[] = [
  {
    kind: 'ACCESSORY',
    slug: 'accessories',
    rotulo: 'Acessórios',
    singular: 'acessório',
    descricao: 'Sai para uma pessoa ou para um posto, e volta. Mouse, teclado, headset sem patrimônio.',
    acao: 'Entregar',
  },
  {
    kind: 'CONSUMABLE',
    slug: 'consumables',
    rotulo: 'Consumíveis',
    singular: 'consumível',
    descricao: 'Sai e não volta. Resma, toner, café. A devolução não existe — nem no banco.',
    acao: 'Dar baixa',
  },
  {
    kind: 'COMPONENT',
    slug: 'components',
    rotulo: 'Componentes',
    singular: 'componente',
    descricao: 'Vai para DENTRO de um ativo, e volta — inclusive em parte. Pente de RAM, HD, placa.',
    acao: 'Instalar',
  },
];

export function abaPorSlug(slug: StockSlug): AbaDeEstoque {
  return ABAS_DE_ESTOQUE.find((aba) => aba.slug === slug) ?? ABAS_DE_ESTOQUE[0];
}

/** Os motivos do ajuste, em português. Espelha o enum do banco (D5). */
export const MOTIVOS_DO_AJUSTE: readonly { valor: MotivoDoAjuste; rotulo: string }[] = [
  { valor: 'COMPRA', rotulo: 'Compra — chegou nota' },
  { valor: 'DEVOLUCAO_FORNECEDOR', rotulo: 'Devolução ao fornecedor' },
  { valor: 'QUEBRA', rotulo: 'Quebra — existia e não existe mais' },
  { valor: 'PERDA', rotulo: 'Perda — ninguém sabe onde está' },
  { valor: 'RECONTAGEM', rotulo: 'Recontagem — a contagem física venceu' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

/**
 * A cor do saldo, como valor de `style` e NUNCA como classe montada em runtime.
 *
 * O Tailwind gera as classes lendo o código-fonte: uma string montada em tempo
 * de execução (`text-${cor}-500`) não existe no CSS final e o elemento sai sem
 * cor nenhuma. É a mesma razão de `StatusLabel.color` ir por `style` na tela do
 * ativo.
 *
 * `null` = sem destaque, a cor herdada da tabela.
 */
export function corDoSaldo(item: Pick<ItemDeEstoque, 'disponivel' | 'estoqueBaixo'>): string | null {
  // Negativo é contagem física e nominal brigando: alguém deu baixa abaixo do
  // que já tinha saído, por fora da API. Merece a cor de erro, não a de aviso.
  if (item.disponivel < 0) return '#ef4444';
  if (item.estoqueBaixo) return '#f59e0b';
  return null;
}

/** "3 / 5" — a coluna principal da tela. Os dois números, sempre. */
export function saldoLegivel(item: Pick<ItemDeEstoque, 'disponivel' | 'qty'>): string {
  return `${item.disponivel} / ${item.qty}`;
}

const ROTULO_DO_MOVIMENTO: Record<string, string> = {
  CHECKOUT: 'Saiu',
  CHECKIN: 'Voltou',
  INSTALL: 'Instalado',
  UNINSTALL: 'Retirado',
  ADJUST: 'Ajuste de quantidade',
};

/**
 * O rótulo do evento — e o **preço do D38, pago aqui**.
 *
 * A retirada parcial divide a linha no banco: a de 4 fecha e nasce uma de 2. O
 * plano declarou que, lido cru, isso pareceria "instalou 4, retirou 4, instalou
 * 2" — e que rotular o par como *devolução parcial* era trabalho de
 * APRESENTAÇÃO, não de schema. Esta função é esse trabalho.
 *
 * O servidor faz a parte que é dele: manda `parcial` já resolvido a partir do
 * vínculo `predecessorId`, e não emite o evento de instalação da sucessora —
 * aquelas unidades nunca voltaram ao estoque.
 */
export function rotuloDoMovimento(movimento: MovimentoDoItem): string {
  const base = ROTULO_DO_MOVIMENTO[movimento.action] ?? movimento.action;
  if (!movimento.parcial) return base;

  return `${base} — parcial: ${movimento.parcial.retirada} de ${movimento.parcial.de}`;
}

/** "+10" / "−3". O sinal explícito é o que faz a coluna se ler de relance. */
export function deltaLegivel(qty: number): string {
  return qty > 0 ? `+${qty}` : `−${Math.abs(qty)}`;
}

/**
 * O corpo do formulário, com os vazios virando `null`.
 *
 * O `<input>` devolve `''` quando o usuário limpa o campo, e `''` num uuid é
 * 422. O servidor lê `null` como "limpar" e `undefined` como "não mexe" — aqui
 * a escolha é `null`, porque a tela sempre manda o formulário inteiro.
 */
export function limpar(valor: string): string | null {
  const texto = valor.trim();
  return texto === '' ? null : texto;
}
