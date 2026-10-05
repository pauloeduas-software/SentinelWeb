import { ArrowRightLeft, Copy, Database, Edit2, PackageX, Plus, RotateCcw, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetFilterBar from './components/AssetFilterBar';
import AssetFormModal from './components/AssetFormModal';
import BulkActionBar from './components/BulkActionBar';
import CheckoutModal from './components/CheckoutModal';
import ColunasMenu from './components/ColunasMenu';
import ExportarCsv from '../components/ExportarCsv';
import ListToolbar from '../components/ListToolbar';
import { formatarData, formatarMoeda } from '../helpers/format.helper';
import { seloDaSaida } from './helpers/descomissionamento.helper';
import { TRACO, resumoDaPosse, rotuloDaOperacao } from './helpers/posse.helper';
import { useAssets } from './hooks/useAssets';
import { useColunas } from './hooks/useColunas';
import { urlDoExportDeAtivos } from '../../domain/asset/asset.queries';
import type { CampoDeColuna } from '../../domain/shared/custom-field.types';

/**
 * O valor de uma coluna customizada, ou `null` quando não há o que mostrar.
 *
 * Cálculo fora do JSX (docs/referencia/arquitetura.md). `CHECKBOX` é o único que precisa de
 * tradução: o valor viaja como o TEXTO `"true"`/`"false"` — é o que o servidor
 * guarda, para o filtro `?cf[slug]=true` funcionar igual a qualquer outro campo
 * —, e "true" numa célula de tabela não é português.
 */
function valorDaColuna(
  // `undefined` junto de `null`: a coluna não está no select compartilhado do
  // servidor, então o tipo `Asset` a declara opcional. Aqui os dois significam a
  // mesma coisa — não há valor para esta célula.
  customFields: Record<string, string> | null | undefined,
  campo: CampoDeColuna,
): string | null {
  const valor = customFields?.[campo.slug];
  if (valor === undefined || valor === '') return null;
  if (campo.element === 'CHECKBOX') return valor === 'true' ? 'sim' : 'não';
  return valor;
}

export default function AtivosPage() {
  const {
    assets, total, totalCadastrado, porStatus, colunasCustomizadas,
    descomissionados, arquivados, page, perPage, setPage,
    search, changeSearch, view, changeView, relatorio, changeRelatorio,
    statusId, statusFiltrado, toggleStatus, limparStatus,
    modalAberto, emEdicao, clonando, openCreate, openEdit, openClone, closeModal, abrirDetalhe,
    handleSubmit, handleDelete, handleRestore,
    emPosse, openPosse, closePosse, handleEntregar, handleDevolver,
    selecao, handleBulk, filtrosParaExport,
  } = useAssets();

  // AS COLUNAS VISÍVEIS (F10, Etapa B). Preferência do navegador, não do
  // servidor: ninguém a consulta e ela não é fato sobre o inventário
  // (docs/referencia/arquitetura.md, *client state*).
  //
  // As CUSTOMIZADAS entram por parâmetro, e só para o export: a tabela as desenha
  // por conta própria (elas não passam pelo seletor), mas o `?columns=` precisa
  // nomeá-las para o arquivo ter o que a tela tem.
  const colunas = useColunas(colunasCustomizadas);

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
                <span
                  className="w-2 h-2 rounded-full border border-border-sutil"
                  style={status.color ? { backgroundColor: status.color } : undefined}
                />
                {status.name} <span className="text-text-secondary tabular-nums">{status.total}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* O export vem ANTES do seletor de colunas, e os dois são vizinhos
              de propósito: o arquivo leva as colunas visíveis, então escolher
              coluna e exportar é um gesto só. */}
          <ExportarCsv
            url={urlDoExportDeAtivos(filtrosParaExport, colunas.paraExportar)}
            total={total}
          />
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
        descomissionados={descomissionados}
        arquivados={arquivados}
        relatorio={relatorio}
        onRelatorioChange={changeRelatorio}
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
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      {selecao.quantos > 0 && (
        <div className="mb-4 shrink-0">
          <BulkActionBar quantos={selecao.quantos} onAplicar={handleBulk} onLimpar={selecao.limpar} />
        </div>
      )}

      <div className="bg-surface-card border border-border-sutil flex-1 overflow-auto">
        <table className="w-full text-left font-mono text-xs whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest sticky top-0 z-10">
            <tr>
              <th className="px-4 py-4 font-normal w-10">
                <input
                  type="checkbox"
                  checked={selecao.paginaInteiraMarcada}
                  onChange={selecao.alternarPagina}
                  aria-label="Selecionar a página inteira"
                  className="accent-status-info w-4 h-4 cursor-pointer"
                />
              </th>
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
              {colunas.mostrar('supplier') && <th className="px-6 py-4 font-normal">Fornecedor</th>}
              {colunas.mostrar('orderNumber') && <th className="px-6 py-4 font-normal">Nº do pedido</th>}
              {colunas.mostrar('warranty') && <th className="px-6 py-4 font-normal">Garantia</th>}
              {colunas.mostrar('eol') && <th className="px-6 py-4 font-normal">Fim de vida</th>}
              {/* AS COLUNAS QUE O CLIENTE CRIOU (F9, `showInListView`). Depois das
                  nativas e antes das ações: elas são extras, e mover "Ações" do
                  fim quebraria o hábito de quem usa a tela todo dia.

                  Campo CIFRADO não chega aqui — o servidor o exclui desta rota, e
                  o cadastro recusa marcá-lo como coluna: uma coluna de `••••••`
                  repetido em toda linha ocuparia espaço para não informar nada. */}
              {colunasCustomizadas.map((campo) => (
                <th key={campo.slug} className="px-6 py-4 font-normal">{campo.name}</th>
              ))}
              <th className="px-6 py-4 font-normal text-right">Ações</th>
            </tr>
          </thead>

          <tbody className="text-text-primary divide-y divide-border-sutil/50">
            {assets.map((asset) => {
              // O cálculo da posse fica no helper, nunca no JSX
              // (docs/referencia/arquitetura.md). Aqui só se escolhe o que mostrar.
              const posse = resumoDaPosse(asset.posse);
              const selo = seloDaSaida(asset);

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
                  <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selecao.estaMarcado(asset.id)}
                      onChange={() => selecao.alternar(asset.id)}
                      aria-label={`Selecionar ${asset.assetTag}`}
                      className="accent-status-info w-4 h-4 cursor-pointer"
                    />
                  </td>
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
                    {/* A cor vem do banco (StatusLabel.color), então vai por
                        `style` — o Tailwind não gera classe a partir de string de
                        runtime. */}
                    <span
                      className="px-2 py-1 border rounded-[2px] text-[10px] uppercase tracking-widest"
                      style={asset.status.color
                        ? { color: asset.status.color, borderColor: `${asset.status.color}33`, backgroundColor: `${asset.status.color}1a` }
                        : undefined}
                    >
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
                  {colunas.mostrar('supplier') && (
                    <td className="px-6 py-4 text-text-tertiary">{asset.supplier?.name ?? TRACO}</td>
                  )}
                  {colunas.mostrar('orderNumber') && (
                    <td className="px-6 py-4 text-text-tertiary">
                      {asset.orderNumber || <span className="text-text-tertiary">{TRACO}</span>}
                    </td>
                  )}
                  {colunas.mostrar('warranty') && (
                    <td className="px-6 py-4 text-text-secondary tabular-nums">
                      {formatarData(asset.warrantyExpiresAt)}
                    </td>
                  )}
                  {colunas.mostrar('eol') && (
                    <td className="px-6 py-4 text-text-secondary tabular-nums">
                      {formatarData(asset.eolDate)}
                    </td>
                  )}
                  {/* Uma célula por coluna customizada, na MESMA ordem do
                      cabeçalho — as duas percorrem a mesma lista, que é o que as
                      mantém alinhadas quando um campo entra ou sai.

                      `customFields` é `null` no ativo que não tem campo nenhum, e
                      a chave falta no que não preencheu ESTE campo: os dois casos
                      caem no travessão, que é o que a tabela já faz com coluna
                      vazia. */}
                  {colunasCustomizadas.map((campo) => (
                    <td key={campo.slug} className="px-6 py-4 text-text-secondary">
                      {valorDaColuna(asset.customFields, campo) ?? (
                        <span className="text-text-tertiary">{TRACO}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      {view === 'trashed' ? (
                        <button onClick={() => void handleRestore(asset)} title="Restaurar" className="text-text-tertiary hover:text-status-success transition-colors">
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <>
                          {/* Entregar/devolver é OPERAÇÃO, não campo: mora aqui,
                              ao lado do ativo, e não dentro do formulário. */}
                          <button
                            onClick={() => openPosse(asset)}
                            title={`${rotuloDaOperacao(asset.posse)} ${asset.assetTag}`}
                            className="text-text-tertiary hover:text-status-info transition-colors"
                          >
                            {posse.entregue ? <Undo2 size={14} /> : <ArrowRightLeft size={14} />}
                          </button>
                          {/* Clonar: o formulário abre em modo criação com os
                              valores deste ativo, sem etiqueta e sem série. */}
                          <button onClick={() => openClone(asset)} title={`Clonar ${asset.assetTag}`} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <Copy size={14} />
                          </button>
                          <button onClick={() => openEdit(asset)} title="Editar" className="text-text-tertiary hover:text-text-primary transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => void handleDelete(asset)} title="Mover para a lixeira" className="text-text-tertiary hover:text-status-danger transition-colors">
                            <Trash2 size={14} />
                          </button>
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
                    muda, F10) mais as que o cliente criou (F9), mais a coluna do
                    checkbox e a de ações. Esta célula é a única que não percorre
                    lista nenhuma, então é a única que precisa contar — e com o
                    número fixo o "nenhum ativo encontrado" deixava de cobrir a
                    tabela a cada coluna marcada ou desmarcada. */}
                <td
                  colSpan={2 + colunas.visiveis.length + colunasCustomizadas.length}
                  className="px-6 py-16 text-center text-text-tertiary"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Database size={24} className="mb-4 opacity-50" />
                    {view === 'trashed' ? (
                      <span>A lixeira está vazia.</span>
                    ) : view === 'retired' ? (
                      <span>Nenhum ativo descomissionado.</span>
                    ) : view === 'archived' ? (
                      <span>Nenhum ativo arquivado.</span>
                    ) : relatorio === 'posto-vago' ? (
                      <span>Nenhum ativo parado em posto vago.</span>
                    ) : search ? (
                      <span>Nenhum ativo encontrado para "{search}".</span>
                    ) : statusId ? (
                      <span>Nenhum ativo com este status.</span>
                    ) : (
                      <>
                        <span>Nenhum ativo cadastrado.</span>
                        {/* Um ativo exige um modelo, e o modelo exige fabricante e
                            categoria — é a ordem do Snipe-IT. Sem esta dica, o
                            primeiro cadastro esbarra num seletor vazio. */}
                        <span className="mt-4 text-[10px] max-w-md leading-relaxed">
                          Todo ativo pertence a um modelo. Cadastre o fabricante e o modelo em{' '}
                          <Link to="/configuracoes" className="text-status-success hover:underline">Configurações</Link>
                          {' '}antes do primeiro ativo.
                        </span>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <AssetFormModal asset={emEdicao} clonar={clonando} onClose={closeModal} onSubmit={handleSubmit} />
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
