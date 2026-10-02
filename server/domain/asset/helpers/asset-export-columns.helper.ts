import type { Prisma } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import type { ColunaCsv } from '../../shared/csv.helper';
import type { PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { lerCampos } from '../../custom-field/helpers/custom-field-value.helper';
import {
  slugDoToken, tokenDoCampo, type CampoParaCsv,
} from '../../custom-field/use-cases/list-csv-fields.usecase';

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
  /**
   * OS CAMPOS CUSTOMIZADOS, crus do JsonB (F9/F10).
   *
   * OPCIONAL porque o `select` do export só a traz quando alguma coluna `cf:` foi
   * pedida: ela não está no select compartilhado, e varrer o JsonB de cinco mil
   * ativos para não usá-lo seria pagar a coluna mais gorda da tabela por nada.
   */
  customFields?: Prisma.JsonValue | null;
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
 * A coluna de um campo customizado — `cf:<slug>` (F9, o item que esperava a F10).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ELAS SÃO DINÂMICAS, E É POR ISSO QUE A ALLOWLIST PRECISOU CRESCER EM VEZ DE
 * ACEITAR UM PREFIXO.
 *
 * `cf:*` liberado por prefixo aceitaria `cf:qualquer_coisa` e devolveria uma
 * coluna vazia em toda linha — o mesmo defeito silencioso que o D67 fecha para as
 * colunas fixas. Então o conjunto válido é montado a partir dos campos que
 * EXISTEM no banco, por requisição, e token fora dele é 422 com a lista.
 *
 * O TÍTULO É O NOME DO CAMPO, não o slug: quem abre a planilha lê "Centro de
 * custo", e `centro_de_custo` é vocabulário de banco.
 *
 * O VALOR sai de `lerCampos`, que é a MESMA leitura do JsonB que a listagem usa —
 * e não um `as Record<string, string>` escrito aqui. A coluna aceita qualquer JSON
 * (número, array, nulo), e uma leitura própria divergiria na primeira linha
 * gravada por `psql`.
 */
function colunaDeCampoCustomizado(campo: CampoParaCsv): ColunaCsv<LinhaDeExport> {
  return {
    titulo: campo.name,
    valor: (linha) => lerCampos(linha.customFields)[campo.slug] ?? '',
  };
}

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
/**
 * As colunas que exigem permissão, e qual (F11, D77 — a obrigação cruzada).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * SEM ISTO, O EXPORT É A PORTA DOS FUNDOS DO CUSTO.
 *
 * A listagem passou a omitir `purchaseCost` do `select` para quem não tem
 * `assets.viewCost` — e o export lê o banco por um caminho PRÓPRIO
 * (`export-assets.usecase.ts`), com select próprio montado a partir destes
 * tokens. Fechar só a tela e deixar o CSV aberto seria trocar um clique por
 * dois: quem não pode ver o custo na tabela baixaria a planilha com ele.
 *
 * É O MESMO PRINCÍPIO COM UM MECANISMO DIFERENTE: na listagem a coluna não é
 * lida; aqui o TOKEN é recusado antes do primeiro byte. Não dá para "não ler"
 * uma coluna que o usuário pediu pelo nome — o honesto é dizer que ele não pode
 * pedi-la.
 * ═════════════════════════════════════════════════════════════════════════
 */
const COLUNAS_COM_PERMISSAO: Readonly<Record<string, string>> = {
  purchaseCost: 'assets.viewCost',
};

export function colunasDoExport(
  tokens: readonly string[] | undefined,
  /**
   * O que a sessão alcança. Por PARÂMETRO, como todo o resto: este helper não
   * conhece `request`.
   *
   * Recebe a função de teste, e não a lista, para o helper não ter que saber se
   * a origem é `Set`, array ou consulta.
   */
  pode: (permissao: string) => boolean,
  /**
   * Os campos customizados que existem, para os tokens `cf:<slug>`.
   *
   * Por PARÂMETRO e não por consulta aqui dentro: este helper é PURO e tem teste
   * puro (`tests/relatorios/allowlist.puro.test.ts`). Quem consulta é o
   * controller, uma vez por requisição — nunca por linha.
   *
   * Lista vazia (o padrão) é o sistema sem campo customizado nenhum: aí todo
   * token `cf:` é desconhecido, que é a verdade.
   */
  camposCustomizados: readonly CampoParaCsv[] = [],
): ColunasEscolhidas {
  // O PADRÃO JÁ VEM FILTRADO, e isto é o que faz o export continuar
  // funcionando: `ASSET_EXPORT_PADRAO` inclui `purchaseCost`, então quem não
  // tem a chave e baixa sem escolher coluna receberia 403 em vez de um CSV.
  // Pedir explicitamente uma coluna proibida é erro; não pedir nada não é.
  const padrao = ASSET_EXPORT_PADRAO.filter(
    (token) => !COLUNAS_COM_PERMISSAO[token] || pode(COLUNAS_COM_PERMISSAO[token]),
  );
  const pedidas = tokens && tokens.length > 0 ? tokens : padrao;

  // ── OS CAMPOS CUSTOMIZADOS, INDEXADOS POR TOKEN ──────────────────────────
  const porToken = new Map(camposCustomizados.map((campo) => [tokenDoCampo(campo.slug), campo]));

  // CIFRADO NÃO EXPORTA, e a recusa vem ANTES da de "desconhecida" para a frase
  // poder dizer o motivo certo.
  //
  // ═══════════════════════════════════════════════════════════════════════════
  // POR QUE NÃO EXPORTAR O CIFRADO MASCARADO.
  //
  // A listagem manda `••••••` porque a tela precisa mostrar que HÁ segredo ali, e
  // oferecer o botão de revelar — que grava `ActivityLog` do ato. Num arquivo não
  // existe botão: a coluna seria `••••••` repetido em cinco mil linhas, ou seja,
  // uma coluna que ocupa espaço e não informa nada.
  //
  // E exportar o PACOTE (`enc:v1:…`) seria pior do que inútil: ele é o segredo
  // cifrado saindo do banco num arquivo que alguém manda por e-mail. O AAD o
  // protege de ser movido de linha, não de ser levado embora junto com a chave do
  // ambiente. O D77 chama o export de "porta dos fundos" por isso — aqui a porta
  // fica fechada por construção.
  // ═══════════════════════════════════════════════════════════════════════════
  const cifradas = pedidas.filter((token) => porToken.get(token)?.encrypted);
  if (cifradas.length > 0) {
    const nomes = cifradas.map((token) => porToken.get(token)?.name ?? token);
    throw new AppError(
      `Campo cifrado não vai para planilha: ${nomes.join(', ')}. O valor é revelado um por vez, `
      + 'na ficha do ativo, e cada revelação fica registrada.',
      422,
      { cifradas },
    );
  }

  const desconhecidas = pedidas.filter(
    (token) => !Object.hasOwn(COLUNAS, token) && !porToken.has(token),
  );
  if (desconhecidas.length > 0) {
    // A lista de válidas inclui os tokens `cf:` do sistema: sem eles, quem errar
    // um slug recebe uma lista que não menciona campo customizado nenhum e conclui
    // que o export não os suporta.
    const validas = [...ASSET_EXPORT_TOKENS, ...porToken.keys()];
    throw new AppError(
      `Coluna desconhecida: ${desconhecidas.join(', ')}. Válidas: ${validas.join(', ')}.`,
      422,
      { validas },
    );
  }

  // 403 ANTES DO PRIMEIRO BYTE, pelo mesmo motivo que o 422 de coluna
  // desconhecida acontece aqui: depois que o stream começou, os cabeçalhos já
  // foram com status 200 e o cliente recebe um arquivo truncado que diz ter
  // dado certo.
  const negadas = pedidas.filter(
    (token) => COLUNAS_COM_PERMISSAO[token] && !pode(COLUNAS_COM_PERMISSAO[token]),
  );
  if (negadas.length > 0) {
    throw new AppError(
      `Seu acesso não inclui a coluna: ${negadas.join(', ')}. Tire-a da seleção para exportar.`,
      403,
      { negadas },
    );
  }

  // `Set` para a repetição não duplicar a coluna: `?columns=assetTag,assetTag`
  // é erro de quem montou a URL, e a resposta certa é um arquivo com uma
  // etiqueta — não um 422 sobre algo que não muda o resultado.
  const unicos = [...new Set(pedidas)];
  return {
    tokens: unicos,
    colunas: unicos.map((token) => {
      const campo = porToken.get(token);
      return campo ? colunaDeCampoCustomizado(campo) : COLUNAS[token];
    }),
  };
}

/**
 * Alguma das colunas pedidas é de campo customizado?
 *
 * O use-case precisa saber para decidir se acrescenta `customFields` ao `select`
 * — ela é a coluna mais gorda da tabela e não está no select compartilhado (F9).
 * A pergunta sai do TOKEN, nunca do título, pelo mesmo motivo do `responsible`:
 * título é string de interface, e renomear "Centro de custo" deixaria o export
 * calado, com a coluna presente e vazia em toda linha.
 */
export function pediuCampoCustomizado(tokens: readonly string[]): boolean {
  return tokens.some((token) => slugDoToken(token) !== null);
}
