import { useState } from 'react';
import { Check, LogOut, Pencil, UserPlus, X } from 'lucide-react';
import ReferenceSelect from '../../../components/ReferenceSelect';
import { diaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import {
  estaAberta, montarOcupante, nomeDoOcupante, periodoDaOcupacao, turnoDoOcupante,
} from '../helpers/ocupantes.helper';
import type { OccupantInput } from '../../../queries/occupancy.queries';
import type { WorkstationOccupant, OccupantView } from '../../../types/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/referencia/modelo-de-posse.md, a que o Snipe-IT não
// tem.
//
// É o painel onde a Mesa 1 vira "Laura de manhã, Ana à tarde": os dois nomes
// que a coluna Responsável da listagem de ativos mostra, sem que nenhum ativo
// tenha sido tocado. Entrar num posto é passar a responder por tudo que foi
// entregue a ele; sair é deixar de responder.
//
// Não traz a moldura da janela: é uma seção do detalhe do posto, e é isso que
// permite pôr, logo abaixo, a lista de ativos que o posto segura.
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
  ocupantes: readonly WorkstationOccupant[];
  carregando: boolean;
  /** A consulta da lista falhou. Vence o vazio: não é "posto vago", é não saber. */
  erro?: string | null;
  view: OccupantView;
  onViewChange: (view: OccupantView) => void;
  onAdicionar: (data: OccupantInput) => Promise<void>;
  /** Encerra com o dia em que a pessoa saiu, 'AAAA-MM-DD'. */
  onEncerrar: (ocupante: WorkstationOccupant, dia: string) => Promise<void>;
  /**
   * Corrige o TURNO de uma ocupação aberta, na própria linha. É texto livre
   * ("Manhã", "08h–14h"), então corrigir serve tanto ao nome quanto ao horário
   * escrito. Encerrar e reabrir faria o histórico dizer que a pessoa saiu e
   * voltou, e perderia a data de entrada.
   */
  onCorrigirTurno: (ocupante: WorkstationOccupant, turno: string) => Promise<void>;
  /** Some no detalhe do posto, que tem o seu próprio rodapé. */
  onFechar?: () => void;
}

export default function OccupantsPanel({
  ocupantes, carregando, erro: erroAoCarregar = null, view, onViewChange, onAdicionar, onEncerrar,
  onCorrigirTurno, onFechar,
}: OccupantsPanelProps) {
  const [personId, setPersonId] = useState('');
  const [shift, setShift] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  // O encerramento aberto numa linha: qual ocupação e o dia escolhido.
  const [encerrando, setEncerrando] = useState<{ id: string; dia: string } | null>(null);

  const adicionar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onAdicionar(montarOcupante({ personId, shift, startedAt, notes }));
      // Limpar só depois do sucesso: com erro, o que foi digitado continua na
      // tela para ser corrigido em vez de redigitado.
      setPersonId('');
      setShift('');
      setStartedAt('');
      setNotes('');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  // A linha em edição de turno — uma por vez — e o texto que está no campo.
  const [editandoTurno, setEditandoTurno] = useState<string | null>(null);
  const [turnoEditado, setTurnoEditado] = useState('');
  // Uma correção por vez: Enter repetido ou clique duplo no ✓ não manda dois PATCH.
  const [salvandoTurno, setSalvandoTurno] = useState(false);

  const abrirEdicaoDoTurno = (ocupante: WorkstationOccupant) => {
    setErro('');
    setEditandoTurno(ocupante.id);
    setTurnoEditado(ocupante.shift ?? '');
  };

  const cancelarTurno = () => {
    setEditandoTurno(null);
    setErro('');
  };

  const salvarTurno = async (ocupante: WorkstationOccupant) => {
    if (salvandoTurno) return;
    // Nada mudou: fecha o campo sem ir ao servidor.
    if (turnoEditado.trim() === (ocupante.shift ?? '')) {
      cancelarTurno();
      return;
    }
    setErro('');
    setSalvandoTurno(true);
    try {
      await onCorrigirTurno(ocupante, turnoEditado);
      setEditandoTurno(null);
    } catch (falha) {
      // O campo continua aberto com o que foi digitado, para corrigir.
      setErro((falha as Error).message);
    } finally {
      setSalvandoTurno(false);
    }
  };

  const encerrar = async (ocupante: WorkstationOccupant, dia: string) => {
    setErro('');
    try {
      await onEncerrar(ocupante, dia);
      setEncerrando(null);
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
                  {ocupante.person?.email && (
                    <div className="text-[10px] text-text-tertiary mt-1">{ocupante.person.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {editandoTurno === ocupante.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        aria-label={`Turno de ${nomeDoOcupante(ocupante)}`}
                        value={turnoEditado}
                        maxLength={60}
                        onChange={(event) => setTurnoEditado(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void salvarTurno(ocupante);
                          if (event.key === 'Escape') cancelarTurno();
                        }}
                        className="w-40 p-1 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary"
                      />
                      <button
                        type="button"
                        onClick={() => void salvarTurno(ocupante)}
                        disabled={salvandoTurno}
                        title="Salvar turno"
                        aria-label="Salvar turno"
                        className="text-text-tertiary hover:text-status-success transition-colors"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelarTurno}
                        title="Cancelar"
                        aria-label="Cancelar a edição do turno"
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    turnoDoOcupante(ocupante)
                  )}
                </td>
                <td className="px-4 py-3 text-text-tertiary tabular-nums">{periodoDaOcupacao(ocupante)}</td>
                <td className="px-4 py-3 text-right">
                  {/* Ocupação já encerrada não tem o que encerrar: a linha
                      fica, sem botão, porque histórico é para ser lido.
                      Visível ao passar o mouse, ao navegar por Tab e sempre no
                      toque — o desenho do `CatalogTable`. Com `opacity-0` puro,
                      no celular encerrar uma ocupação era impossível. */}
                  {encerrando?.id === ocupante.id ? (
                    <div className="inline-flex items-center gap-2">
                      <label className="flex items-center gap-2 text-[10px] text-text-tertiary uppercase tracking-widest">
                        Saiu em
                        <input
                          type="date"
                          value={encerrando.dia}
                          min={diaDoInstante(ocupante.startedAt)}
                          max={hojeNoCampoDeData()}
                          onChange={(event) => setEncerrando({ id: ocupante.id, dia: event.target.value })}
                          className="p-1 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void encerrar(ocupante, encerrando.dia)}
                        disabled={encerrando.dia === ''}
                        title="Confirmar o encerramento"
                        aria-label={`Confirmar o encerramento da ocupação de ${nomeDoOcupante(ocupante)}`}
                        className="text-text-tertiary hover:text-status-success transition-colors disabled:opacity-40"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEncerrando(null)}
                        title="Cancelar"
                        aria-label="Cancelar o encerramento"
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : estaAberta(ocupante) && editandoTurno !== ocupante.id && (
                    <div className="inline-flex items-center gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => abrirEdicaoDoTurno(ocupante)}
                        title="Corrigir turno"
                        aria-label={`Corrigir o turno de ${nomeDoOcupante(ocupante)}`}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEncerrando({ id: ocupante.id, dia: hojeNoCampoDeData() })}
                        title="Encerrar ocupação"
                        aria-label={`Encerrar a ocupação de ${nomeDoOcupante(ocupante)}`}
                        className="text-text-tertiary hover:text-status-danger transition-colors"
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {ocupantes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-tertiary">
                  {carregando
                    ? 'Carregando...'
                    : erroAoCarregar
                      ? <span role="alert" className="text-status-danger">Não foi possível carregar os ocupantes: {erroAoCarregar}</span>
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
            {/* `people` é o slug real de `/options` (GET /api/people/options). */}
            <ReferenceSelect rota="people" valor={personId} obrigatorio onChange={setPersonId} />
          </div>
          <div className="space-y-1">
            <label className={ROTULO}>Turno</label>
            <input
              value={shift}
              onChange={(event) => setShift(event.target.value)}
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
              max={hojeNoCampoDeData()}
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
            disabled={salvando || !personId}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
          >
            <UserPlus size={14} /> {salvando ? 'Adicionando...' : 'Adicionar ao posto'}
          </button>
        </div>
      </form>
    </div>
  );
}
