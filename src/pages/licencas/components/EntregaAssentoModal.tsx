import { useState } from 'react';
import { Laptop, User, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { AlvoDoAssento, Licenca } from '../../../domain/shared/license.types';

// A ENTREGA DE UM ASSENTO.
//
// ═════════════════════════════════════════════════════════════════════════════
// SÃO DOIS ALVOS, E NÃO TRÊS — posto de trabalho NÃO é alvo de licença (D39).
//
// A ausência é a decisão, e a frase do rodapé existe para quem for procurar o
// botão que falta: o desktop fixo da Mesa 1 é um ATIVO, e o assento vai para
// ele. E se a licença for por usuário nomeado, Laura e Ana precisam de DOIS
// assentos — um pendurado na mesa esconderia duas pessoas atrás de um móvel,
// que é exatamente a exposição de conformidade que o módulo deveria apontar.
// ═════════════════════════════════════════════════════════════════════════════
//
// NÃO HÁ CAMPO DE ASSENTO, e a ausência também é regra: quem escolhe é o
// SERVIDOR, com `FOR UPDATE … SKIP LOCKED`. Deixar a tela escolher reabriria a
// corrida — duas telas mostrando "assento 3 livre" mandariam as duas o mesmo
// número.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface EntregaAssentoModalProps {
  licenca: Licenca;
  onClose: () => void;
  onSubmit: (alvo: AlvoDoAssento) => Promise<void>;
}

export default function EntregaAssentoModal({ licenca, onClose, onSubmit }: EntregaAssentoModalProps) {
  const [alvo, setAlvo] = useState<'USER' | 'ASSET'>('USER');
  const [userId, setUserId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const pronto = alvo === 'USER' ? userId !== '' : assetId !== '';

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    // SÓ a chave do alvo escolhido vai no corpo. Mandar as duas responde 422
    // pelo use-case, e o banco tem o CHECK por baixo — mas montar o corpo certo
    // aqui é o que faz o erro nunca acontecer por descuido da tela.
    const corpo: AlvoDoAssento = alvo === 'USER'
      ? { assignedUserId: userId, notes: notes.trim() || null }
      : { assignedAssetId: assetId, notes: notes.trim() || null };

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparecem o 409 de sem assento livre (com os números), o 409
      // do colaborador desligado e o 409 do ativo descomissionado.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Entregar assento</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {licenca.name} · {licenca.livres} de {licenca.seatsTotal} livre(s)
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="flex border border-border-sutil w-fit">
            {([['USER', 'Colaborador', User], ['ASSET', 'Ativo', Laptop]] as const).map(([valor, rotulo, Icone]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setAlvo(valor)}
                className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
                  alvo === valor
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
                }`}
              >
                <Icone size={12} /> {rotulo}
              </button>
            ))}
          </div>

          {alvo === 'USER' ? (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Colaborador *</span>
              <ReferenceSelect rota="users" valor={userId} obrigatorio onChange={setUserId} />
            </label>
          ) : (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Ativo *</span>
              <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
            </label>
          )}

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Observações</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
          </label>

          <p className="text-[10px] text-text-tertiary leading-relaxed border-t border-border-sutil pt-3">
            O assento é escolhido pelo servidor — o primeiro livre. Posto de trabalho não é alvo
            de licença: o computador da mesa é um <span className="text-text-secondary">ativo</span>, e
            é a ele que o assento vai. Se a licença é por usuário nomeado, duas pessoas na mesma
            máquina precisam de dois assentos.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando || !pronto} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest transition-colors disabled:opacity-50">
              {salvando ? 'Entregando…' : 'Entregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
