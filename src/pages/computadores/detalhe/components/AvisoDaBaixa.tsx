import { PackageX } from 'lucide-react';
import { Aviso } from '../../../../components/ui/aviso';
import type { Asset } from '../../../../types/asset.types';
import { seloDaSaida } from '../../helpers/baixa.helper';

// O AVISO DA BAIXA: situação que continua valendo, entre o card e as abas, à vista em
// todas elas (BR). Some quando a baixa é revertida.

export default function AvisoDaBaixa({ asset }: { asset: Asset }) {
  const selo = seloDaSaida(asset);
  if (!selo) return null;

  return (
    <Aviso tom="aviso">
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <PackageX className="size-4" /> Fora do patrimônio
        </div>
        <div className="text-text-primary">{selo}</div>
        {asset.retiredNotes && <div className="text-text-secondary">{asset.retiredNotes}</div>}
        {!asset.deletedAt && (
          <p className="text-xs text-text-tertiary">
            Continua no histórico e na vista Baixados. Não é o mesmo que estar na lixeira, que é cadastro errado.
          </p>
        )}
      </div>
    </Aviso>
  );
}
