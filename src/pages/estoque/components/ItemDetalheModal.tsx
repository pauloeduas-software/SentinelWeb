import { Edit2, Power, PowerOff, Trash2, UserPlus, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import HistoricoItem from './HistoricoItem';
import EntregasAbertas from './EntregasAbertas';
import ListToolbar from '../../components/ListToolbar';
import {
  useStockCheckoutsQuery, useStockHistoryQuery, useStockItemQuery,
} from '../../../domain/stock/stock.queries';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { classeDaConta, ehComponente, ehConsumivel, motivoParaNaoEntregar, resumoDaContagem } from '../helpers/estoque.helper';

// O DETALHE DO ITEM: a conta, as ações da lista, todos os campos do cadastro,
// quem está com ele agora e o histórico — as duas listas de 15 em 15. É o
// detalhe da licença (`LicencaDetalheModal.tsx`), com quantidade (AE).
//
// "COM QUEM ESTÁ" É ONDE A DEVOLUÇÃO ACONTECE — o único lugar: as fichas do
// posto e do colaborador mostram o que está com eles e apontam para cá. No
// COMPONENTE (AI) a lista é "Em quais computadores", e a devolução é o Retirar;
// a aba Componentes do computador aponta para cá do mesmo jeito.

interface ItemDetalheModalProps {
  item: ItemDeEstoque;
  ocupado: boolean;
  onClose: () => void;
  onEntregar: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  /** Desativar e ativar — o mesmo botão, pelo estado do item. */
  onAlternarAtivo: (item: ItemDeEstoque) => void;
  /** Excluir é `ADMIN` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (item: ItemDeEstoque) => void;
  /** `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu certo. */
  onDevolver: (entregaId: string, qty: number, checkinAt: string) => Promise<boolean>;
  /** A busca de "Com quem está" já preenchida — o link de uma ficha traz o nome de quem está com ele. */
  buscaInicial?: string;
}

/** As duas listas do detalhe andam de 15 em 15. */
const POR_PAGINA = 15;

const ROTULO = 'text-text-tertiary uppercase tracking-widest text-[10px]';

function Campo({ rotulo, children, largo = false }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`space-y-1 ${largo ? 'col-span-2' : ''}`}>
      <span className={ROTULO}>{rotulo}</span>
      <div className="text-text-secondary whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

function Acao({ icone: Icone, rotulo, onClick, disabled = false, title, perigo = false }: {
  icone: LucideIcon;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? rotulo}
      className={`flex items-center gap-1.5 px-2.5 py-1 border border-border-sutil text-[10px] uppercase tracking-widest text-text-secondary transition-colors disabled:opacity-30 ${
        perigo ? 'hover:text-status-danger' : 'hover:text-text-primary'
      }`}
    >
      <Icone size={12} /> {rotulo}
    </button>
  );
}

/** Carregando e erro antes do conteúdo: lista vazia não pode ser o que a tela diz enquanto espera. */
function Estado({ carregando, erro, children }: { carregando: boolean; erro: Error | null; children: React.ReactNode }) {
  if (carregando) return <p className="text-text-tertiary">Carregando…</p>;
  if (erro) return <p role="alert" className="text-status-danger">Não foi possível carregar: {erro.message}</p>;
  return <>{children}</>;
}

export default function ItemDetalheModal({
  item, ocupado, onClose, onEntregar, onEditar, onAlternarAtivo, onExcluir, onDevolver, buscaInicial = '',
}: ItemDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz a conta fresca logo em seguida.
  const { data: detalhe, error: erroDoDetalhe } = useStockItemQuery(item.id);

  const [paginaDasEntregas, setPaginaDasEntregas] = useState(1);
  const [busca, setBusca] = useState(buscaInicial);
  const buscaAdiada = useDebouncedValue(busca);
  // O consumível (AJ) não fica com ninguém: nem busca "Com quem está".
  const entregas = useStockCheckoutsQuery(ehConsumivel(item) ? null : item.id, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useStockHistoryQuery(item.id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  const atual = detalhe ?? item;
  const motivoSemEntrega = motivoParaNaoEntregar(atual);
  const componente = ehComponente(atual);
  // O consumível (AJ) não fica com ninguém: a entrega tira do total, e o
  // histórico é o único lugar onde ela aparece.
  const consumivel = ehConsumivel(atual);

  const mudarBusca = (valor: string) => {
    setBusca(valor);
    setPaginaDasEntregas(1);
  };

  // A página que deixou de existir volta para a última — a entrega voltou
  // inteira, aqui ou por outra pessoa —, senão a lista abre vazia dizendo que
  // ninguém está com o item. Ajuste DURANTE o render, guardado pela condição,
  // como na lista.
  const ultimaPaginaDasEntregas = entregas.data
    ? Math.max(1, Math.ceil(entregas.data.total / POR_PAGINA))
    : paginaDasEntregas;
  if (paginaDasEntregas > ultimaPaginaDasEntregas) setPaginaDasEntregas(ultimaPaginaDasEntregas);

  const totalDoHistorico = historico.data?.total ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div role="dialog" aria-label={atual.name} className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase break-words">{atual.name}</h2>
              <p className="font-mono text-[10px] mt-1 text-text-tertiary">
                {!atual.isActive && 'Desativado · '}
                <span className={atual.disponivel < 0 ? classeDaConta(atual) : ''}>{resumoDaContagem(atual)}</span>
              </p>
            </div>
            {/* As ações da lista, com as mesmas regras: o desativado não
                entrega, e se ativa pelo mesmo botão. */}
            <div className="flex flex-wrap gap-2 font-mono">
              {atual.isActive && (
                <Acao
                  icone={UserPlus}
                  rotulo="Entregar"
                  onClick={() => onEntregar(atual)}
                  disabled={motivoSemEntrega !== null}
                  title={motivoSemEntrega ?? 'Entregar'}
                />
              )}
              <Acao icone={Edit2} rotulo="Editar" onClick={() => onEditar(atual)} />
              <Acao
                icone={atual.isActive ? PowerOff : Power}
                rotulo={atual.isActive ? 'Desativar' : 'Ativar'}
                onClick={() => onAlternarAtivo(atual)}
                disabled={ocupado}
              />
              {onExcluir && (
                <Acao
                  icone={Trash2}
                  rotulo="Excluir"
                  onClick={() => onExcluir(atual)}
                  disabled={ocupado}
                  perigo
                />
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" title="Fechar" className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 font-mono text-xs space-y-6 overflow-y-auto">
          {erroDoDetalhe && (
            <p role="alert" className="text-status-danger">Não foi possível atualizar o item: {erroDoDetalhe.message}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo rotulo="Categoria">{atual.category.name}</Campo>
            <Campo rotulo="Localização">{atual.location?.name ?? '—'}</Campo>
            <Campo rotulo="Notas" largo>{atual.notes ?? '—'}</Campo>
          </div>

          {!consumivel && <div className="space-y-3">
            <span className={ROTULO}>{componente ? 'Em quais computadores' : 'Com quem está'}</span>
            <ListToolbar
              search={busca}
              onSearchChange={mudarBusca}
              placeholder={componente ? 'Buscar por etiqueta ou nome do computador...' : 'Buscar por colaborador ou posto...'}
              page={paginaDasEntregas}
              perPage={POR_PAGINA}
              total={entregas.data?.total ?? 0}
              onPageChange={setPaginaDasEntregas}
            />
            <Estado carregando={entregas.isPending} erro={entregas.error}>
              <EntregasAbertas
                entregas={entregas.data?.rows ?? []}
                vazio={
                  componente
                    ? buscaAdiada
                      ? `Nenhum computador com "${buscaAdiada}" tem este componente.`
                      : 'Nenhum computador tem este componente agora.'
                    : buscaAdiada ? `Ninguém com "${buscaAdiada}" está com este item.` : undefined
                }
                ocupado={ocupado}
                onDevolver={onDevolver}
              />
            </Estado>
          </div>}

          <div className="space-y-3">
            <span className={ROTULO}>Histórico</span>
            {/* O paginador só quando há mais de uma página: com três eventos,
                "1–3 de 3" é ruído. */}
            {totalDoHistorico > POR_PAGINA && (
              <ListToolbar
                page={paginaDoHistorico}
                perPage={POR_PAGINA}
                total={totalDoHistorico}
                onPageChange={setPaginaDoHistorico}
              />
            )}
            <Estado carregando={historico.isPending} erro={historico.error}>
              <HistoricoItem eventos={historico.data?.rows ?? []} />
            </Estado>
          </div>
        </div>
      </div>
    </div>
  );
}
