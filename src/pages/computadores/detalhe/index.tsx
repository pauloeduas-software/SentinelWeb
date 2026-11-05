import { ArrowLeft, Copy, Pencil, Trash2, Undo2, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFormModal from '../components/AssetFormModal';
import CheckoutModal from '../components/CheckoutModal';
import AssetTabs from './components/AssetTabs';
import IdentificacaoCard from './components/IdentificacaoCard';
import LicensesTab from './components/LicensesTab';
import ComponentesTab from './components/ComponentesTab';
import MaquinaTab from './components/MaquinaTab';
import DetalhesTab from './components/DetalhesTab';
import HistoryTab from './components/HistoryTab';
import PosseTab from './components/PosseTab';
import RetireModal from './components/RetireModal';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import { Aviso } from '../../../components/ui/aviso';
import { Button } from '../../../components/ui/button';
import { TabsContent } from '../../../components/ui/tabs';
import { bloqueioDaEntrega, rotuloDaOperacao } from '../helpers/posse.helper';
import { useAssetDetail } from './hooks/useAssetDetail';
import { usePode } from '../../../stores/auth.store';

// A TELA DO ATIVO — `/computadores/:id`.
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
    licencas, licencasPendentes, erroDasLicencas,
    componentes, componentesPendentes, erroDosComponentes,
    maquina, maquinaPendente, desvinculando, handleDesvincular,
    modal, abrirEdicao, abrirClone, abrirPosse, abrirBaixa, fecharModal, statusPadraoId,
    handleSubmit, handleEntregar, handleDevolver, handleDarBaixa, handleReverterSaida,
    handleDelete,
  } = useAssetDetail();
  // A lixeira e a baixa são `SUPERVISOR` no servidor (`DELETE /api/assets/:id`,
  // `retire`, `unretire`); para quem não é, o botão só levaria 403. Antes dos `return` abaixo: hook depois de retorno
  // condicional é o que as regras do React proíbem.
  const podeExcluir = usePode('SUPERVISOR');

  if (carregando) {
    return <div className="text-sm text-text-tertiary">Carregando ativo…</div>;
  }

  if (erro || !asset) {
    return (
      <div className="space-y-4">
        <Aviso>{erro ?? 'Ativo não encontrado.'}</Aviso>
        <Link to="/computadores" className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary">
          <ArrowLeft className="size-4" /> Voltar para os computadores
        </Link>
      </div>
    );
  }

  // A MESMA trava da listagem, nas duas portas desta tela (cabeçalho e aba
  // Posse): só `DEPLOYABLE` se entrega, e o motivo vai no `title`.
  const bloqueio = bloqueioDaEntrega(asset);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho
        voltar={{ para: '/computadores', rotulo: 'Computadores' }}
        titulo={<span className="font-mono">{asset.assetTag}</span>}
        subtitulo={`${asset.model.manufacturer.name} ${asset.model.name}`}
        acao={
          <>
            <Button size="sm" onClick={abrirPosse} disabled={bloqueio !== null} title={bloqueio ?? undefined}>
              {asset.posse?.assignmentId ? <Undo2 /> : <UserPlus />} {rotuloDaOperacao(asset.posse)}
            </Button>
            <Button variant="outline" size="sm" onClick={abrirEdicao}><Pencil /> Editar</Button>
            <AcoesDaLinha
              nome={asset.assetTag}
              acoes={[
                // Clonar é operação DE TELA: abre o formulário em modo criação com
                // os valores deste ativo, sem etiqueta e sem série. Não há rota nova.
                { rotulo: 'Clonar', icone: Copy, onClick: abrirClone },
                podeExcluir && { rotulo: 'Excluir', icone: Trash2, onClick: () => void handleDelete(), perigo: true },
              ]}
            />
          </>
        }
      />

      <div className="space-y-6">
        <IdentificacaoCard asset={asset} />

        <AssetTabs ativa={aba} onChange={setAba}>
          <TabsContent value="detalhes" className="mt-4">
            <DetalhesTab
              asset={asset}
              onDarBaixa={podeExcluir ? abrirBaixa : undefined}
              onReverterSaida={podeExcluir ? () => void handleReverterSaida() : undefined}
            />
          </TabsContent>

          <TabsContent value="posse" className="mt-4">
            <PosseTab
              posse={asset.posse}
              assignments={assignments}
              carregando={possePendente}
              onAbrirOperacao={abrirPosse}
              bloqueio={bloqueio}
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <HistoryTab eventos={eventos} total={totalDeEventos} carregando={historicoPendente} />
          </TabsContent>

          <TabsContent value="licencas" className="mt-4">
            <LicensesTab
              licencas={licencas}
              assetTag={asset.assetTag}
              carregando={licencasPendentes}
              erro={erroDasLicencas}
            />
          </TabsContent>

          <TabsContent value="componentes" className="mt-4">
            <ComponentesTab
              componentes={componentes}
              assetTag={asset.assetTag}
              carregando={componentesPendentes}
              erro={erroDosComponentes}
            />
          </TabsContent>

          <TabsContent value="maquina" className="mt-4">
            <MaquinaTab
              maquina={maquina}
              carregando={maquinaPendente}
              desvinculando={desvinculando}
              onDesvincular={handleDesvincular}
            />
          </TabsContent>
        </AssetTabs>
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
