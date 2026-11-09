import { useState, type KeyboardEvent } from 'react';
import {
  MapPin, Monitor, Undo2, User, Users,
} from 'lucide-react';
import { CartaoVazio } from '../../../components/ListaVazia';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import type { EntregaAberta } from '../../../types/stock.types';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { textoDeUnidades } from '../../../helpers/estoque.helper';

// QUEM ESTÁ COM O ITEM AGORA — uma linha por ENTREGA ("Mesa 1 · 5 unidades ·
// desde…"), com o botão de devolver. É a aba Responsáveis da licença
// (`EntregasAbertas.tsx`), com quantidade.
//
// NO POSTO, QUEM ESTÁ NELE APARECE EMBAIXO (BL), só o nome: responde pelo que foi
// entregue à mesa (D33). A linha não é link.
//
// DEVOLVER PERGUNTA QUANTAS E O DIA, na própria linha: vem com todas e com
// hoje; voltam menos quando só parte voltou, e o dia pode voltar até o da
// entrega — o registro da devolução que já aconteceu. É o único lugar do
// sistema que devolve estoque; as fichas mostram e apontam para cá.
//
// No COMPONENTE (AI), a linha é o computador e o botão é RETIRAR: a peça sai da
// máquina e volta ao disponível. A pergunta é a mesma, quantas e o dia.

interface EntregasAbertasProps {
  entregas: EntregaAberta[];
  carregando: boolean;
  erro: string | null;
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  ocupado: boolean;
  /**
   * `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu
   * certo — só então a linha fecha, e a recusa deixa o que foi escolhido nos campos.
   */
  onDevolver: (entregaId: string, qty: number, checkinAt: string) => Promise<boolean>;
}

/** O que a linha aberta está pedindo: quantas e o dia. */
type Pedido = { id: string; qty: string; dia: string } | null;

const ICONE_DO_ALVO = { PERSON: User, WORKSTATION: MapPin, ASSET: Monitor } as const;

/** Quem recebeu: o computador pela etiqueta em mono, como a licença o escreve. */
function Alvo({ entrega }: { entrega: EntregaAberta }) {
  const ativo = entrega.targetAsset;
  if (!ativo) return <>{entrega.targetLabel}</>;
  return <span className="font-mono">{ativo.assetTag}</span>;
}

export default function EntregasAbertas({ entregas, carregando, erro, vazio, ocupado, onDevolver }: EntregasAbertasProps) {
  // Um pedido aberto de cada vez, na linha que o abriu.
  const [pedido, setPedido] = useState<Pedido>(null);

  // Esc na linha aberta desfaz o pedido.
  const desfazerNoEsc = (evento: KeyboardEvent) => {
    if (evento.key === 'Escape') setPedido(null);
  };

  if (entregas.length === 0) {
    return <CartaoVazio icone={Users} carregando={carregando} erro={erro} frase={vazio ?? 'Nenhum responsável por este item agora.'} />;
  }

  const hoje = hojeNoCampoDeData();

  const confirmar = async (entrega: EntregaAberta, meu: NonNullable<Pedido>) => {
    if (await onDevolver(entrega.id, Number(meu.qty), meu.dia)) setPedido(null);
  };

  return (
    <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
      {entregas.map((entrega) => {
        const Icone = ICONE_DO_ALVO[entrega.targetType];
        const componente = entrega.targetType === 'ASSET';
        const meu = pedido?.id === entrega.id ? pedido : null;
        const quantas = meu ? Number(meu.qty) : 0;
        const quantasValem = meu !== null && meu.qty.trim() !== '' && Number.isInteger(quantas)
          && quantas >= 1 && quantas <= entrega.unidades;

        return (
          <li key={entrega.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-text-primary">
                <Icone className="size-4 shrink-0 text-text-tertiary" />
                <span className="truncate font-medium"><Alvo entrega={entrega} /></span>
                <span className="text-text-secondary shrink-0">· {textoDeUnidades(entrega.unidades)}</span>
              </div>
              {/* A série embaixo da etiqueta, como na lista de Computadores (CH). */}
              {entrega.targetAsset?.serial && (
                <div className="truncate font-mono text-xs text-text-secondary">{entrega.targetAsset.serial}</div>
              )}
              {entrega.responsaveis.map((pessoa) => (
                <div key={pessoa.id} className="truncate text-xs text-text-secondary">{pessoa.name}</div>
              ))}
              <div className="text-xs text-text-tertiary">
                desde {formatarDiaDoInstante(entrega.checkoutAt)}
                {entrega.notes && <span className="text-text-secondary"> · {entrega.notes}</span>}
              </div>
            </div>

            {meu ? (
              <div onKeyDown={desfazerNoEsc} className="flex flex-wrap items-center gap-2">
                {/* Com uma unidade só, não há o que perguntar. */}
                {entrega.unidades > 1 && (
                  <label className="flex items-center gap-2 text-xs text-text-tertiary">
                    Quantas
                    <Input
                      type="number"
                      value={meu.qty}
                      min={1}
                      max={entrega.unidades}
                      onChange={(evento) => setPedido({ ...meu, qty: evento.target.value })}
                      className="h-9 w-16"
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-text-tertiary">
                  {componente ? 'Retirada em' : 'Devolvida em'}
                  <Input
                    type="date"
                    value={meu.dia}
                    min={diaDoInstante(entrega.checkoutAt)}
                    max={hoje}
                    onChange={(evento) => setPedido({ ...meu, dia: evento.target.value })}
                    className="h-9 w-36"
                  />
                </label>
                <Button variant="outline" size="sm" onClick={() => setPedido(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => void confirmar(entrega, meu)}
                  disabled={ocupado || meu.dia === '' || !quantasValem}
                  title={quantasValem ? 'Confirmar' : `De 1 a ${entrega.unidades}`}
                >
                  Confirmar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPedido({ id: entrega.id, qty: String(entrega.unidades), dia: hoje })}
                disabled={ocupado}
              >
                <Undo2 /> {componente ? 'Retirar' : 'Devolver'}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
