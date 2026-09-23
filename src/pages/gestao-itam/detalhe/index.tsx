import { ArrowLeft, ArrowRightLeft, Copy, Edit2, PackageX, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFormModal from '../components/AssetFormModal';
import CheckoutModal from '../components/CheckoutModal';
import AssetTabs, { AbaFutura } from './components/AssetTabs';
import DetalhesTab from './components/DetalhesTab';
import FilesTab from './components/FilesTab';
import HistoryTab from './components/HistoryTab';
import PosseTab from './components/PosseTab';
import RetireModal from './components/RetireModal';
import { ABAS } from './helpers/abas.helper';
import { seloDaSaida } from '../helpers/descomissionamento.helper';
import { rotuloDaOperacao } from '../helpers/posse.helper';
import { useAssetDetail } from './hooks/useAssetDetail';

// A TELA DO ATIVO — `/itam/assets/:id`.
//
// Existe porque uma URL colada no navegador não tem a linha que a listagem
// tinha em memória: até a F2 o modal recebia o ativo já carregado pela tabela, e
// não havia como abrir um ativo direto. Ela começa por `GET /api/assets/:id`.
//
// Markup e mais nada: estado e chamadas ficam no `useAssetDetail`
// (docs/ARQUITETURA.md).

export default function AssetDetailPage() {
  const {
    asset, carregando, erro,
    aba, setAba,
    eventos, totalDeEventos, historicoPendente,
    assignments, possePendente,
    anexos, anexosPendentes, enviandoArquivo, erroDeArquivo, temImagem,
    handleAnexar, handleExcluirAnexo, handleTrocarImagem, handleRemoverImagem,
    modal, abrirEdicao, abrirClone, abrirPosse, abrirDescomissionar, fecharModal,
    handleSubmit, handleEntregar, handleDevolver, handleDescomissionar, handleReverterSaida,
    handleDelete,
  } = useAssetDetail();

  if (carregando) {
    return <div className="font-mono text-xs text-text-tertiary">Carregando ativo…</div>;
  }

  if (erro || !asset) {
    return (
      <div className="font-mono text-xs space-y-4">
        <div className="text-status-danger">{erro ?? 'Ativo não encontrado.'}</div>
        <Link to="/itam" className="flex items-center gap-2 text-text-tertiary hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Voltar para os ativos
        </Link>
      </div>
    );
  }

  // Cálculo fora do JSX (docs/ARQUITETURA.md).
  const selo = seloDaSaida(asset);
  const abaAtual = ABAS.find((item) => item.id === aba);

  return (
    <div className="animate-in fade-in duration-300 space-y-6 pb-6">
      <Link
        to="/itam"
        className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={13} /> Ativos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">{asset.assetTag}</h2>

            {/* A cor vem do banco (StatusLabel.color): vai por `style`, porque o
                Tailwind não gera classe a partir de string de runtime. */}
            <span
              className="px-2 py-1 border rounded-[2px] font-mono text-[10px] uppercase tracking-widest"
              style={asset.status.color
                ? { color: asset.status.color, borderColor: `${asset.status.color}33`, backgroundColor: `${asset.status.color}1a` }
                : undefined}
            >
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
          <Acao onClick={abrirPosse} icone={asset.posse?.assignmentId ? Undo2 : ArrowRightLeft}>
            {rotuloDaOperacao(asset.posse)}
          </Acao>
          <Acao onClick={abrirEdicao} icone={Edit2}>Editar</Acao>
          {/* Clonar é operação DE TELA: abre o formulário em modo criação com os
              valores deste ativo, sem etiqueta e sem série. Não há rota nova. */}
          <Acao onClick={abrirClone} icone={Copy}>Clonar</Acao>
          <Acao onClick={() => void handleDelete()} icone={Trash2} perigo>Lixeira</Acao>
        </div>
      </div>

      <AssetTabs ativa={aba} onChange={setAba} />

      <div className="bg-surface-card border border-border-sutil p-6 font-mono text-xs">
        {aba === 'detalhes' && (
          <DetalhesTab
            asset={asset}
            onDescomissionar={abrirDescomissionar}
            onReverterSaida={() => void handleReverterSaida()}
          />
        )}

        {aba === 'posse' && (
          <PosseTab
            posse={asset.posse}
            assignments={assignments}
            carregando={possePendente}
            onAbrirOperacao={abrirPosse}
          />
        )}

        {aba === 'historico' && (
          <HistoryTab eventos={eventos} total={totalDeEventos} carregando={historicoPendente} />
        )}

        {/* As quatro abas de fase futura são desabilitadas na barra; este ramo
            existe para a tela continuar íntegra se alguma delas for aberta por
            outro caminho. */}
        {aba === 'arquivos' && (
          <FilesTab
            assetId={asset.id}
            temImagem={temImagem}
            anexos={anexos}
            carregando={anexosPendentes}
            enviando={enviandoArquivo}
            erro={erroDeArquivo}
            onAnexar={handleAnexar}
            onExcluirAnexo={handleExcluirAnexo}
            onTrocarImagem={handleTrocarImagem}
            onRemoverImagem={handleRemoverImagem}
          />
        )}

        {abaAtual?.fase && <AbaFutura rotulo={abaAtual.rotulo} fase={abaAtual.fase} />}
      </div>

      {(modal === 'editar' || modal === 'clonar') && (
        <AssetFormModal
          asset={asset}
          clonar={modal === 'clonar'}
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

      {modal === 'descomissionar' && (
        <RetireModal asset={asset} onClose={fecharModal} onConfirmar={handleDescomissionar} />
      )}
    </div>
  );
}

interface AcaoProps {
  onClick: () => void;
  icone: typeof Edit2;
  perigo?: boolean;
  children: React.ReactNode;
}

function Acao({ onClick, icone: Icone, perigo, children }: AcaoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 border border-border-sutil transition-colors ${
        perigo
          ? 'text-text-tertiary hover:text-status-danger hover:bg-bg-base'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-base'
      }`}
    >
      <Icone size={13} /> {children}
    </button>
  );
}
