import ChaveEscondida from '../../components/ChaveEscondida';
import { lugarDaChave } from '../../helpers/licenca.helper';
import type { ChaveDaLicenca } from '../../../../types/license.types';

// AS CHAVES DO PRODUTO, numeradas e com quanto cada uma cobre, todas escondidas até
// "Mostrar" (AC). É a mesma ordem e o mesmo número de "Com quem está" e da entrega.

export default function ChavesTab({ chaves }: { chaves: ChaveDaLicenca[] }) {
  return (
    <ol className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
      {chaves.map((chave, indice) => (
        <li key={chave.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="text-text-tertiary">{indice + 1}.</span>
          <ChaveEscondida chave={chave.productKey} />
          <span className="text-xs text-text-tertiary">{lugarDaChave(chave)}</span>
        </li>
      ))}
    </ol>
  );
}
