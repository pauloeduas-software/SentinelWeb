// A CONTA DA LICENÇA — e as frases que dependem dela, ao lado.
//
// ═════════════════════════════════════════════════════════════════════════════
// livres = compradas − em uso
//
// Sem vaga numerada (AA): a licença guarda quantas foram compradas, e cada uso é
// uma linha de entrega. EM USO é entrega aberta; devolvida, a licença volta a
// ficar livre.
//
// A invariante 22 amarra os lados: em uso nunca passa de `seatsTotal`. Quem a
// mantém são a entrega e a edição, as duas sob a trava da licença.
// ═════════════════════════════════════════════════════════════════════════════

export interface ContagemDaLicenca {
  /** Entregas abertas agora. */
  emUso: number;
  /** O que ainda pode ser entregue. */
  livres: number;
  /** Já teve entrega, aberta ou devolvida: não se exclui mais, se encerra. A tela desabilita o Excluir. */
  jaEntregue: boolean;
}

export interface UsoDaLicenca {
  emUso: number;
  jaEntregue: boolean;
}

export const SEM_USO: UsoDaLicenca = { emUso: 0, jaEntregue: false };

/**
 * A conta, num lugar só. Sem travar no zero, como o `disponivel` do estoque:
 * um número negativo aqui é contrato rebaixado por fora da aplicação, e
 * escondê-lo atrás de um zero apagaria o sintoma.
 */
export function contarLivres(seatsTotal: number, uso: UsoDaLicenca): ContagemDaLicenca {
  return { ...uso, livres: seatsTotal - uso.emUso };
}

function quantas(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/** Por que não há licença livre — e o que fazer. */
export function fraseSemVaga(nome: string, seatsTotal: number, uso: UsoDaLicenca): string {
  return `Sem licença livre em "${nome}": ${quantas(seatsTotal, 'comprada', 'compradas')}, `
    + `${uso.emUso} em uso. Devolva uma entrega ou aumente a quantidade comprada.`;
}

/** Por que a quantidade não desce até `novoTotal`: o piso é o que está em uso. */
export function fraseDoPiso(nome: string, novoTotal: number, uso: UsoDaLicenca): string {
  return `Não dá para reduzir "${nome}" para ${novoTotal}: ${quantas(uso.emUso, 'está', 'estão')} em uso. `
    + 'Devolva para liberar.';
}
