import { ArrowRightLeft, Copy, Database, Edit2, PackageX, Plus, RotateCcw, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFilterBar from './components/AssetFilterBar';
import AssetFormModal from './components/AssetFormModal';
import CheckoutModal from './components/CheckoutModal';
import ColunasMenu from './components/ColunasMenu';
import CategoriaFiltro from '../components/CategoriaFiltro';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import { usePode } from '../../domain/auth/auth.store';
import { formatarData, formatarMoeda } from '../helpers/format.helper';
import { seloDaSaida } from './helpers/baixa.helper';
import {
  TRACO, bloqueioDaEntrega, resumoDaPosse, rotuloDaOperacao,
} from './helpers/posse.helper';
import { useAssets } from './hooks/useAssets';
import { useColunas } from './hooks/useColunas';

export default function AtivosPage() {
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
  // Mandar para a lixeira e tirar de lá é `ADMIN` no servidor (excluir de
  // verdade é dele); o resto da linha é o trabalho do técnico. Sem isto o
  // técnico via a lixeira e o restaurar, e os dois só levavam 403.
  const ehAdmin = usePode('ADMIN');

  // AS COLUNAS VISÍVEIS (F10, Etapa B). Preferência do navegador, não do
  // servidor: ninguém a consulta e ela não é fato sobre o inventário
  // (docs/referencia/arquitetura.md, *client state*).
  const colunas = useColunas();

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Ativos</h2>
          <div className="flex flex-wrap items-center gap-4 mt-2 font-mono text-xs text-text-tertiary">
            <span>{totalCadastrado} {totalCadastrado === 1 ? 'ativo' : 'ativos'}</span>
            {porStatus.map((status) => (
              // O contador agora FILTRA: clicar liga `?statusId=`, clicar de
              // novo desliga. Antes o número existia e não levava a lugar
              // nenhum, porque a API não aceitava filtro por status.
              <button
                key={status.id}
                type="button"
                onClick={() => toggleStatus(status.id)}
                title={`Filtrar por ${status.name}`}
                className={`flex items-center gap-2 px-2 py-1 border transition-colors ${
                  statusId === status.id
                    ? 'border-status-info/40 bg-status-info/10 text-text-primary'
                    : 'border-transparent hover:border-border-sutil hover:text-text-secondary'
                }`}
              >
                {status.name} <span className="text-text-secondary tabular-nums">{status.total}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ColunasMenu
            catalogo={colunas.catalogo}
            visiveis={colunas.visiveis}
            personalizado={colunas.personalizado}
            onAlternar={colunas.alternar}
            onRestaurar={colunas.restaurar}
          />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <Plus size={14} /> Novo Ativo
          </button>
        </div>
      </div>

      <AssetFilterBar
        view={view}
        onViewChange={changeView}
        baixados={baixados}
        statusFiltrado={statusFiltrado}
        onLimparStatus={limparStatus}
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

      <div className="bg-surface-card border border-border-sutil flex-1 overflow-auto">
        <table className="w-full text-left font-mono text-xs whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest sticky top-0 z-10">
            <tr>
              {/* O CABEÇALHO E A CÉLULA consultam o MESMO `mostrar()`, e é só
                  isso que os mantém alinhados. Iterar a lista de tokens e
                  desenhar a célula por token seria mais curto e exigiria uma
                  função de render por coluna — o que levaria o JSX de status,
                  de posse e de compra (que não são texto: são selo, lista com
                  turno e duas linhas) para dentro de um helper. */}
              {colunas.mostrar('assetTag') && <th className="px-6 py-4 font-normal">Etiqueta</th>}
              {colunas.mostrar('model') && <th className="px-6 py-4 font-normal">Modelo</th>}
              {colunas.mostrar('category') && <th className="px-6 py-4 font-normal">Categoria</th>}
              {colunas.mostrar('status') && <th className="px-6 py-4 font-normal">Status</th>}
              {colunas.mostrar('location') && <th className="px-6 py-4 font-normal">Localização</th>}
              {colunas.mostrar('responsible') && <th className="px-6 py-4 font-normal">Responsável</th>}
              {colunas.mostrar('purchase') && <th className="px-6 py-4 font-normal">Compra</th>}
              {colunas.mostrar('name') && <th className="px-6 py-4 font-normal">Nome</th>}
              {colunas.mostrar('orderNumber') && <th className="px-6 py-4 font-normal">Nº do pedido</th>}
              <th className="px-6 py-4 font-normal text-right">Ações</th>
            </tr>
          </thead>

          <tbody className="text-text-primary divide-y divide-border-sutil/50">
            {assets.map((asset) => {
              // O cálculo da posse fica no helper, nunca no JSX
              // (docs/referencia/arquitetura.md). Aqui só se escolhe o que mostrar.
              const posse = resumoDaPosse(asset.posse);
              const selo = seloDaSaida(asset);
              const bloqueio = bloqueioDaEntrega(asset);

              return (
                <tr
                  key={asset.id}
                  // A LINHA ABRE O DETALHE. Os controles de dentro dela param a
                  // propagação: marcar um checkbox ou clicar em "editar" não
                  // pode navegar para outra tela.
                  onClick={() => abrirDetalhe(asset)}
                  title={`Abrir ${asset.assetTag}`}
                  className="hover:bg-bg-base transition-colors group cursor-pointer"
                >
                  {colunas.mostrar('assetTag') && (
                  <td className="px-6 py-4">
                    <div className="font-medium">{asset.assetTag}</div>
                    {asset.serial && <div className="text-[10px] text-text-tertiary mt-1">SN {asset.serial}</div>}
                    {selo && (
                      <div className="flex items-center gap-1.5 text-[10px] text-status-warning mt-1 uppercase tracking-widest">
                        <PackageX size={11} className="shrink-0" /> {selo}
                      </div>
                    )}
                  </td>
                  )}
                  {colunas.mostrar('model') && (
                  <td className="px-6 py-4 text-text-secondary">
                    <div>{asset.model.name}</div>
                    <div className="text-[10px] text-text-tertiary mt-1">{asset.model.manufacturer.name}</div>
                  </td>
                  )}
                  {colunas.mostrar('category') && (
                  <td className="px-6 py-4 text-text-tertiary">{asset.model.category.name}</td>
                  )}
                  {colunas.mostrar('status') && (
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 border border-border-sutil rounded-[2px] text-text-secondary text-[10px] uppercase tracking-widest">
                      {asset.status.name}
                    </span>
                  </td>
                  )}
                  {colunas.mostrar('location') && (
                  <td className="px-6 py-4 text-text-tertiary">{asset.location?.name ?? '—'}</td>
                  )}
                  {/* RESPONSÁVEL — derivado, e pode ser mais de um: os ocupantes
                      do posto para o qual o ativo foi entregue aparecem juntos,
                      cada um com o turno (docs/referencia/modelo-de-posse.md, Camada 3). */}
                  {colunas.mostrar('responsible') && (
                  <td className="px-6 py-4">
                    {posse.quantos > 0
                      ? <div className="text-text-secondary whitespace-normal max-w-[20rem]">{posse.responsaveis}</div>
                      : <span className="text-text-tertiary">{TRACO}</span>}

                    {posse.detalheAlvo && (
                      <div className="text-[10px] text-text-tertiary mt-1">{posse.detalheAlvo}</div>
                    )}

                    {/* Posto vago: equipamento parado em mesa sem ninguém. É sinal
                        operacional, por isso tem cor — some assim que alguém
                        ocupar o posto. */}
                    {posse.postoVago && (
                      <div className="flex items-center gap-1.5 text-[10px] text-status-warning mt-1 uppercase tracking-widest">
                        <TriangleAlert size={11} className="shrink-0" /> Posto vago
                      </div>
                    )}
                  </td>
                  )}
                  {colunas.mostrar('purchase') && (
                  <td className="px-6 py-4 text-text-secondary">
                    <div className="tabular-nums">{formatarMoeda(asset.purchaseCost)}</div>
                    <div className="text-[10px] text-text-tertiary mt-1 tabular-nums">{formatarData(asset.purchaseDate)}</div>
                  </td>
                  )}

                  {/* AS CINCO QUE O SELETOR TROUXE. Todas vinham no payload da
                      listagem desde a F1 — nenhuma custa consulta a mais. */}
                  {colunas.mostrar('name') && (
                    <td className="px-6 py-4 text-text-secondary">
                      {asset.name || <span className="text-text-tertiary">{TRACO}</span>}
                    </td>
                  )}
                  {colunas.mostrar('orderNumber') && (
                    <td className="px-6 py-4 text-text-tertiary">
                      {asset.orderNumber || <span className="text-text-tertiary">{TRACO}</span>}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                    {/* Visível ao passar o mouse, ao navegar por Tab
                        (`focus-within`) e sempre no toque, onde não há hover —
                        o mesmo desenho do `CatalogTable`. Com `opacity-0` puro,
                        o botão focado por Tab ficava invisível e, no celular,
                        a coluna inteira não existia. */}
                    <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                      {view === 'trashed' ? (
                        ehAdmin && (
                          <button onClick={() => void handleRestore(asset)} title="Restaurar" aria-label={`Restaurar ${asset.assetTag}`} className="text-text-tertiary hover:text-status-success transition-colors">
                            <RotateCcw size={14} />
                          </button>
                        )
                      ) : (
                        <>
                          {/* Entregar/devolver é OPERAÇÃO, não campo: mora aqui,
                              ao lado do ativo, e não dentro do formulário.
                              Travado, o `title` diz POR QUÊ — um botão apagado
                              sem explicação parece defeito. */}
                          <button
                            onClick={() => openPosse(asset)}
                            disabled={bloqueio !== null}
                            title={bloqueio ?? `${rotuloDaOperacao(asset.posse)} ${asset.assetTag}`}
                            aria-label={`${rotuloDaOperacao(asset.posse)} ${asset.assetTag}`}
                            className="text-text-tertiary hover:text-status-info transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary disabled:cursor-not-allowed"
                          >
                            {posse.entregue ? <Undo2 size={14} /> : <ArrowRightLeft size={14} />}
                          </button>
                          {/* Clonar: o formulário abre em modo criação com os
                              valores deste ativo, sem etiqueta e sem série. */}
                          <button onClick={() => openClone(asset)} title={`Clonar ${asset.assetTag}`} aria-label={`Clonar ${asset.assetTag}`} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <Copy size={14} />
                          </button>
                          <button onClick={() => openEdit(asset)} title="Editar" aria-label={`Editar ${asset.assetTag}`} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <Edit2 size={14} />
                          </button>
                          {ehAdmin && (
                            <button onClick={() => void handleDelete(asset)} title="Mover para a lixeira" aria-label={`Mover ${asset.assetTag} para a lixeira`} className="text-text-tertiary hover:text-status-danger transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {assets.length === 0 && (
              <tr>
                {/* A SOMA, e não um número cravado: as visíveis (que o seletor
                    muda, F10) mais a coluna de ações. Esta célula é a única que
                    não percorre lista nenhuma, então é a única que precisa contar
                    — e com o número fixo o "nenhum ativo encontrado" deixava de
                    cobrir a tabela a cada coluna marcada ou desmarcada. */}
                <td
                  colSpan={1 + colunas.visiveis.length}
                  className="px-6 py-16 text-center text-text-tertiary"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Database size={24} className="mb-4 opacity-50" />
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
                              primeiro cadastro esbarra num seletor vazio.
                              O LINK é só do ADMIN: Configurações é tela dele, e
                              para os outros o link levava a uma porta fechada. A
                              dica fica, porque a ordem vale para todos — muda
                              quem faz. */}
                          <span className="mt-4 text-[10px] max-w-md leading-relaxed">
                            {ehAdmin ? (
                              <>
                                Todo ativo pertence a um modelo. Cadastre o fabricante e o modelo em{' '}
                                <Link to="/configuracoes" className="text-status-success hover:underline">Configurações</Link>
                                {' '}antes do primeiro ativo.
                              </>
                            ) : (
                              <>
                                Todo ativo pertence a um modelo. Fabricante e modelo se cadastram em
                                Configurações — peça a um administrador antes do primeiro ativo.
                              </>
                            )}
                          </span>
                        </>
                      )}
                    </EstadoDaLista>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
