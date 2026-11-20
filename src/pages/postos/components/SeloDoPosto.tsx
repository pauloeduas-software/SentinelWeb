import { PontoDeStatus } from '../../../components/ui/badge';
import type { Posto } from '../../../types/workstation.types';

// O STATUS DO POSTO, o mesmo na linha da lista e no card da ficha.

export default function SeloDoPosto({ posto }: { posto: Pick<Posto, 'vago' | 'totalOcupantes'> }) {
  if (posto.vago) return <PontoDeStatus tom="aviso">Posto vago</PontoDeStatus>;
  if (posto.totalOcupantes > 0) return <PontoDeStatus tom="sucesso">Ocupado</PontoDeStatus>;
  // Sem gente E sem equipamento: não é sinal de nada, é um posto que acabou de
  // ser criado. Marcá-lo de amarelo junto com os vagos apagaria a diferença que
  // importa.
  return <PontoDeStatus tom="neutro">Sem uso</PontoDeStatus>;
}
