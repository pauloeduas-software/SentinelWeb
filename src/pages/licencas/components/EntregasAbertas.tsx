import { useState, type KeyboardEvent } from 'react';
import {
  KeyRound, Monitor, Undo2, User, Users,
} from 'lucide-react';
import ChaveEscondida from './ChaveEscondida';
import { CartaoVazio } from '../../../components/ListaVazia';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Seletor } from '../../../components/ui/seletor';
import type { ChaveDaLicenca, EntregaComChave } from '../../../types/license.types';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { chavesComLugar, lugarDaChave, rotuloDaChave } from '../helpers/licenca.helper';

// QUEM ESTÁ COM A LICENÇA AGORA — uma linha por entrega aberta, com a chave
// dela e o botão de devolver. Sem número de vaga (AA): a pergunta é "com
// quem", não "qual vaga".
//
// DEVOLVER PEDE O DIA, na própria linha: vem com hoje e pode voltar até o dia
// da entrega — o registro da devolução que já aconteceu. É o único lugar do
// sistema que devolve licença; as outras telas mostram e apontam para cá.
//
// A CHAVE da entrega aparece escondida, com a posição dela na lista da licença,
// e se troca aqui também — por outra da lista (AC). É também como a entrega
// feita antes de a licença ter chaves ganha a sua.

interface EntregasAbertasProps {
  entregas: EntregaComChave[];
  carregando: boolean;
  erro: string | null;
  /** As chaves da licença, do detalhe. Vazia, a entrega não tem chave para trocar. */
  chaves: ChaveDaLicenca[];
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  ocupado: boolean;
  /**
   * `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu
   * certo — só então a linha fecha, e a recusa deixa o dia escolhido no campo.
   */
  onDevolver: (checkoutId: string, checkinAt: string) => Promise<boolean>;
  /** Resolve `true` quando a troca deu certo — só então a linha sai da edição. */
  onTrocarChave: (checkoutId: string, licenseKeyId: string) => Promise<boolean>;
}

/** O que uma linha está pedindo agora: nada, o dia da devolução, ou a chave nova (o id). */
type Pedido = { id: string; tipo: 'devolver' | 'chave'; valor: string } | null;

function Alvo({ entrega }: { entrega: EntregaComChave }) {
  if (entrega.assignedPerson) return <>{entrega.assignedPerson.name}</>;
  const ativo = entrega.assignedAsset;
  if (!ativo) return <>—</>;
  return <span className="font-mono">{ativo.assetTag}</span>;
}

export default function EntregasAbertas({ entregas, carregando, erro, chaves, vazio, ocupado, onDevolver, onTrocarChave }: EntregasAbertasProps) {
  // Um pedido aberto de cada vez, na linha que o abriu.
  const [pedido, setPedido] = useState<Pedido>(null);

  // Esc na linha aberta desfaz o pedido.
  const desfazerNoEsc = (evento: KeyboardEvent) => {
    if (evento.key === 'Escape') setPedido(null);
  };

  if (entregas.length === 0) {
    return <CartaoVazio icone={Users} carregando={carregando} erro={erro} frase={vazio ?? 'Nenhum responsável por esta licença agora.'} />;
  }

  const hoje = hojeNoCampoDeData();

  const salvarChave = async (checkoutId: string, licenseKeyId: string) => {
    if (await onTrocarChave(checkoutId, licenseKeyId)) setPedido(null);
  };

  const comLugar = chavesComLugar(chaves);
  const posicaoDa = (licenseKeyId: string | null) => chaves.findIndex((chave) => chave.id === licenseKeyId) + 1;

  const confirmarDevolucao = async (checkoutId: string, dia: string) => {
    if (await onDevolver(checkoutId, dia)) setPedido(null);
  };

  return (
    <ul className="divide-y divide-border-sutil rounded-lg border border-border-sutil text-sm">
      {entregas.map((entrega) => {
        const Icone = entrega.assignedPerson ? User : Monitor;
        const meu = pedido?.id === entrega.id ? pedido : null;
        return (
          <li key={entrega.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-text-primary">
                  <Icone className="size-4 shrink-0 text-text-tertiary" />
                  <span className="truncate font-medium"><Alvo entrega={entrega} /></span>
                </div>
                {/* A série embaixo da etiqueta, como na lista de Computadores (CH). */}
                {entrega.assignedAsset?.serial && (
                  <div className="truncate font-mono text-xs text-text-secondary">{entrega.assignedAsset.serial}</div>
                )}
                <div className="text-xs text-text-tertiary">
                  desde {formatarDiaDoInstante(entrega.checkoutAt)}
                  {entrega.checkoutNotes && <span className="text-text-secondary"> · {entrega.checkoutNotes}</span>}
                </div>
              </div>

              {meu?.tipo === 'devolver' ? (
                <div onKeyDown={desfazerNoEsc} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-text-tertiary">
                    Devolvida em
                    <Input
                      type="date"
                      value={meu.valor}
                      min={diaDoInstante(entrega.checkoutAt)}
                      max={hoje}
                      onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                      className="h-9 w-36"
                    />
                  </label>
                  <Button variant="outline" size="sm" onClick={() => setPedido(null)}>Cancelar</Button>
                  <Button
                    size="sm"
                    onClick={() => void confirmarDevolucao(entrega.id, meu.valor)}
                    disabled={ocupado || meu.valor === ''}
                  >
                    Confirmar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {chaves.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPedido({ id: entrega.id, tipo: 'chave', valor: entrega.licenseKeyId ?? '' })}
                      disabled={ocupado}
                    >
                      <KeyRound /> Chave
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPedido({ id: entrega.id, tipo: 'devolver', valor: hoje })}
                    disabled={ocupado}
                  >
                    <Undo2 /> Devolver
                  </Button>
                </div>
              )}
            </div>

            {meu?.tipo === 'chave' ? (
              <div onKeyDown={desfazerNoEsc} className="flex flex-wrap items-center gap-2">
                {/* A chave atual e as que têm lugar. */}
                <Seletor
                  ariaLabel="Chave desta entrega"
                  value={meu.valor}
                  onChange={(valor) => setPedido({ ...meu, valor })}
                  vazio="Escolha a chave…"
                  placeholderDaBusca="Buscar chave…"
                  opcoesMono
                  className={meu.valor ? 'min-w-[220px] flex-1 font-mono' : 'min-w-[220px] flex-1'}
                  opcoes={chaves.flatMap((chave, indice) => (chave.id === entrega.licenseKeyId || comLugar.includes(chave)
                    ? [{
                      value: chave.id,
                      label: rotuloDaChave(chave, indice + 1),
                      detalhe: chave.id === entrega.licenseKeyId ? 'a atual' : lugarDaChave(chave),
                    }]
                    : []))}
                />
                <Button variant="outline" size="sm" onClick={() => setPedido(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => void salvarChave(entrega.id, meu.valor)}
                  disabled={ocupado || meu.valor === '' || meu.valor === entrega.licenseKeyId}
                >
                  Salvar
                </Button>
              </div>
            ) : entrega.licenseKey ? (
              <div className="flex items-center gap-2 text-xs">
                <KeyRound className="size-4 shrink-0 text-text-tertiary" />
                {posicaoDa(entrega.licenseKeyId) > 0 && (
                  <span className="shrink-0 text-text-tertiary">{posicaoDa(entrega.licenseKeyId)}.</span>
                )}
                <ChaveEscondida chave={entrega.licenseKey.productKey} />
              </div>
            ) : chaves.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <KeyRound className="size-4 shrink-0" /> sem chave: use Chave para escolher uma
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
