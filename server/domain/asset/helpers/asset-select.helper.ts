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
  // perguntas diferentes e nenhuma substitui a outra (D19, docs/FASE-2-PLANO-ITAM.md).
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

/**
 * A REGRA DE DEPRECIAÇÃO, e ela está no select do DETALHE — não no compartilhado.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUEM CALCULA VALOR CONTÁBIL É UMA TELA, E A LISTAGEM NÃO É ELA.
 *
 * Na F8 estes quatro campos entraram direto no `ASSET_SELECT`, com a justificativa
 * de evitar N+1 "na listagem e no relatório da frota inteira". As duas razões não
 * se sustentam: a listagem NÃO calcula valor contábil, e o relatório de depreciação
 * tem `SELECT` próprio (`depreciation-report.usecase.ts`).
 *
 * O que o select compartilhado tem de verdade são NOVE consumidores — a listagem,
 * a busca por série, a tela do posto, as posses do colaborador e os seis use-cases
 * de escrita do ativo. Todos ganhavam um `LEFT JOIN` em `depreciations` e quatro
 * colunas na resposta para um número que nenhum deles mostra.
 *
 * Aqui a regra viaja com o único leitor que a usa, e o N+1 continua não existindo:
 * é UMA consulta, com a regra embutida, para UM ativo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ASSET_DETAIL_SELECT = {
  ...ASSET_SELECT,
  model: {
    select: {
      ...ASSET_SELECT.model.select,
      depreciation: {
        select: { id: true, name: true, months: true, floorValue: true, floorType: true },
      },
    },
  },
} as const;
