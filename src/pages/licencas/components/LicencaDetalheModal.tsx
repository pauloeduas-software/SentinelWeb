import { X } from 'lucide-react';
import AssentosGrade from './AssentosGrade';
import ConformidadeLicenca from './ConformidadeLicenca';
import HistoricoLicenca from './HistoricoLicenca';
import {
  useLicenseHistoryQuery, useLicenseQuery, useLicenseSeatsQuery,
} from '../../../domain/license/license.queries';
import type { Licenca } from '../../../domain/shared/license.types';
import type { AvisoDeQueima } from '../hooks/useLicencas';
import { corDoStatus, textoDoPrazo } from '../helpers/licenca.helper';
import { formatarMoeda } from '../../helpers/format.helper';

// O DETALHE DA LICENÇA: a grade de assentos e o histórico.
//
// ═════════════════════════════════════════════════════════════════════════════
// A CHAVE REVELADA VIVE EM `useState`, NUNCA NO CACHE.
//
// `useRevealProductKey` é `useMutation` mesmo sendo um GET, e a razão está do
// lado do servidor: cada leitura daquela rota grava `VIEW_KEY` no
// `ActivityLog`. Com `useQuery`, o refetch automático do TanStack encheria a
// trilha de "quem viu o segredo" com leituras que ninguém pediu — e a única
// pergunta que ela existe para responder ficaria afogada.
//
// Aqui ela fica num `useState` que morre junto com o modal. Fechar a janela
// apaga a chave da memória do navegador.
// ═════════════════════════════════════════════════════════════════════════════

interface LicencaDetalheModalProps {
  licenca: Licenca;
  onClose: () => void;
  /**
   * `aviso` nulo = devolução comum. Preenchido = a devolução QUEIMA, e são
   * estes números — os do `detalhe`, recém-consultados — que entram na frase
   * da confirmação. A linha da listagem não serve: depois de duas devoluções
   * nesta mesma janela ela já está velha.
   */
  onDevolver: (seatId: string, aviso: AvisoDeQueima | null) => void;
}

const ROTULO = 'text-text-tertiary uppercase tracking-widest text-[10px]';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className={ROTULO}>{rotulo}</span>
      <div className="text-text-secondary">{children}</div>
    </div>
  );
}

export default function LicencaDetalheModal({ licenca, onClose, onDevolver }: LicencaDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz a MÁSCARA e as contagens frescas logo em seguida.
  const { data: detalhe } = useLicenseQuery(licenca.id);
  const { data: assentos } = useLicenseSeatsQuery(licenca.id);
  const { data: eventos, isPending: historicoPendente } = useLicenseHistoryQuery(licenca.id);

  const atual = detalhe ?? licenca;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">{atual.name}</h2>
            <p className="font-mono text-[10px] mt-1">
              <span style={{ color: corDoStatus(atual.status) }}>{atual.status}</span>
              <span className="text-text-tertiary"> · {textoDoPrazo(atual.diasParaVencer)}</span>
              {!atual.reassignable && <span className="text-status-warning"> · não reatribuível</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 font-mono text-xs space-y-6 overflow-y-auto">

          {/* A CONTA, aberta. `livres + ocupados + queimados` fecha em
              `seatsTotal`; `aposentados` fica de fora porque já saiu do
              contrato quando ele encolheu — mostrá-lo ao lado é o que explica
              a grade ter mais quadrados que o total. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Campo rotulo="Contrato">{atual.seatsTotal}</Campo>
            <Campo rotulo="Livres"><span className="text-status-success">{atual.livres}</span></Campo>
            <Campo rotulo="Ocupados">{atual.ocupados}</Campo>
            <Campo rotulo="Queimados"><span className={atual.queimados > 0 ? 'text-status-danger' : ''}>{atual.queimados}</span></Campo>
            <Campo rotulo="Aposentados">{atual.aposentados}</Campo>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo rotulo="Categoria">{atual.category?.name ?? '—'}</Campo>
            <Campo rotulo="Fabricante">{atual.manufacturer?.name ?? '—'}</Campo>
            <Campo rotulo="Fornecedor">{atual.supplier?.name ?? '—'}</Campo>
            <Campo rotulo="Custo">{formatarMoeda(atual.purchaseCost)}</Campo>
            <Campo rotulo="Licenciado para">{atual.licensedToName ?? '—'}</Campo>
            <Campo rotulo="E-mail">{atual.licensedToEmail ?? '—'}</Campo>
            <Campo rotulo="Pedido">{atual.orderNumber ?? '—'}</Campo>
            <Campo rotulo="Manutenção">{atual.maintained ? 'Sim' : 'Não'}</Campo>
          </div>

          {atual.notes && <Campo rotulo="Notas">{atual.notes}</Campo>}

          <div className="space-y-3">
            <span className={ROTULO}>Assentos</span>
            <AssentosGrade
              assentos={assentos ?? []}
              queimaAoDevolver={!atual.reassignable}
              onDevolver={(seatId) => onDevolver(
                seatId,
                atual.reassignable
                  ? null
                  : { seatsTotal: atual.seatsTotal, queimados: atual.queimados },
              )}
            />
          </div>

          {/* CONFORMIDADE entre os assentos e o histórico, e não numa aba
              separada: a pergunta "este contrato está sendo cumprido?" se
              responde olhando a grade de assentos e o cruzamento com o software
              instalado ao mesmo tempo. Separar os dois faria quem lê a grade
              concluir que 8 de 10 ocupados significa conformidade — e ocupado
              por quem não tem o programa instalado é assento pago à toa. */}
          <div className="space-y-3">
            <span className={ROTULO}>Conformidade</span>
            <ConformidadeLicenca licenseId={licenca.id} />
          </div>

          <div className="space-y-3">
            <span className={ROTULO}>Histórico</span>
            <HistoricoLicenca eventos={eventos ?? []} carregando={historicoPendente} />
          </div>
        </div>
      </div>
    </div>
  );
}
