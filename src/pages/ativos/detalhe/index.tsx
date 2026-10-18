import { ArrowLeft, ArrowRightLeft, Copy, Edit2, PackageX, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFormModal from '../components/AssetFormModal';
import CheckoutModal from '../components/CheckoutModal';
import AssetTabs from './components/AssetTabs';
import LicensesTab from './components/LicensesTab';
import MaquinaTab from './components/MaquinaTab';
import DetalhesTab from './components/DetalhesTab';
import HistoryTab from './components/HistoryTab';
import PosseTab from './components/PosseTab';
import RetireModal from './components/RetireModal';
import { seloDaSaida } from '../helpers/baixa.helper';
import { bloqueioDaEntrega, rotuloDaOperacao } from '../helpers/posse.helper';
import { useAssetDetail } from './hooks/useAssetDetail';
import { usePode } from '../../../domain/auth/auth.store';

// A TELA DO ATIVO — `/ativos/:id`.
//
// Existe porque uma URL colada no navegador não tem a linha que a listagem
// tinha em memória: até a F2 o modal recebia o ativo já carregado pela tabela, e
// não havia como abrir um ativo direto. Ela começa por `GET /api/assets/:id`.
//
// Markup e mais nada: estado e chamadas ficam no `useAssetDetail`
// (docs/referencia/arquitetura.md).

export default function AssetDetailPage() {
  const {
    asset, carregando, erro,
    aba, setAba,
    eventos, totalDeEventos, historicoPendente,
    assignments, possePendente,
    licencas, licencasPendentes,
    maquina, maquinaPendente, desvinculando, handleDesvincular,
    modal, abrirEdicao, abrirClone, abrirPosse, abrirBaixa, fecharModal, statusPadraoId,
    handleSubmit, handleEntregar, handleDevolver, handleDarBaixa, handleReverterSaida,
    handleDelete,
  } = useAssetDetail();
  // A lixeira é `ADMIN` no servidor (`DELETE /api/assets/:id`); para o técnico
  // o botão só levava 403. Antes dos `return` abaixo: hook depois de retorno
  // condicional é o que as regras do React proíbem.
  const podeExcluir = usePode('ADMIN');

  if (carregando) {
    return <div className="font-mono text-xs text-text-tertiary">Carregando ativo…</div>;
  }

  if (erro || !asset) {
    return (
      <div className="font-mono text-xs space-y-4">
        <div className="text-status-danger">{erro ?? 'Ativo não encontrado.'}</div>
        <Link to="/ativos" className="flex items-center gap-2 text-text-tertiary hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Voltar para os ativos
        </Link>
      </div>
    );
  }

  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const selo = seloDaSaida(asset);
  // A MESMA trava da listagem, nas duas portas desta tela (cabeçalho e aba
  // Posse): só `DEPLOYABLE` se entrega, e o motivo vai no `title`.
  const bloqueio = bloqueioDaEntrega(asset);

  return (
    <div className="motion-safe:animate-fade-in space-y-6 pb-6">
      <Link
        to="/ativos"
        className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={13} /> Ativos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">{asset.assetTag}</h2>

            <span className="px-2 py-1 border border-border-sutil rounded-[2px] text-text-secondary font-mono text-[10px] uppercase tracking-widest">
              {asset.status.name}
            </span>

            {selo && (
              <span className="flex items-center gap-1.5 px-2 py-1 border border-status-warning/30 bg-status-warning/10 text-status-warning font-mono text-[10px] uppercase tracking-widest">
                <PackageX size={11} /> {selo}
              </span>
            )}
          </div>

          <div className="font-mono text-xs text-text-tertiary">
            {asset.model.manufacturer.name} {asset.model.name}
            {asset.name && <> · {asset.name}</>}
            {asset.serial && <> · SN {asset.serial}</>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <Acao onClick={abrirPosse} icone={asset.posse?.assignmentId ? Undo2 : ArrowRightLeft} bloqueio={bloqueio}>
            {rotuloDaOperacao(asset.posse)}
          </Acao>
          <Acao onClick={abrirEdicao} icone={Edit2}>Editar</Acao>
          {/* Clonar é operação DE TELA: abre o formulário em modo criação com os
              valores deste ativo, sem etiqueta e sem série. Não há rota nova. */}
          <Acao onClick={abrirClone} icone={Copy}>Clonar</Acao>
          {podeExcluir && <Acao onClick={() => void handleDelete()} icone={Trash2} perigo>Lixeira</Acao>}
        </div>
      </div>

      <AssetTabs ativa={aba} onChange={setAba} />

      <div className="bg-surface-card border border-border-sutil p-6 font-mono text-xs">
        {aba === 'detalhes' && (
          <DetalhesTab
            asset={asset}
            onDarBaixa={abrirBaixa}
            onReverterSaida={() => void handleReverterSaida()}
          />
        )}

        {aba === 'posse' && (
          <PosseTab
            posse={asset.posse}
            assignments={assignments}
            carregando={possePendente}
            onAbrirOperacao={abrirPosse}
            bloqueio={bloqueio}
          />
        )}

        {aba === 'historico' && (
          <HistoryTab eventos={eventos} total={totalDeEventos} carregando={historicoPendente} />
        )}

        {aba === 'licencas' && (
          <LicensesTab licencas={licencas} carregando={licencasPendentes} />
        )}

        {aba === 'maquina' && (
          <MaquinaTab
            maquina={maquina}
            carregando={maquinaPendente}
            desvinculando={desvinculando}
            onDesvincular={handleDesvincular}
          />
        )}
      </div>

      {(modal === 'editar' || modal === 'clonar') && (
        <AssetFormModal
          asset={asset}
          clonar={modal === 'clonar'}
          statusPadraoId={statusPadraoId}
          onClose={fecharModal}
          onSubmit={handleSubmit}
        />
      )}

      {modal === 'posse' && (
        <CheckoutModal
          asset={asset}
          onClose={fecharModal}
          onEntregar={handleEntregar}
          onDevolver={handleDevolver}
        />
      )}

      {modal === 'baixa' && (
        <RetireModal asset={asset} onClose={fecharModal} onConfirmar={handleDarBaixa} />
      )}
    </div>
  );
}

interface AcaoProps {
  onClick: () => void;
  icone: typeof Edit2;
  perigo?: boolean;
  /** Preenchido, a ação fica travada e o texto vira o `title` — o porquê. */
  bloqueio?: string | null;
  children: React.ReactNode;
}

function Acao({ onClick, icone: Icone, perigo, bloqueio, children }: AcaoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bloqueio != null}
      title={bloqueio ?? undefined}
      className={`flex items-center gap-2 px-3 py-2 border border-border-sutil transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        perigo
          ? 'text-text-tertiary hover:text-status-danger hover:bg-bg-base'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-base'
      }`}
    >
      <Icone size={13} /> {children}
    </button>
  );
}
