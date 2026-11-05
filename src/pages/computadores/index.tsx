import {
  Copy, Monitor, PackageX, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, Undo2, UserPlus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFilterBar from './components/AssetFilterBar';
import AssetFormModal from './components/AssetFormModal';
import CheckoutModal from './components/CheckoutModal';
import ColunasMenu from './components/ColunasMenu';
import AcoesDaLinha from '../../components/AcoesDaLinha';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import EstadoDaLista from '../../components/EstadoDaLista';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { usePode } from '../../stores/auth.store';
import { cn } from '../../helpers/cn.helper';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';
import { seloDaSaida } from './helpers/baixa.helper';
import {
  TRACO, bloqueioDaEntrega, resumoDaPosse, rotuloDaOperacao, tomDoStatus,
} from './helpers/posse.helper';
import { useAssets } from './hooks/useAssets';
import { useColunas } from './hooks/useColunas';

export default function ComputadoresPage() {
  const {
    assets, total, totalCadastrado, porStatus,
    baixados, page, perPage, setPage,
    search, changeSearch, view, changeView,
    statusId, statusFiltrado, toggleStatus, limparStatus,
    categoryId, changeCategoria, loading, erro,
    modalAberto, emEdicao, clonando, statusPadraoId, openCreate, openEdit, openClone, closeModal, abrirDetalhe,
    handleSubmit, handleDelete, handleRestore,
    emPosse, openPosse, closePosse, handleEntregar, handleDevolver,
  } = useAssets();
  // Mandar para a lixeira, tirar de lá e Configurações são `SUPERVISOR` no
  // servidor (AV). Sem isto, quem não é veria a lixeira, o restaurar e o link de
  // Configurações, e os três só levariam 403 ou voltariam para a raiz.
  const podeDecidir = usePode('SUPERVISOR');

  // AS COLUNAS VISÍVEIS (F10, Etapa B). Preferência do navegador, não do
  // servidor: ninguém a consulta e ela não é fato sobre o inventário
  // (docs/referencia/arquitetura.md, *client state*).
  const colunas = useColunas();

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho
        titulo="Computadores"
        subtitulo={
          <span className="flex flex-wrap items-center gap-1">
            <span className="mr-1">{totalCadastrado} {totalCadastrado === 1 ? 'ativo' : 'ativos'}</span>
            {porStatus.map((status) => (
              // O contador agora FILTRA: clicar liga `?statusId=`, clicar de
              // novo desliga. Antes o número existia e não levava a lugar
              // nenhum, porque a API não aceitava filtro por status.
              <button
                key={status.id}
                type="button"
                onClick={() => toggleStatus(status.id)}
                title={`Filtrar por ${status.name}`}
                aria-pressed={statusId === status.id}
                className={cn(
                  'rounded-md px-2 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground',
                  statusId === status.id && 'bg-accent text-accent-foreground',
                )}
              >
                {status.name} <span className="tabular-nums">{status.total}</span>
              </button>
            ))}
          </span>
        }
        acao={
          <>
            <ColunasMenu
              catalogo={colunas.catalogo}
              visiveis={colunas.visiveis}
              personalizado={colunas.personalizado}
              onAlternar={colunas.alternar}
              onRestaurar={colunas.restaurar}
            />
            <Button onClick={openCreate}><Plus /> Novo ativo</Button>
          </>
        }
      />

      <AssetFilterBar
        view={view}
        onViewChange={changeView}
        baixados={baixados}
        statusFiltrado={statusFiltrado}
        onLimparStatus={limparStatus}
        comLixeira={podeDecidir}
      />

      {/* Sem as abas do `ListToolbar`: as vistas do ativo são três e moram no
          `AssetFilterBar` (D20). Aqui ficam busca e paginação, que são de toda
          listagem do sistema. */}
      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por etiqueta, série, nome, modelo ou fabricante..."
        filtros={<CategoriaFiltro tipo="ASSET" valor={categoryId} onChange={changeCategoria} />}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      {assets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
          <Monitor className="size-6 opacity-50" />
          <EstadoDaLista carregando={loading} erro={erro}>
            {view === 'trashed' ? (
              <span>A lixeira está vazia.</span>
            ) : view === 'retired' ? (
              <span>Nenhum ativo baixado.</span>
            ) : search ? (
              <span>Nenhum ativo encontrado para "{search}".</span>
            ) : statusId ? (
              <span>Nenhum ativo com este status.</span>
            ) : categoryId ? (
              <span>Nenhum ativo nesta categoria.</span>
            ) : (
              <>
                <span>Nenhum ativo cadastrado.</span>
                {/* Um ativo exige um modelo, e o modelo exige fabricante e
                    categoria — é a ordem do Snipe-IT. Sem esta dica, o
                    primeiro cadastro esbarra num seletor vazio. */}
                <span className="max-w-md text-center text-xs leading-relaxed">
                  {podeDecidir ? (
                    <>
                      Todo ativo pertence a um modelo. Cadastre o fabricante e o modelo em{' '}
                      <Link to="/configuracoes" className="text-primary hover:underline">Configurações</Link>
                      {' '}antes do primeiro ativo.
                    </>
                  ) : (
                    'Todo ativo pertence a um modelo. Peça a um supervisor que cadastre o fabricante e o modelo em Configurações antes do primeiro ativo.'
                  )}
                </span>
              </>
            )}
          </EstadoDaLista>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {/* O CABEÇALHO E A CÉLULA consultam o MESMO `mostrar()`, e é só
                    isso que os mantém alinhados. Iterar a lista de tokens e
                    desenhar a célula por token seria mais curto e exigiria uma
                    função de render por coluna — o que levaria o JSX de status,
                    de posse e de compra (que não são texto: são selo, lista com
                    turno e duas linhas) para dentro de um helper. */}
                {colunas.mostrar('assetTag') && <TableHead>Etiqueta</TableHead>}
                {colunas.mostrar('model') && <TableHead>Modelo</TableHead>}
                {colunas.mostrar('category') && <TableHead>Categoria</TableHead>}
                {colunas.mostrar('status') && <TableHead>Status</TableHead>}
                {colunas.mostrar('location') && <TableHead>Localização</TableHead>}
                {colunas.mostrar('responsible') && <TableHead>Responsável</TableHead>}
                {colunas.mostrar('purchase') && <TableHead>Compra</TableHead>}
                {colunas.mostrar('name') && <TableHead>Nome</TableHead>}
                {colunas.mostrar('orderNumber') && <TableHead>Nº do pedido</TableHead>}
                <TableHead className="w-12 text-right">Ações</TableHead>
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
                  <TableRow
                    key={asset.id}
                    // A LINHA ABRE O DETALHE, e o `⋯` guarda as ações (AY). Na lixeira
                    // não há o que abrir: o servidor responde 404, e a linha só restaura.
                    onClick={view === 'trashed' ? undefined : () => abrirDetalhe(asset)}
                    className={view === 'trashed' ? undefined : 'cursor-pointer'}
                  >
                    {colunas.mostrar('assetTag') && (
                      <TableCell className="whitespace-nowrap">
                        {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                        <button type="button" className="text-left font-mono font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                          {asset.assetTag}
                        </button>
                        {asset.serial && <div className="mt-0.5 font-mono text-xs text-text-tertiary">SN {asset.serial}</div>}
                        {selo && (
                          <div className="mt-1">
                            <Badge tom="aviso"><PackageX className="size-3 shrink-0" /> {selo}</Badge>
                          </div>
                        )}
                      </TableCell>
                    )}
                    {colunas.mostrar('model') && (
                      <TableCell>
                        <div>{asset.model.name}</div>
                        <div className="mt-0.5 text-xs text-text-tertiary">{asset.model.manufacturer.name}</div>
                      </TableCell>
                    )}
                    {colunas.mostrar('category') && (
                      <TableCell>{asset.model.category.name}</TableCell>
                    )}
                    {colunas.mostrar('status') && (
                      <TableCell>
                        <Badge tom={tomDoStatus(asset.status.type)}>{asset.status.name}</Badge>
                      </TableCell>
                    )}
                    {colunas.mostrar('location') && (
                      <TableCell>{asset.location?.name ?? TRACO}</TableCell>
                    )}
                    {/* RESPONSÁVEL — derivado, e pode ser mais de um: os ocupantes
                        do posto para o qual o ativo foi entregue aparecem juntos,
                        cada um com o turno (docs/referencia/modelo-de-posse.md, Camada 3). */}
                    {colunas.mostrar('responsible') && (
                      <TableCell>
                        {posse.quantos > 0 ? <div>{posse.responsaveis}</div> : TRACO}

                        {posse.detalheAlvo && (
                          <div className="mt-0.5 text-xs text-text-tertiary">{posse.detalheAlvo}</div>
                        )}

                        {/* Posto vago: equipamento parado em mesa sem ninguém. É sinal
                            operacional, por isso tem cor — some assim que alguém
                            ocupar o posto. */}
                        {posse.postoVago && (
                          <div className="mt-1">
                            <Badge tom="aviso"><TriangleAlert className="size-3 shrink-0" /> Posto vago</Badge>
                          </div>
                        )}
                      </TableCell>
                    )}
                    {colunas.mostrar('purchase') && (
                      <TableCell className="whitespace-nowrap">
                        {/* O valor só para quem vê o custo (D77, AV); a data, para todos. */}
                        {asset.purchaseCost != null && <div className="tabular-nums">{formatarMoeda(asset.purchaseCost)}</div>}
                        <div className={cn('tabular-nums', asset.purchaseCost != null && 'mt-0.5 text-xs text-text-tertiary')}>
                          {formatarData(asset.purchaseDate)}
                        </div>
                      </TableCell>
                    )}

                    {/* AS QUE O SELETOR TROUXE. Vinham no payload da listagem desde
                        a F1 — nenhuma custa consulta a mais. */}
                    {colunas.mostrar('name') && <TableCell>{asset.name || TRACO}</TableCell>}
                    {colunas.mostrar('orderNumber') && <TableCell>{asset.orderNumber || TRACO}</TableCell>}

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
                            // Clonar: o formulário abre em modo criação com os
                            // valores deste ativo, sem etiqueta e sem série.
                            { rotulo: 'Clonar', icone: Copy, onClick: () => openClone(asset) },
                            { rotulo: 'Editar', icone: Pencil, onClick: () => openEdit(asset) },
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
        </Card>
      )}

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
