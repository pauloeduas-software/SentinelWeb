import type { AssentoDeLicenca, StatusDaLicenca } from '../../../domain/shared/license.types';

// Funções puras da tela de licenças — cálculo e cor fora do JSX
// (docs/ARQUITETURA.md).

/** A cor de cada status. Hex, porque o Tailwind não gera classe de runtime. */
const COR_DO_STATUS: Record<StatusDaLicenca, string> = {
  ATIVA: '#22c55e',
  VENCENDO: '#f59e0b',
  EXPIRADA: '#ef4444',
  ENCERRADA: '#888888',
};

export function corDoStatus(status: StatusDaLicenca): string {
  return COR_DO_STATUS[status];
}

/**
 * O prazo, em português, a partir do número que o SERVIDOR calculou.
 *
 * A conta não é refeita aqui de propósito: o "hoje" do navegador pode não ser o
 * do servidor, e uma licença que vence hoje apareceria como vencida para quem
 * está num fuso a oeste.
 */
export function textoDoPrazo(dias: number | null): string {
  if (dias === null) return 'sem vencimento';
  if (dias < 0) return `venceu há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'vence hoje';
  return `vence em ${dias} dia${dias === 1 ? '' : 's'}`;
}

/** Os cinco estados possíveis de um quadrado da grade. */
export type EstadoDoAssento = 'livre' | 'pessoa' | 'ativo' | 'queimado' | 'aposentado';

/**
 * A ORDEM DAS PERGUNTAS É A REGRA.
 *
 * Aposentado vem primeiro porque ele não existe mais no contrato — mostrar um
 * assento aposentado como "livre" convidaria alguém a tentar entregá-lo, e o
 * servidor recusaria sem que a tela tivesse explicado por quê. Queimado vem em
 * seguida pelo mesmo motivo: ele parece livre e não é.
 */
export function estadoDoAssento(assento: AssentoDeLicenca): EstadoDoAssento {
  if (assento.retiredAt) return 'aposentado';
  if (assento.burnedAt) return 'queimado';

  const aberta = assento.checkouts[0];
  if (!aberta) return 'livre';
  return aberta.assignedUserId ? 'pessoa' : 'ativo';
}

export const ROTULO_DO_ESTADO: Record<EstadoDoAssento, string> = {
  livre: 'Livre',
  pessoa: 'Pessoa',
  ativo: 'Ativo',
  queimado: 'Queimado',
  aposentado: 'Aposentado',
};

/** Quem está no assento, em uma linha. `null` quando ninguém está. */
export function ocupanteDoAssento(assento: AssentoDeLicenca): string | null {
  const aberta = assento.checkouts[0];
  if (!aberta) return null;
  if (aberta.assignedUser) return aberta.assignedUser.name;
  if (aberta.assignedAsset) {
    return aberta.assignedAsset.name
      ? `${aberta.assignedAsset.assetTag} — ${aberta.assignedAsset.name}`
      : aberta.assignedAsset.assetTag;
  }
  return null;
}

/**
 * O vocabulário do histórico DESTA tela.
 *
 * Mora aqui e não no `historico.helper.ts` compartilhado: uma lista central com
 * o vocabulário de todos os domínios seria um arquivo que nenhuma das telas lê
 * inteiro — é a nota que aquele arquivo já traz.
 */
export const ACOES_DA_LICENCA: Record<string, string> = {
  CHECKOUT: 'Assento entregue',
  CHECKIN: 'Assento devolvido',
  RETIRE: 'Assento queimado',
  VIEW_KEY: 'Chave revelada',
};

/**
 * O nome dos campos que a trilha DESTA tela grava, em português.
 *
 * Passado ao `lerEvento` como os rótulos do domínio — pela mesma inversão do
 * `parseListQuery` recebendo a allowlist: um mapa global traduziria `name` para
 * todas as tabelas e erraria no primeiro homônimo.
 *
 * `hasProductKey` e `productKeyTrocada` são o que o histórico sabe sobre a
 * chave, e é tudo o que ele PODE saber: `productKey` está fora de
 * `LICENSE_AUDITED` justamente para o diff não publicar o segredo (D42).
 */
export const ROTULOS_DA_LICENCA: Record<string, string> = {
  name: 'Nome',
  seatsTotal: 'Total de assentos',
  minSeats: 'Mínimo de livres',
  reassignable: 'Reatribuível',
  maintained: 'Com manutenção',
  expirationDate: 'Vencimento',
  terminationDate: 'Encerramento',
  licensedToName: 'Licenciado para',
  licensedToEmail: 'E-mail do licenciado',
  categoryId: 'Categoria',
  manufacturerId: 'Fabricante',
  supplierId: 'Fornecedor',
  orderNumber: 'Pedido',
  purchaseDate: 'Data da compra',
  purchaseCost: 'Valor da compra',
  notes: 'Notas',

  hasProductKey: 'Chave cadastrada',
  productKeyTrocada: 'Chave substituída',

  seatNumber: 'Assento',
  seatId: 'Assento (id)',
  checkoutId: 'Ocupação',
  alvo: 'Alvo',
  alvoId: 'Alvo (id)',
  alvoNome: 'Alvo',
  queimado: 'Queimado',
  motivo: 'Motivo',
  burnedAt: 'Queimado em',
  checkinAt: 'Devolvido em',
  revealedAt: 'Revelada em',
  userId: 'Colaborador',
};
