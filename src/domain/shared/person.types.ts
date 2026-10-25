import type { EntregaDoAlvo, EventoDeLicencaDoAlvo } from './license.types';
import type { UnidadeDeEstoque } from './stock.types';

/**
 * UM colaborador, como `GET /api/people/:id` o devolve — a ficha.
 *
 * Colaborador é quem RECEBE equipamento e não entra no sistema; quem opera é
 * `User`. O cadastro dele é a aba Colaboradores de Configurações (catálogo), e
 * a linha daquela tabela é um `CatalogRow`: este tipo é só o da ficha.
 *
 * DESATIVAR NÃO É EXCLUIR. Quem saiu da empresa continua no cadastro, com o
 * histórico de posse apontando para ele; excluir é para cadastro criado errado,
 * e o servidor só deixa quando não há histórico nenhum.
 */
export interface PessoaDaFicha {
  id: string;
  name: string;
  /** Opcional: o colaborador não faz login. */
  email: string | null;
  createdAt: string;
  isActive: boolean;
  /** As unidades de estoque no NOME dela — como a ficha do posto mostra `itens`. */
  itens: UnidadeDeEstoque[];
  /** As licenças entregues A ELA e ainda abertas — não as do computador que ela usa. */
  licencas: EntregaDoAlvo[];
}

/**
 * Um evento da aba Histórico da pessoa — `GET /api/people/:id/history`.
 *
 * TRÊS fontes numa lista só: as posses DIRETAS dela, as OCUPAÇÕES de posto e
 * as licenças entregues A ELA. Só movimentação: cadastro, edição e desativação
 * ficam na auditoria, no banco (AB).
 */
export interface EventoDaPessoa {
  id: string;
  fonte: 'POSSE' | 'POSTO' | 'LICENCA';
  action: string;
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  /** Preenchido só quando `fonte === 'POSSE'`. */
  posse: {
    assignmentId: string;
    assetId: string;
    /** "ATV-00012 — Dell Latitude". */
    assetLabel: string;
    notes: string | null;
    expectedCheckinAt: string | null;
  } | null;
  /** Preenchido só quando `fonte === 'POSTO'`. */
  posto: {
    occupantId: string;
    /** Nulo quando o posto foi excluído: o nome continua em `workstationLabel`. */
    workstationId: string | null;
    workstationLabel: string;
    shift: string | null;
    notes: string | null;
  } | null;
  /** Preenchido só quando `fonte === 'LICENCA'`. */
  licenca: EventoDeLicencaDoAlvo | null;
}
