// O QUE DE UMA MANUTENÇÃO SAI PARA O CLIENTE — allowlist, não `include`.
//
// `cost` é `Decimal` e sai no JSON como STRING ("350.5" — o zero à direita
// some). É assim que o frontend o tipa, e formatar é da tela: converter para
// `number` aqui reintroduziria o erro de centavo que a coluna existe para
// impedir.

export const MAINTENANCE_SELECT = {
  id: true,
  assetId: true,
  supplierId: true,
  type: true,
  title: true,
  startDate: true,
  completionDate: true,
  cost: true,
  isWarranty: true,
  notes: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,

  // O ativo embutido. `assetTag` porque é por ela que se procura na tela global,
  // e o modelo porque "ATV-00012" sozinho não diz o que é o equipamento.
  asset: {
    select: {
      id: true,
      assetTag: true,
      name: true,
      deletedAt: true,
      model: { select: { name: true, manufacturer: { select: { name: true } } } },
    },
  },
  supplier: { select: { id: true, name: true } },
} as const;

/**
 * A linha crua, como o `select` acima a devolve.
 *
 * O `Record<string, unknown>` é o que permite o `as` nos use-cases sem repetir o
 * `GetPayload` do Prisma em cada um. Os campos DECLARADOS são os que algum
 * use-case lê pelo nome — e cada um só entrou aqui quando alguém precisou:
 * `assetId` e `title` porque o log da aba Histórico do ATIVO os carrega, e sem a
 * declaração eles chegam como `unknown` e não atravessam o `changes` do
 * `ActivityLog`.
 */
export interface LinhaDeManutencao extends Record<string, unknown> {
  id: string;
  assetId: string;
  title: string;
  startDate: Date;
  completionDate: Date | null;
}

/** O que o cliente recebe: a linha mais o que é derivado das datas. */
export type ManutencaoNaResposta = LinhaDeManutencao & {
  /** `completionDate IS NULL`. Não é coluna, e não pode ser: divergiria. */
  emAberto: boolean;
  /**
   * Dias corridos desde a abertura, ou `null` quando ela já foi encerrada.
   *
   * Existe porque é o número que a tela mostra ("há 23 dias") e o que o alerta
   * `MANUTENCAO_EM_ABERTO` compara com `maintenanceOpenDays` — derivar isso em
   * três lugares é como as três divergem.
   */
  diasEmAberto: number | null;
};

const UM_DIA = 24 * 60 * 60 * 1000;

/** Dias corridos entre `de` e agora, nunca negativo (abertura futura é 0). */
export function diasDesde(de: Date, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - de.getTime()) / UM_DIA));
}

/**
 * A ÚNICA saída desta camada. Acrescenta o que é derivado, não remove nada.
 *
 * Função pura: recebe `agora` por parâmetro em vez de chamar `new Date()` lá
 * dentro, para o teste poder fixar o dia sem mexer no relógio do processo.
 */
export function paraResposta(
  linha: LinhaDeManutencao,
  agora: Date = new Date(),
): ManutencaoNaResposta {
  return {
    ...linha,
    emAberto: linha.completionDate === null,
    diasEmAberto: linha.completionDate === null ? diasDesde(linha.startDate, agora) : null,
  };
}

/** Allowlist de ordenação, exigida pelo `core/http/list-query.ts`. */
export const MAINTENANCE_SORTABLE = [
  'startDate', 'completionDate', 'cost', 'title', 'createdAt',
] as const;

/** Campos varridos pela busca `?q=` — mais a etiqueta do ativo, no use-case. */
export const MAINTENANCE_SEARCHABLE = ['title', 'notes'] as const;

/**
 * O que entra no diff do `ActivityLog`.
 *
 * `assetId` está aqui, e é de propósito: a manutenção não muda de ativo pela
 * tela (o schema de edição não aceita o campo), então um valor diferente no diff
 * é sinal de que alguém escreveu direto no banco.
 */
export const MAINTENANCE_AUDITED = [
  'assetId', 'supplierId', 'type', 'title',
  'startDate', 'completionDate', 'cost', 'isWarranty', 'notes',
] as const;
