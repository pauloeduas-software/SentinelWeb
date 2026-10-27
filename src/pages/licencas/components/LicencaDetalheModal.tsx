import { Edit2, Power, PowerOff, Trash2, UserPlus, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import ChaveEscondida from './ChaveEscondida';
import EntregasAbertas from './EntregasAbertas';
import HistoricoLicenca from './HistoricoLicenca';
import ListToolbar from '../../components/ListToolbar';
import {
  useLicenseCheckoutsQuery, useLicenseHistoryQuery, useLicenseQuery,
} from '../../../domain/license/license.queries';
import type { Licenca } from '../../../domain/shared/license.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  ROTULO_DO_STATUS, resumoDaContagem, textoDoPrazo, textoDoValorDaCompra,
} from '../../helpers/licenca.helper';
import { formatarData } from '../../helpers/format.helper';
import { lugarDaChave, motivoParaNaoEntregar } from '../helpers/licenca.helper';

// O DETALHE DA LICENÇA: o status e a conta, as ações da lista, todos os campos
// do cadastro, quem está com ela agora e o histórico — as duas listas de 15 em 15.
//
// É A ÚNICA TELA COM AS CHAVES DE PRODUTO: as da licença, no topo, numeradas e
// com quanto cada uma cobre, e a de cada entrega, em "Com quem está" — todas
// escondidas até "Mostrar" (AC).

interface LicencaDetalheModalProps {
  licenca: Licenca;
  ocupado: boolean;
  onClose: () => void;
  onEntregar: (licenca: Licenca) => void;
  onEditar: (licenca: Licenca) => void;
  /** Encerrar e reabrir — o mesmo botão, pelo status da licença. */
  onAlternarEncerrada: (licenca: Licenca) => void;
  /** Excluir é `ADMIN` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (licenca: Licenca) => void;
  /** `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu certo. */
  onDevolver: (checkoutId: string, checkinAt: string) => Promise<boolean>;
  /** Troca só a chave de uma entrega aberta, por outra da lista. Resolve `true` quando deu certo. */
  onTrocarChave: (checkoutId: string, licenseKeyId: string) => Promise<boolean>;
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

export default function LicencaDetalheModal({
  licenca, ocupado, onClose, onEntregar, onEditar, onAlternarEncerrada, onExcluir, onDevolver, onTrocarChave,
}: LicencaDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz as contagens frescas logo em seguida.
  const { data: detalhe, error: erroDoDetalhe } = useLicenseQuery(licenca.id);

  const [paginaDasEntregas, setPaginaDasEntregas] = useState(1);
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDebouncedValue(busca);
  const entregas = useLicenseCheckoutsQuery(licenca.id, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useLicenseHistoryQuery(licenca.id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  const atual = detalhe ?? licenca;
  const encerrada = atual.status === 'ENCERRADA';
  const motivoSemEntrega = motivoParaNaoEntregar(atual);

  const mudarBusca = (valor: string) => {
    setBusca(valor);
    setPaginaDasEntregas(1);
  };

  // A última linha da página foi devolvida: volta uma, senão a lista abre vazia
  // com o paginador apontando para uma página que não existe mais.
  const devolver = async (checkoutId: string, checkinAt: string): Promise<boolean> => {
    const linhasNaPagina = entregas.data?.rows.length ?? 0;
    const devolveu = await onDevolver(checkoutId, checkinAt);
    if (devolveu && linhasNaPagina === 1 && paginaDasEntregas > 1) setPaginaDasEntregas(paginaDasEntregas - 1);
    return devolveu;
  };

  const totalDoHistorico = historico.data?.total ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div role="dialog" aria-label={atual.name} className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase break-words">{atual.name}</h2>
              <p className="font-mono text-[10px] mt-1 text-text-tertiary">
                {ROTULO_DO_STATUS[atual.status]} · {resumoDaContagem(atual)}
              </p>
            </div>
            {/* As ações da lista, com as mesmas regras: a encerrada não
                entrega, e se reabre pelo mesmo botão. */}
            <div className="flex flex-wrap gap-2 font-mono">
              {!encerrada && (
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
                icone={encerrada ? Power : PowerOff}
                rotulo={encerrada ? 'Reabrir' : 'Encerrar'}
                onClick={() => onAlternarEncerrada(atual)}
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
            <p role="alert" className="text-status-danger">Não foi possível atualizar a licença: {erroDoDetalhe.message}</p>
          )}

          {/* As chaves só chegam com o detalhe: a linha da listagem não as traz.
              O `key` pela chave: trocar de licença pelo link com a janela aberta
              não leva o "Mostrar" ligado para a chave da outra. */}
          <Campo rotulo="Chaves do produto">
            {!detalhe ? (erroDoDetalhe ? 'Não foi possível carregar' : 'Carregando…')
              : detalhe.keys.length === 0 ? '—' : (
                <ol className="space-y-1.5">
                  {detalhe.keys.map((chave, indice) => (
                    <li key={chave.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <span className="text-text-tertiary">{indice + 1}.</span>
                      <ChaveEscondida chave={chave.productKey} />
                      <span className="text-[10px] text-text-tertiary">{lugarDaChave(chave)}</span>
                    </li>
                  ))}
                </ol>
              )}
          </Campo>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo rotulo="Vencimento">
              {formatarData(atual.expirationDate)}
              {atual.expirationDate && !encerrada && (
                <span className="text-text-tertiary"> · {textoDoPrazo(atual.diasParaVencer)}</span>
              )}
            </Campo>
            <Campo rotulo="Encerramento">{formatarData(atual.terminationDate)}</Campo>
            <Campo rotulo="Categoria">{atual.category?.name ?? '—'}</Campo>
            <Campo rotulo="Fabricante">{atual.manufacturer?.name ?? '—'}</Campo>
            <Campo rotulo="Licenciado para">{atual.licensedToName ?? '—'}</Campo>
            <Campo rotulo="E-mail do licenciado">{atual.licensedToEmail ?? '—'}</Campo>
            <Campo rotulo="Nº do pedido">{atual.orderNumber ?? '—'}</Campo>
            <Campo rotulo="Data da compra">{formatarData(atual.purchaseDate)}</Campo>
            <Campo rotulo="Valor da compra" largo>{textoDoValorDaCompra(atual)}</Campo>
            <Campo rotulo="Notas" largo>{atual.notes ?? '—'}</Campo>
          </div>

          <div className="space-y-3">
            <span className={ROTULO}>Com quem está</span>
            <ListToolbar
              search={busca}
              onSearchChange={mudarBusca}
              placeholder="Buscar por colaborador ou computador..."
              page={paginaDasEntregas}
              perPage={POR_PAGINA}
              total={entregas.data?.total ?? 0}
              onPageChange={setPaginaDasEntregas}
            />
            <Estado carregando={entregas.isPending} erro={entregas.error}>
              <EntregasAbertas
                entregas={entregas.data?.rows ?? []}
                chaves={detalhe?.keys ?? []}
                vazio={buscaAdiada ? `Ninguém com "${buscaAdiada}" está com esta licença.` : undefined}
                ocupado={ocupado}
                onDevolver={devolver}
                onTrocarChave={onTrocarChave}
              />
            </Estado>
          </div>

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
              <HistoricoLicenca eventos={historico.data?.rows ?? []} />
            </Estado>
          </div>
        </div>
      </div>
    </div>
  );
}
