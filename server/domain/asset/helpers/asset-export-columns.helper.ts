import { AppError } from '../../../core/errors/app-error';
import type { ColunaCsv } from '../../shared/csv.helper';
import type { PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';

// A ALLOWLIST DE COLUNAS DO EXPORT DE ATIVOS (F10, Etapa C — D67 e D71).
//
// ═════════════════════════════════════════════════════════════════════════════
// O CLIENTE MANDA TOKEN. O SERVIDOR TROCA O TOKEN PELA COLUNA.
//
// `?columns=assetTag,serial,purchaseCost`. O que chega é casado contra as
// chaves deste mapa; token desconhecido é 422 COM A LISTA dos válidos — a
// mensagem é o que torna a divergência entre esta lista e o catálogo da tela
// (`src/pages/ativos/helpers/asset-columns.ts`) barulhenta em vez de silenciosa.
//
// O perigo nunca foi "raw SQL": é campo escolhido pelo CLIENTE. Um
// `select: { [chave]: true }` montado com string de fora devolve coluna que a
// resposta não deveria ter — e aqui isso significaria exportar o que a tela
// esconde.
//
// ESTA LISTA É UM SUPERCONJUNTO DA DA TELA, de propósito. `serial`, `notes` e
// `fabricante` não são colunas da tabela de ativos (série aparece embaixo da
// etiqueta, observação não cabe numa célula), e num arquivo de planilha as três
// são exatamente o que alguém quer. O caminho contrário não vale: token da tela
// que não exista aqui volta 422.
// ═════════════════════════════════════════════════════════════════════════════

/** A forma mínima que cada coluna sabe ler. O select do use-case é que a produz. */
export interface LinhaDeExport {
  id: string;
  assetTag: string;
  serial: string | null;
  name: string | null;
  notes: string | null;
  byod: boolean;
  orderNumber: string | null;
  purchaseDate: Date | null;
  purchaseCost: unknown;
  warrantyExpiresAt: Date | null;
  eolDate: Date | null;
  retiredAt: Date | null;
  retiredReason: string | null;
  createdAt: Date;
  status: { name: string };
  model: { name: string; manufacturer: { name: string }; category: { name: string } };
  location: { name: string } | null;
  supplier: { name: string } | null;
  posse: PosseResolvida;
}

/**
 * O responsável em UMA célula.
 *
 * `Laura Souza (direto)` ou `Laura Souza (Mesa 1, manhã); Ana Lima (Mesa 1,
 * tarde)` — a Camada 3 devolve LISTA, porque num posto com duas pessoas as duas
 * respondem (docs/MODELO-POSSE.md). Achatar para o primeiro nome responderia
 * errado exatamente no caso que o modelo existe para cobrir.
 *
 * O separador é `;` com espaço, e a célula vai entre aspas pelo
 * `csv.helper.ts` quando o delimitador do arquivo também for `;`.
 */
function responsaveisEmTexto(posse: PosseResolvida): string {
  if (posse.responsaveis.length === 0) return '';

  return posse.responsaveis
    .map((pessoa) => {
      if (pessoa.via === 'POSTO') {
        const detalhe = [pessoa.locationName, pessoa.shift].filter(Boolean).join(', ');
        return detalhe ? `${pessoa.name} (${detalhe})` : pessoa.name;
      }
      return pessoa.via === 'ATIVO' ? `${pessoa.name} (pelo ativo detentor)` : `${pessoa.name} (direto)`;
    })
    .join('; ');
}

const COLUNAS: Record<string, ColunaCsv<LinhaDeExport>> = {
  assetTag: { titulo: 'Etiqueta', valor: (linha) => linha.assetTag },
  serial: { titulo: 'Nº de série', valor: (linha) => linha.serial },
  name: { titulo: 'Nome', valor: (linha) => linha.name },
  model: { titulo: 'Modelo', valor: (linha) => linha.model.name },
  manufacturer: { titulo: 'Fabricante', valor: (linha) => linha.model.manufacturer.name },
  category: { titulo: 'Categoria', valor: (linha) => linha.model.category.name },
  status: { titulo: 'Status', valor: (linha) => linha.status.name },
  location: { titulo: 'Localização', valor: (linha) => linha.location?.name ?? '' },
  supplier: { titulo: 'Fornecedor', valor: (linha) => linha.supplier?.name ?? '' },
  orderNumber: { titulo: 'Nº do pedido', valor: (linha) => linha.orderNumber },

  // Número CRU e data ISO (D69): este arquivo é a entrada do importador.
  purchaseDate: { titulo: 'Data de compra', valor: (linha) => linha.purchaseDate },
  purchaseCost: { titulo: 'Custo de compra', valor: (linha) => linha.purchaseCost },
  warrantyExpiresAt: { titulo: 'Garantia até', valor: (linha) => linha.warrantyExpiresAt },
  eolDate: { titulo: 'Fim de vida', valor: (linha) => linha.eolDate },

  retiredAt: { titulo: 'Descomissionado em', valor: (linha) => linha.retiredAt },
  retiredReason: { titulo: 'Motivo da saída', valor: (linha) => linha.retiredReason },
  byod: { titulo: 'BYOD', valor: (linha) => linha.byod },
  notes: { titulo: 'Observações', valor: (linha) => linha.notes },
  createdAt: { titulo: 'Cadastrado em', valor: (linha) => linha.createdAt },

  // A COLUNA QUE NÃO É COLUNA DE TABELA NENHUMA — a Camada 3 resolvida. Ela é
  // metade da razão de existir este export: nenhum ITAM de prateleira responde
  // "quem responde pelo mouse da Mesa 1" numa planilha.
  responsible: { titulo: 'Responsável', valor: (linha) => responsaveisEmTexto(linha.posse) },
};

export const ASSET_EXPORT_TOKENS = Object.keys(COLUNAS);

/**
 * O que sai quando ninguém pede coluna.
 *
 * As onze que respondem "o que é, de quem é e quanto custou" — o arquivo que
 * alguém abre para conferir inventário. Quem quer o resto pede com `?columns=`.
 */
export const ASSET_EXPORT_PADRAO = [
  'assetTag', 'serial', 'name', 'model', 'manufacturer', 'category',
  'status', 'location', 'responsible', 'purchaseDate', 'purchaseCost',
];

/**
 * Traduz os tokens pedidos em colunas, ou recusa com a lista dos válidos.
 *
 * A ORDEM É A QUE O CLIENTE PEDIU. Não é detalhe: quem exporta para conferir
 * contra outra planilha monta as colunas na ordem da outra planilha, e
 * reordenar à mão 15 colunas no Excel é o trabalho que o parâmetro existe para
 * evitar.
 */
export interface ColunasEscolhidas {
  /**
   * Os tokens, na ordem final e sem repetição.
   *
   * Saem junto com as colunas porque QUEM BUSCA precisa deles: a coluna de
   * responsável custa a resolução da Camada 3 em lote, e só vale pagá-la se ela
   * foi pedida. Perguntar isso pelo TÍTULO da coluna — como a primeira versão
   * deste arquivo fazia — amarra o use-case a uma string de interface: mudar
   * "Responsável" para "Responsáveis" deixaria o export calado, com a coluna
   * presente e vazia em toda linha.
   */
  tokens: string[];
  colunas: ColunaCsv<LinhaDeExport>[];
}

/**
 * O token casa contra a allowlist? `Object.hasOwn`, e NUNCA `token in MAPA`.
 *
 * ⚠️ `'constructor' in COLUNAS` é `true`. `'__proto__'`, `'toString'` e
 * `'valueOf'` também: o `in` percorre a cadeia de protótipos, e um objeto
 * literal herda tudo de `Object.prototype`. Com o `in` como porteiro, esses
 * nomes ATRAVESSAVAM a lista e o que vinha depois lia `COLUNAS['constructor']`
 * — que existe, é uma função, e não tem `titulo` nem `valor`.
 *
 * O efeito era o pior possível para um download: a validação passava, os
 * cabeçalhos da resposta já tinham ido com status 200, e o `TypeError` estourava
 * DENTRO do stream — o cliente recebia um arquivo truncado que diz ter dado
 * certo. É exatamente o que a validação-antes-do-primeiro-byte existe para
 * evitar.
 *
 * `Object.hasOwn` olha só as chaves PRÓPRIAS, então a lista volta a ser a lista.
 */
export function colunasDoExport(tokens: readonly string[] | undefined): ColunasEscolhidas {
  const pedidas = tokens && tokens.length > 0 ? tokens : ASSET_EXPORT_PADRAO;

  const desconhecidas = pedidas.filter((token) => !Object.hasOwn(COLUNAS, token));
  if (desconhecidas.length > 0) {
    throw new AppError(
      `Coluna desconhecida: ${desconhecidas.join(', ')}. Válidas: ${ASSET_EXPORT_TOKENS.join(', ')}.`,
      422,
      { validas: ASSET_EXPORT_TOKENS },
    );
  }

  // `Set` para a repetição não duplicar a coluna: `?columns=assetTag,assetTag`
  // é erro de quem montou a URL, e a resposta certa é um arquivo com uma
  // etiqueta — não um 422 sobre algo que não muda o resultado.
  const unicos = [...new Set(pedidas)];
  return { tokens: unicos, colunas: unicos.map((token) => COLUNAS[token]) };
}
