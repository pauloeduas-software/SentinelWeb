import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  booleano, emailOpcional,
  nomeObrigatorio, textoOpcional, urlOpcional, uuidObrigatorio, versaoLida
} from '../../shared/fields.schema';

// Contrato de entrada das seis tabelas de catálogo, num lugar só.
//
// `strictObject` em tudo: campo desconhecido é recusado em vez de ignorado em
// silêncio — é o que fecha o mass assignment (docs/historico/fase-00-base-tecnica.md).
//
// Os enums vêm de `$Enums`, gerado pelo Prisma a partir do schema: a lista de
// valores válidos tem UMA fonte, o banco. É o fim do texto livre que a Fase 1
// existe para promover (D5/D10).

// ---------------------------------------------------------------- Category
export const createCategorySchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido'),
});

export const updateCategorySchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido').optional(),
  isActive: booleano('ativa').optional(),
  updatedAt: versaoLida,
});

// ------------------------------------------------------------- StatusLabel
export const createStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido'),
  notes: textoOpcional('notas', 2_000),
});

export const updateStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido').optional(),
  notes: textoOpcional('notas', 2_000),
  isActive: booleano('ativo').optional(),
  updatedAt: versaoLida,
});

// ------------------------------------------------------------ Manufacturer
const camposFabricante = {
  url: urlOpcional('site'),
  supportPhone: textoOpcional('telefone de suporte', 50),
  supportEmail: emailOpcional,
};

export const createManufacturerSchema = z.strictObject({ name: nomeObrigatorio(), ...camposFabricante });
// `isActive` só na EDIÇÃO em categoria, status, fabricante e modelo: é o botão
// Desativar/Ativar da linha. Quem nasce, nasce ativo — o create o recusa.
export const updateManufacturerSchema = z.strictObject({
  name: nomeObrigatorio().optional(), ...camposFabricante, isActive: booleano('ativo').optional(),
  updatedAt: versaoLida,
});

// -------------------------------------------------------------- AssetModel
const camposModelo = {
  modelNumber: textoOpcional('número do modelo', 100),
  notes: textoOpcional('notas', 2_000),
};

export const createAssetModelSchema = z.strictObject({
  name: nomeObrigatorio(),
  manufacturerId: uuidObrigatorio('fabricante'),
  categoryId: uuidObrigatorio('categoria'),
  ...camposModelo,
});

export const updateAssetModelSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  manufacturerId: uuidObrigatorio('fabricante').optional(),
  categoryId: uuidObrigatorio('categoria').optional(),
  ...camposModelo,
  isActive: booleano('ativo').optional(),
  updatedAt: versaoLida,
});

// ---------------------------------------------------------------- Location
// Sem marca de posto: o posto é cadastro próprio, na tela Postos (decisão Y).
const camposLocalizacao = {
  address: textoOpcional('endereço', 300),
  city: textoOpcional('cidade', 100),
  state: textoOpcional('estado', 100),
  zip: textoOpcional('CEP', 20),
  phone: textoOpcional('telefone', 50),
  notes: textoOpcional('notas', 2_000),
};

export const createLocationSchema = z.strictObject({ name: nomeObrigatorio(), ...camposLocalizacao });
// `isActive` só na EDIÇÃO, como nas outras quatro: é o botão Desativar/Ativar.
export const updateLocationSchema = z.strictObject({
  name: nomeObrigatorio().optional(), ...camposLocalizacao, isActive: booleano('ativa').optional(),
  updatedAt: versaoLida,
});

// ------------------------------------------------------------------ Person
// O e-mail do colaborador é OPCIONAL — ele não faz login, e há quem não tenha
// um — e único quando preenchido. `toLowerCase` antes do formato pela mesma
// razão do e-mail de usuário (`user.schema.ts`): "Ana@x.com" e "ana@x.com"
// seriam dois cadastros, e o `@unique` do banco compara byte a byte.
const emailDoColaborador = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((valor) => (valor === undefined ? undefined : valor || null))
  .pipe(z.email('e-mail inválido').max(320, 'e-mail: máximo de 320 caracteres').nullish());

export const createPersonSchema = z.strictObject({ name: nomeObrigatorio(), email: emailDoColaborador });
// `isActive` só na EDIÇÃO, como nas outras cinco: é o botão Desativar/Ativar.
export const updatePersonSchema = z.strictObject({
  name: nomeObrigatorio().optional(), email: emailDoColaborador, isActive: booleano('ativo').optional(),
  updatedAt: versaoLida,
});
