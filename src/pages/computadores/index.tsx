import {
  Copy, Monitor, PackageX, Pencil, Plus, RotateCcw, Trash2, Undo2, UserPlus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFormModal from './components/AssetFormModal';
import CheckoutModal from './components/CheckoutModal';
import RetireModal from './components/RetireModal';
import AcoesDaLinha from '../../components/AcoesDaLinha';
import CartoesDeContagem from '../../components/CartoesDeContagem';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import VistasDaLista from '../../components/VistasDaLista';
import { PontoDeStatus } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableLinha, TableNome, TableRow, TableSublinha } from '../../components/ui/table';
import { usePode } from '../../stores/auth.store';
import { motivoDaSaida } from './helpers/baixa.helper';
import { tomDoStatus } from '../../helpers/status.helper';
import { nomeDoResponsavel } from '../../helpers/responsavel.helper';
import { TRACO, bloqueioDaEntrega } from './helpers/posse.helper';
import { useAssets } from './hooks/useAssets';

export default function ComputadoresPage() {
  const {
    assets, total, contagens, contagensDosMotivos,
    baixados, page, perPage, setPage,
    search, buscaFeita, changeSearch, view, changeView,
    statusType, escolherStatus, retiredReasonId, escolherMotivo,
    categoryId, changeCategoria, loading, erro,
    modalAberto, emEdicao, clonando, statusPadraoId, openCreate, openEdit, openClone, closeModal, abrirDetalhe,
    handleSubmit, handleDelete, handleRestore,
    emPosse, openPosse, closePosse, handleEntregar,
    emBaixa, openBaixa, closeBaixa, handleDarBaixa, handleReverterSaida,
  } = useAssets();
  // Mandar para a lixeira, tirar de lá e Configurações são `SUPERVISOR` no
  // servidor (AV). Sem isto, quem não é veria a lixeira, o restaurar e o link de
  // Configurações, e os três só levariam 403 ou voltariam para a raiz.
  const podeDecidir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Computadores" />

      {/* Baixado não está Em uso nem Disponível: os cartões da vista são os motivos (BV). */}
      {view === 'retired'
        ? <CartoesDeContagem contagens={contagensDosMotivos} escolhido={retiredReasonId} onEscolher={escolherMotivo} />
        : <CartoesDeContagem contagens={contagens} escolhido={statusType} onEscolher={escolherStatus} />}

      <VistasDaLista
        valor={view}
        onChange={changeView}
        vistas={[
          { valor: 'active', rotulo: 'Ativos', icone: Monitor },
          { valor: 'retired', rotulo: 'Baixados', icone: PackageX, contagem: baixados },
          // A lixeira é `SUPERVISOR` no servidor (AV): sem ele, a vista não aparece.
          ...(podeDecidir ? [{ valor: 'trashed' as const, rotulo: 'Lixeira', icone: Trash2 }] : []),
        ]}
      />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por etiqueta, série, nome ou modelo…"
        filtros={<CategoriaFiltro tipo="ASSET" valor={categoryId} onChange={changeCategoria} />}
        acao={<Button onClick={openCreate}><Plus /> Novo computador</Button>}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <Card className="overflow-hidden">
        <Table className="min-w-[43rem] md:min-w-[53rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Etiqueta</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="hidden w-[12%] md:table-cell">Categoria</TableHead>
              <TableHead className="hidden w-[12%] md:table-cell">Localização</TableHead>
              <TableHead>Responsáveis</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>

          <TableBody>
            {assets.map((asset) => {
              // O cálculo da posse fica no helper, nunca no JSX
              // (docs/referencia/arquitetura.md). Aqui só se escolhe o que mostrar.
              const motivo = motivoDaSaida(asset);
              const bloqueio = bloqueioDaEntrega(asset);

              return (
                // A LINHA ABRE O DETALHE, e o `⋯` guarda as ações (AY). Na lixeira
                // também: a ficha de lá é só consulta (BW).
                <TableRow key={asset.id} onClick={() => abrirDetalhe(asset)}>
                  <TableCell>
                    <TableNome className="font-mono">{asset.assetTag}</TableNome>
                    {asset.serial && <TableSublinha className="font-mono">{asset.serial}</TableSublinha>}
                  </TableCell>
                  <TableCell>
                    <TableLinha>{asset.model.name}</TableLinha>
                    <TableSublinha>{asset.model.manufacturer.name}</TableSublinha>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{asset.model.category.name}</TableCell>
                  {/* No posto, ele está onde o posto fica (AW); `location` é para onde ele volta. */}
                  <TableCell className="hidden md:table-cell">{asset.postoAtual?.location.name ?? asset.location?.name ?? TRACO}</TableCell>
                  {/* RESPONSÁVEL — derivado (docs/referencia/modelo-de-posse.md, Camada 3).
                      Ou o posto ou a pessoa direta: quem ocupa o posto fica na aba Responsáveis (BL). */}
                  <TableCell>{nomeDoResponsavel(asset.posse) || TRACO}</TableCell>
                  {/* O motivo é o status do baixado (BV). */}
                  <TableCell title={motivo ?? asset.status.name}>
                    {motivo
                      ? <PontoDeStatus tom="perigo">{motivo}</PontoDeStatus>
                      : <PontoDeStatus tom={tomDoStatus(asset.status.type)}>{asset.status.name}</PontoDeStatus>}
                  </TableCell>

                  <TableCell>
                    <AcoesDaLinha
                      nome={asset.assetTag}
                      acoes={view === 'trashed'
                        ? [podeDecidir && { rotulo: 'Restaurar', icone: RotateCcw, onClick: () => void handleRestore(asset) }]
                        : [
                          // Entregar é OPERAÇÃO, não campo: mora aqui, ao lado do
                          // ativo, e não dentro do formulário. Travado, o `titulo`
                          // diz POR QUÊ — um botão apagado sem explicação parece
                          // defeito. O Devolver mora na ficha, como em Estoque (BN, BQ).
                          {
                            rotulo: 'Entregar',
                            icone: UserPlus,
                            onClick: () => openPosse(asset),
                            disabled: bloqueio !== null,
                            titulo: bloqueio ?? undefined,
                          },
                          { rotulo: 'Editar', icone: Pencil, onClick: () => openEdit(asset) },
                          // Clonar: o formulário abre em modo criação com os
                          // valores deste ativo, sem etiqueta e sem série.
                          { rotulo: 'Clonar', icone: Copy, onClick: () => openClone(asset) },
                          // Dar baixa e Reverter, como no `⋯` da ficha (BV).
                          podeDecidir && !motivo && { rotulo: 'Dar baixa', icone: PackageX, onClick: () => openBaixa(asset) },
                          podeDecidir && motivo !== null && {
                            rotulo: 'Reverter baixa',
                            icone: Undo2,
                            onClick: () => void handleReverterSaida(asset),
                          },
                          podeDecidir && {
                            rotulo: 'Excluir',
                            icone: Trash2,
                            onClick: () => void handleDelete(asset),
                            perigo: true,
                          },
                        ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {assets.length === 0 && (
          <ListaVazia
            icone={Monitor}
            carregando={loading}
            erro={erro}
            nome="computador"
            busca={buscaFeita}
            frase={view === 'trashed' ? 'A lixeira está vazia.' : view === 'retired' ? 'Nenhum computador baixado.' : undefined}
            filtrada={Boolean(statusType || retiredReasonId || categoryId)}
          >
            {/* Um ativo exige um modelo, e o modelo exige fabricante e categoria — é a
                ordem do Snipe-IT. Sem esta dica, o primeiro cadastro esbarra num seletor
                vazio. */}
            {view === 'active' && <span className="max-w-md text-center text-xs leading-relaxed">
              {podeDecidir ? (
                <>
                  Todo ativo pertence a um modelo. Cadastre o fabricante e o modelo em{' '}
                  <Link to="/configuracoes?aba=modelos" className="text-link hover:underline">Configurações</Link>
                  {' '}antes do primeiro ativo.
                </>
              ) : (
                'Todo computador pertence a um modelo. Peça a um supervisor que cadastre o fabricante e o modelo em Configurações antes do primeiro computador.'
              )}
            </span>}
          </ListaVazia>
        )}
      </Card>

      {modalAberto && (
        <AssetFormModal
          asset={emEdicao}
          clonar={clonando}
          statusPadraoId={statusPadraoId}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {emPosse && (
        <CheckoutModal
          asset={emPosse}
          onClose={closePosse}
          onEntregar={handleEntregar}
        />
      )}

      {emBaixa && <RetireModal asset={emBaixa} onClose={closeBaixa} onConfirmar={handleDarBaixa} />}
    </div>
  );
}
