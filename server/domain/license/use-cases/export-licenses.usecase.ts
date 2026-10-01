import type { Readable } from 'stream';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { csvStream, type ColunaCsv } from '../../shared/csv.helper';
import { contarAssentos } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import { buildLicenseViewWhere, buildLicenseWhere } from './list-licenses.usecase';

// O EXPORT DE LICENÇAS (F10, Etapa C) — a QUARTA porta da chave de produto, e a
// que o TODO marcou com ⚠️.
//
// ═════════════════════════════════════════════════════════════════════════════
// A CHAVE NÃO SAI DAQUI, E NÃO É UMA ALLOWLIST QUE GARANTE ISSO.
//
// As outras três portas foram fechadas na F6: a allowlist da resposta
// (`paraResposta`), o diff do `ActivityLog` e o `core/logger/sanitize.ts`. Esta
// é a quarta — e um arquivo é pior que uma resposta HTTP, porque ele circula
// por e-mail e sobrevive ao encerramento da sessão.
//
// O EXPORT PASSA PELO MESMO `paraResposta()` DA LISTAGEM (D133). Ele REMOVE a
// chave por desestruturação, e o tipo de retorno não a tem: nenhuma coluna
// daqui consegue nomeá-la, porque ela não existe no objeto que as colunas leem.
// Uma allowlist paralela escrita neste arquivo nasceria certa e envelheceria
// sozinha — e o dia em que divergisse seria o dia em que a chave viajou.
//
// E A MÁSCARA TAMBÉM NÃO VEM: `paraResposta` só a deriva com `comMascara`, que
// é do DETALHE. Decifrar N chaves para escrever `••••-AB12` num arquivo poria o
// texto em claro de todas elas na memória do processo para informar quatro
// caracteres de cada. A coluna que sai é "Tem chave", que é o que uma planilha
// de conferência precisa saber.
// ═════════════════════════════════════════════════════════════════════════════

const TAMANHO_DO_LOTE = 500;

/**
 * A linha da licença com os campos que ESTE export lê, tipados.
 *
 * POR QUE O TIPO EXTRA: `LinhaDeLicenca` estende `Record<string, unknown>` de
 * propósito — o `LICENSE_SELECT` tem trinta chaves e o domínio escolheu uma
 * assinatura de índice em vez de declarar as trinta duas vezes. O preço é que
 * `linha.name` é `unknown`, e uma coluna de CSV que devolve `unknown` compila
 * em qualquer lugar e escreve `[object Object]` em produção.
 *
 * Declarado aqui e aplicado em UM lugar (o `map` do lote), ele vale como
 * contrato: acrescentar uma coluna sem acrescentar o campo não compila.
 */
type LinhaExportada = LicencaNaResposta & {
  // `id` também entra aqui, e não é descuido do tipo de cima: `Omit` sobre um
  // tipo com assinatura de índice devolve SÓ a assinatura — `keyof` é
  // `string | number`, então `Pick` perde todos os campos nomeados, inclusive
  // os que `LinhaDeLicenca` declara. O cursor do export depende dele.
  id: string;
  name: string;
  manufacturer: { name: string } | null;
  category: { name: string } | null;
  supplier: { name: string } | null;
  licensedToName: string | null;
  licensedToEmail: string | null;
  orderNumber: string | null;
  purchaseDate: Date | null;
  purchaseCost: unknown;
  reassignable: boolean;
  maintained: boolean;
  notes: string | null;
};

const COLUNAS: Record<string, ColunaCsv<LinhaExportada>> = {
  name: { titulo: 'Licença', valor: (linha) => linha.name },
  manufacturer: { titulo: 'Fabricante', valor: (linha) => linha.manufacturer?.name ?? '' },
  category: { titulo: 'Categoria', valor: (linha) => linha.category?.name ?? '' },
  supplier: { titulo: 'Fornecedor', valor: (linha) => linha.supplier?.name ?? '' },

  seatsTotal: { titulo: 'Assentos', valor: (linha) => linha.seatsTotal },
  ocupados: { titulo: 'Ocupados', valor: (linha) => linha.ocupados },
  livres: { titulo: 'Livres', valor: (linha) => linha.livres },
  queimados: { titulo: 'Queimados', valor: (linha) => linha.queimados },
  minSeats: { titulo: 'Mínimo de livres', valor: (linha) => linha.minSeats },

  status: { titulo: 'Situação', valor: (linha) => linha.status },
  expirationDate: { titulo: 'Vence em', valor: (linha) => linha.expirationDate },
  terminationDate: { titulo: 'Encerra em', valor: (linha) => linha.terminationDate },

  licensedToName: { titulo: 'Licenciado para', valor: (linha) => linha.licensedToName },
  licensedToEmail: { titulo: 'E-mail do licenciamento', valor: (linha) => linha.licensedToEmail },

  orderNumber: { titulo: 'Nº do pedido', valor: (linha) => linha.orderNumber },
  purchaseDate: { titulo: 'Data de compra', valor: (linha) => linha.purchaseDate },
  purchaseCost: { titulo: 'Custo de compra', valor: (linha) => linha.purchaseCost },

  // "Tem chave", nunca a chave. É o que `hasProductKey` já responde para a
  // tela decidir se oferece o botão de revelar.
  hasProductKey: { titulo: 'Tem chave', valor: (linha) => linha.hasProductKey },

  reassignable: { titulo: 'Reatribuível', valor: (linha) => linha.reassignable },
  maintained: { titulo: 'Com suporte', valor: (linha) => linha.maintained },
  notes: { titulo: 'Observações', valor: (linha) => linha.notes },
};

export const LICENSE_EXPORT_TOKENS = Object.keys(COLUNAS);

export const LICENSE_EXPORT_PADRAO = [
  'name', 'manufacturer', 'seatsTotal', 'ocupados', 'livres',
  'status', 'expirationDate', 'hasProductKey', 'purchaseCost',
];

/**
 * Mesma regra do export de ativos: `Object.hasOwn`, nunca `token in MAPA`.
 *
 * `'constructor' in COLUNAS` é `true` — o `in` percorre o protótipo —, e aqui o
 * preço de deixar passar é mais alto que um arquivo truncado: a allowlist desta
 * rota é o que mantém a CHAVE DE PRODUTO fora do CSV (D133). Ela continua fora
 * por construção (o `paraResposta` a remove do objeto), e esta linha é a que
 * garante que nenhum nome herdado chegue perto da lista de colunas.
 */
export function colunasDoExportDeLicenca(tokens: readonly string[] | undefined): ColunaCsv<LinhaExportada>[] {
  const pedidas = tokens && tokens.length > 0 ? tokens : LICENSE_EXPORT_PADRAO;

  const desconhecidas = pedidas.filter((token) => !Object.hasOwn(COLUNAS, token));
  if (desconhecidas.length > 0) {
    throw new AppError(
      `Coluna desconhecida: ${desconhecidas.join(', ')}. Válidas: ${LICENSE_EXPORT_TOKENS.join(', ')}.`,
      422,
      { validas: LICENSE_EXPORT_TOKENS },
    );
  }

  return [...new Set(pedidas)].map((token) => COLUNAS[token]);
}

export function exportLicenses(
  q: string | undefined,
  view: 'active' | 'trashed',
  colunas: ColunaCsv<LinhaExportada>[],
  delimitador: string,
): Readable {
  const where = { ...buildLicenseWhere(q), ...buildLicenseViewWhere(view) };

  return csvStream<LinhaExportada>({
    colunas,
    delimitador,
    cursorDe: (linha) => linha.id,
    lote: async (cursor) => {
      const rows = await prisma.license.findMany({
        where,
        select: LICENSE_SELECT,
        orderBy: { id: 'asc' },
        take: TAMANHO_DO_LOTE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }) as LinhaDeLicenca[];

      if (rows.length === 0) return [];

      // A contagem de assentos em LOTE, como na listagem: `livres` e `ocupados`
      // são derivados de `license_seats` (D40), e uma consulta por licença seria
      // N+1 sobre o catálogo inteiro.
      const contagens = await contarAssentos(prisma, rows.map((linha) => linha.id));

      // O ÚNICO `as` deste arquivo, e ele é sobre a forma da linha — nunca
      // sobre o conteúdo: `paraResposta` já removeu a chave de produto, e o
      // tipo acima apenas nomeia os campos que o `LICENSE_SELECT` traz.
      return rows.map((linha) => paraResposta(
        linha,
        contagens.get(linha.id) ?? { ocupados: 0, queimados: 0, aposentados: 0, livres: 0 },
      ) as LinhaExportada);
    },
  });
}
