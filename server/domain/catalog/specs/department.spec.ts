import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createDepartmentSchema, updateDepartmentSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

// DEPARTAMENTO — a décima tabela de catálogo (F11, Etapa D, D75).
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE UM DEPARTAMENTO **NÃO** É, e vale escrever aqui porque é a spec que
// alguém vai ler primeiro ao perguntar "posso entregar um notebook para o
// Comercial?".
//
// Ele NÃO detém ativo (D72). Não existe `AssignmentTarget = DEPARTMENT`, e não
// vai existir: entregar "para o Comercial" é entregar para uma sala ou para uma
// pessoa — departamento não tem mesa, não tem chave e não assina nada. Aceitá-lo
// como alvo acrescentaria um quarto valor ao `AssignmentTarget` cujo
// "responsável" seria a lista inteira de quem trabalha lá, e a pluralidade
// voltaria a crescer multiplicativamente — exatamente o que o D14 evitou.
//
// Ele agrupa PESSOAS, e serve para três coisas: relatório ("quanto o Comercial
// tem em equipamento"), rateio de custo e filtro de tela.
// ═══════════════════════════════════════════════════════════════════════════

export const departmentSpec: CatalogSpec = {
  slug: 'departments',
  entityType: 'Department',
  rotulo: 'departamento',

  delegate: (client) => client.department as unknown as CatalogDelegate,
  createSchema: createDepartmentSchema,
  updateSchema: updateDepartmentSchema,

  select: {
    id: true, name: true, code: true, managerId: true, createdAt: true,
    // O NOME do gestor, não só o uuid: a tabela mostra "Comercial — Ana Lima",
    // e uma consulta por linha seria N+1.
    manager: { select: { id: true, name: true } },
  },
  sortable: ['name', 'code', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name', 'code'],
  audited: ['name', 'code', 'managerId'],

  /**
   * Quantas pessoas estão neste departamento.
   *
   * `User.departmentId` é `Restrict`, então o banco já barraria o `DELETE` —
   * mas pelo P2003, com a frase genérica "registro está em uso por outro
   * cadastro" em vez da que conta por QUANTAS pessoas. A rede existia; o
   * ensinamento não. É a mesma razão pela qual o fornecedor conta as licenças.
   *
   * `INCLUINDO_LIXEIRA` porque a FK `Restrict` não distingue lixeira de linha
   * viva: um colaborador apagado ainda aponta para o departamento, e o banco
   * recusaria o delete que esta contagem teria dito ser possível.
   */
  countUsages: async (client, id) =>
    client.user.count({ where: { departmentId: id, ...INCLUINDO_LIXEIRA } }),
};
