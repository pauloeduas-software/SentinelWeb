import { useState } from 'react';
import { X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { montarNovoPosto } from '../helpers/postos.helper';
import type { NovoPostoInput } from '../../../domain/workstation/workstation.queries';

// Criar a Mesa 1 SEM sair da tela de postos.
//
// Três campos, e é decisão: nome, onde a mesa fica e uma nota. Endereço, CEP e
// telefone ficam de fora porque não querem dizer nada numa bancada — foi
// justamente por misturar mesa e filial num formulário só que o posto sumiu
// atrás da 6ª aba de Configurações. Quem precisa dos campos de filial edita a
// localização lá, onde eles fazem sentido.
//
// Grava em `/locations` com `isWorkstation: true` (ver a query do domínio): o
// posto É uma `Location`, e não há tabela nova (docs/MODELO-POSSE.md, D15).

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface PostoFormModalProps {
  onClose: () => void;
  onSubmit: (data: NovoPostoInput) => Promise<void>;
}

export default function PostoFormModal({ onClose, onSubmit }: PostoFormModalProps) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit(montarNovoPosto({ name, parentId, notes }));
    } catch (falha) {
      // O apiClient já traduziu a resposta do servidor em Error.message — é
      // aqui que aparece o 409 de nome repetido.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Novo posto</h2>
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
              placeholder="Ex: Mesa 1"
              className={CLASSE_CAMPO}
            />
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Dentro de</label>
            {/* A sala ou o andar que contém a mesa. `locations` devolve a
                hierarquia inteira de propósito: o pai de um posto é uma sala, e
                uma sala não é posto. */}
            <ReferenceSelect rota="locations" valor={parentId} onChange={setParentId} />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Onde a mesa fica: a sala, o andar, a filial. Em branco, o posto nasce na raiz.
            </p>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Notas</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex: bancada da esquerda, junto à janela"
              className={`${CLASSE_CAMPO} h-20 resize-none`}
            />
          </div>

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            Quem ocupa o posto se define depois de criado, com o turno de cada um. Endereço e
            telefone não aparecem aqui: são de filial, não de mesa — quem precisar deles usa
            Configurações › Localizações.
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
              disabled={salvando || !name.trim()}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Criando...' : 'Criar posto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
