import type { CheckinInput, CheckoutInput } from '../../../queries/assignment.queries';
import type { Asset } from '../../../types/asset.types';
import type { AlvoDaPosse, PosseResolvida } from '../../../types/posse.types';
import { caminhoDoResponsavel } from '../../../helpers/responsavel.helper';

// Leitura da posse para a tela — funções puras, fora do JSX
// (docs/referencia/arquitetura.md: "cálculo sai do JSX").
//
// O contrato está em docs/referencia/modelo-de-posse.md: a responsabilidade é DERIVADA, pode
// ser de VÁRIAS pessoas (os ocupantes de um posto) e pode ser de NINGUÉM mesmo
// com o ativo entregue (posto sem ocupante aberto). Fora da aba Responsáveis, a tela
// mostra só o alvo da entrega (BL), e é isto que este arquivo resolve.

/** O que a listagem mostra quando não há nada a mostrar. */
export const TRACO = '—';

/** Onde a busca da aba Responsáveis procura: no alvo e em quem está no posto. */
export function textoDaPosse(posse: PosseResolvida): string {
  return [posse.targetLabel, ...posse.responsaveis.map((pessoa) => pessoa.name)].join(' ');
}

/**
 * Por que o botão de ENTREGAR está travado — ou `null`, se não está.
 *
 * Só ativo de status `DEPLOYABLE` ("Disponível") pode ser entregue: é a regra do
 * servidor, e o tipo do status é exatamente a pergunta "está no estoque, pronto
 * para sair?". Um ativo "Em conserto" com o botão aceso abria o modal inteiro,
 * deixava escolher pessoa, data e observação, e só no fim levava a recusa.
 *
 * O ATIVO ENTREGUE trava primeiro, como o item sem unidade disponível: volta pelo
 * Devolver da aba Responsáveis (BQ), que nunca trava, qualquer que seja o status —
 * é por ele que um status errado se conserta.
 *
 * O texto diz o status ATUAL pelo nome que o cliente deu a ele, porque é esse
 * nome que a pessoa vê na linha e procura em Configurações para entender.
 *
 * Ativo BAIXADO também trava, venha com o status que vier: ele saiu do
 * patrimônio, e a baixa não mexe no status — um vendido pode estar
 * "Disponível". O servidor recusa com 409; o botão não oferece.
 */
/**
 * Para onde a linha do responsável leva (CJ): a ficha do posto, ou a do colaborador que
 * recebeu direto. Sem posse aberta, nada.
 */
export function caminhoDaPosse(asset: Pick<Asset, 'posse' | 'postoAtual'>): string | null {
  const noPosto = asset.posse?.targetType === 'WORKSTATION';
  const pessoa = asset.posse?.responsaveis.find((responsavel) => responsavel.via === 'DIRETO');
  return caminhoDoResponsavel({ posto: noPosto ? asset.postoAtual?.id : null, colaborador: noPosto ? null : pessoa?.id });
}

export function bloqueioDaEntrega(asset: Pick<Asset, 'posse' | 'status' | 'retiredAt'>): string | null {
  if (asset.posse?.assignmentId != null) return 'Já entregue: devolva antes de entregar de novo';
  if (asset.retiredAt) return 'Baixado: reverta a baixa para entregar';
  if (asset.status.type === 'DEPLOYABLE') return null;
  return `${asset.status.name}: só computador disponível é entregue`;
}

/**
 * Formulário de entrega → corpo de `POST /assets/:id/checkout`.
 *
 * Mora aqui, e não no `onSubmit` do modal, por dois motivos concretos:
 *
 * 1. das duas FKs de alvo, UMA vale — a que corresponde à aba escolhida. Mandar
 *    a outra (mesmo vazia) seria mandar um alvo que o usuário não escolheu;
 * 2. campo vazio precisa virar AUSENTE, não `''`: uma data vazia chegaria ao
 *    servidor como string inválida em vez de "não informado".
 */
export function montarEntrega(valores: {
  targetType: AlvoDaPosse;
  alvoId: string;
  statusId: string;
  expectedCheckinAt: string;
  checkoutNotes: string;
  checkoutAt: string;
}): CheckoutInput {
  const corpo: CheckoutInput = { targetType: valores.targetType };

  if (valores.targetType === 'PERSON') corpo.targetPersonId = valores.alvoId;
  if (valores.targetType === 'WORKSTATION') corpo.targetWorkstationId = valores.alvoId;

  if (valores.statusId) corpo.statusId = valores.statusId;
  if (valores.expectedCheckinAt) corpo.expectedCheckinAt = valores.expectedCheckinAt;
  if (valores.checkoutNotes.trim()) corpo.checkoutNotes = valores.checkoutNotes.trim();
  if (valores.checkoutAt) corpo.checkoutAt = valores.checkoutAt;

  return corpo;
}

/** Formulário de devolução → corpo de `POST /assets/:id/checkin`. */
export function montarDevolucao(valores: { statusId: string; checkinNotes: string; checkinAt: string }): CheckinInput {
  const corpo: CheckinInput = {};

  if (valores.statusId) corpo.statusId = valores.statusId;
  if (valores.checkinNotes.trim()) corpo.checkinNotes = valores.checkinNotes.trim();
  if (valores.checkinAt) corpo.checkinAt = valores.checkinAt;

  return corpo;
}
