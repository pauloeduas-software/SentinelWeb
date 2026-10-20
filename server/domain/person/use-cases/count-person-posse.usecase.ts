import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { contarAssentosDaPessoa } from '../../license/use-cases/count-person-seats.usecase';
import { contarEstoqueDaPessoa } from '../../stock/use-cases/count-person-stock.usecase';

// O QUE AINDA PRENDE UMA PESSOA AO INVENTÁRIO — as pontas, contadas juntas.
//
// São QUATRO, e vêm do mesmo lugar (docs/referencia/modelo-de-posse.md): o que
// está no NOME da pessoa — ativo (`Assignment` alvo `PERSON`), assento de licença
// (`LicenseSeatCheckout.assignedPersonId`) e unidade de estoque (`StockMovement`
// de SAIDA alvo `PERSON`) — e o que ela responde por OCUPAR um posto
// (`WorkstationOccupant`). Contar só a primeira é o erro que o D32 descreve: quem
// saiu continua respondendo por tudo que está na Mesa 1, e nenhuma consulta
// acusa, porque a Camada 3 é derivada.
//
// A PERGUNTA QUE DECIDE se algo entra aqui não é "tem tabela própria?", é
// *"alguém responde por isto quando a pessoa sai?"*. Assento de licença responde
// sim — ele custa dinheiro por mês e é nominal; o mouse no nome dela também: é
// patrimônio, por quantidade, com uma pessoa respondendo. Por isso os dois
// entraram junto com os outros em vez de virarem uma contagem que alguém
// precisasse lembrar de somar.

interface PosseAbertaDaPessoa {
  /** `Assignment` abertas com alvo `PERSON` — o que devolver. */
  ativosEmPosse: number;
  /** `WorkstationOccupant` abertas — o que encerrar. */
  postosOcupados: number;
  /**
   * `LicenseSeatCheckout` abertas com `assignedPersonId` — a terceira ponta, da F6.
   *
   * SÓ as da pessoa. Os assentos de ATIVO não entram: eles são da máquina
   * (`license/use-cases/count-person-seats.usecase.ts`).
   */
  assentosEmPosse: number;
  /**
   * `StockMovement` de SAIDA abertas com alvo `PERSON` — a quarta ponta, a do
   * estoque. SÓ as da pessoa: as unidades do POSTO são do posto, e quem sai da
   * empresa não leva o mouse da Mesa 1 (`stock/use-cases/count-person-stock.usecase.ts`).
   */
  itensEmPosse: number;
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
  const [ativosEmPosse, postosOcupados, assentosEmPosse, itensEmPosse] = await Promise.all([
    client.assignment.count({
      // `asset: { deletedAt: null }` EXPLÍCITO. `assignments` não tem
      // `deletedAt`, então a extension não escopa esta contagem — e ela não
      // alcança relação aninhada de jeito nenhum.
      //
      // Sem esta linha, um ativo mandado para a lixeira com a posse ainda
      // aberta contaria aqui: o 409 diria "responde por 1 ativo" sobre
      // equipamento que saiu do inventário, e não se cobra isso de ninguém.
      where: { targetType: 'PERSON', targetPersonId: personId, checkinAt: null, asset: { deletedAt: null } },
    }),
    client.workstationOccupant.count({ where: { personId, endedAt: null } }),
    contarAssentosDaPessoa(client, personId),
    contarEstoqueDaPessoa(client, personId),
  ]);

  return { ativosEmPosse, postosOcupados, assentosEmPosse, itensEmPosse };
}

/** "2 ativos", "1 ativo" — plural à mão porque é uma frase, não um dado. */
function quantos(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/**
 * A frase do 409 da exclusão e da desativação, montada a partir das contagens.
 *
 * Mora aqui, ao lado da contagem, porque o texto e os números têm que mudar
 * juntos: um 409 que diz "ainda responde por ativos" sem dizer QUANTOS e por
 * qual das duas camadas manda o operador procurar no lugar errado — e a camada
 * do posto é justamente a que ninguém lembra.
 *
 * Devolve `null` quando não há nada aberto: é o sinal de que a operação pode
 * seguir, sem o chamador reinterpretar os números.
 */
export function motivoParaRecusar(
  posse: PosseAbertaDaPessoa,
  operacao: 'excluir' | 'desativar',
): string | null {
  const partes: string[] = [];
  if (posse.ativosEmPosse > 0) partes.push(`responde por ${quantos(posse.ativosEmPosse, 'ativo', 'ativos')}`);
  if (posse.assentosEmPosse > 0) {
    partes.push(`ocupa ${quantos(posse.assentosEmPosse, 'assento de licença', 'assentos de licença')}`);
  }
  if (posse.itensEmPosse > 0) {
    partes.push(`está com ${quantos(posse.itensEmPosse, 'item de estoque', 'itens de estoque')}`);
  }
  if (posse.postosOcupados > 0) partes.push(`ocupa ${quantos(posse.postosOcupados, 'posto', 'postos')}`);

  if (partes.length === 0) return null;

  // Vírgula entre as primeiras e " e " antes da última: com quatro pontas, um
  // `join(' e ')` produziria "responde por 1 ativo e ocupa 1 assento de licença
  // e ocupa 1 posto" — uma frase que ninguém lê até o fim.
  const frase = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;

  // A FRASE DIZ O QUE FAZER, e o que ela manda fazer tem que EXISTIR: devolver
  // o ativo, o assento e a unidade de estoque, e encerrar a ocupação, são as
  // quatro operações que zeram as quatro pontas contadas acima.
  return `Este colaborador ainda ${frase}. Devolva o que está com ele e encerre as ocupações antes de ${operacao}.`;
}
