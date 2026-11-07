import { useUnretireAsset } from '../../../queries/asset.queries';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useNotificacao } from '../../../hooks/useNotificacao';
import type { Asset } from '../../../types/asset.types';

// Reverter apaga a data, o motivo e a observação da saída num clique só, e o item fica
// no `⋯`, onde se clica por engano — por isso a confirmação, como na lixeira. O que se
// perde é o registro no ativo; a auditoria, no banco, guarda a baixa e a reversão (AB).
// A lista e a ficha fazem igual, com as mesmas frases (BV).

export function useReverterBaixa() {
  const notificar = useNotificacao();
  const reverter = useUnretireAsset();

  return async (asset: Pick<Asset, 'id' | 'assetTag'>) => {
    if (!(await confirmar({
      titulo: `Reverter a baixa de "${asset.assetTag}"?`,
      descricao: 'A data, o motivo e as notas da saída são apagados.',
      acao: 'Reverter',
      perigo: true,
    }))) return;
    try {
      await reverter.mutateAsync(asset.id);
      notificar.sucesso('Baixa revertida.');
    } catch (falha) {
      notificar.erro((falha as Error).message);
    }
  };
}
