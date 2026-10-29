import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import type { ReferenciaDoErro } from '../../../core/errors/app-error';
import {
  comoReferencias, licencasDaPessoa, nomesDasLicencas, type LicencaComAlguem,
} from '../../license/use-cases/count-license-checkouts.usecase';
import {
  itensComoReferencias, itensDaPessoa, nomesDosItens, totalDeUnidades, type ItemComAlguem,
} from '../../stock/use-cases/count-person-stock.usecase';

// O QUE AINDA PRENDE UMA PESSOA AO INVENTÁRIO — as pontas, contadas juntas.
//
// São QUATRO, e vêm do mesmo lugar (docs/referencia/modelo-de-posse.md): o que
// está no NOME da pessoa — ativo (`Assignment` alvo `PERSON`), licença
// (`LicenseCheckout.assignedPersonId`) e unidade de estoque (`StockMovement`
// aberto alvo `PERSON`) — e o que ela responde por OCUPAR um posto
// (`WorkstationOccupant`). Contar só a primeira é o erro que o D32 descreve: quem
// saiu continua respondendo por tudo que está na Mesa 1, e nenhuma consulta
// acusa, porque a Camada 3 é derivada.
//
// A PERGUNTA QUE DECIDE se algo entra aqui não é "tem tabela própria?", é
// *"alguém responde por isto quando a pessoa sai?"*. Licença entregue a ela responde
// sim — ele custa dinheiro por mês e é nominal; o mouse no nome dela também: é
// patrimônio, por quantidade, com uma pessoa respondendo. Por isso os dois
// entraram junto com os outros em vez de virarem uma contagem que alguém
// precisasse lembrar de somar.

/** Um computador ou um posto que a recusa cita: o id para o link, o nome para a frase. */
interface CitadoNaRecusa {
  id: string;
  nome: string;
}

interface PosseAbertaDaPessoa {
  /**
   * `Assignment` abertas com alvo `PERSON` — o que devolver —, pela ETIQUETA:
   * a recusa diz QUAIS, como faz com as licenças e os itens.
   */
  ativos: CitadoNaRecusa[];
  /** `WorkstationOccupant` abertas — o que encerrar —, pelo nome do posto. */
  postos: CitadoNaRecusa[];
  /**
   * `LicenseCheckout` abertas com `assignedPersonId` — a terceira ponta —, com
   * o NOME de cada licença: a recusa diz quais voltam.
   *
   * SÓ as da pessoa. As licenças de ATIVO não entram: elas são da máquina
   * (`license/use-cases/count-license-checkouts.usecase.ts`).
   */
  licencas: LicencaComAlguem[];
  /**
   * As unidades de estoque abertas com alvo `PERSON` — a quarta ponta —, por
   * ITEM e com o nome: a recusa diz quais voltam, como as licenças. SÓ as da
   * pessoa: as unidades do POSTO são do posto, e quem sai da empresa não leva o
   * mouse da Mesa 1 (`stock/use-cases/count-person-stock.usecase.ts`).
   */
  itens: ItemComAlguem[];
}

/**
 * Recebe o cliente de transação porque quem conta é a exclusão e a
 * desativação, DENTRO da transação que grava: contar fora deixaria uma janela
 * entre a contagem e o `UPDATE` em que uma entrega nova passaria.
 *
 * Só o que está ABERTO: o colaborador com histórico pode ser excluído — vai
 * para a lixeira, e a linha continua lá para o histórico de posse apontar.
 */
export async function contarPosseAberta(
  client: ClientePosse,
  personId: string,
): Promise<PosseAbertaDaPessoa> {
  const [posses, ocupacoes, licencas, itens] = await Promise.all([
    // Sem filtro de lixeira: o ativo entregue não vai para ela (AL).
    client.assignment.findMany({
      where: { targetType: 'PERSON', targetPersonId: personId, checkinAt: null },
      select: { asset: { select: { id: true, assetTag: true } } },
      orderBy: { asset: { assetTag: 'asc' } },
    }),
    client.workstationOccupant.findMany({
      where: { personId, endedAt: null },
      select: { workstation: { select: { id: true, name: true } } },
      orderBy: { workstation: { name: 'asc' } },
    }),
    licencasDaPessoa(client, personId),
    itensDaPessoa(client, personId),
  ]);

  return {
    ativos: posses.map(({ asset }) => ({ id: asset.id, nome: asset.assetTag })),
    // A ocupação aberta sempre tem posto (CHECK `workstation_occupants_posto_presente`);
    // o filtro é para o tipo, que é o da coluna.
    postos: ocupacoes.flatMap(({ workstation }) => (workstation ? [{ id: workstation.id, nome: workstation.name }] : [])),
    licencas,
    itens,
  };
}

/** "ATV-00012, ATV-00013 e ATV-00020" — os nomes que a recusa escreve. */
function emLista(citados: readonly CitadoNaRecusa[]): string {
  const nomes = citados.map((citado) => citado.nome);
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** "2 ativos", "1 ativo" — plural à mão porque é uma frase, não um dado. */
function quantos(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/** A recusa: a frase, e as licenças que ela cita, para a tela pôr link. */
export interface RecusaDaPessoa {
  mensagem: string;
  refs: ReferenciaDoErro[];
}

/**
 * A frase do 409 da exclusão e da desativação, montada a partir das contagens.
 *
 * Mora aqui, ao lado da contagem, porque o texto e os números têm que mudar
 * juntos: um 409 que diz "ainda responde por ativos" sem dizer QUANTOS e por
 * qual das duas camadas manda o operador procurar no lugar errado — e a camada
 * do posto é justamente a que ninguém lembra.
 *
 * AS QUATRO PONTAS VÊM PELO NOME — "responde por 1 ativo (ATV-00012)", "tem 3
 * licenças (AutoCAD, Office e VPN)", "está com 3 unidades de estoque (Mouse USB
 * ×2 e Teclado)", "ocupa 1 posto (Mesa 1)" — e como `refs`: o Devolver mora na
 * ficha do computador, no detalhe da licença e no do item, e o Encerrar na
 * ficha do posto; quem desliga um funcionário que sai vai direto a cada um
 * pelo link.
 *
 * Devolve `null` quando não há nada aberto: é o sinal de que a operação pode
 * seguir, sem o chamador reinterpretar os números.
 */
export function motivoParaRecusar(
  posse: PosseAbertaDaPessoa,
  operacao: 'excluir' | 'desativar',
): RecusaDaPessoa | null {
  const partes: string[] = [];
  if (posse.ativos.length > 0) {
    partes.push(`responde por ${quantos(posse.ativos.length, 'ativo', 'ativos')} (${emLista(posse.ativos)})`);
  }
  if (posse.licencas.length > 0) {
    partes.push(`tem ${quantos(posse.licencas.length, 'licença', 'licenças')} (${nomesDasLicencas(posse.licencas)})`);
  }
  if (posse.itens.length > 0) {
    const unidades = totalDeUnidades(posse.itens);
    partes.push(`está com ${quantos(unidades, 'unidade de estoque', 'unidades de estoque')} (${nomesDosItens(posse.itens)})`);
  }
  if (posse.postos.length > 0) {
    partes.push(`ocupa ${quantos(posse.postos.length, 'posto', 'postos')} (${emLista(posse.postos)})`);
  }

  if (partes.length === 0) return null;

  const frase = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;

  // Os links na ordem da frase.
  return {
    mensagem: `Este colaborador ainda ${frase}. Devolva o que está com ele e encerre as ocupações antes de ${operacao}.`,
    refs: [
      ...posse.ativos.map((ativo) => ({ tipo: 'ativo' as const, ...ativo })),
      ...comoReferencias(posse.licencas),
      ...itensComoReferencias(posse.itens),
      ...posse.postos.map((posto) => ({ tipo: 'posto' as const, ...posto })),
    ],
  };
}
