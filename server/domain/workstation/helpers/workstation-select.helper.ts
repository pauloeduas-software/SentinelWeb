import { POSSE_ABERTA } from './workstation-filters.helper';

// O que de um POSTO pode sair para o cliente — allowlist, nunca `include`.
//
// Um posto é uma `Location` (D15), e a tabela `locations` guarda também filial:
// endereço, CEP e telefone. Com `include`, esses campos sairiam por aqui sem
// ninguém ter decidido isso — e eles não querem dizer nada numa mesa, que é
// exatamente o motivo de /postos existir separado do catálogo.

/**
 * O ocupante como a LISTA precisa dele: quem é e em que turno.
 *
 * Enxuto de propósito, e não o `OCCUPANT_SELECT` inteiro: aqui são N postos ×
 * M ocupantes numa resposta só, e `notes`, `createdAt` e o local repetido em
 * cada linha seriam peso que a tabela não mostra.
 */
export const WORKSTATION_OCCUPANT_SELECT = {
  id: true,
  locationId: true,
  userId: true,
  shift: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

/**
 * A linha da listagem.
 *
 * `_count` com `where` é o que evita o N+1 dos ativos: a contagem de posses
 * abertas apontando para cada posto sai na MESMA consulta da página, em vez de
 * uma consulta por linha. Os ocupantes não vêm por `_count` porque a tela
 * mostra os NOMES — eles saem numa segunda consulta, única para a página
 * inteira.
 */
export const WORKSTATION_SELECT = {
  id: true,
  name: true,
  notes: true,
  isWorkstation: true,
  isActive: true,
  createdAt: true,

  _count: { select: { assignments: { where: POSSE_ABERTA } } },
} as const;

/**
 * O detalhe de um posto.
 *
 * Escrito por extenso em vez de espalhar `WORKSTATION_SELECT` com um campo a
 * mais: aqui os ativos vêm por inteiro, então o `_count` deles seria um segundo
 * número para o mesmo fato — e dois números para o mesmo fato divergem.
 *
 * Os ocupantes vêm só CONTADOS: é do número que `vago` sai. A lista com nomes
 * a tela lê da rota de ocupação (`/api/locations/:id/occupants`), onde mora o
 * histórico e que o adicionar/encerrar invalida.
 */
export const WORKSTATION_DETAIL_SELECT = {
  id: true,
  name: true,
  notes: true,
  isWorkstation: true,
  isActive: true,
  createdAt: true,

  _count: { select: { occupants: { where: { endedAt: null } } } },
} as const;
