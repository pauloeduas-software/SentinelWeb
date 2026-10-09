import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';

// O que de um ativo pode sair para o cliente — em UM lugar só, usado pela
// listagem, pela criação, pela edição e pela busca por série.
//
// Allowlist, não `include`: coluna nova na tabela não aparece em resposta
// nenhuma até alguém escrever o nome dela aqui.
//
// As relações vêm embutidas com allowlist própria porque a tabela mostra o NOME
// do status, do modelo e do fabricante, não o uuid — e uma consulta por linha
// seria N+1. O `assignedTo` reaproveita `USER_PUBLIC_SELECT`: repetido, uma
// cópia esquecida na Fase 3 devolveria o `passwordHash` por aqui.
//
// A CATEGORIA do ativo vem pelo modelo (`model.category`), não por coluna
// própria — é assim no Snipe-IT, e é o que impede ativo e modelo divergirem.
export const ASSET_SELECT = {
  id: true,
  assetTag: true,
  serial: true,
  name: true,
  notes: true,
  byod: true,
  requestable: true,

  statusId: true,
  modelId: true,
  locationId: true,
  supplierId: true,
  assignedToId: true,

  orderNumber: true,
  purchaseDate: true,
  // Decimal: sai no JSON como STRING.
  purchaseCost: true,

  warrantyMonths: true,
  warrantyExpiresAt: true,
  eolMonths: true,
  eolDate: true,
  eolExplicit: true,

  // DESCOMISSIONAMENTO. Sai na resposta porque a tela precisa mostrar o selo
  // "descomissionado" na linha e na aba Detalhes — e porque, sem ele, a
  // listagem `?view=retired` devolveria linhas indistinguíveis das outras.
  //
  // NÃO é `deletedAt` nem `status.type = ARCHIVED`: as três colunas respondem
  // perguntas diferentes e nenhuma substitui a outra (D19, docs/historico/fase-02-ativos.md).
  retiredAt: true,
  retiredReason: true,

  // Foto do ativo. O valor é o caminho relativo no `UPLOAD_DIR`, e a tela o usa
  // SÓ como "tem imagem ou não" — a URL que ela monta é `/api/images/asset/:id`,
  // por id.
  //
  // O caminho não é credencial nem atalho: NENHUMA rota aceita caminho de
  // arquivo como parâmetro. Quem serve resolve o caminho a partir do id, dentro
  // do servidor, depois de conferir a sessão. É por isso que ele pode sair aqui
  // enquanto `Attachment.path` fica de fora do `ATTACHMENT_SELECT`: lá a lista
  // tem N linhas e devolver N nomes de arquivo é dar um mapa do diretório sem
  // ganho nenhum; aqui é um campo que a própria linha já tem.
  imagePath: true,

  // Autoria (D26) — as duas colunas que existem para a tela de detalhe não
  // consultar o `ActivityLog` por linha.
  createdById: true,
  updatedById: true,

  createdAt: true,

  status: { select: { id: true, name: true, type: true, color: true } },
  model: {
    select: {
      id: true, name: true, modelNumber: true, eolMonths: true,
      manufacturer: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, type: true, color: true } },
    },
  },
  location: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  assignedTo: { select: USER_PUBLIC_SELECT },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// O CUSTO POR PERMISSÃO (F11, D77) — e ele é OMITIDO DO SELECT, não mascarado
// depois.
//

// deixa o valor passar pelo processo. Ele entra no objeto, e daí em diante vaza
// por qualquer caminho que não seja a resposta "feliz" — a linha de log de um
// erro que serializa o objeto, um `JSON.stringify` num handler de exceção, o
// `changes` de um `ActivityLog` montado com spread. O dado que não deve sair
// não é lido.
//
// POR QUE UMA FUNÇÃO E NÃO DOIS `const`: os dois selects têm que ser o MESMO
// menos uma coluna. Dois literais lado a lado divergem na primeira coluna
// acrescentada — e a que divergiria é a versão restrita, que ninguém olha no
// dia a dia porque o administrador vê tudo.
//
// ⚠️ O QUE ESTA FUNÇÃO **NÃO** COBRE, de propósito: as 50 chamadas a
// `ASSET_SELECT` das ESCRITAS internas (`checkoutAsset`, `fecharPosse`,
// `retireAsset`, `updateAsset`…). Elas leem o ativo para gravar outra coisa e
// não devolvem custo a ninguém; enfiar a sessão em cada use-case de escrita
// espalharia autorização por toda a camada de posse para zero ganho. O custo
// sai por LEITURA, e é a leitura que filtra.
// ═══════════════════════════════════════════════════════════════════════════

/** As colunas que `assets.viewCost` governa. Uma lista, num lugar só. */
const COLUNAS_DE_CUSTO = ['purchaseCost'] as const;

/**
 * Remove as colunas de custo de um select quando a sessão não tem a chave.
 *
 * Genérica porque serve o select da listagem e o do detalhe — e o do detalhe
 * tem a regra de depreciação embutida, que também é dinheiro.
 */
function semCusto<T extends Record<string, unknown>>(select: T): T {
  const copia = { ...select };
  for (const coluna of COLUNAS_DE_CUSTO) delete copia[coluna];
  return copia;
}

/** O select da LISTAGEM, conforme a sessão enxergue custo ou não. */
export function assetSelect(podeVerCusto: boolean) {
  return podeVerCusto ? ASSET_SELECT : semCusto(ASSET_SELECT);
}

/** A forma crua da coluna, como o Prisma a devolve. */


/**
 * O select do DETALHE, conforme a sessão enxergue custo ou não.
 *
 * ERA MAIS QUE ISSO: ele acrescentava a regra de depreciação do modelo ao
 * `ASSET_SELECT`, porque o valor contábil era `purchaseCost` menos a depreciação
 * acumulada e só a ficha o calculava. O valor contábil saiu no D152, e o detalhe
 * voltou a ser o select compartilhado — menos a coluna de custo, quando a sessão
 * não é `ADMIN` (D77).
 */
export function assetDetailSelect(podeVerCusto: boolean) {
  if (podeVerCusto) return ASSET_SELECT;

  return {
    ...semCusto(ASSET_SELECT),
    model: { select: ASSET_SELECT.model.select },
  };
}
