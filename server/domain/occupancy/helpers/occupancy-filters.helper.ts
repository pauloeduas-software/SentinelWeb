import type { Prisma } from '@prisma/client';

/**
 * As duas perguntas que as listagens da Camada 2 respondem.
 *
 * `current` — quem ocupa o posto AGORA (`endedAt IS NULL`). É o padrão porque é
 * a pergunta da operação e a que a Camada 3 usa para resolver responsáveis
 * (docs/MODELO-POSSE.md).
 *
 * `all` — o histórico inteiro, aberto e encerrado. Existe porque encerrar não é
 * apagar: "quem respondia pela Mesa 1 em março?" precisa continuar respondível,
 * pelo mesmo motivo que o `ActivityLog` é append-only.
 *
 * NÃO são o `active`/`trashed` do `core/http/list-query.ts`, e os nomes são
 * diferentes de propósito: lá o par fala de lixeira (linha apagada), aqui fala
 * de vigência (linha viva que terminou). Reaproveitar a palavra faria parecer
 * que uma ocupação encerrada foi excluída — e ela não foi.
 */
export type OccupancyView = 'current' | 'all';

/**
 * Recorte de vigência da consulta.
 *
 * Em `all` o filtro é VAZIO, não `endedAt: { not: null }`: "histórico" aqui
 * significa tudo, aberto inclusive — a tela que mostra o histórico de um posto
 * precisa mostrar quem ainda está nele no meio da lista.
 */
export function buildViewWhere(view: OccupancyView): Prisma.LocationOccupantWhereInput {
  return view === 'current' ? { endedAt: null } : {};
}

/**
 * Ordem das duas listagens.
 *
 * Aberta primeiro, depois a mais recente: no Postgres `ASC` joga NULL para o
 * FIM por padrão, então sem o `nulls: 'first'` explícito o histórico abriria
 * pelas ocupações já encerradas e o ocupante atual — a informação que se
 * procura — apareceria no rodapé.
 *
 * Em `view=current` a primeira chave não faz nada (todo `endedAt` é nulo); ela
 * existe para a `all`, e manter UMA ordem para as duas é o que permite a mesma
 * tabela renderizar as duas visões.
 */
export const OCCUPANT_ORDER_BY: Prisma.LocationOccupantOrderByWithRelationInput[] = [
  { endedAt: { sort: 'asc', nulls: 'first' } },
  { startedAt: 'desc' },
];
