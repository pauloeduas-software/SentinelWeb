import { prisma } from '../../../core/database/prismaClient';
import { contarAssentos } from '../helpers/license-seats.helper';
import {
  DIAS_DE_AVISO, diasParaVencer, meiaNoiteUTC, statusDaLicenca, type LicenseStatus,
} from '../helpers/license-status.helper';

// OS DOIS SINAIS DA LICENÇA, numa rota só — o mesmo desenho do
// `/api/stock/alerts` da F5, e pelo mesmo motivo: os dois valem para a mesma
// tela, então o tipo é FILTRO e não rota separada.

export interface LicencaEmAlerta {
  id: string;
  name: string;
  seatsTotal: number;
  minSeats: number | null;
  livres: number;
  status: LicenseStatus;
  diasParaVencer: number | null;
  expirationDate: Date | null;
  categoryName: string | null;
}

export interface AlertasDeLicenca {
  /** Vence dentro da janela de aviso, ou já venceu e ninguém tratou. */
  vencendo: LicencaEmAlerta[];
  /** `livres < minSeats`. Licença sem `minSeats` nunca entra: sem piso, sem alerta. */
  assentosBaixos: LicencaEmAlerta[];
}

/** Teto por categoria — alerta é lista para agir, não relatório. */
const LIMITE = 200;

const SELECT_DO_ALERTA = {
  id: true, name: true, seatsTotal: true, minSeats: true,
  expirationDate: true, terminationDate: true,
  category: { select: { name: true } },
} as const;

type LinhaDoAlerta = {
  id: string; name: string; seatsTotal: number; minSeats: number | null;
  expirationDate: Date | null; terminationDate: Date | null;
  category: { name: string } | null;
};

export async function listLicenseAlerts(
  tipo?: 'vencendo' | 'assentosBaixos',
): Promise<AlertasDeLicenca> {
  const [vencendo, assentosBaixos] = await Promise.all([
    tipo === 'assentosBaixos' ? Promise.resolve([]) : licencasVencendo(),
    tipo === 'vencendo' ? Promise.resolve([]) : licencasComPoucosAssentos(),
  ]);

  return { vencendo, assentosBaixos };
}

/**
 * As que vencem dentro da janela — e as que JÁ venceram.
 *
 * As vencidas entram de propósito: uma licença que passou do prazo e continua
 * com assentos ocupados é software em uso sem direito de uso, que é o achado
 * mais caro de uma auditoria de fornecedor. Sumir com ela da lista no dia
 * seguinte ao vencimento esconderia exatamente o problema no momento em que ele
 * passa a existir.
 *
 * As ENCERRADAS não entram: o contrato foi rescindido de propósito, alguém já
 * tratou. Continuar cobrando ação sobre elas treinaria quem lê a tela a ignorar
 * a lista.
 *
 * O FILTRO GROSSO VAI AO BANCO (`expirationDate <= limite`), e o fino —
 * distinguir ENCERRADA — sai do helper puro. É a mesma divisão do
 * `list-stock-alerts`: o que é coluna filtra no Postgres, o que é derivado
 * filtra aqui.
 */
async function licencasVencendo(): Promise<LicencaEmAlerta[]> {
  const limite = meiaNoiteUTC();
  limite.setUTCDate(limite.getUTCDate() + DIAS_DE_AVISO);

  const linhas = await prisma.license.findMany({
    where: { expirationDate: { not: null, lte: limite } },
    select: SELECT_DO_ALERTA,
    orderBy: { expirationDate: 'asc' },
    take: LIMITE,
  }) as LinhaDoAlerta[];

  const contagens = await contarAssentos(prisma, linhas.map((linha) => linha.id));

  return linhas
    .filter((linha) => statusDaLicenca(linha) !== 'ENCERRADA')
    .map((linha) => paraAlerta(linha, contagens.get(linha.id)?.livres ?? 0));
}

/**
 * As que têm piso e estão abaixo dele.
 *
 * O FILTRO FINO (`livres < minSeats`) NÃO CABE EM `where` porque `livres` não é
 * coluna — é a conta do D92 —, e esse é o preço declarado da decisão. Ele é
 * pequeno: a lista de licenças COM piso é o que a TI escolheu vigiar, não o
 * catálogo inteiro.
 *
 * As ENCERRADAS ficam de fora: cobrar "compre mais assentos" de um contrato
 * rescindido é a única coisa que a lista não deveria dizer.
 */
async function licencasComPoucosAssentos(): Promise<LicencaEmAlerta[]> {
  const linhas = await prisma.license.findMany({
    where: { minSeats: { not: null } },
    select: SELECT_DO_ALERTA,
    orderBy: { name: 'asc' },
    take: LIMITE,
  }) as LinhaDoAlerta[];

  const contagens = await contarAssentos(prisma, linhas.map((linha) => linha.id));

  return linhas
    .filter((linha) => statusDaLicenca(linha) !== 'ENCERRADA')
    .map((linha) => paraAlerta(linha, contagens.get(linha.id)?.livres ?? 0))
    .filter((alerta) => alerta.minSeats !== null && alerta.livres < alerta.minSeats);
}

function paraAlerta(linha: LinhaDoAlerta, livres: number): LicencaEmAlerta {
  return {
    id: linha.id,
    name: linha.name,
    seatsTotal: linha.seatsTotal,
    minSeats: linha.minSeats,
    livres,
    status: statusDaLicenca(linha),
    diasParaVencer: diasParaVencer(linha.expirationDate),
    expirationDate: linha.expirationDate,
    categoryName: linha.category?.name ?? null,
  };
}
