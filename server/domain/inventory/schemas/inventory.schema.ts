import { z } from 'zod';

// Contrato de entrada das rotas de inventário.
//
// `strictObject` recusa campo desconhecido em vez de ignorar em silêncio: é o
// que fecha o mass assignment. Antes, a proteção era a lista explícita de campos
// no use-case — funcionava, mas quem mandasse um campo a mais recebia 200 e
// achava que tinha gravado.
//
// A lista de status é a definição do SERVIDOR sobre o que é um status válido.
// Hoje ela existe também no frontend (src/pages/gestao-itam/helpers/
// status-label.helper.ts) porque `InventoryItem.status` é texto livre no schema
// do Prisma; as duas somem na Fase 1, quando virar a tabela `StatusLabel`.
export const INVENTORY_STATUSES = ['AVAILABLE', 'DEPLOYED', 'BROKEN'] as const;

const nomeObrigatorio = (rotulo: string) =>
  z.string(`${rotulo} é obrigatório`).trim().min(1, `${rotulo} não pode ser vazio`).max(200, `${rotulo}: máximo de 200 caracteres`);

// Texto livre opcional. `''` vira `null` (o formulário manda string vazia quando
// o usuário limpa o campo); ausente continua `undefined`, que o Prisma entende
// como "não mexe neste campo".
const textoOpcional = (rotulo: string, max: number) =>
  z.string().trim().max(max, `${rotulo}: máximo de ${max} caracteres`).nullish()
    .transform(valor => (valor === undefined ? undefined : valor || null));

// Quantidade chega do formulário como string ("3"): `coerce` converte.
const quantidade = z.coerce.number('quantidade deve ser um número')
  .int('quantidade deve ser um número inteiro')
  .min(0, 'quantidade não pode ser negativa')
  .max(1_000_000, 'quantidade acima do limite');

const status = z.enum(INVENTORY_STATUSES, 'status desconhecido');

export const createInventoryItemSchema = z.strictObject({
  name: nomeObrigatorio('nome'),
  category: nomeObrigatorio('categoria'),
  description: textoOpcional('descrição', 2_000),
  quantity: quantidade.optional(),
  status: status.optional(),
  notes: textoOpcional('notas', 2_000),
});

// Edição: todo campo é opcional — ausente significa "mantém o valor atual".
export const updateInventoryItemSchema = z.strictObject({
  name: nomeObrigatorio('nome').optional(),
  category: nomeObrigatorio('categoria').optional(),
  description: textoOpcional('descrição', 2_000),
  quantity: quantidade.optional(),
  status: status.optional(),
  notes: textoOpcional('notas', 2_000),
});
