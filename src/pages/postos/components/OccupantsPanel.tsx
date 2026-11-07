import { useState, type KeyboardEvent } from 'react';
import {
  LogOut, Pencil, User, Users,
} from 'lucide-react';
import { CartaoVazio } from '../../../components/ListaVazia';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { diaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { nomeDoOcupante, periodoDaOcupacao } from '../helpers/ocupantes.helper';
import type { WorkstationOccupant } from '../../../types/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/referencia/modelo-de-posse.md, a que o Snipe-IT não
// tem.
//
// É o painel onde a Mesa 1 vira "Laura de manhã, Ana à tarde": os dois nomes
// que a aba Responsáveis do ativo mostra, sem que nenhum ativo
// tenha sido tocado. Entrar num posto é passar a responder por tudo que foi
// entregue a ele; sair é deixar de responder.
//
// A LINHA É A DE ESTOQUE E LICENÇAS (BQ), e o que ela pede abre nela mesma, um pedido
// de cada vez: o dia em que a pessoa saiu, como o Devolver da licença, e o turno.
//
// Não fala HTTP: recebe a lista pronta e devolve callbacks.

interface OccupantsPanelProps {
  ocupantes: readonly WorkstationOccupant[];
  carregando: boolean;
  /** A consulta da lista falhou. Vence o vazio: não é "posto vago", é não saber. */
  erro?: string | null;
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
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

/** O que uma linha está pedindo agora: nada, o turno novo, ou o dia em que a pessoa saiu. */
type Pedido = { id: string; tipo: 'turno' | 'encerrar'; valor: string } | null;

export default function OccupantsPanel({
  ocupantes, carregando, erro = null, vazio, onEncerrar, onCorrigirTurno,
}: OccupantsPanelProps) {
  const notificar = useNotificacao();
  const [pedido, setPedido] = useState<Pedido>(null);
  // Uma operação por vez: Enter repetido ou clique duplo não manda duas.
  const [ocupado, setOcupado] = useState(false);

  // Esc na linha aberta desfaz o pedido, e só ele.
  const desfazerNoEsc = (evento: KeyboardEvent) => {
    if (evento.key === 'Escape') setPedido(null);
  };

  if (ocupantes.length === 0) {
    return <CartaoVazio icone={Users} carregando={carregando} erro={erro} frase={vazio ?? 'Nenhum responsável por este posto agora.'} />;
  }

  const hoje = hojeNoCampoDeData();

  const salvarTurno = async (ocupante: WorkstationOccupant, turno: string) => {
    if (ocupado) return;
    // Nada mudou: fecha o campo sem ir ao servidor.
    if (turno.trim() === (ocupante.shift ?? '')) {
      setPedido(null);
      return;
    }
    setOcupado(true);
    try {
      await onCorrigirTurno(ocupante, turno);
      setPedido(null);
      notificar.sucesso('Turno corrigido.');
    } catch (falha) {
      // O campo continua aberto com o que foi digitado, para corrigir.
      notificar.erro((falha as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const encerrar = async (ocupante: WorkstationOccupant, dia: string) => {
    setOcupado(true);
    try {
      await onEncerrar(ocupante, dia);
      setPedido(null);
      notificar.sucesso('Responsabilidade encerrada.');
    } catch (falha) {
      notificar.erro((falha as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
      {ocupantes.map((ocupante) => {
        const nome = nomeDoOcupante(ocupante);
        const meu = pedido?.id === ocupante.id ? pedido : null;
        // A nota de quem colocou a pessoa aqui, lida onde foi escrita — como a da
        // entrega de estoque, na mesma ficha.
        const detalhe = [ocupante.person?.email, ocupante.notes].filter(Boolean).join(' · ');

        return (
          <li key={ocupante.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-text-primary">
                <User className="size-4 shrink-0 text-text-tertiary" />
                <span className="truncate font-medium">{nome}</span>
                {ocupante.shift?.trim() && <span className="shrink-0 text-text-secondary">· {ocupante.shift}</span>}
              </div>
              <div className="text-xs text-text-tertiary">
                {periodoDaOcupacao(ocupante)}
                {detalhe && <span className="text-text-secondary"> · {detalhe}</span>}
              </div>
            </div>

            {meu?.tipo === 'turno' && (
              <div onKeyDown={desfazerNoEsc} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-text-tertiary">
                  Turno
                  <Input
                    autoFocus
                    aria-label={`Turno de ${nome}`}
                    value={meu.valor}
                    maxLength={60}
                    onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') void salvarTurno(ocupante, meu.valor);
                    }}
                    className="h-9 w-32"
                  />
                </label>
                <Button variant="outline" size="sm" onClick={() => setPedido(null)}>Cancelar</Button>
                <Button size="sm" onClick={() => void salvarTurno(ocupante, meu.valor)} disabled={ocupado}>Salvar</Button>
              </div>
            )}

            {meu?.tipo === 'encerrar' && (
              <div onKeyDown={desfazerNoEsc} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-text-tertiary">
                  Saiu em
                  <Input
                    type="date"
                    value={meu.valor}
                    min={diaDoInstante(ocupante.startedAt)}
                    max={hoje}
                    onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                    className="h-9 w-36"
                  />
                </label>
                <Button variant="outline" size="sm" onClick={() => setPedido(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => void encerrar(ocupante, meu.valor)}
                  disabled={ocupado || meu.valor === ''}
                  aria-label={`Confirmar o encerramento da responsabilidade de ${nome}`}
                >
                  Confirmar
                </Button>
              </div>
            )}

            {!meu && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPedido({ id: ocupante.id, tipo: 'turno', valor: ocupante.shift ?? '' })}
                  disabled={ocupado}
                >
                  <Pencil /> Corrigir turno
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPedido({ id: ocupante.id, tipo: 'encerrar', valor: hoje })}
                  disabled={ocupado}
                  title="Sair do posto não apaga nada: a responsabilidade é encerrada e fica no histórico."
                >
                  <LogOut /> Encerrar
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
