import { useState } from 'react';
import { CheckCircle2, LogOut, TriangleAlert, X } from 'lucide-react';
import ReferenceSelect from '../../../components/ReferenceSelect';
import type { OffboardInput, ResultadoDesligamento } from '../../../../domain/user/user.queries';
import type { Asset, PostoDoAtivo } from '../../../../domain/shared/asset.types';
import type { LocationOccupant } from '../../../../domain/shared/posse.types';

// DESLIGAMENTO — o modal que diz EXATAMENTE o que vai acontecer, antes de
// acontecer (D32).
//
// Ele não pergunta "tem certeza?". Ele mostra a lista de ativos que serão
// devolvidos e a lista de postos que serão desocupados, com nome e turno,
// porque é uma operação que fecha N+M vínculos numa transação só e não tem
// desfazer: a devolução refeita à mão perderia a data, e a ocupação reaberta
// nasceria com `startedAt` de hoje, apagando desde quando a pessoa estava lá.
//
// O terceiro bloco — o que NÃO acontece — é tão importante quanto os outros
// dois: o ativo entregue a um POSTO continua com o posto, e a pessoa NÃO vai
// para a lixeira. Sem dizer isso, quem lê "vai devolver tudo" procura depois o
// monitor da Mesa 1 na lista de devoluções e não encontra.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

/** "Mesa 1 (Manhã)" — o turno entre parênteses, quando existe. */
function postoComTurno(nome: string, shift: string | null): string {
  return shift ? `${nome} (${shift})` : nome;
}

interface OffboardModalProps {
  nome: string;
  /** Os ativos no NOME da pessoa — os únicos que a operação devolve. */
  diretos: readonly Asset[];
  /** Os ativos que ela responde POR OCUPAR um posto — que ficam onde estão. */
  porPosto: readonly (Asset & { posto: PostoDoAtivo })[];
  /** As ocupações abertas — todas serão encerradas. */
  ocupacoes: readonly LocationOccupant[];
  onClose: () => void;
  onConfirmar: (data: OffboardInput) => Promise<void>;
  salvando: boolean;
  /** Preenchido DEPOIS de confirmar: o modal vira relatório. */
  resultado: ResultadoDesligamento | null;
}

export default function OffboardModal({
  nome, diretos, porPosto, ocupacoes, onClose, onConfirmar, salvando, resultado,
}: OffboardModalProps) {
  const [notes, setNotes] = useState('');
  const [statusId, setStatusId] = useState('');
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');

    const corpo: OffboardInput = {};
    if (notes.trim()) corpo.notes = notes.trim();
    if (statusId) corpo.statusId = statusId;

    try {
      await onConfirmar(corpo);
    } catch (falha) {
      // "Este colaborador já foi desligado." é o caso real: duas abas abertas,
      // ou alguém que desligou pela lista enquanto este modal estava no ar.
      setErro((falha as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <LogOut size={16} />
            {resultado ? 'Desligamento concluído' : `Desligar ${nome}`}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {resultado ? (
          <div className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
            <div className="flex items-start gap-2 text-status-success leading-relaxed">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>
                {resultado.devolvidos.length} {resultado.devolvidos.length === 1 ? 'ativo devolvido' : 'ativos devolvidos'} e{' '}
                {resultado.ocupacoesEncerradas.length}{' '}
                {resultado.ocupacoesEncerradas.length === 1 ? 'posto desocupado' : 'postos desocupados'}, na mesma operação.
              </span>
            </div>

            <Bloco titulo={`Devolvidos (${resultado.devolvidos.length})`}>
              {resultado.devolvidos.map((item) => (
                <li key={item.assignmentId} className="px-4 py-2 text-text-primary">{item.assetTag}</li>
              ))}
            </Bloco>

            <Bloco titulo={`Postos desocupados (${resultado.ocupacoesEncerradas.length})`}>
              {resultado.ocupacoesEncerradas.map((item) => (
                <li key={item.id} className="px-4 py-2 text-text-primary">
                  {postoComTurno(item.locationName, item.shift)}
                </li>
              ))}
            </Bloco>

            <p className="text-text-tertiary text-[10px] leading-relaxed">
              O cadastro continua existindo, marcado como desligado: todo o histórico de posse segue
              apontando para ele. A exclusão (lixeira) é outra coisa, e agora está liberada.
            </p>

            <div className="pt-4 flex justify-end border-t border-border-sutil">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
            {erro && (
              <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
            )}

            <p className="text-text-secondary leading-relaxed">
              Ao confirmar, numa operação só:
            </p>

            <Bloco titulo={`1. Devolver ${diretos.length} ${diretos.length === 1 ? 'ativo' : 'ativos'} em nome de ${nome}`}>
              {diretos.map((asset) => (
                <li key={asset.id} className="px-4 py-2 text-text-primary">
                  {asset.assetTag}
                  {asset.name && <span className="text-text-tertiary"> — {asset.name}</span>}
                </li>
              ))}
            </Bloco>

            <Bloco titulo={`2. Encerrar ${ocupacoes.length} ${ocupacoes.length === 1 ? 'ocupação de posto' : 'ocupações de posto'}`}>
              {ocupacoes.map((ocupacao) => (
                <li key={ocupacao.id} className="px-4 py-2 text-text-primary">
                  {postoComTurno(ocupacao.location?.name ?? 'Posto', ocupacao.shift)}
                </li>
              ))}
            </Bloco>

            <div className="border border-border-sutil p-4 space-y-2">
              <div className={ROTULO}>3. Marcar a saída</div>
              <p className="text-text-tertiary text-[10px] leading-relaxed">
                A pessoa deixa de operar e não pode mais receber equipamento. O cadastro NÃO é
                excluído: desligar e mandar para a lixeira são coisas diferentes, e o histórico de
                posse precisa continuar apontando para alguém.
              </p>
            </div>

            {porPosto.length > 0 && (
              <div className="flex items-start gap-2 text-status-warning text-[10px] leading-relaxed border border-status-warning/30 bg-status-warning/10 p-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span>
                  {porPosto.length} {porPosto.length === 1 ? 'ativo continua' : 'ativos continuam'} no posto e
                  NÃO {porPosto.length === 1 ? 'é devolvido' : 'são devolvidos'}: {' '}
                  {porPosto.map((asset) => asset.assetTag).join(', ')}. Eles são do posto, não da pessoa —
                  quem continua lá segue respondendo por eles.
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label className={ROTULO}>Status de volta dos ativos</label>
              <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Em branco, tudo volta ao estoque. Escolha quando o equipamento voltar para
                conferência ou conserto.
              </p>
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Observações</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex: desligamento em 23/09, equipamentos entregues na recepção."
                className={`${CLASSE_CAMPO} h-20 resize-none`}
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                Fica na devolução de cada ativo e na trilha de auditoria do desligamento.
              </p>
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
                disabled={salvando}
                className="px-4 py-2 bg-status-danger text-bg-base hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {salvando ? 'Desligando...' : 'Confirmar desligamento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Um passo da operação, com a lista do que ele alcança.
 *
 * A lista VAZIA continua aparecendo, com a frase "nada a fazer aqui": sumir com
 * o passo faria o modal parecer que a operação é outra dependendo da pessoa — e
 * é justamente o passo que ninguém espera (o do posto) o que sumiria mais vezes.
 */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const vazio = Array.isArray(children) && children.length === 0;

  return (
    <div className="border border-border-sutil">
      <div className={`${ROTULO} px-4 py-2 border-b border-border-sutil bg-bg-base/50`}>{titulo}</div>
      {vazio ? (
        <p className="px-4 py-2 text-text-tertiary">Nada a fazer aqui.</p>
      ) : (
        <ul className="divide-y divide-border-sutil/50 max-h-40 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}
