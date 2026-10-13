import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  dataOpcional, nomeObrigatorio, textoOpcional,
  uuidObrigatorio, uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';

// Contrato de entrada das rotas de ativo.
//
// `strictObject` recusa campo desconhecido em vez de ignorar em silêncio — é o
// que fecha o mass assignment.
//
// NÃO existe `categoryId` aqui: a categoria do ativo é a do modelo. Aceitar uma
// categoria digitada permitiria um ativo de categoria "Monitor" apontando para
// um modelo de categoria "Notebook".
//
// NÃO existe `quantity`: um ativo é UM equipamento (D3).
//
// NÃO existe mais `assignedToId`: a operação foi para o CHECKOUT/CHECKIN
// (docs/referencia/modelo-de-posse.md). A coluna continua no banco e continua saindo na
// resposta (`ASSET_SELECT`), mas virou cache do caso `targetType: USER` da
// `Assignment` — quem escreve nela é só a entrega e a devolução. Um campo
// editável à mão ao lado de uma tabela de posse são duas fontes de verdade para
// o mesmo fato, e nada impede divergirem. Como `strictObject` recusa chave
// desconhecida, mandar `assignedToId` para /api/assets agora responde 422, que
// é a resposta certa: a operação existe, só não é esta.

/**
 * Etiqueta do ativo. Chave AUSENTE **ou** valor vazio significam a mesma coisa:
 * "gere a partir do contador de `AppSetting`".
 *
 * O `preprocess` não é zelo. `.optional()` sozinho só aceita a chave ausente, e
 * o formulário sempre manda a chave — `assetTag: ''` quando o usuário não digita
 * nada e deixa a etiqueta automática fazer o trabalho. Sem isto o `''` cai no
 * `.min(1)` e a etiqueta automática fica INALCANÇÁVEL pela tela, respondendo
 * 422 "etiqueta não pode ser vazio". É a mesma armadilha do número opcional, e
 * a solução é a mesma: normalizar antes de validar.
 */
const etiquetaOpcional = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
  nomeObrigatorio('etiqueta').optional(),
);

const camposComuns = {
  serial: textoOpcional('número de série', 150),
  name: textoOpcional('nome', 200),
  notes: textoOpcional('notas', 2_000),

  locationId: uuidOpcional('localização'),

  orderNumber: textoOpcional('número do pedido', 100),
  purchaseDate: dataOpcional('data de compra'),
  purchaseCost: valorMonetarioOpcional('valor de compra'),

  // ── OS CAMPOS CUSTOMIZADOS (F9, Etapa B) ─────────────────────────────────
  //
};

export const createAssetSchema = z.strictObject({
  // Ausente ou vazia, a etiqueta é gerada pelo contador de `AppSetting`. É por
  // isso que o campo é opcional aqui e obrigatório no banco.
  assetTag: etiquetaOpcional,
  statusId: uuidObrigatorio('status'),
  modelId: uuidObrigatorio('modelo'),
  ...camposComuns,
});

// Edição: todo campo é opcional — ausente significa "mantém o valor atual".
// Etiqueta apagada no formulário também significa isso: a coluna é obrigatória
// no banco, então "limpar" não é uma operação que exista.
export const updateAssetSchema = z.strictObject({
  assetTag: etiquetaOpcional,
  statusId: uuidObrigatorio('status').optional(),
  modelId: uuidObrigatorio('modelo').optional(),
  ...camposComuns,
});

// ---------------------------------------------------------------------------
// DAR BAIXA
// ---------------------------------------------------------------------------

/**
 * O motivo vem do enum do banco, e não de uma lista escrita de novo aqui: um
 * valor a mais em `RetiredReason` passa a ser aceito sem ninguém lembrar deste
 * arquivo, e um valor removido vira erro de compilação em vez de 500 na
 * gravação.
 */
export const retireAssetSchema = z.strictObject({
  retiredReason: z.enum($Enums.RetiredReason, 'motivo da saída inválido'),
  // Ausente = agora. A venda pode ter sido na semana passada e o registro hoje.
  retiredAt: dataOpcional('data da saída'),
  // A justificativa do evento. Vai para o `ActivityLog`, não para uma coluna
  // (ver retire-asset.usecase.ts).
  notes: textoOpcional('observações', 2_000),
});

// O `historyQuerySchema` da aba Histórico mudou para `shared/history.schema.ts`
// quando a pessoa ganhou o dela — o ativo não é mais o único a ter histórico.
