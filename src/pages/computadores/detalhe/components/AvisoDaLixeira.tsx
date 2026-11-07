import { Trash2 } from 'lucide-react';
import { Aviso } from '../../../../components/ui/aviso';
import { formatarDataHora } from '../../../../helpers/format.helper';

// O AVISO DA LIXEIRA: a ficha abre para consultar o que aconteceu, sem restaurar, e nada
// muda por aqui (BW). Entre o card e as abas, como o da baixa. Some ao restaurar.

export default function AvisoDaLixeira({ excluidoEm }: { excluidoEm: string }) {
  return (
    <Aviso tom="aviso">
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <Trash2 className="size-4" /> Na lixeira
        </div>
        <div className="text-text-primary">Excluído em {formatarDataHora(excluidoEm)}</div>
        <p className="text-xs text-text-tertiary">Só para consulta. Restaure para editar, entregar ou dar baixa.</p>
      </div>
    </Aviso>
  );
}
