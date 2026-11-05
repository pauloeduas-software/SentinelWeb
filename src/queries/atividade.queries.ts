import { useIsFetching } from '@tanstack/react-query';

/**
 * Há consulta em andamento? É o que acende a faixa do cabeçalho, sem cada tela
 * precisar saber dela. A leitura periódica da máquina fica de fora: com ela a
 * faixa piscaria sozinha a cada poucos segundos, com ninguém esperando nada.
 */
export function useConsultasEmVoo(): boolean {
  return useIsFetching({
    predicate: (consulta) => !consulta.observers.some((observador) => observador.options.refetchInterval),
  }) > 0;
}
