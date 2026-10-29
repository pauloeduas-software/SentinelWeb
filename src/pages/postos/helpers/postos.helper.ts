import type { PostoInput } from '../../../domain/workstation/workstation.queries';
import type {
  AtivoDoPosto, Posto, PostoOcupante, PostoView,
} from '../../../domain/shared/workstation.types';

// Leitura de um posto para a tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md). Camadas 1 e 2 de docs/referencia/modelo-de-posse.md, vistas do lado
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

/** Uma faixa da escala: o turno e quem o cobre. */
interface TurnoDoPosto {
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
    const nome = ocupante.person?.name ?? ocupante.personId;

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
 * Os ativos deste posto que TÊM MÁQUINA VINCULADA — os que têm telemetria.
 *
 * Todo ativo é um computador (o que não é máquina é estoque), e um posto tem
 * no máximo um — é a invariante 19. O que varia é se o agente já foi vinculado
 * a ele: sem máquina, o computador está na mesa mas a ficha não tem o que
 * medir. A resposta é uma LISTA para a ficha conseguir mostrar o dado de antes
 * da regra, se ele existir.
 */
type AtivoComMaquina = AtivoDoPosto & { endpointId: string };

export function ativosComMaquina(ativos: readonly AtivoDoPosto[]): AtivoComMaquina[] {
  // Predicado de tipo, e não `filter` + `as`: é o filtro que sabe que o campo
  // não é nulo, e dizê-lo aqui poupa um cast em cada lugar que usa a lista.
  return ativos.filter((ativo): ativo is AtivoComMaquina => ativo.endpointId !== null);
}

/**
 * Formulário → corpo de `POST` (criar) ou `PUT` (editar) `/workstations`.
 *
 * Na CRIAÇÃO, nota vazia vira AUSENTE. Na EDIÇÃO ela vai como `null`: é como
 * se apaga uma nota que existia — ausente diria "não mexe" e a nota velha
 * ficaria.
 */
export function montarPosto(
  valores: { name: string; locationId: string; notes: string },
  edicao: boolean,
): PostoInput {
  const corpo: PostoInput = { name: valores.name.trim(), locationId: valores.locationId };
  const nota = valores.notes.trim();

  if (nota) corpo.notes = nota;
  else if (edicao) corpo.notes = null;

  return corpo;
}
