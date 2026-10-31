import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { montarPosto } from '../helpers/postos.helper';
import type { PostoInput } from '../../../queries/workstation.queries';
import type { Posto } from '../../../types/workstation.types';

// Criar ou editar a Mesa 1 SEM sair da tela de postos.
//
// Três campos: nome, a LOCALIZAÇÃO onde a mesa fica e uma nota. Endereço, CEP e
// telefone são da localização, não da mesa — quem precisa deles edita a
// localização em Configurações, onde eles fazem sentido.
//
// Grava em `/workstations`, o cadastro do posto (decisão Y).

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface PostoFormModalProps {
  /** O posto em edição; `null` cria um novo. */
  posto: Posto | null;
  onClose: () => void;
  onSubmit: (data: PostoInput) => Promise<void>;
}

export default function PostoFormModal({ posto, onClose, onSubmit }: PostoFormModalProps) {
  const [name, setName] = useState(posto?.name ?? '');
  const [locationId, setLocationId] = useState(posto?.locationId ?? '');
  const [notes, setNotes] = useState(posto?.notes ?? '');
  // A versão DESTA abertura (AF): o registro pode chegar mais novo enquanto o
  // formulário está aberto, e o que ele mostra continua sendo o desta leitura.
  const [versao] = useState(posto?.updatedAt);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit({ ...montarPosto({ name, locationId, notes }, posto !== null), ...(versao ? { updatedAt: versao } : {}) });
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor em Error.message — é
      // aqui que aparece o 409 de nome repetido e o 404 da localização.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {posto ? 'Editar posto' : 'Novo posto'}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4 overflow-y-auto max-h-[75vh]">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="space-y-1">
            <label className={ROTULO}>Nome*</label>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="MesaEscritório, MesaRecepção..."
              className={CLASSE_CAMPO}
            />
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Localização*</label>
            <ReferenceSelect
              rota="locations"
              valor={locationId}
              obrigatorio
              atual={posto?.location}
              onChange={setLocationId}
            />
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Notas</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${CLASSE_CAMPO} h-20 resize-none`}
            />
          </div>

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            Quem ocupa o posto se define na ficha dele, com o turno de cada um. A localização é
            onde a mesa fica — a Matriz, a Filial —, e se cadastra em Configurações › Localizações.
          </p>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !name.trim() || !locationId}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : posto ? 'Salvar' : 'Criar posto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
