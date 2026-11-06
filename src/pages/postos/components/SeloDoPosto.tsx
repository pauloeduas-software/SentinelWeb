import { PontoDeStatus } from '../../../components/ui/badge';
import type { Posto } from '../../../types/workstation.types';

// A SITUAÇÃO DO POSTO, a mesma na linha da lista e no card da ficha.

export default function SeloDoPosto({ posto }: { posto: Pick<Posto, 'vago' | 'totalOcupantes'> }) {
  if (posto.vago) return <PontoDeStatus tom="aviso">Posto vago</PontoDeStatus>;
  if (posto.totalOcupantes > 0) return <PontoDeStatus tom="sucesso">Ocupado</PontoDeStatus>;
  // Sem gente E sem equipamento: não é sinal de nada, é uma mesa que acabou de
  // ser criada. Marcá-la de amarelo junto com as vagas apagaria a diferença que
  // importa.
  return <PontoDeStatus tom="neutro">Sem uso</PontoDeStatus>;
}
