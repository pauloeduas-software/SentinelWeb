import type { prisma } from '../../../infra/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';

// CAMADA 3 do docs/referencia/modelo-de-posse.md — a responsabilidade DERIVADA.
//
// Ela NUNCA é coluna. Seria uma quarta fonte de verdade para o que a
// `Assignment` (Camada 1) e o `WorkstationOccupant` (Camada 2) já dizem, e a
// divergência entre as três seria silenciosa. Aqui ela é calculada na hora, em
// cima das duas — e é por isso que este arquivo é só leitura: ele não grava nada.

/**
 * Cliente aceito pela resolução: tanto o global quanto o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão (`$transaction`, `$connect`…) que o
 * cliente de transação não tem — é o que faz o MESMO código servir os dois, e é
 * o que deixa o checkout resolver responsáveis DENTRO da própria transação, sem
 * enxergar um estado que ainda não existe para ninguém. Mesmo padrão do
 * `ClienteCatalogo` (catalog/specs/catalog-spec.types.ts).
 */
export type ClientePosse = Omit<typeof prisma, `$${string}`>;

export type AlvoPosse = 'PERSON' | 'WORKSTATION';

/**
 * COMO a responsabilidade chegou até a pessoa.
 *
 * Vai para a tela porque "Laura, direto" e "Laura, pelo posto Mesa 1 no turno
 * da manhã" são fatos diferentes sobre o mesmo ativo: o primeiro se desfaz com
 * uma devolução, o segundo com uma troca de escala.
 */
type ViaPosse = 'DIRETO' | 'POSTO';

export interface Responsavel {
  id: string;
  name: string;
  email: string | null;
  via: ViaPosse;
  /** Só quando `via === 'POSTO'`: turno é atributo do vínculo pessoa↔posto. */
  shift: string | null;
  /** Só quando `via === 'POSTO'`. */
  workstationName: string | null;
}

export interface PosseResolvida {
  assignmentId: string | null;
  targetType: AlvoPosse | null;
  /** "Laura Souza", "Mesa 1". */
  targetLabel: string | null;
  responsaveis: Responsavel[];
  /** Quando a posse aberta começou — o `min` do dia da devolução (AM). */
  checkoutAt: Date | null;
  /**
   * Alvo WORKSTATION sem NENHUM ocupante aberto — equipamento parado em posto
   * vazio. Não é erro: é o sinal operacional que o docs/referencia/modelo-de-posse.md pede e que
   * nenhum ITAM de prateleira responde. Candidato a voltar para o estoque.
   */
  postoVago: boolean;
}

/**
 * Objeto NOVO a cada chamada, e não uma constante compartilhada: o array
 * `responsaveis` de uma constante seria o MESMO array em todos os ativos sem
 * posse, e um `push` de quem recebe contaminaria todos de uma vez.
 */
function semPosse(): PosseResolvida {
  return { assignmentId: null, targetType: null, targetLabel: null, responsaveis: [], checkoutAt: null, postoVago: false };
}

// O mínimo que a resolução precisa de uma posse aberta.
const SELECT_POSSE = {
  id: true,
  assetId: true,
  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  checkoutAt: true,
} as const;

interface PosseAberta {
  id: string;
  assetId: string;
  targetType: AlvoPosse;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  checkoutAt: Date;
}

interface Pessoa {
  id: string;
  name: string;
  email: string | null;
}

interface OcupanteAberto {
  workstationId: string;
  shift: string | null;
  person: Pessoa;
}

/** Tudo que as consultas em lote trouxeram, indexado por id, para o `montar` ser memória pura. */
interface Dicionarios {
  pessoas: Map<string, Pessoa>;
  nomesDePosto: Map<string, string>;
  ocupantesPorPosto: Map<string, OcupanteAberto[]>;
}

function unicos(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function pessoaComoResponsavel(pessoa: Pessoa): Responsavel {
  return { ...pessoa, via: 'DIRETO', shift: null, workstationName: null };
}

function ocupanteComoResponsavel(ocupante: OcupanteAberto, nomeDoPosto: string | null): Responsavel {
  return { ...ocupante.person, via: 'POSTO', shift: ocupante.shift, workstationName: nomeDoPosto };
}

function montar(posse: PosseAberta, dicionarios: Dicionarios): PosseResolvida {
  if (posse.targetType === 'PERSON') {
    const pessoa = posse.targetPersonId ? dicionarios.pessoas.get(posse.targetPersonId) : undefined;
    return {
      assignmentId: posse.id,
      targetType: 'PERSON',
      targetLabel: pessoa?.name ?? null,
      responsaveis: pessoa ? [pessoaComoResponsavel(pessoa)] : [],
      checkoutAt: posse.checkoutAt,
      postoVago: false,
    };
  }

  const nomeDoPosto = posse.targetWorkstationId ? dicionarios.nomesDePosto.get(posse.targetWorkstationId) ?? null : null;
  const ocupantes = posse.targetWorkstationId ? dicionarios.ocupantesPorPosto.get(posse.targetWorkstationId) ?? [] : [];
  return {
    assignmentId: posse.id,
    targetType: 'WORKSTATION',
    targetLabel: nomeDoPosto,
    responsaveis: ocupantes.map((ocupante) => ocupanteComoResponsavel(ocupante, nomeDoPosto)),
    checkoutAt: posse.checkoutAt,
    postoVago: ocupantes.length === 0,
  };
}

/**
 * A resolução de VÁRIOS ativos em número CONSTANTE de consultas.
 *
 * Esta é a versão que importa. A listagem de ativos resolve 50 linhas de uma
 * vez, e uma consulta por linha seria N+1 — com o agravante de que cada linha
 * custa até duas consultas (posse, ocupantes), ou seja 100 viagens ao banco
 * para pintar uma página.
 *
 * São no máximo QUATRO `findMany` com `in: [...]`, independentemente de virem 1
 * ou 100 ativos: as posses abertas, as pessoas, os postos e os ocupantes. O
 * resto é junção em memória.
 *
 * A versão de um ativo só (`resolverResponsaveis`) chama esta — uma
 * implementação, uma regra. Duas cópias da Camada 3 divergiriam no primeiro
 * ajuste.
 */
export async function resolverResponsaveisEmLote(
  client: ClientePosse,
  assetIds: string[],
): Promise<Map<string, PosseResolvida>> {
  // Todo id pedido sai no mapa, inclusive o que não tem posse: quem chama itera
  // a própria lista e um `get` sem resposta viraria `undefined` no meio do laço.
  const resultado = new Map<string, PosseResolvida>();
  for (const assetId of assetIds) resultado.set(assetId, semPosse());
  if (assetIds.length === 0) return resultado;

  const abertas: PosseAberta[] = await client.assignment.findMany({
    where: { assetId: { in: assetIds }, checkinAt: null },
    select: SELECT_POSSE,
  });
  // Frota inteira no estoque: nada mais a perguntar ao banco.
  if (abertas.length === 0) return resultado;

  const idsDePessoa = unicos(abertas.map((posse) => posse.targetPersonId));
  const idsDePosto = unicos(abertas.map((posse) => posse.targetWorkstationId));

  // `INCLUINDO_LIXEIRA` e desativados inclusive. A invariante 6 impede excluir
  // ou desativar quem está com algo, mas um banco antigo pode ter: filtrado,
  // esse colaborador devolveria `responsaveis: []` — "está no estoque", que é
  // falso e é justamente o equipamento que ninguém quer perder de vista.
  const pessoas = idsDePessoa.length === 0 ? [] : await client.person.findMany({
    where: { id: { in: idsDePessoa }, ...INCLUINDO_LIXEIRA },
    select: { id: true, name: true, email: true },
  });

  // O nome do posto vem em consulta própria, e não do ocupante, porque o posto
  // VAGO também precisa de rótulo — e ele, por definição, não tem ocupante.
  const postos = idsDePosto.length === 0 ? [] : await client.workstation.findMany({
    where: { id: { in: idsDePosto } },
    select: { id: true, name: true },
  });

  const ocupacoes = idsDePosto.length === 0 ? [] : await client.workstationOccupant.findMany({
    where: { workstationId: { in: idsDePosto }, endedAt: null },
    select: { workstationId: true, shift: true, person: { select: { id: true, name: true, email: true } } },
    // Turno e depois antiguidade: a lista sai na mesma ordem a cada chamada, e
    // ordem instável faz a tela "piscar" entre dois refreshes idênticos.
    orderBy: [{ shift: 'asc' }, { startedAt: 'asc' }],
  });

  const ocupantesPorPosto = new Map<string, OcupanteAberto[]>();
  for (const { workstationId, ...ocupacao } of ocupacoes) {
    // Aberta aponta sempre para o posto (CHECK `workstation_occupants_posto_presente`);
    // `workstationId` só é nulo na encerrada de um posto excluído, que esta
    // consulta nem traz. O `if` é para o tipo, não para o dado.
    if (!workstationId) continue;
    const ocupante = { ...ocupacao, workstationId };
    const lista = ocupantesPorPosto.get(workstationId);
    if (lista) lista.push(ocupante);
    else ocupantesPorPosto.set(workstationId, [ocupante]);
  }

  const dicionarios: Dicionarios = {
    pessoas: new Map(pessoas.map((pessoa) => [pessoa.id, pessoa])),
    nomesDePosto: new Map(postos.map((posto) => [posto.id, posto.name])),
    ocupantesPorPosto,
  };

  for (const posse of abertas) resultado.set(posse.assetId, montar(posse, dicionarios));

  return resultado;
}

/** Quem responde por UM ativo. Atalho sobre a versão em lote — ver o porquê lá. */
export async function resolverResponsaveis(
  client: ClientePosse,
  assetId: string,
): Promise<PosseResolvida> {
  const mapa = await resolverResponsaveisEmLote(client, [assetId]);
  return mapa.get(assetId) ?? semPosse();
}
