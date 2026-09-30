import { z } from 'zod';
import { $Enums } from '@prisma/client';
import {
  booleano, dataOpcional, nomeObrigatorio, textoOpcional,
  uuidOpcional, valorMonetarioOpcional,
} from '../../shared/fields.schema';

// O CONTRATO DA MANUTENÇÃO.
//
// `startDate` NÃO usa `dataNaoFutura`, e isso é a regra da etapa: upgrade
// agendado para o mês que vem e contrato de suporte que começa na renovação são
// manutenções legítimas com data futura. A borda que existe é a outra — encerrar
// antes de abrir —, e ela é entre DOIS campos com edição parcial, então mora no
// use-case e não aqui (mesmo caso do `beforeWrite` da depreciação).
//
// `cost` é STRING do começo ao fim (`valorMonetarioOpcional`): `z.coerce.number()`
// no caminho reintroduz o centavo que o `Decimal` existe para impedir.

/** A data de abertura é OBRIGATÓRIA — sem ela não há "há quantos dias". */
const dataObrigatoria = (rotulo: string) =>
  dataOpcional(rotulo).refine((valor): valor is Date => valor instanceof Date, `${rotulo} é obrigatória`);

export const createMaintenanceSchema = z.strictObject({
  type: z.enum($Enums.MaintenanceType, 'tipo de manutenção inválido'),
  title: nomeObrigatorio('título'),
  startDate: dataObrigatoria('data de abertura'),
  completionDate: dataOpcional('data de encerramento'),
  cost: valorMonetarioOpcional('custo'),
  isWarranty: booleano('na garantia').default(false),
  supplierId: uuidOpcional('fornecedor'),
  notes: textoOpcional('observações', 2000),
});

/**
 * A edição NÃO aceita `assetId`.
 *
 * Mover uma manutenção de ativo não é edição, é dois fatos: o serviço não
 * aconteceu naquele equipamento e aconteceu neste. Deixar o campo aberto
 * permitiria reescrever o histórico de dois ativos com um PUT — é a mesma razão
 * que tirou `assignedToId` do formulário do ativo na F4 (D14).
 */
export const updateMaintenanceSchema = createMaintenanceSchema.partial();

/**
 * O ENCERRAMENTO, com rota própria.
 *
 * Poderia ser um PUT com `completionDate` e não é, por duas razões: é UM clique
 * na tela ("Encerrar") e o valor padrão é hoje — um PUT obrigaria o cliente a
 * calcular a data —, e o evento merece linha própria no histórico DO ATIVO
 * (`SERVICE_CLOSE`), que um PUT genérico gravaria como diff de campo.
 */
export const closeMaintenanceSchema = z.strictObject({
  completionDate: dataOpcional('data de encerramento'),
  cost: valorMonetarioOpcional('custo'),
  notes: textoOpcional('observações', 2000),
});

export type CreateMaintenanceData = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceData = z.infer<typeof updateMaintenanceSchema>;
export type CloseMaintenanceData = z.infer<typeof closeMaintenanceSchema>;
