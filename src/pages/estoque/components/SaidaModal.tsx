import { useState } from 'react';
import { MapPin, User, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { AbaDeEstoque } from '../helpers/estoque.helper';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';

// A SAÍDA — e ela é uma operação DIFERENTE em cada aba. É isso que separa os
// três tipos, e por isso o modal é um só com três corpos, não três modais com o
// mesmo cabeçalho copiado.
//
//   ACESSÓRIO   entrega UMA unidade a uma pessoa OU A UM POSTO, e ela volta.
//   CONSUMÍVEL  dá baixa de N unidades no nome de uma pessoa, e não volta.
//   COMPONENTE  instala N unidades DENTRO de um ativo, e elas voltam.
//
// ─────────────────────────────────────────────────────────────────────────────
// O ACESSÓRIO NÃO TEM CAMPO DE QUANTIDADE, e os outros dois têm.
//
// Uma linha de `accessory_checkouts` é UMA unidade: entregar três mouses à
// Laura são três entregas, três linhas e três devoluções independentes — porque
// eles se perdem e voltam separados. Já instalar 4 pentes na mesma máquina é um
// fato só, e dar baixa de 3 resmas também.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface SaidaModalProps {
  aba: AbaDeEstoque;
  item: ItemDeEstoque;
  onClose: () => void;
  onSubmit: (dados: Record<string, unknown>) => Promise<void>;
}

export default function SaidaModal({ aba, item, onClose, onSubmit }: SaidaModalProps) {
  const [alvo, setAlvo] = useState<'USER' | 'LOCATION'>('USER');
  const [userId, setUserId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [qty, setQty] = useState('1');
  const [expectedCheckinAt, setExpectedCheckinAt] = useState('');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const quantidade = Number(qty) || 0;

  const pronto = aba.kind === 'ACCESSORY'
    ? (alvo === 'USER' ? userId !== '' : locationId !== '')
    : aba.kind === 'CONSUMABLE'
      ? userId !== '' && quantidade >= 1
      : assetId !== '' && quantidade >= 1;

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    // O corpo de cada operação é montado aqui, com SÓ a chave do alvo escolhido
    // preenchida: mandar as duas responderia 422 (e o CHECK do banco recusaria
    // a linha de qualquer jeito).
    const corpo: Record<string, unknown> =
      aba.kind === 'ACCESSORY'
        ? {
            targetType: alvo,
            ...(alvo === 'USER' ? { targetUserId: userId } : { targetLocationId: locationId }),
            ...(expectedCheckinAt ? { expectedCheckinAt } : {}),
          }
        : aba.kind === 'CONSUMABLE'
          ? { userId, qty: quantidade }
          : { assetId, qty: quantidade };

    if (notes.trim()) corpo.notes = notes.trim();

    try {
      await onSubmit(corpo);
    } catch (falha) {
      // É aqui que aparece o 409 "sem unidade suficiente" e o 409 de
      // colaborador desligado.
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
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">{aba.acao}</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {item.name} · {item.disponivel} de {item.qty} disponíveis
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

          {aba.kind === 'ACCESSORY' && (
            <>
              {/* AS DUAS ABAS DE ALVO — e a segunda é a novidade sobre o
                  Snipe-IT: entregar 5 mouses à Mesa 1 é o caso real. */}
              <div className="flex border border-border-sutil w-fit">
                <BotaoDeAlvo ativo={alvo === 'USER'} onClick={() => setAlvo('USER')} icone={User} rotulo="Pessoa" />
                <BotaoDeAlvo ativo={alvo === 'LOCATION'} onClick={() => setAlvo('LOCATION')} icone={MapPin} rotulo="Posto" />
              </div>

              {alvo === 'USER' ? (
                <div className="space-y-1">
                  <label className={ROTULO}>Colaborador*</label>
                  <ReferenceSelect rota="users" valor={userId} obrigatorio onChange={setUserId} />
                  <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                    A unidade fica no nome dela e volta com ela. O desligamento devolve esta.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className={ROTULO}>Posto*</label>
                  <ReferenceSelect rota="locations" valor={locationId} obrigatorio onChange={setLocationId} />
                  <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                    A unidade fica no POSTO: quem responde por ela são os ocupantes dele — vários,
                    em turnos diferentes, respondendo pela MESMA unidade. Sai UMA do estoque,
                    qualquer que seja o número de pessoas na mesa. Posto sem ocupante é aceito e
                    aparece nos alertas.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className={ROTULO}>Devolução prevista</label>
                <input
                  type="date"
                  value={expectedCheckinAt}
                  onChange={(event) => setExpectedCheckinAt(event.target.value)}
                  className={CLASSE_CAMPO}
                />
              </div>
            </>
          )}

          {aba.kind === 'CONSUMABLE' && (
            <>
              <div className="space-y-1">
                <label className={ROTULO}>Colaborador*</label>
                <ReferenceSelect rota="users" valor={userId} obrigatorio onChange={setUserId} />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  O nome é copiado no ato: o consumo continua legível depois que a pessoa sair.
                </p>
              </div>
              <CampoDeQuantidade valor={qty} max={item.disponivel} onChange={setQty} />
              <div className="p-3 border border-status-warning/30 bg-status-warning/10 text-status-warning text-[10px] leading-relaxed">
                Consumível NÃO volta. Não existe devolução — nem tela, nem rota, nem coluna no
                banco. Se a quantidade estiver errada, o caminho é o ajuste de estoque.
              </div>
            </>
          )}

          {aba.kind === 'COMPONENT' && (
            <>
              <div className="space-y-1">
                <label className={ROTULO}>Ativo*</label>
                <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  A peça passa a fazer parte deste ativo e aparece na aba Componentes dele.
                </p>
              </div>
              <CampoDeQuantidade valor={qty} max={item.disponivel} onChange={setQty} />
            </>
          )}

          <div className="space-y-1">
            <label className={ROTULO}>Observações</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${CLASSE_CAMPO} h-16 resize-none`}
            />
          </div>

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
              disabled={salvando || !pronto}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Gravando...' : aba.acao}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BotaoDeAlvo({ ativo, onClick, icone: Icone, rotulo }: {
  ativo: boolean; onClick: () => void; icone: typeof User; rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
        ativo ? 'bg-text-primary text-bg-base' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
      }`}
    >
      <Icone size={13} /> {rotulo}
    </button>
  );
}

/**
 * O `max` é o disponível, e serve de guia — não de garantia: quem manda mais do
 * que há recebe 409 do servidor, que conta as linhas de saída DENTRO da
 * transação travada. O campo evita o erro; a trava é que o impede.
 */
function CampoDeQuantidade({ valor, max, onChange }: {
  valor: string; max: number; onChange: (valor: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={ROTULO}>Quantidade*</label>
      <input
        required
        type="number"
        min={1}
        max={max}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        className={CLASSE_CAMPO}
      />
    </div>
  );
}
