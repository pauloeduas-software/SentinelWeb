import { useState } from 'react';
import { LogOut, UserPlus } from 'lucide-react';
import ReferenceSelect from './ReferenceSelect';
import {
  estaAberta, montarOcupante, nomeDoOcupante, periodoDaOcupacao, turnoDoOcupante,
} from '../helpers/ocupantes.helper';
import type { OccupantInput } from '../../domain/occupancy/occupancy.queries';
import type { LocationOccupant, OccupantView } from '../../domain/shared/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/MODELO-POSSE.md, a que o Snipe-IT não
// tem.
//
// É o painel onde a Mesa 1 vira "Laura de manhã, Ana à tarde": os dois nomes
// que a coluna Responsável da listagem de ativos mostra, sem que nenhum ativo
// tenha sido tocado. Entrar num posto é passar a responder por tudo que foi
// entregue a ele; sair é deixar de responder.
//
// Mora em `pages/components/` porque DUAS telas fazem esta mesma operação: a
// aba Localizações (pelo ícone da linha) e o detalhe do posto em /postos. Ele
// não traz a moldura da janela — quem o usa decide se é modal ou seção —, e é
// isso que permite o detalhe do posto pôr, logo abaixo, a lista de ativos que
// o posto segura.
//
// Não fala HTTP: recebe a lista pronta e devolve callbacks (o `ReferenceSelect`
// é a exceção documentada, que busca as opções pela query do domínio).

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

const RECORTES: readonly { valor: OccupantView; rotulo: string }[] = [
  { valor: 'current', rotulo: 'Atuais' },
  { valor: 'all', rotulo: 'Histórico' },
];

interface OccupantsPanelProps {
  ocupantes: readonly LocationOccupant[];
  carregando: boolean;
  view: OccupantView;
  onViewChange: (view: OccupantView) => void;
  onAdicionar: (data: OccupantInput) => Promise<void>;
  onEncerrar: (ocupante: LocationOccupant) => Promise<void>;
  /** Some no detalhe do posto, que tem o seu próprio rodapé. */
  onFechar?: () => void;
}

export default function OccupantsPanel({
  ocupantes, carregando, view, onViewChange, onAdicionar, onEncerrar, onFechar,
}: OccupantsPanelProps) {
  const [userId, setUserId] = useState('');
  const [shift, setShift] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const adicionar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onAdicionar(montarOcupante({ userId, shift, startedAt, notes }));
      // Limpar só depois do sucesso: com erro, o que foi digitado continua na
      // tela para ser corrigido em vez de redigitado.
      setUserId('');
      setShift('');
      setStartedAt('');
      setNotes('');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const encerrar = async (ocupante: LocationOccupant) => {
    setErro('');
    try {
      await onEncerrar(ocupante);
    } catch (falha) {
      setErro((falha as Error).message);
    }
  };

  return (
    <div className="font-mono text-xs space-y-5">
      {erro && (
        <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
      )}

      <p className="text-text-tertiary text-[10px] leading-relaxed">
        Quem ocupa este posto responde por todos os ativos entregues a ele. Vários ocupantes, em
        turnos diferentes, são o caso normal — e é isso que a coluna Responsável da listagem de
        ativos mostra. Sair do posto não apaga nada: a ocupação é encerrada e fica no histórico.
      </p>

      <div className="flex flex-wrap border border-border-sutil w-fit">
        {RECORTES.map((recorte) => (
          <button
            key={recorte.valor}
            type="button"
            onClick={() => onViewChange(recorte.valor)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              recorte.valor === view
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {recorte.rotulo}
          </button>
        ))}
      </div>

      <div className="border border-border-sutil overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3 font-normal">Pessoa</th>
              <th className="px-4 py-3 font-normal">Turno</th>
              <th className="px-4 py-3 font-normal">Período</th>
              <th className="px-4 py-3 font-normal text-right">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border-sutil/50">
            {ocupantes.map((ocupante) => (
              <tr key={ocupante.id} className="hover:bg-bg-base transition-colors group">
                <td className="px-4 py-3 text-text-primary">
                  <div>{nomeDoOcupante(ocupante)}</div>
                  {ocupante.user?.email && (
                    <div className="text-[10px] text-text-tertiary mt-1">{ocupante.user.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{turnoDoOcupante(ocupante)}</td>
                <td className="px-4 py-3 text-text-tertiary tabular-nums">{periodoDaOcupacao(ocupante)}</td>
                <td className="px-4 py-3 text-right">
                  {/* Ocupação já encerrada não tem o que encerrar: a linha
                      fica, sem botão, porque histórico é para ser lido. */}
                  {estaAberta(ocupante) && (
                    <button
                      type="button"
                      onClick={() => void encerrar(ocupante)}
                      title="Encerrar ocupação"
                      className="text-text-tertiary hover:text-status-danger transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <LogOut size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {ocupantes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-tertiary">
                  {carregando
                    ? 'Carregando...'
                    : view === 'all'
                      ? 'Este posto nunca teve ocupante.'
                      : 'Posto vago: ninguém responde pelos ativos entregues aqui.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={adicionar} className="border-t border-border-sutil pt-5 space-y-4">
        <div className={ROTULO}>Colocar alguém no posto</div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={ROTULO}>Pessoa*</label>
            {/* `users` é o slug real de `/options` (GET /api/users/options). */}
            <ReferenceSelect rota="users" valor={userId} obrigatorio onChange={setUserId} />
          </div>
          <div className="space-y-1">
            <label className={ROTULO}>Turno</label>
            <input
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              placeholder="Ex: Manhã, Tarde, 12x36 A"
              className={CLASSE_CAMPO}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Texto livre: é rótulo de escala, não horário. Aparece ao lado do nome na
              listagem de ativos.
            </p>
          </div>
          <div className="space-y-1">
            <label className={ROTULO}>Desde</label>
            <input
              type="date"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              className={CLASSE_CAMPO}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Em branco, vale a partir de agora.
            </p>
          </div>
          <div className="space-y-1">
            <label className={ROTULO}>Notas</label>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={CLASSE_CAMPO}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          {onFechar && (
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Fechar
            </button>
          )}
          <button
            type="submit"
            disabled={salvando || !userId}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
          >
            <UserPlus size={14} /> {salvando ? 'Adicionando...' : 'Adicionar ao posto'}
          </button>
        </div>
      </form>
    </div>
  );
}
