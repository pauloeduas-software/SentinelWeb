import type { ClientePosse } from '../../assignment/use-cases/resolve-responsibles.usecase';

// O QUE AINDA PRENDE UMA PESSOA AO INVENTÁRIO — as duas pontas, contadas juntas.
//
// São duas porque a responsabilidade tem duas camadas (docs/MODELO-POSSE.md):
// o que está no NOME da pessoa (`Assignment` com alvo `USER`) e o que ela
// responde por OCUPAR um posto (`LocationOccupant`). Contar só a primeira é o
// erro que o D32 descreve: o desligado continua respondendo por tudo que está
// na Mesa 1, e nenhuma consulta acusa, porque a Camada 3 é derivada.

export interface PosseAbertaDoUsuario {
  /** `Assignment` abertas com alvo `USER` — o que devolver. */
  ativosEmPosse: number;
  /** `LocationOccupant` abertas — o que encerrar. */
  postosOcupados: number;
}

/**
 * Recebe o cliente (global ou de transação) porque os dois chamadores precisam
 * de coisas diferentes: o `DELETE` conta DENTRO da transação que vai apagar
 * (contar fora deixaria uma janela entre a contagem e o `UPDATE` em que uma
 * entrega nova passaria), e a tela de perfil conta por fora, só para mostrar.
 */
export async function contarPosseAberta(
  client: ClientePosse,
  userId: string,
): Promise<PosseAbertaDoUsuario> {
  const [ativosEmPosse, postosOcupados] = await Promise.all([
    client.assignment.count({
      // `asset: { deletedAt: null }` EXPLÍCITO. `assignments` não tem
      // `deletedAt`, então a extension não escopa esta contagem — e ela não
      // alcança relação aninhada de jeito nenhum.
      //
      // Sem esta linha, um ativo mandado para a lixeira com a posse ainda
      // aberta contaria aqui e NÃO apareceria no `holdings` (que é escopado):
      // o 409 diria "responde por 1 ativo" ao lado de uma lista vazia, e o
      // operador não teria o que devolver. É a mesma escolha do `holdings` —
      // equipamento que saiu do inventário não se cobra de ninguém.
      where: { targetType: 'USER', targetUserId: userId, checkinAt: null, asset: { deletedAt: null } },
    }),
    client.locationOccupant.count({ where: { userId, endedAt: null } }),
  ]);

  return { ativosEmPosse, postosOcupados };
}

/** "2 ativos", "1 ativo" — plural à mão porque é uma frase, não um dado. */
function quantos(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/**
 * A frase do 409 do `DELETE`, montada a partir das duas contagens.
 *
 * Mora aqui, ao lado da contagem, porque o texto e os números têm que mudar
 * juntos: um 409 que diz "ainda responde por ativos" sem dizer QUANTOS e por
 * qual das duas camadas manda o operador procurar no lugar errado — e a camada
 * do posto é justamente a que ninguém lembra.
 *
 * Devolve `null` quando não há nada aberto: é o sinal de que o `DELETE` pode
 * seguir, sem o chamador reinterpretar os dois números.
 */
export function motivoParaNaoExcluir(posse: PosseAbertaDoUsuario): string | null {
  const partes: string[] = [];
  if (posse.ativosEmPosse > 0) partes.push(`responde por ${quantos(posse.ativosEmPosse, 'ativo', 'ativos')}`);
  if (posse.postosOcupados > 0) partes.push(`ocupa ${quantos(posse.postosOcupados, 'posto', 'postos')}`);

  if (partes.length === 0) return null;

  return `Este colaborador ainda ${partes.join(' e ')}. Faça o desligamento antes de excluir.`;
}
