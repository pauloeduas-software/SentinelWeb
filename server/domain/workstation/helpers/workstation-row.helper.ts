// Montagem da linha de posto — funções PURAS, sem I/O. Quem foi ao banco foram
// os use-cases; aqui só se junta o que eles trouxeram.

/** Pessoa embutida num ocupante. */
interface PessoaDoPosto {
  id: string;
  name: string;
  email: string | null;
}

/** Quem ocupa o posto AGORA, como a listagem mostra: nome e turno. */
interface OcupanteDoPosto {
  id: string;
  personId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A" (docs/referencia/modelo-de-posse.md, Camada 2). */
  shift: string | null;
  person: PessoaDoPosto | null;
}

/**
 * O que o use-case leu do banco. Interface explícita, e não o tipo inferido do
 * Prisma, porque um helper não pode importar o use-case que o chama — seria
 * ciclo. A forma bate com `WORKSTATION_SELECT`, e o compilador reclama se
 * divergir.
 */
interface PostoLido {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  locationId: string;
  location: { id: string; name: string };
  _count: { assignments: number };
}

export interface WorkstationRow {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  locationId: string;
  location: { id: string; name: string };
  ocupantes: OcupanteDoPosto[];
  totalOcupantes: number;
  totalAtivos: number;
  vago: boolean;
}

/**
 * POSTO VAGO: tem equipamento entregue e ninguém respondendo por ele.
 *
 * As duas metades importam. Sem ocupante e sem ativo é só um posto novo — nada
 * a sinalizar. Com ativo e sem ocupante é equipamento parado em mesa vazia,
 * candidato a voltar ao estoque, e é o sinal que nenhum ITAM de prateleira
 * responde (docs/referencia/modelo-de-posse.md).
 *
 * Função, e não a expressão solta em dois lugares: a listagem e o detalhe
 * precisam responder a MESMA coisa, e duas cópias divergiriam no primeiro
 * ajuste.
 */
export function ehPostoVago(totalOcupantes: number, totalAtivos: number): boolean {
  return totalOcupantes === 0 && totalAtivos > 0;
}

/**
 * Agrupa por posto os ocupantes abertos que vieram numa consulta só.
 *
 * É o que troca N+1 (uma consulta de ocupantes por linha da página) por uma
 * junção em memória — o mesmo desenho do `resolverResponsaveisEmLote`.
 */
export function agruparOcupantes(
  ocupacoes: readonly (OcupanteDoPosto & { workstationId: string | null })[],
): Map<string, OcupanteDoPosto[]> {
  const porPosto = new Map<string, OcupanteDoPosto[]>();

  for (const ocupacao of ocupacoes) {
    // Aberta aponta sempre para o posto (CHECK `workstation_occupants_posto_presente`);
    // nulo só na encerrada de um posto excluído, que quem chama nem consulta.
    if (!ocupacao.workstationId) continue;

    // `workstationId` fica FORA da linha devolvida: ele é a chave do agrupamento,
    // e repetido dentro de cada ocupante de um posto que já se sabe qual é
    // seria o mesmo uuid escrito M vezes por linha da tabela.
    const ocupante: OcupanteDoPosto = {
      id: ocupacao.id,
      personId: ocupacao.personId,
      shift: ocupacao.shift,
      person: ocupacao.person,
    };

    const lista = porPosto.get(ocupacao.workstationId);
    if (lista) lista.push(ocupante);
    else porPosto.set(ocupacao.workstationId, [ocupante]);
  }

  return porPosto;
}

export function montarLinhaDePosto(
  posto: PostoLido,
  ocupantesPorPosto: Map<string, OcupanteDoPosto[]>,
): WorkstationRow {
  const ocupantes = ocupantesPorPosto.get(posto.id) ?? [];
  const totalAtivos = posto._count.assignments;

  return {
    id: posto.id,
    name: posto.name,
    notes: posto.notes,
    isActive: posto.isActive,
    createdAt: posto.createdAt,
    locationId: posto.locationId,
    location: posto.location,
    ocupantes,
    // Sai do MESMO array que a tela renderiza, e não de um `_count` paralelo:
    // duas contagens do mesmo fato podem divergir, e a que o usuário confere
    // contando os nomes na tela é esta.
    totalOcupantes: ocupantes.length,
    totalAtivos,
    vago: ehPostoVago(ocupantes.length, totalAtivos),
  };
}
