import { OCCUPANT_SELECT } from '../../occupancy/helpers/occupant-select.helper';
import { OCUPANTES_ABERTOS_ORDER_BY, POSSE_ABERTA } from './workstation-filters.helper';

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
  createdAt: true,

  parentId: true,
  parent: { select: { id: true, name: true } },

  _count: { select: { assignments: { where: POSSE_ABERTA } } },
} as const;

/**
 * O detalhe de um posto.
 *
 * Escrito por extenso em vez de espalhar `WORKSTATION_SELECT` com um campo a
 * mais: aqui os ativos vêm por inteiro, então o `_count` deles seria um segundo
 * número para o mesmo fato — e dois números para o mesmo fato divergem.
 *
 * `manager` só aparece no detalhe: é quem assina o termo de entrega de um posto
 * com duas pessoas (D27), informação de ficha, não de tabela.
 *
 * Os ocupantes reaproveitam o `OCCUPANT_SELECT` do domínio `occupancy` em vez
 * de repetir a lista — quem decide o que é público de uma ocupação continua
 * sendo o dono dela, e uma cópia esquecida aqui vazaria o que lá for fechado.
 */
export const WORKSTATION_DETAIL_SELECT = {
  id: true,
  name: true,
  notes: true,
  isWorkstation: true,
  createdAt: true,

  parentId: true,
  parent: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },

  occupants: {
    where: { endedAt: null },
    select: OCCUPANT_SELECT,
    orderBy: OCUPANTES_ABERTOS_ORDER_BY,
  },
} as const;
