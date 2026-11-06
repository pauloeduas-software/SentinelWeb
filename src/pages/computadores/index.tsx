import {
  Copy, Monitor, PackageX, Pencil, Plus, RotateCcw, Trash2, Undo2, UserPlus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFormModal from './components/AssetFormModal';
import CheckoutModal from './components/CheckoutModal';
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
import { formatarData, formatarMoeda } from '../../helpers/format.helper';
import { seloDaSaida } from './helpers/baixa.helper';
import { tomDoStatus } from '../../helpers/status.helper';
import {
  TRACO, bloqueioDaEntrega, resumoDaPosse, rotuloDaOperacao,
} from './helpers/posse.helper';
import { useAssets } from './hooks/useAssets';

export default function ComputadoresPage() {
  const {
    assets, total, contagens,
    baixados, page, perPage, setPage,
    search, buscaFeita, changeSearch, view, changeView,
    statusId, escolherStatus,
    categoryId, changeCategoria, loading, erro,
    modalAberto, emEdicao, clonando, statusPadraoId, openCreate, openEdit, openClone, closeModal, abrirDetalhe,
    handleSubmit, handleDelete, handleRestore,
    emPosse, openPosse, closePosse, handleEntregar, handleDevolver,
  } = useAssets();
  // Mandar para a lixeira, tirar de lá e Configurações são `SUPERVISOR` no
  // servidor (AV). Sem isto, quem não é veria a lixeira, o restaurar e o link de
  // Configurações, e os três só levariam 403 ou voltariam para a raiz.
  const podeDecidir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Computadores" />

      <CartoesDeContagem contagens={contagens} escolhido={statusId} onEscolher={escolherStatus} />

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
        acao={<Button onClick={openCreate}><Plus /> Novo ativo</Button>}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <Card className="overflow-hidden">
        <Table className="min-w-[52rem] md:min-w-[62rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Etiqueta</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="hidden w-[12%] md:table-cell">Categoria</TableHead>
              <TableHead className="hidden w-[12%] md:table-cell">Localização</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="w-36">Compra</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>

          <TableBody>
            {assets.map((asset) => {
              // O cálculo da posse fica no helper, nunca no JSX
              // (docs/referencia/arquitetura.md). Aqui só se escolhe o que mostrar.
              const posse = resumoDaPosse(asset.posse);
              const selo = seloDaSaida(asset);
              const bloqueio = bloqueioDaEntrega(asset);

              return (
                // A LINHA ABRE O DETALHE, e o `⋯` guarda as ações (AY). Na lixeira não há o
                // que abrir: o servidor responde 404, e a linha só restaura.
                <TableRow key={asset.id} onClick={view === 'trashed' ? undefined : () => abrirDetalhe(asset)}>
                  <TableCell>
                    <TableNome className="font-mono">{asset.assetTag}</TableNome>
                    {asset.serial && <TableSublinha className="font-mono">SN {asset.serial}</TableSublinha>}
                  </TableCell>
                  <TableCell>
                    <TableLinha>{asset.model.name}</TableLinha>
                    <TableSublinha>{asset.model.manufacturer.name}</TableSublinha>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{asset.model.category.name}</TableCell>
                  <TableCell className="hidden md:table-cell">{asset.location?.name ?? TRACO}</TableCell>
                  {/* RESPONSÁVEL — derivado, e pode ser mais de um: os ocupantes
                      do posto para o qual o ativo foi entregue aparecem juntos,
                      cada um com o turno (docs/referencia/modelo-de-posse.md, Camada 3). */}
                  <TableCell>
                    <TableLinha>{posse.quantos > 0 ? posse.responsaveis : TRACO}</TableLinha>
                    {posse.detalheAlvo && <TableSublinha>{posse.detalheAlvo}</TableSublinha>}
                  </TableCell>
                  <TableCell>
                    {/* O valor só para quem vê o custo (D77, AV); a data, para todos. */}
                    {asset.purchaseCost != null && <TableLinha>{formatarMoeda(asset.purchaseCost)}</TableLinha>}
                    {asset.purchaseCost != null
                      ? <TableSublinha>{formatarData(asset.purchaseDate)}</TableSublinha>
                      : <TableLinha>{formatarData(asset.purchaseDate)}</TableLinha>}
                  </TableCell>
                  {/* O baixado diz quando saiu: é a situação dele agora. */}
                  <TableCell title={selo ?? asset.status.name}>
                    {selo
                      ? <PontoDeStatus tom="aviso">{selo}</PontoDeStatus>
                      : <PontoDeStatus tom={tomDoStatus(asset.status.type)}>{asset.status.name}</PontoDeStatus>}
                  </TableCell>

                  <TableCell>
                    <AcoesDaLinha
                      nome={asset.assetTag}
                      acoes={view === 'trashed'
                        ? [podeDecidir && { rotulo: 'Restaurar', icone: RotateCcw, onClick: () => void handleRestore(asset) }]
                        : [
                          // Entregar/devolver é OPERAÇÃO, não campo: mora aqui,
                          // ao lado do ativo, e não dentro do formulário.
                          // Travado, o `titulo` diz POR QUÊ — um botão apagado
                          // sem explicação parece defeito.
                          {
                            rotulo: rotuloDaOperacao(asset.posse),
                            icone: posse.entregue ? Undo2 : UserPlus,
                            onClick: () => openPosse(asset),
                            disabled: bloqueio !== null,
                            titulo: bloqueio ?? undefined,
                          },
                          { rotulo: 'Editar', icone: Pencil, onClick: () => openEdit(asset) },
                          // Clonar: o formulário abre em modo criação com os
                          // valores deste ativo, sem etiqueta e sem série.
                          { rotulo: 'Clonar', icone: Copy, onClick: () => openClone(asset) },
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
            nome="ativo"
            busca={buscaFeita}
            frase={view === 'trashed' ? 'A lixeira está vazia.' : view === 'retired' ? 'Nenhum ativo baixado.' : undefined}
            filtrada={Boolean(statusId || categoryId)}
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
                'Todo ativo pertence a um modelo. Peça a um supervisor que cadastre o fabricante e o modelo em Configurações antes do primeiro ativo.'
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
          onDevolver={handleDevolver}
        />
      )}
    </div>
  );
}
