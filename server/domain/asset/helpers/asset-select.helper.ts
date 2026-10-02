import type { Prisma } from '@prisma/client';
import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';
import { mascararCampos, temCampoCifrado } from '../../custom-field/helpers/custom-field-value.helper';

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
 * O `ASSET_SELECT` MAIS OS CAMPOS CUSTOMIZADOS (F9, Etapa D).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE `customFields` NÃO ENTROU NO SELECT COMPARTILHADO.
 *
 * Ele tem NOVE consumidores: a listagem, a busca por série, a tela do posto, as
 * posses do colaborador e os seis use-cases de escrita. Só quatro mostram campo
 * customizado — a listagem (coluna de `showInListView`), o detalhe e as
 * respostas de criação e edição, que devolvem o estado salvo ao formulário.
 *
 * E a diferença aqui não é só peso de resposta, como foi no caso da depreciação:
 * o que está guardado nessa coluna inclui PACOTE CIFRADO, e todo caminho que a
 * leia precisa passar pela máscara. Deixá-la no select compartilhado poria o
 * `enc:v1:…` em cinco respostas que ninguém mascararia — não é vazamento de
 * segredo (o pacote é inútil sem a chave), mas é lixo numa resposta que não o
 * pediu e um convite para o próximo caminho esquecer a máscara.
 *
 * Quem lê esta coluna passa por `comCamposMascarados()`. É um arquivo, uma
 * função, e o tipo obriga.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ASSET_SELECT_COM_CAMPOS = {
  ...ASSET_SELECT,
  customFields: true,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// O CUSTO POR PERMISSÃO (F11, D77) — e ele é OMITIDO DO SELECT, não mascarado
// depois.
//
// POR QUE OMITIR, E NÃO APAGAR O CAMPO ANTES DE RESPONDER: mascarar depois
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
  return podeVerCusto ? ASSET_SELECT_COM_CAMPOS : semCusto(ASSET_SELECT_COM_CAMPOS);
}

/** A forma crua da coluna, como o Prisma a devolve. */
interface LinhaComCampos {
  customFields: Prisma.JsonValue | null;
}

/**
 * A ÚNICA saída de uma linha que carrega `customFields`.
 *
 * Troca todo valor cifrado pela máscara e acrescenta `temSegredo`.
 *
 * A DECISÃO DE QUEM MASCARAR É DO PRÓPRIO DADO, não de uma consulta a
 * `custom_fields WHERE encrypted`: o prefixo `enc:` viaja dentro do valor
 * exatamente para isso (D81, item 1). Ver `mascararCampos`.
 *
 * ⚠️ `temSegredo` É A RESPOSTA DE LINHA, E NÃO É O QUE DECIDE O BOTÃO DE REVELAR.
 *
 * Ele responde *"há algum segredo guardado neste ativo?"*, que é pergunta de
 * listagem — uma marca na linha sem abrir o ativo. O botão de revelar é por
 * CAMPO, e a ficha o decide pelo par `campo.encrypted` + valor igual à máscara
 * (`CustomFieldsCard.tsx`): uma flag de linha não sabe dizer QUAL dos campos tem
 * segredo, que é justamente o que o botão precisa saber.
 *
 * Ele sai aqui porque é de graça — a máscara já percorreu os valores para
 * descobri-lo — e porque a alternativa é a tela deduzir de um sentinela de texto
 * o que o servidor já sabia.
 */
export function comCamposMascarados<T extends LinhaComCampos>(linha: T): Omit<T, 'customFields'> & {
  customFields: Record<string, string> | null;
  temSegredo: boolean;
} {
  return {
    ...linha,
    customFields: mascararCampos(linha.customFields),
    temSegredo: temCampoCifrado(linha.customFields),
  };
}

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
  ...ASSET_SELECT_COM_CAMPOS,
  model: {
    select: {
      ...ASSET_SELECT.model.select,
      depreciation: {
        select: { id: true, name: true, months: true, floorValue: true, floorType: true },
      },
    },
  },
} as const;

/**
 * O select do DETALHE, conforme a sessão enxergue custo ou não.
 *
 * TIRA A REGRA DE DEPRECIAÇÃO JUNTO, e não só a coluna de custo. O valor
 * contábil é `purchaseCost` menos a depreciação acumulada: sem o custo ele não é
 * calculável, então trazer `model.depreciation` seria pagar um `LEFT JOIN` para
 * alimentar uma conta que não vai acontecer — e deixaria na resposta a regra
 * financeira ("48 meses, piso de R$ 300") para quem não pode ver dinheiro.
 *
 * Quem consome tem que tratar `valorContabil: null` de qualquer forma: ele já
 * era nulo para ativo sem custo cadastrado e para modelo sem regra. "Sem
 * permissão" entra como terceiro motivo do mesmo `null`, e nenhuma tela precisa
 * saber distinguir os três — a diferença aparece no campo de custo, que
 * simplesmente não vem.
 */
export function assetDetailSelect(podeVerCusto: boolean) {
  if (podeVerCusto) return ASSET_DETAIL_SELECT;

  return {
    ...semCusto(ASSET_SELECT_COM_CAMPOS),
    model: { select: ASSET_SELECT.model.select },
  };
}
