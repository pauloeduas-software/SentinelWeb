import { useState } from 'react';
import { CheckCircle2, HardDrive, MapPin, PackageCheck, User, X, XCircle } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import { montarEntrega } from '../helpers/posse.helper';
import {
  useBulkCheckout,
  type BulkCheckoutInput,
  type RelatorioEntregaEmLote,
} from '../../../domain/assignment/assignment.queries';
import type { Asset } from '../../../domain/shared/asset.types';
import type { AlvoDaPosse } from '../../../domain/shared/posse.types';

// ENTREGA EM MASSA — o kit de onboarding (D31).
//
// DUAS TELAS NUM COMPONENTE SÓ, e a segunda é a que justifica o resto: primeiro
// o formulário (quem recebe, com que status, até quando), depois o RELATÓRIO do
// que entrou e do que foi recusado. A entrega em massa é por linha — um kit de
// 8 em que 1 está com outra pessoa entrega 7 —, então fechar o modal com um
// "pronto!" esconderia exatamente a informação que o operador precisa.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE COMPONENTE CHAMA A MUTAÇÃO, sendo que "componente não faz fetch"
//
// É a mesma exceção do `ReferenceSelect`, por um motivo concreto: a listagem de
// ativos (`index.tsx`) é de outra fatia de trabalho, e este fluxo precisa entrar
// lá com UMA linha — `{selecionados.length > 0 && <BulkCheckoutModal … />}`.
// Espalhar a mutação, o estado de relatório e o de erro pelo hook da página
// obrigaria a mexer em quatro arquivos que não são deste assunto, e a montagem
// do corpo (`montarEntrega`) continua no helper puro, fora do JSX.
//
// O que ele continua NÃO fazendo: `apiClient`, `axios`, `useQuery` direto. O
// acesso é pela query do domínio, como manda o docs/ARQUITETURA.md.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

/**
 * As três abas de alvo, as mesmas do `CheckoutModal` — repetidas aqui de
 * propósito.
 *
 * A ajuda de cada uma é DIFERENTE: no lote, o caso que o posto torna trivial
 * (o kit inteiro para a Mesa 1, uma posse por ativo, todas com o mesmo alvo) é
 * o que precisa de explicação, e não a diferença entre pessoa e lugar.
 * Compartilhar a constante obrigaria a parametrizar os textos dos dois lados
 * para economizar doze linhas de dado.
 */
const ABAS: readonly {
  tipo: AlvoDaPosse;
  rotulo: string;
  icone: typeof User;
  rota: string;
  rotuloAlvo: string;
  ajuda: string;
}[] = [
  {
    tipo: 'USER',
    rotulo: 'Pessoa',
    icone: User,
    rota: 'users',
    rotuloAlvo: 'Colaborador',
    ajuda: 'Todos os ativos ficam no nome dela. É o kit de onboarding: notebook, dock, monitor e headset de uma vez.',
  },
  {
    tipo: 'LOCATION',
    rotulo: 'Posto',
    icone: MapPin,
    rota: 'locations',
    rotuloAlvo: 'Localização',
    ajuda: 'O kit inteiro vai para o LUGAR — uma posse por ativo, todas apontando para o mesmo posto. Quem responde são os ocupantes dele, e um equipamento novo na mesa herda os mesmos responsáveis sem nenhuma linha a mais.',
  },
  {
    tipo: 'ASSET',
    rotulo: 'Ativo',
    icone: HardDrive,
    rota: 'assets',
    rotuloAlvo: 'Ativo detentor',
    ajuda: 'Os ativos passam a acompanhar outro — os periféricos presos à dock. Um ativo que esteja na própria seleção é recusado: nada é detentor de si mesmo.',
  },
];

interface BulkCheckoutModalProps {
  /**
   * Os ids marcados — é ISTO que vai no corpo da requisição.
   *
   * Separado dos objetos de propósito: a seleção da listagem ATRAVESSA a
   * paginação (`useBulkSelection`), então o que está marcado pode não estar
   * carregado na tela. Receber só os ativos da página entregaria menos ativos do
   * que o operador marcou, em silêncio — o pior tipo de bug de lote.
   */
  assetIds: readonly string[];
  /**
   * Os ativos que a tela TEM em mãos (a página atual), só para escrever
   * etiqueta no lugar de uuid. Opcional, e nunca usado para decidir o que
   * entregar.
   */
  assets?: readonly Asset[];
  onClose: () => void;
  /** Chamado quando o lote termina — a listagem usa para limpar a seleção. */
  onConcluido?: (relatorio: RelatorioEntregaEmLote) => void;
}

export default function BulkCheckoutModal({ assetIds, assets = [], onClose, onConcluido }: BulkCheckoutModalProps) {
  const entregaEmLote = useBulkCheckout();

  // Etiqueta por id, para a seleção e para o relatório. Quem não estiver aqui
  // (marcado em outra página) aparece pelo id — nunca some da conta.
  const etiquetaPorId = new Map(assets.map((asset) => [asset.id, asset.assetTag]));

  const [aba, setAba] = useState<AlvoDaPosse>('USER');
  const [alvoId, setAlvoId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [expectedCheckinAt, setExpectedCheckinAt] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [relatorio, setRelatorio] = useState<RelatorioEntregaEmLote | null>(null);

  const abaAtual = ABAS.find((item) => item.tipo === aba) ?? ABAS[0];

  // Trocar de aba ZERA o alvo: o corpo leva UMA FK, e um id que sobrou da aba
  // anterior seria um alvo que ninguém escolheu.
  const trocarAba = (proxima: AlvoDaPosse) => {
    setAba(proxima);
    setAlvoId('');
  };

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro('');

    // O corpo da entrega sai do MESMO helper puro da entrega avulsa, e só então
    // ganha a lista de ids: a regra de "manda só a FK da aba escolhida, e campo
    // vazio vira ausente" não pode existir em duas versões.
    const corpo: BulkCheckoutInput = {
      ...montarEntrega({ targetType: aba, alvoId, statusId, expectedCheckinAt, checkoutNotes: observacoes }),
      assetIds: [...assetIds],
    };

    try {
      const resposta = await entregaEmLote.mutateAsync(corpo);
      setRelatorio(resposta);
      onConcluido?.(resposta);
    } catch (falha) {
      // Aqui NÃO é linha recusada — linha recusada vem dentro do relatório, com
      // 200. Isto é a requisição inteira falhando: sessão perdida, alvo
      // inexistente, corpo inválido, servidor fora do ar.
      setErro((falha as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <PackageCheck size={16} />
            {relatorio ? 'Entrega em massa — resultado' : `Entregar ${assetIds.length} ${assetIds.length === 1 ? 'ativo' : 'ativos'}`}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {relatorio ? (
          <Relatorio relatorio={relatorio} etiquetaPorId={etiquetaPorId} onClose={onClose} />
        ) : (
          <form onSubmit={enviar} className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
            {erro && (
              <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
            )}

            <Selecionados assetIds={assetIds} etiquetaPorId={etiquetaPorId} />

            <div className="flex flex-wrap border border-border-sutil">
              {ABAS.map((item) => (
                <button
                  key={item.tipo}
                  type="button"
                  onClick={() => trocarAba(item.tipo)}
                  className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
                    item.tipo === aba
                      ? 'bg-text-primary text-bg-base'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
                  }`}
                >
                  <item.icone size={14} /> {item.rotulo}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>{abaAtual.rotuloAlvo}*</label>
              <ReferenceSelect
                // Remontar a cada aba: cada alvo é uma lista diferente, e a
                // `key` evita o `<select>` da aba anterior aparecer por um
                // quadro com as opções velhas.
                key={abaAtual.tipo}
                rota={abaAtual.rota}
                valor={alvoId}
                obrigatorio
                onChange={setAlvoId}
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">{abaAtual.ajuda}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={ROTULO}>Status após a entrega</label>
                <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  Vale para todos do lote. Em branco, o servidor aplica o status de uso.
                </p>
              </div>
              <div className="space-y-1">
                <label className={ROTULO}>Devolução prevista</label>
                <input
                  type="date"
                  value={expectedCheckinAt}
                  onChange={(event) => setExpectedCheckinAt(event.target.value)}
                  className={CLASSE_CAMPO}
                />
                <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                  Só para empréstimo com prazo. Em branco, é entrega sem data de volta.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className={ROTULO}>Observações da entrega</label>
              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Ex: kit de onboarding entregue na recepção."
                className={`${CLASSE_CAMPO} h-20 resize-none`}
              />
              <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
                A mesma observação é gravada em cada uma das {assetIds.length} entregas.
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
                disabled={entregaEmLote.isPending || !alvoId || assetIds.length === 0}
                className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
              >
                {entregaEmLote.isPending ? 'Entregando...' : `Entregar ${assetIds.length}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * O que está selecionado, ANTES de escolher o alvo.
 *
 * Não é enfeite: a seleção pode ter vindo de uma página inteira marcada de uma
 * vez, e entregar 40 ativos para a pessoa errada é uma operação que só se
 * desfaz com 40 devoluções à mão.
 */
function Selecionados({
  assetIds, etiquetaPorId,
}: {
  assetIds: readonly string[];
  etiquetaPorId: Map<string, string>;
}) {
  return (
    <div className="border border-border-sutil bg-bg-base/50 p-4 space-y-2">
      <div className={ROTULO}>Ativos selecionados ({assetIds.length})</div>
      <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
        {assetIds.map((id) => (
          <span key={id} className="px-2 py-1 border border-border-sutil text-text-secondary">
            {/* Marcado em outra página: a etiqueta não está carregada, e mostrar
                o id é melhor do que omitir a linha da conta. */}
            {etiquetaPorId.get(id) ?? id}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * O RELATÓRIO — o que entrou e o que foi recusado, com o motivo de cada recusa.
 *
 * As duas listas aparecem SEMPRE que existem, e a de falhas nunca vira um
 * "alguns itens falharam": o motivo é diferente por linha ("já está entregue",
 * "só ativo disponível pode ser entregue"), e é o motivo que diz o que fazer
 * em seguida.
 */
function Relatorio({
  relatorio,
  etiquetaPorId,
  onClose,
}: {
  relatorio: RelatorioEntregaEmLote;
  /** A etiqueta de quem FALHOU não vem na resposta: o servidor só tem o id. */
  etiquetaPorId: Map<string, string>;
  onClose: () => void;
}) {
  return (
    <div className="p-6 font-mono text-xs overflow-y-auto max-h-[78vh] space-y-5">
      <p className="text-text-secondary leading-relaxed">
        {relatorio.ok.length} de {relatorio.total} {relatorio.total === 1 ? 'ativo entregue' : 'ativos entregues'}.
        {relatorio.falhas.length > 0 && ' As recusas estão abaixo, com o motivo de cada uma — elas não impediram as demais.'}
      </p>

      {relatorio.ok.length > 0 && (
        <div className="border border-border-sutil">
          <div className={`${ROTULO} px-4 py-2 border-b border-border-sutil bg-bg-base/50 flex items-center gap-2`}>
            <CheckCircle2 size={12} className="text-status-success" /> Entregues ({relatorio.ok.length})
          </div>
          <ul className="divide-y divide-border-sutil/50">
            {relatorio.ok.map((item) => (
              <li key={item.assetId} className="px-4 py-2 text-text-primary">{item.assetTag}</li>
            ))}
          </ul>
        </div>
      )}

      {relatorio.falhas.length > 0 && (
        <div className="border border-status-danger/30">
          <div className={`${ROTULO} px-4 py-2 border-b border-status-danger/30 bg-status-danger/10 flex items-center gap-2`}>
            <XCircle size={12} className="text-status-danger" /> Recusados ({relatorio.falhas.length})
          </div>
          <ul className="divide-y divide-border-sutil/50">
            {relatorio.falhas.map((falha) => (
              <li key={falha.assetId} className="px-4 py-2">
                <div className="text-text-primary">{etiquetaPorId.get(falha.assetId) ?? falha.assetId}</div>
                <div className="text-status-danger text-[10px] leading-relaxed">{falha.erro}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
  );
}
