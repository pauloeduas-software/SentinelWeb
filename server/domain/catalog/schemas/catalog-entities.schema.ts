import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  booleano, corOpcional, emailOpcional,
  nomeObrigatorio, textoOpcional, urlOpcional, uuidObrigatorio, uuidOpcional,
} from '../../shared/fields.schema';

// Contrato de entrada das cinco tabelas de catálogo, num lugar só.
//
// `strictObject` em tudo: campo desconhecido é recusado em vez de ignorado em
// silêncio — é o que fecha o mass assignment (docs/historico/fase-00-base-tecnica.md).
//
// Os enums vêm de `$Enums`, gerado pelo Prisma a partir do schema: a lista de
// valores válidos tem UMA fonte, o banco. É o fim do texto livre que a Fase 1
// existe para promover (D5/D10).

// ---------------------------------------------------------------- Category
const camposCategoria = {
  color: corOpcional,
};

export const createCategorySchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido'),
  ...camposCategoria,
});

export const updateCategorySchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.CategoryType, 'tipo de categoria inválido').optional(),
  ...camposCategoria,
});

// ------------------------------------------------------------- StatusLabel
export const createStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido'),
  color: corOpcional,
  showInNav: booleano('mostrar no menu').optional(),
  notes: textoOpcional('notas', 2_000),
});

export const updateStatusLabelSchema = z.strictObject({
  name: nomeObrigatorio().optional(),
  type: z.enum($Enums.StatusLabelType, 'tipo de status inválido').optional(),
  color: corOpcional,
  showInNav: booleano('mostrar no menu').optional(),
  notes: textoOpcional('notas', 2_000),
});

// ------------------------------------------------------------ Manufacturer
const camposFabricante = {
  url: urlOpcional,
  supportPhone: textoOpcional('telefone de suporte', 50),
  supportEmail: emailOpcional,
  supportUrl: urlOpcional,
};

export const createManufacturerSchema = z.strictObject({ name: nomeObrigatorio(), ...camposFabricante });
export const updateManufacturerSchema = z.strictObject({ name: nomeObrigatorio().optional(), ...camposFabricante });

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
});

// ---------------------------------------------------------------- Location
const camposLocalizacao = {
  parentId: uuidOpcional('localização pai'),
  managerId: uuidOpcional('gestor'),

  // Marca a folha da árvore que é MESA, e não filial: é o que separa "Mesa 1"
  // de "Filial São Paulo" nas telas e o que alimenta /postos. De APRESENTAÇÃO,
  // não de regra — nenhuma invariante depende dela, e um local sem a marca
  // continua podendo receber ativo e ocupante (prisma/schema.prisma, D15).
  isWorkstation: booleano('é posto de trabalho').optional(),
  address: textoOpcional('endereço', 300),
  city: textoOpcional('cidade', 100),
  state: textoOpcional('estado', 100),
  zip: textoOpcional('CEP', 20),
  phone: textoOpcional('telefone', 50),
  notes: textoOpcional('notas', 2_000),
};

export const createLocationSchema = z.strictObject({ name: nomeObrigatorio(), ...camposLocalizacao });
export const updateLocationSchema = z.strictObject({ name: nomeObrigatorio().optional(), ...camposLocalizacao });
