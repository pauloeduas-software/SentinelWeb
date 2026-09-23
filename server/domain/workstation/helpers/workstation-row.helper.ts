// Montagem da linha de posto — funções PURAS, sem I/O. Quem foi ao banco foram
// os use-cases; aqui só se junta o que eles trouxeram.

/** Pessoa embutida num ocupante. */
export interface PessoaDoPosto {
  id: string;
  name: string;
  email: string;
}

/** Quem ocupa o posto AGORA, como a listagem mostra: nome e turno. */
export interface OcupanteDoPosto {
  id: string;
  userId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A" (docs/MODELO-POSSE.md, Camada 2). */
  shift: string | null;
  user: PessoaDoPosto | null;
}

/**
 * O que o use-case leu do banco. Interface explícita, e não o tipo inferido do
 * Prisma, porque um helper não pode importar o use-case que o chama — seria
 * ciclo. A forma bate com `WORKSTATION_SELECT`, e o compilador reclama se
 * divergir.
 */
export interface LocalDePosto {
  id: string;
  name: string;
  notes: string | null;
  isWorkstation: boolean;
  createdAt: Date;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  _count: { assignments: number };
}

export interface WorkstationRow {
  id: string;
  name: string;
  notes: string | null;
  isWorkstation: boolean;
  createdAt: Date;
  parent: { id: string; name: string } | null;
  /** Os ancestrais, da raiz para baixo: `['Sede', 'Andar 2', 'Sala 3']`. */
  caminho: string[];
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
 * responde (docs/MODELO-POSSE.md).
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
  ocupacoes: readonly (OcupanteDoPosto & { locationId: string })[],
): Map<string, OcupanteDoPosto[]> {
  const porPosto = new Map<string, OcupanteDoPosto[]>();

  for (const ocupacao of ocupacoes) {
    // `locationId` fica FORA da linha devolvida: ele é a chave do agrupamento,
    // e repetido dentro de cada ocupante de um posto que já se sabe qual é
    // seria o mesmo uuid escrito M vezes por linha da tabela.
    const ocupante: OcupanteDoPosto = {
      id: ocupacao.id,
      userId: ocupacao.userId,
      shift: ocupacao.shift,
      user: ocupacao.user,
    };

    const lista = porPosto.get(ocupacao.locationId);
    if (lista) lista.push(ocupante);
    else porPosto.set(ocupacao.locationId, [ocupante]);
  }

  return porPosto;
}

export function montarLinhaDePosto(
  local: LocalDePosto,
  ocupantesPorPosto: Map<string, OcupanteDoPosto[]>,
  caminhosPorPai: Map<string, string[]>,
): WorkstationRow {
  const ocupantes = ocupantesPorPosto.get(local.id) ?? [];
  const totalAtivos = local._count.assignments;

  return {
    id: local.id,
    name: local.name,
    notes: local.notes,
    isWorkstation: local.isWorkstation,
    createdAt: local.createdAt,
    parent: local.parent,
    caminho: local.parentId ? caminhosPorPai.get(local.parentId) ?? [] : [],
    ocupantes,
    // Sai do MESMO array que a tela renderiza, e não de um `_count` paralelo:
    // duas contagens do mesmo fato podem divergir, e a que o usuário confere
    // contando os nomes na tela é esta.
    totalOcupantes: ocupantes.length,
    totalAtivos,
    vago: ehPostoVago(ocupantes.length, totalAtivos),
  };
}
