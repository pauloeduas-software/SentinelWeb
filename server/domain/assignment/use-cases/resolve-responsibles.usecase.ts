import type { prisma } from '../../../core/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';

// CAMADA 3 do docs/MODELO-POSSE.md — a responsabilidade DERIVADA.
//
// Ela NUNCA é coluna. Seria uma quarta fonte de verdade para o que a
// `Assignment` (Camada 1) e o `LocationOccupant` (Camada 2) já dizem, e a
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

export type AlvoPosse = 'USER' | 'ASSET' | 'LOCATION';

/**
 * COMO a responsabilidade chegou até a pessoa.
 *
 * Vai para a tela porque "Laura, direto" e "Laura, pelo posto Mesa 1 no turno
 * da manhã" são fatos diferentes sobre o mesmo ativo: o primeiro se desfaz com
 * uma devolução, o segundo com uma troca de escala.
 */
export type ViaPosse = 'DIRETO' | 'POSTO' | 'ATIVO';

export interface Responsavel {
  id: string;
  name: string;
  email: string;
  via: ViaPosse;
  /** Só quando `via === 'POSTO'`: turno é atributo do vínculo pessoa↔posto. */
  shift: string | null;
  /** Só quando `via === 'POSTO'`. */
  locationName: string | null;
}

export interface PosseResolvida {
  assignmentId: string | null;
  targetType: AlvoPosse | null;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Notebook". */
  targetLabel: string | null;
  responsaveis: Responsavel[];
  /**
   * Alvo LOCATION sem NENHUM ocupante aberto — equipamento parado em posto
   * vazio. Não é erro: é o sinal operacional que o MODELO-POSSE.md pede e que
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
  return { assignmentId: null, targetType: null, targetLabel: null, responsaveis: [], postoVago: false };
}

// O mínimo que a resolução precisa de uma posse aberta. Repetido nas duas
// consultas (a do ativo e a do salto de ASSET) de propósito: são a MESMA forma.
const SELECT_POSSE = {
  id: true,
  assetId: true,
  targetType: true,
  targetUserId: true,
  targetAssetId: true,
  targetLocationId: true,
} as const;

interface PosseAberta {
  id: string;
  assetId: string;
  targetType: AlvoPosse;
  targetUserId: string | null;
  targetAssetId: string | null;
  targetLocationId: string | null;
}

interface Pessoa {
  id: string;
  name: string;
  email: string;
}

interface OcupanteAberto {
  locationId: string;
  shift: string | null;
  user: Pessoa;
}

/** Tudo que as consultas em lote trouxeram, indexado por id, para o `montar` ser memória pura. */
interface Dicionarios {
  pessoas: Map<string, Pessoa>;
  nomesDeLocal: Map<string, string>;
  ocupantesPorLocal: Map<string, OcupanteAberto[]>;
  rotulosDeAtivo: Map<string, string>;
  /** A posse aberta do ativo-ALVO — o salto de ASSET, limitado a este mapa e só. */
  posseDoAlvo: Map<string, PosseAberta>;
}

function unicos(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function rotuloDeAtivo(ativo: { assetTag: string; name: string | null; model: { name: string } }): string {
  // O nome próprio do ativo quando existe; senão o do modelo — "ATV-00012" só
  // não diz nada a quem está lendo a tela de outro ativo.
  const complemento = ativo.name || ativo.model.name;
  return complemento ? `${ativo.assetTag} — ${complemento}` : ativo.assetTag;
}

function pessoaComoResponsavel(pessoa: Pessoa, via: ViaPosse): Responsavel {
  return { ...pessoa, via, shift: null, locationName: null };
}

function ocupanteComoResponsavel(ocupante: OcupanteAberto, nomeDoLocal: string | null, via: ViaPosse): Responsavel {
  // `shift` e `locationName` SÓ em `POSTO`, por contrato: no salto de ASSET o
  // que a tela precisa mostrar é o ativo detentor ("responde pela dock"), e o
  // posto do detentor ali seria uma terceira informação sem lugar na frase.
  const dePosto = via === 'POSTO';
  return {
    ...ocupante.user,
    via,
    shift: dePosto ? ocupante.shift : null,
    locationName: dePosto ? nomeDoLocal : null,
  };
}

/** Os responsáveis do ATIVO-ALVO — o segundo e ÚLTIMO nível do salto. */
function responsaveisPeloAtivoAlvo(alvo: PosseAberta | undefined, dicionarios: Dicionarios): Responsavel[] {
  // Ativo-alvo sem posse aberta: a dock está no estoque, então ninguém responde
  // pelo que está preso nela.
  if (!alvo) return [];

  if (alvo.targetType === 'USER') {
    const pessoa = alvo.targetUserId ? dicionarios.pessoas.get(alvo.targetUserId) : undefined;
    return pessoa ? [pessoaComoResponsavel(pessoa, 'ATIVO')] : [];
  }

  if (alvo.targetType === 'LOCATION' && alvo.targetLocationId) {
    const ocupantes = dicionarios.ocupantesPorLocal.get(alvo.targetLocationId) ?? [];
    return ocupantes.map((ocupante) => ocupanteComoResponsavel(ocupante, null, 'ATIVO'));
  }

  // Alvo do alvo também é ASSET: o salto PARA AQUI, sem recursão.
  //
  // O limite é de propósito (MODELO-POSSE.md, Camada 3): dock → notebook →
  // pessoa resolve o caso real, e cadeia mais longa é sintoma de modelagem
  // errada — a mesma que, sem limite, vira ciclo e trava o processo.
  return [];
}

function montar(posse: PosseAberta, dicionarios: Dicionarios): PosseResolvida {
  if (posse.targetType === 'USER') {
    const pessoa = posse.targetUserId ? dicionarios.pessoas.get(posse.targetUserId) : undefined;
    return {
      assignmentId: posse.id,
      targetType: 'USER',
      targetLabel: pessoa?.name ?? null,
      responsaveis: pessoa ? [pessoaComoResponsavel(pessoa, 'DIRETO')] : [],
      postoVago: false,
    };
  }

  if (posse.targetType === 'LOCATION') {
    const nomeDoLocal = posse.targetLocationId ? dicionarios.nomesDeLocal.get(posse.targetLocationId) ?? null : null;
    const ocupantes = posse.targetLocationId ? dicionarios.ocupantesPorLocal.get(posse.targetLocationId) ?? [] : [];
    return {
      assignmentId: posse.id,
      targetType: 'LOCATION',
      targetLabel: nomeDoLocal,
      responsaveis: ocupantes.map((ocupante) => ocupanteComoResponsavel(ocupante, nomeDoLocal, 'POSTO')),
      postoVago: ocupantes.length === 0,
    };
  }

  const alvo = posse.targetAssetId ? dicionarios.posseDoAlvo.get(posse.targetAssetId) : undefined;
  return {
    assignmentId: posse.id,
    targetType: 'ASSET',
    targetLabel: posse.targetAssetId ? dicionarios.rotulosDeAtivo.get(posse.targetAssetId) ?? null : null,
    responsaveis: responsaveisPeloAtivoAlvo(alvo, dicionarios),
    // `postoVago` descreve o alvo DESTE ativo, e o alvo daqui é um ativo, não um
    // posto. O posto vazio do detentor é sinal do DETENTOR, e aparece quando a
    // tela resolver ele.
    postoVago: false,
  };
}

/**
 * A resolução de VÁRIOS ativos em número CONSTANTE de consultas.
 *
 * Esta é a versão que importa. A listagem de ativos resolve 50 linhas de uma
 * vez, e uma consulta por linha seria N+1 — com o agravante de que cada linha
 * custa até três consultas (posse, ocupantes, salto de ativo), ou seja 150
 * viagens ao banco para pintar uma página.
 *
 * São no máximo SEIS `findMany` com `in: [...]`, independentemente de virem 1
 * ou 100 ativos: as posses abertas, as posses dos ativos-alvo (o salto), as
 * pessoas, os locais, os ocupantes e os rótulos dos ativos-alvo. O resto é
 * junção em memória.
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

  // O salto de ASSET em UMA consulta para todos os ativos-alvo de uma vez — é
  // aqui que uma recursão ingênua viraria uma consulta por dock.
  const idsDeAtivoAlvo = unicos(abertas.map((posse) => posse.targetAssetId));
  const abertasDoAlvo: PosseAberta[] = idsDeAtivoAlvo.length === 0
    ? []
    : await client.assignment.findMany({
        where: { assetId: { in: idsDeAtivoAlvo }, checkinAt: null },
        select: SELECT_POSSE,
      });

  // Os dois níveis juntos: quem o salto encontrou precisa de nome e de ocupantes
  // pelo mesmo caminho que o primeiro nível — em uma consulta só, não em duas.
  const todas = [...abertas, ...abertasDoAlvo];
  const idsDePessoa = unicos(todas.map((posse) => posse.targetUserId));
  const idsDeLocal = unicos(todas.map((posse) => posse.targetLocationId));

  // `INCLUINDO_LIXEIRA` nos dois lugares onde o alvo tem soft delete (pessoa e
  // ativo) NÃO é descuido com a lixeira: é o contrário. Filtrado, um colaborador
  // desligado com o notebook na mão devolveria `responsaveis: []` — ou seja,
  // "está no estoque", que é falso e é justamente o equipamento que ninguém
  // quer perder de vista. Aparecendo, ele vira a pendência de checkin que é.
  const pessoas = idsDePessoa.length === 0 ? [] : await client.user.findMany({
    where: { id: { in: idsDePessoa }, ...INCLUINDO_LIXEIRA },
    select: { id: true, name: true, email: true },
  });

  // O nome do local vem em consulta própria, e não do ocupante, porque o posto
  // VAGO também precisa de rótulo — e ele, por definição, não tem ocupante.
  const locais = idsDeLocal.length === 0 ? [] : await client.location.findMany({
    where: { id: { in: idsDeLocal } },
    select: { id: true, name: true },
  });

  const ocupacoes = idsDeLocal.length === 0 ? [] : await client.locationOccupant.findMany({
    where: { locationId: { in: idsDeLocal }, endedAt: null },
    select: { locationId: true, shift: true, user: { select: { id: true, name: true, email: true } } },
    // Turno e depois antiguidade: a lista sai na mesma ordem a cada chamada, e
    // ordem instável faz a tela "piscar" entre dois refreshes idênticos.
    orderBy: [{ shift: 'asc' }, { startedAt: 'asc' }],
  });

  const ativosAlvo = idsDeAtivoAlvo.length === 0 ? [] : await client.asset.findMany({
    where: { id: { in: idsDeAtivoAlvo }, ...INCLUINDO_LIXEIRA },
    select: { id: true, assetTag: true, name: true, model: { select: { name: true } } },
  });

  const ocupantesPorLocal = new Map<string, OcupanteAberto[]>();
  for (const ocupacao of ocupacoes) {
    const lista = ocupantesPorLocal.get(ocupacao.locationId);
    if (lista) lista.push(ocupacao);
    else ocupantesPorLocal.set(ocupacao.locationId, [ocupacao]);
  }

  const dicionarios: Dicionarios = {
    pessoas: new Map(pessoas.map((pessoa) => [pessoa.id, pessoa])),
    nomesDeLocal: new Map(locais.map((local) => [local.id, local.name])),
    ocupantesPorLocal,
    rotulosDeAtivo: new Map(ativosAlvo.map((ativo) => [ativo.id, rotuloDeAtivo(ativo)])),
    posseDoAlvo: new Map(abertasDoAlvo.map((posse) => [posse.assetId, posse])),
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
