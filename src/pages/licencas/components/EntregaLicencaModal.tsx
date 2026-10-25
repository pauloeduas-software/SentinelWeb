import { useState } from 'react';
import { Laptop, User, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { AlvoDaEntrega, Licenca } from '../../../domain/shared/license.types';
import { hojeNoCampoDeData } from '../../helpers/format.helper';

// A ENTREGA DE UMA LICENÇA.
//
// ═════════════════════════════════════════════════════════════════════════════
// SÃO DOIS ALVOS, E NÃO TRÊS — posto de trabalho NÃO recebe licença (D39).
//
// A ausência é a decisão, e a frase do rodapé existe para quem for procurar o
// botão que falta: o desktop fixo da Mesa 1 é um ATIVO, e a licença vai para
// ele. Licença por assinatura de pessoa (Microsoft 365, Adobe) vai para o
// colaborador.
// ═════════════════════════════════════════════════════════════════════════════

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface EntregaLicencaModalProps {
  licenca: Licenca;
  onClose: () => void;
  onSubmit: (alvo: AlvoDaEntrega) => Promise<void>;
}

export default function EntregaLicencaModal({ licenca, onClose, onSubmit }: EntregaLicencaModalProps) {
  const [alvo, setAlvo] = useState<'PERSON' | 'ASSET'>('PERSON');
  const [personId, setPersonId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [notes, setNotes] = useState('');
  const [productKey, setProductKey] = useState('');
  // Vem com hoje; pode voltar para registrar a entrega que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [checkoutAt, setCheckoutAt] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const pronto = (alvo === 'PERSON' ? personId !== '' : assetId !== '') && checkoutAt !== '';

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    // SÓ a chave do alvo escolhido vai no corpo. Mandar as duas responde 422
    // pelo use-case, e o banco tem o CHECK por baixo — mas montar o corpo certo
    // aqui é o que faz o erro nunca acontecer por descuido da tela.
    const comum = { notes: notes.trim() || null, checkoutAt, productKey: productKey.trim() || null };
    const corpo: AlvoDaEntrega = alvo === 'PERSON'
      ? { assignedPersonId: personId, ...comum }
      : { assignedAssetId: assetId, ...comum };

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparecem o 409 de sem licença livre (com os números), o do
      // alvo que já está com ela, o da chave que já está em outra entrega, o do
      // colaborador desativado e o do ativo baixado.
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
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Entregar licença</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {licenca.name} · {licenca.livres} de {licenca.seatsTotal} livre(s)
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" title="Fechar" className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="flex border border-border-sutil w-fit">
            {([['PERSON', 'Colaborador', User], ['ASSET', 'Ativo', Laptop]] as const).map(([valor, rotulo, Icone]) => (
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

          {alvo === 'PERSON' ? (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Colaborador *</span>
              <ReferenceSelect rota="people" valor={personId} obrigatorio comDetalhe onChange={setPersonId} />
            </label>
          ) : (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Ativo *</span>
              <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
            </label>
          )}

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Data da entrega *</span>
            <input
              type="date" required max={hoje} value={checkoutAt}
              onChange={(e) => setCheckoutAt(e.target.value)} className={CLASSE_CAMPO}
            />
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Chave</span>
            <input
              value={productKey} onChange={(e) => setProductKey(e.target.value)}
              spellCheck={false} autoComplete="off" className={`${CLASSE_CAMPO} font-mono`}
            />
            <span className="block text-[10px] text-text-tertiary">
              A chave desta entrega. Deixe vazia quando a licença usa chave de volume.
            </span>
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Observações</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
          </label>

          <p className="text-[10px] text-text-tertiary leading-relaxed border-t border-border-sutil pt-3">
            Licença por computador (Windows, Office avulso) vai para o{' '}
            <span className="text-text-secondary">ativo</span>; por assinatura de pessoa (Microsoft
            365, Adobe), para o <span className="text-text-secondary">colaborador</span>. Posto de
            trabalho não recebe licença: o computador da mesa recebe.
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
