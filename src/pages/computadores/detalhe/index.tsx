import { Copy, PackageX, Pencil, RotateCcw, Trash2, Undo2, UserPlus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import AssetFormModal from '../components/AssetFormModal';
import CheckoutModal from '../components/CheckoutModal';
import RetireModal from '../components/RetireModal';
import AssetTabs from './components/AssetTabs';
import AvisoDaBaixa from './components/AvisoDaBaixa';
import { seloDaSaida } from '../helpers/baixa.helper';
import IdentificacaoCard from './components/IdentificacaoCard';
import LicensesTab from './components/LicensesTab';
import ComponentesTab from './components/ComponentesTab';
import DevolucaoModal from './components/DevolucaoModal';
import MaquinaTab from './components/MaquinaTab';
import HistoryTab from './components/HistoryTab';
import PosseTab from './components/PosseTab';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import AvisoDaLixeira from '../../../components/AvisoDaLixeira';
import { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import ListToolbar from '../../../components/ListToolbar';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import { Button } from '../../../components/ui/button';
import { TabsContent } from '../../../components/ui/tabs';
import { POR_PAGINA } from '../../../hooks/useListaNaUrl';
import { rotuloDaVolta } from '../../../hooks/useVoltaComFiltros';
import { bloqueioDaEntrega } from '../helpers/posse.helper';
import { useAssetDetail } from './hooks/useAssetDetail';
import { usePode } from '../../../stores/auth.store';

// A TELA DO ATIVO — `/computadores/:id`.
//
// Existe porque uma URL colada no navegador não tem a linha que a listagem
// tinha em memória: antes o modal recebia o ativo já carregado pela tabela, e
// não havia como abrir um ativo direto. Ela começa por `GET /api/assets/:id`.
//
// Markup e mais nada: estado e chamadas ficam no `useAssetDetail`
// (docs/referencia/arquitetura.md).

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Outro computador é outra ficha, e o Clonar abre uma sem sair daqui: a busca e as
  // páginas não passam de um para o outro.
  return <FichaDoComputador key={id} />;
}

function FichaDoComputador() {
  const {
    asset, carregando, erro, voltar,
    aba, setAba, contagens, responsaveis, abrirPosto,
    eventos, totalDeEventos, paginaDoHistorico, setPaginaDoHistorico, historicoPendente, erroDoHistorico,
    licencas, licencasPendentes, erroDasLicencas,
    componentes, componentesPendentes, erroDosComponentes,
    maquina, maquinaPendente, erroDaMaquina,
    modal, abrirEdicao, abrirClone, abrirEntrega, abrirDevolucao, abrirBaixa, fecharModal, statusPadraoId,
    handleSubmit, handleEntregar, handleDevolver, handleDarBaixa, handleReverterSaida,
    handleDelete, handleRestaurar,
  } = useAssetDetail();
  // A lixeira e a baixa são `SUPERVISOR` no servidor (`DELETE /api/assets/:id`,
  // `retire`, `unretire`); para quem não é, o botão só levaria 403. Antes dos `return` abaixo: hook depois de retorno
  // condicional é o que as regras do React proíbem.
  const podeExcluir = usePode('SUPERVISOR');

  const rotulo = rotuloDaVolta(voltar.para, 'Computadores');

  if (carregando || erro || !asset) {
    return <FichaIndisponivel lista="Computadores" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Ativo não encontrado.'} />;
  }

  // A MESMA trava da listagem: só `DEPLOYABLE` sem posse se entrega, e o motivo vai no `title`.
  const bloqueio = bloqueioDaEntrega(asset);
  const baixado = seloDaSaida(asset) !== null;
  const naLixeira = Boolean(asset.deletedAt);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho
        voltar={{ ...voltar, rotulo }}
        titulo={<span className="font-mono">{asset.assetTag}</span>}
      />

      <div className="space-y-6">
        <IdentificacaoCard
          asset={asset}
          acoes={naLixeira ? (
            <Button size="sm" onClick={() => void handleRestaurar()}><RotateCcw /> Restaurar</Button>
          ) : (
            <>
              <Button size="sm" onClick={abrirEntrega} disabled={bloqueio !== null} title={bloqueio ?? undefined}>
                <UserPlus /> Entregar
              </Button>
              <Button variant="outline" size="sm" onClick={abrirEdicao}><Pencil /> Editar</Button>
              <AcoesDaLinha
                nome={asset.assetTag}
                acoes={[
                  // Clonar é operação DE TELA: abre o formulário em modo criação com
                  // os valores deste ativo, sem etiqueta e sem série. Não há rota nova.
                  { rotulo: 'Clonar', icone: Copy, onClick: abrirClone },
                  podeExcluir && !baixado && { rotulo: 'Dar baixa', icone: PackageX, onClick: abrirBaixa },
                  podeExcluir && baixado && { rotulo: 'Reverter baixa', icone: Undo2, onClick: () => void handleReverterSaida() },
                  podeExcluir && { rotulo: 'Excluir', icone: Trash2, onClick: () => void handleDelete(), perigo: true },
                ]}
              />
            </>
          )}
        />

        {asset.deletedAt && <AvisoDaLixeira excluidoEm={asset.deletedAt} restaurePara="editar, entregar ou dar baixa" />}
        <AvisoDaBaixa asset={asset} />

        <AssetTabs ativa={aba} onChange={setAba} contagens={contagens}>
          <TabsContent value="responsaveis" className="mt-4 space-y-4">
            <ListToolbar
              search={responsaveis.busca}
              onSearchChange={responsaveis.mudarBusca}
              placeholder="Buscar por responsável ou posto…"
              page={responsaveis.page}
              perPage={POR_PAGINA}
              total={responsaveis.total}
              onPageChange={responsaveis.setPage}
            />
            <PosseTab
              posse={responsaveis.visiveis[0]}
              vazio={responsaveis.buscaAdiada ? `Nenhum responsável com "${responsaveis.buscaAdiada}" neste computador.` : undefined}
              onAbrirPosto={abrirPosto}
              onDevolver={abrirDevolucao}
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <HistoryTab
              eventos={eventos}
              pagina={{ page: paginaDoHistorico, total: totalDeEventos, onPageChange: setPaginaDoHistorico }}
              carregando={historicoPendente}
              erro={erroDoHistorico}
            />
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
              erro={erroDaMaquina}
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

      {modal === 'entregar' && <CheckoutModal asset={asset} onClose={fecharModal} onEntregar={handleEntregar} />}

      {modal === 'devolver' && <DevolucaoModal asset={asset} onClose={fecharModal} onDevolver={handleDevolver} />}

      {modal === 'baixa' && (
        <RetireModal asset={asset} onClose={fecharModal} onConfirmar={handleDarBaixa} />
      )}
    </div>
  );
}
