import { useState } from 'react';
import { Link2 } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { Endpoint } from '../../../domain/shared/endpoint.types';

// VINCULAR UMA MÁQUINA A UM ATIVO, À MÃO — e, se quiser, entregar o ativo ao
// posto na mesma ida.
//
// Inline, na linha da máquina, e não um modal: a pessoa está olhando o
// hostname, o serial e o sistema da máquina que vai vincular, e um modal
// cobriria exatamente isso. Dois campos: o ativo (obrigatório) e o posto
// (opcional). Com posto, a operação é a de vincular-e-entregar, que o servidor
// encadeia; sem, é só o vínculo.
//
// O seletor de ativos pede `?maquina=sem`: ativo que já tem máquina é opção
// que o `endpoints.assetId @unique` recusaria no clique, então a lista nem
// oferece. O de posto é o `/workstations/options`, como na entrega da tela de
// Ativos: só posto recebe entrega.
//
// Não fala HTTP: recebe `onVincular` e mostra o que ele rejeitar. O erro mora
// AQUI porque é aqui que a pessoa decide — "este posto já tem um ativo"
// precisa aparecer ao lado do campo onde ela escolheu o posto.

const ROTULO = 'text-[10px] uppercase tracking-widest text-text-tertiary';

interface Props {
  maquina: Endpoint;
  ocupado: boolean;
  onVincular: (endpointId: string, assetId: string, targetWorkstationId: string | null) => Promise<void>;
  onCancelar: () => void;
}

export default function VincularMaquinaForm({ maquina, ocupado, onVincular, onCancelar }: Props) {
  const [assetId, setAssetId] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await onVincular(maquina.id, assetId, workstationId || null);
      // Sem `onCancelar` no sucesso: a linha some da lista "Sem vínculo" na
      // revalidação, e o formulário desmonta com ela.
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="p-4 bg-bg-base border-t border-border-sutil space-y-4 font-mono text-xs">
      <p className="text-text-secondary">
        <Link2 size={12} className="inline mr-2" />
        {maquina.hostname} passa a ser o patrimônio escolhido abaixo. Nada muda na máquina.
      </p>

      {erro && (
        <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20" role="alert">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={ROTULO}>Ativo*</label>
          <ReferenceSelect
            rota="assets"
            parametros={{ maquina: 'sem' }}
            valor={assetId}
            obrigatorio
            onChange={setAssetId}
          />
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            Só ativos ainda sem máquina. Cadastre o ativo em Ativos se ele não existe.
          </p>
        </div>
        <div className="space-y-1">
          <label className={ROTULO}>E entregar ao posto</label>
          <ReferenceSelect rota="workstations" valor={workstationId} onChange={setWorkstationId} />
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            Opcional. Com posto, o ativo é entregue à mesa na mesma operação — e um posto que já
            tem ativo recusa.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-1.5 border border-border-sutil text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary hover:bg-bg-base transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando || ocupado || !assetId}
          className="px-3 py-1.5 bg-text-primary text-bg-base text-[10px] uppercase tracking-widest hover:bg-text-secondary transition-colors disabled:opacity-40"
        >
          {salvando ? 'Vinculando…' : workstationId ? 'Vincular e entregar' : 'Vincular'}
        </button>
      </div>
    </form>
  );
}
