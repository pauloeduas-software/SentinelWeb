import type { Contagem } from '../../../components/CartoesDeContagem';
import type { PostoInput } from '../../../queries/workstation.queries';
import type {
  AtivoDoPosto, Posto, PostoStats, PostoView,
} from '../../../types/workstation.types';

// Leitura de um posto para a tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md). Camadas 1 e 2 de docs/referencia/modelo-de-posse.md, vistas do lado
// do posto.

export const TRACO = '—';

/** Os cartões da tela: o Total e um status por cartão, na cor do selo da tabela. */
export function contagensDosPostos(stats: PostoStats | undefined): Contagem<PostoView>[] {
  return [
    { valor: 'todos', rotulo: 'Total', total: stats?.total },
    { valor: 'ocupados', rotulo: 'Ocupados', total: stats?.ocupados, tom: 'sucesso' },
    { valor: 'vagos', rotulo: 'Vagos', total: stats?.vagos, tom: 'aviso' },
    { valor: 'sem-uso', rotulo: 'Sem uso', total: stats?.semUso, tom: 'neutro' },
  ];
}

const RECORTES: readonly PostoView[] = ['todos', 'ocupados', 'vagos', 'sem-uso'];

/** `?status=` da lista. O que não é recorte vale `todos`: o servidor recusaria com 422. */
export function recorteDaUrl(valor: string | null): PostoView {
  return RECORTES.find((recorte) => recorte === valor) ?? 'todos';
}

/** Quantos nomes cabem na coluna Responsáveis: o resto vira "+N". */
const NOMES_NA_COLUNA = 2;

/** Todos os nomes, na ordem do servidor. É o `title` da coluna. */
export function nomesDoPosto(posto: Pick<Posto, 'ocupantes'>): string[] {
  return posto.ocupantes.map((ocupante) => ocupante.person?.name ?? ocupante.personId);
}

/**
 * A coluna Responsáveis: só os nomes (BO), os dois primeiros e quantos faltam, "Ana, Bruno
 * +3". O turno fica na ficha do posto, e o posto vago, no Status.
 */
export function quemEstaNoPosto(posto: Pick<Posto, 'ocupantes'>): string {
  const nomes = nomesDoPosto(posto);
  const primeiros = nomes.slice(0, NOMES_NA_COLUNA).join(', ');
  const resto = nomes.length - NOMES_NA_COLUNA;
  return resto > 0 ? `${primeiros} +${resto}` : primeiros || TRACO;
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
