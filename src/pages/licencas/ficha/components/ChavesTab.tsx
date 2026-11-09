import ChaveEscondida from '../../components/ChaveEscondida';
import { lugarDaChave } from '../../helpers/licenca.helper';
import BarraDaFicha from '../../../../components/BarraDaFicha';
import { usePaginaLocal } from '../../../../hooks/usePaginaLocal';
import type { ChaveDaLicenca } from '../../../../types/license.types';

// AS CHAVES DO PRODUTO, numeradas e com quanto cada uma cobre, todas escondidas até
// "Mostrar" (AC). É a mesma ordem e o mesmo número da aba Responsáveis e da entrega.
// De 15 em 15, como toda aba de ficha: a licença de chave por computador tem dezenas.

export default function ChavesTab({ chaves }: { chaves: ChaveDaLicenca[] }) {
  // O número vem da lista inteira, antes da página: a chave 16 é a 16 também na página 2.
  const pagina = usePaginaLocal(chaves.map((chave, indice) => ({ chave, numero: indice + 1 })));

  return (
    <>
      <BarraDaFicha page={pagina.page} total={pagina.total} onPageChange={pagina.setPage} />
      <ol className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
        {pagina.visiveis.map(({ chave, numero }) => (
          <li key={chave.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="text-text-tertiary">{numero}.</span>
            <ChaveEscondida chave={chave.productKey} />
            <span className="text-xs text-text-tertiary">{lugarDaChave(chave)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
