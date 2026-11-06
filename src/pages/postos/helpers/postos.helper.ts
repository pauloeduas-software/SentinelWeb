import type { Contagem } from '../../../components/CartoesDeContagem';
import type { PostoInput } from '../../../queries/workstation.queries';
import type {
  AtivoDoPosto, Posto, PostoOcupante, PostoStats, PostoView,
} from '../../../types/workstation.types';

// Leitura de um posto para a tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md). Camadas 1 e 2 de docs/referencia/modelo-de-posse.md, vistas do lado
// do posto.

export const TRACO = '—';

/** Os cartões da tela: o Total e uma situação por cartão, na cor do selo da tabela. */
export function contagensDosPostos(stats: PostoStats | undefined): Contagem<PostoView>[] {
  return [
    { valor: 'todos', rotulo: 'Total', total: stats?.total },
    { valor: 'ocupados', rotulo: 'Ocupados', total: stats?.ocupados, tom: 'sucesso' },
    { valor: 'vagos', rotulo: 'Vagos', total: stats?.vagos, tom: 'aviso' },
    { valor: 'sem-uso', rotulo: 'Sem uso', total: stats?.semUso, tom: 'neutro' },
  ];
}

const RECORTES: readonly PostoView[] = ['todos', 'ocupados', 'vagos', 'sem-uso'];

/** `?situacao=` da lista. O que não é recorte vale `todos`: o servidor recusaria com 422. */
export function recorteDaUrl(valor: string | null): PostoView {
  return RECORTES.find((recorte) => recorte === valor) ?? 'todos';
}

/** Uma faixa da escala: o turno e quem o cobre. */
interface TurnoDoPosto {
  turno: string;
  pessoas: string[];
}

const SEM_TURNO = 'sem turno';

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
    const turno = ocupante.shift?.trim() || SEM_TURNO;
    const nome = ocupante.person?.name ?? ocupante.personId;

    const faixa = faixas.find((item) => item.turno === turno);
    if (faixa) faixa.pessoas.push(nome);
    else faixas.push({ turno, pessoas: [nome] });
  }

  return faixas;
}

/**
 * A coluna Quem está, numa linha: "Manhã: Laura · Tarde: Ana". No posto vago, a frase
 * do selo: é o sinal que a tela existe para dar.
 */
export function quemEstaNoPosto(posto: Pick<Posto, 'ocupantes' | 'vago' | 'totalAtivos'>): string {
  if (posto.vago) return explicacaoDoVago(posto);
  const faixas = turnosDoPosto(posto.ocupantes);
  if (faixas.length === 0) return TRACO;
  return faixas
    .map(({ turno, pessoas }) => (turno === SEM_TURNO ? pessoas.join(', ') : `${turno}: ${pessoas.join(', ')}`))
    .join(' · ');
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
