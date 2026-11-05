import { useEffect, useRef, useState } from 'react';
import { Check, LogOut, Pencil, UserPlus, X } from 'lucide-react';
import OcupanteFormModal from './OcupanteFormModal';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { Aviso } from '../../../components/ui/aviso';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Segmentado } from '../../../components/ui/segmentado';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { diaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import {
  estaAberta, nomeDoOcupante, periodoDaOcupacao, turnoDoOcupante,
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
// Não traz a moldura da janela: é uma aba do detalhe do posto, que tem nas outras
// a lista de ativos que o posto segura.
//
// Não fala HTTP: recebe a lista pronta e devolve callbacks.

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
}

export default function OccupantsPanel({
  ocupantes, carregando, erro: erroAoCarregar = null, view, onViewChange, onAdicionar, onEncerrar,
  onCorrigirTurno,
}: OccupantsPanelProps) {
  const [adicionando, setAdicionando] = useState(false);
  const [erro, setErro] = useState('');
  // O aviso fica no topo, e a aba rola: quem encerrou uma ocupação no fim do
  // histórico não via a recusa e achava que o clique não tinha feito nada.
  const avisoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (erro) avisoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [erro]);
  // O encerramento aberto numa linha: qual ocupação e o dia escolhido.
  const [encerrando, setEncerrando] = useState<{ id: string; dia: string } | null>(null);

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
    <>
      {erro && <Aviso ref={avisoRef}>{erro}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado opcoes={RECORTES} valor={view} onChange={onViewChange} />
        <Button size="sm" onClick={() => setAdicionando(true)}><UserPlus /> Adicionar ao posto</Button>
      </div>

      {ocupantes.length === 0 ? (
        erroAoCarregar && !carregando ? (
          <Aviso>Não foi possível carregar os ocupantes: {erroAoCarregar}</Aviso>
        ) : (
          <p className="text-sm text-text-tertiary">
            {carregando
              ? 'Carregando…'
              : view === 'all'
                ? 'Este posto nunca teve ocupante.'
                : 'Ninguém ocupa este posto agora.'}
          </p>
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {ocupantes.map((ocupante) => (
                <TableRow key={ocupante.id}>
                  <TableCell>
                    <div className="font-medium text-text-primary">{nomeDoOcupante(ocupante)}</div>
                    {ocupante.person?.email && (
                      <div className="mt-0.5 text-xs text-text-tertiary">{ocupante.person.email}</div>
                    )}
                    {/* A nota de quem colocou a pessoa aqui, lida onde foi escrita
                        — como a da entrega de estoque, na mesma ficha. */}
                    {ocupante.notes && (
                      <div className="mt-0.5 text-xs text-text-tertiary">{ocupante.notes}</div>
                    )}
                  </TableCell>

                  <TableCell>
                    {editandoTurno === ocupante.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          data-esc-proprio
                          aria-label={`Turno de ${nomeDoOcupante(ocupante)}`}
                          value={turnoEditado}
                          maxLength={60}
                          onChange={(event) => setTurnoEditado(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void salvarTurno(ocupante);
                            // Esc aqui desfaz a correção, e só ela: a ficha continua aberta.
                            if (event.key === 'Escape') cancelarTurno();
                          }}
                          className="h-9 w-32"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void salvarTurno(ocupante)}
                          disabled={salvandoTurno}
                          title="Salvar turno"
                          aria-label="Salvar turno"
                        >
                          <Check />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={cancelarTurno}
                          title="Cancelar"
                          aria-label="Cancelar a edição do turno"
                        >
                          <X />
                        </Button>
                      </div>
                    ) : (
                      turnoDoOcupante(ocupante)
                    )}
                  </TableCell>

                  <TableCell className="whitespace-nowrap tabular-nums">
                    {encerrando?.id === ocupante.id ? (
                      <label className="flex items-center gap-2 text-xs text-text-tertiary">
                        Saiu em
                        <Input
                          type="date"
                          value={encerrando.dia}
                          min={diaDoInstante(ocupante.startedAt)}
                          max={hojeNoCampoDeData()}
                          onChange={(event) => setEncerrando({ id: ocupante.id, dia: event.target.value })}
                          className="h-9 w-36"
                        />
                      </label>
                    ) : (
                      periodoDaOcupacao(ocupante)
                    )}
                  </TableCell>

                  <TableCell>
                    {/* Ocupação já encerrada não tem o que encerrar: a linha fica,
                        sem ação, porque histórico é para ser lido. */}
                    {encerrando?.id === ocupante.id ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void encerrar(ocupante, encerrando.dia)}
                          disabled={encerrando.dia === ''}
                          title="Confirmar o encerramento"
                          aria-label={`Confirmar o encerramento da ocupação de ${nomeDoOcupante(ocupante)}`}
                        >
                          <Check />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEncerrando(null)}
                          title="Cancelar"
                          aria-label="Cancelar o encerramento"
                        >
                          <X />
                        </Button>
                      </div>
                    ) : estaAberta(ocupante) && editandoTurno !== ocupante.id && (
                      <AcoesDaLinha
                        nome={nomeDoOcupante(ocupante)}
                        acoes={[
                          { rotulo: 'Corrigir turno', icone: Pencil, onClick: () => abrirEdicaoDoTurno(ocupante) },
                          {
                            rotulo: 'Encerrar ocupação',
                            icone: LogOut,
                            onClick: () => setEncerrando({ id: ocupante.id, dia: hojeNoCampoDeData() }),
                            titulo: 'Sair do posto não apaga nada: a ocupação é encerrada e fica no histórico.',
                            perigo: true,
                          },
                        ]}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {adicionando && <OcupanteFormModal onClose={() => setAdicionando(false)} onSubmit={onAdicionar} />}
    </>
  );
}
