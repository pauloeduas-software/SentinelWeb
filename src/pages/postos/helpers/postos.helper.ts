import type { NovoPostoInput } from '../../../domain/workstation/workstation.queries';
import type { Posto, PostoOcupante, PostoView } from '../../../domain/shared/workstation.types';

// Leitura de um posto para a tela — funções puras, fora do JSX
// (docs/ARQUITETURA.md). Camadas 1 e 2 de docs/MODELO-POSSE.md, vistas do lado
// do posto.

export const TRACO = '—';

/** Os três recortes da tela, na ordem em que aparecem. */
export const VISOES: readonly { valor: PostoView; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'vagos', rotulo: 'Vagos' },
  { valor: 'ocupados', rotulo: 'Ocupados' },
];

/**
 * O que o contador do cabeçalho diz, e ele muda com o recorte: em "Vagos", o
 * número na tela é de postos vagos, não de postos. Repetir "postos" nos três
 * casos faria o mesmo número parecer o total da empresa.
 */
export function rotuloDaContagem(total: number, view: PostoView): string {
  const plural = total === 1 ? 'posto' : 'postos';
  if (view === 'vagos') return `${total} ${plural} ${total === 1 ? 'vago' : 'vagos'}`;
  if (view === 'ocupados') return `${total} ${plural} ${total === 1 ? 'ocupado' : 'ocupados'}`;
  return `${total} ${plural}`;
}

/**
 * "Sede › Andar 2 › Sala 3" — onde a mesa fica.
 *
 * Sem ancestral nenhum o posto está na raiz, e escrever isso é mais honesto que
 * um traço: "na raiz" é uma posição; o traço se lê como dado faltando.
 */
export function caminhoDoPosto(caminho: readonly string[]): string {
  return caminho.length > 0 ? caminho.join(' › ') : 'na raiz';
}

/** Uma faixa da escala: o turno e quem o cobre. */
export interface TurnoDoPosto {
  turno: string;
  pessoas: string[];
}

/**
 * Os ocupantes agrupados POR TURNO — é assim que a linha se lê ("Manhã: Laura /
 * Tarde: Ana"), e é a forma que o modelo tem e o Snipe-IT não.
 *
 * O turno é texto livre e pode vir vazio: aí a faixa é "sem turno", que é
 * diferente de não haver ninguém. A ordem vem do servidor (turno, depois
 * antiguidade) e é preservada — reordenar aqui faria a mesma lista sair
 * diferente da que a listagem de ativos mostra.
 */
export function turnosDoPosto(ocupantes: readonly PostoOcupante[]): TurnoDoPosto[] {
  const faixas: TurnoDoPosto[] = [];

  for (const ocupante of ocupantes) {
    const turno = ocupante.shift?.trim() || 'sem turno';
    const nome = ocupante.user?.name ?? ocupante.userId;

    const faixa = faixas.find((item) => item.turno === turno);
    if (faixa) faixa.pessoas.push(nome);
    else faixas.push({ turno, pessoas: [nome] });
  }

  return faixas;
}

/** "3 ativos" / "1 ativo" / "nenhum". */
export function resumoDeAtivos(total: number): string {
  if (total === 0) return 'nenhum';
  return `${total} ${total === 1 ? 'ativo' : 'ativos'}`;
}

/**
 * A frase do selo de posto vago — a explicação, não só o rótulo.
 *
 * Posto vago não é erro de cadastro: é equipamento parado em mesa sem ninguém,
 * candidato a voltar ao estoque. Quem vê o selo pela primeira vez precisa ler
 * o que ele quer dizer, senão trata como bug.
 */
export function explicacaoDoVago(posto: Pick<Posto, 'totalAtivos'>): string {
  return `${resumoDeAtivos(posto.totalAtivos)} entregue${posto.totalAtivos === 1 ? '' : 's'} aqui e ninguém responde por ${posto.totalAtivos === 1 ? 'ele' : 'eles'}.`;
}

/**
 * Formulário → corpo de `POST /locations`.
 *
 * Campo vazio vira AUSENTE, não `''`: `parentId` em branco precisa dizer "sem
 * pai", e o schema do servidor já traduz ausente para `null`. Mandar `''` num
 * campo de uuid seria 422.
 *
 * Endereço, CEP e telefone não entram nem como chave: não querem dizer nada
 * numa mesa, e é por misturá-los que a localização virou um formulário onde o
 * posto se perdia.
 */
export function montarNovoPosto(valores: {
  name: string;
  parentId: string;
  notes: string;
}): NovoPostoInput {
  const corpo: NovoPostoInput = { name: valores.name.trim() };

  if (valores.parentId) corpo.parentId = valores.parentId;
  if (valores.notes.trim()) corpo.notes = valores.notes.trim();

  return corpo;
}
