import { useState } from 'react';
import { Armchair, User, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { useStockItemQuery } from '../../../domain/stock/stock.queries';
import type { AlvoDaEntregaDeEstoque, ItemDeEstoque } from '../../../domain/shared/stock.types';
import { hojeNoCampoDeData } from '../../helpers/format.helper';

// A ENTREGA: `qty` unidades para UM colaborador ou UM posto, num dia — a
// entrega da licença com quantidade (AE).
//
// O POSTO PODE SER ALVO, ao contrário da licença (D39 é de licença, não de
// estoque): entregar 5 mouses à Mesa 1 é o caso real do almoxarifado, e a
// unidade entregue ao posto vale UMA, qualquer que seja o número de ocupantes
// (D33). Quem responde por ela são os ocupantes abertos, resolvidos na leitura.
//
// CADA UNIDADE VIRA UMA LINHA, e por isso há um teto de 100 por entrega
// (`checkoutStockSchema`) — ninguém entrega mil mouses de uma vez pela tela.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface EntregaModalProps {
  item: ItemDeEstoque;
  onClose: () => void;
  onSubmit: (alvo: AlvoDaEntregaDeEstoque) => Promise<void>;
}

export default function EntregaModal({ item, onClose, onSubmit }: EntregaModalProps) {
  const [tipo, setTipo] = useState<'PERSON' | 'WORKSTATION'>('PERSON');
  const [personId, setPersonId] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  // Vem com hoje; pode voltar para registrar a entrega que já aconteceu.
  const hoje = hojeNoCampoDeData();
  const [checkoutAt, setCheckoutAt] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // A conta do cabeçalho vem do detalhe, e não da linha da lista: depois de um
  // 409 de "sem unidade", a consulta é buscada de novo e o número acompanha.
  const { data: detalhe } = useStockItemQuery(item.id);
  const atual = detalhe ?? item;

  const alvoId = tipo === 'PERSON' ? personId : workstationId;
  const pronto = alvoId !== '' && checkoutAt !== '';

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();

    // Em branco não vira 0 — a mesma regra da quantidade do cadastro.
    const quantidade = Number(qty);
    if (qty.trim() === '' || !Number.isInteger(quantidade) || quantidade < 1) {
      setErro('Informe a quantidade: um número inteiro, 1 ou mais.');
      return;
    }

    setSalvando(true);
    setErro('');

    // SÓ a chave do alvo escolhido vai no corpo. Mandar as duas responde 422
    // pelo use-case, e o banco tem o CHECK por baixo.
    const comum = { qty: quantidade, notes: notes.trim() || null, checkoutAt };
    const corpo: AlvoDaEntregaDeEstoque = tipo === 'PERSON'
      ? { targetType: 'PERSON', targetPersonId: personId, ...comum }
      : { targetType: 'WORKSTATION', targetWorkstationId: workstationId, ...comum };

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparecem o 409 de sem unidade disponível (com os números), o
      // do item desativado no meio, o do colaborador desativado e o do posto
      // desativado.
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
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Entregar</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {atual.name} · {atual.disponivel} de {atual.qty} {atual.disponivel === 1 ? 'disponível' : 'disponíveis'}
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
            {([['PERSON', 'Colaborador', User], ['WORKSTATION', 'Posto', Armchair]] as const).map(([valor, rotulo, Icone]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTipo(valor)}
                className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
                  tipo === valor
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
                }`}
              >
                <Icone size={12} /> {rotulo}
              </button>
            ))}
          </div>

          {tipo === 'PERSON' ? (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Colaborador *</span>
              <ReferenceSelect rota="people" valor={personId} obrigatorio comDetalhe onChange={setPersonId} />
            </label>
          ) : (
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Posto *</span>
              <ReferenceSelect rota="workstations" valor={workstationId} obrigatorio onChange={setWorkstationId} />
            </label>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1.5 block">
              <span className={ROTULO}>Quantidade *</span>
              <input
                required type="number" min={1} max={100} value={qty}
                onChange={(e) => setQty(e.target.value)} className={CLASSE_CAMPO}
              />
            </label>

            <label className="space-y-1.5 block">
              <span className={ROTULO}>Data da entrega *</span>
              <input
                type="date" required max={hoje} value={checkoutAt}
                onChange={(e) => setCheckoutAt(e.target.value)} className={CLASSE_CAMPO}
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Observações</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
          </label>

          <p className="text-[10px] text-text-tertiary leading-relaxed border-t border-border-sutil pt-3">
            Entregar a um posto vale pela mesa, não pela pessoa: qualquer ocupante aberto dela
            responde pelas unidades. A devolução é feita no detalhe do item, quantas voltarem.
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
