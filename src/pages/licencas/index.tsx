import { Plus } from 'lucide-react';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import EstadoDaLista from '../../components/EstadoDaLista';
import ListToolbar from '../../components/ListToolbar';
import AlertasLicenca from './components/AlertasLicenca';
import EntregaLicencaModal from './components/EntregaLicencaModal';
import LicencaDetalheModal from './components/LicencaDetalheModal';
import LicencaFormModal from './components/LicencaFormModal';
import LicencaTable from './components/LicencaTable';
import StatusFiltro from './components/StatusFiltro';
import { useLicencas } from './hooks/useLicencas';
import { usePode } from '../../stores/auth.store';

// AS LICENÇAS DE SOFTWARE (docs/referencia/licencas.md).
//
// A licença não é entregue uma vez: é usada até a quantidade comprada — e a
// pergunta que esta tela existe para responder é "quantas sobraram e com quem
// estão as outras".
//
// Markup e mais nada: estado e chamadas ficam no `useLicencas`
// (docs/referencia/arquitetura.md). Sem abas: a encerrada fica na lista, como o
// desativado nas Configurações (AF).

export default function LicencasPage() {
  const {
    licencas, total, carregando, erro, page, perPage, setPage, search, changeSearch,
    categoryId, changeCategoria, status, changeStatus, irParaAlerta,
    alertas,
    modal, licencaAberta, buscaDoLink, erroDoLink, abrir, fechar, ocupado,
    handleCriar, handleEditar, handleEntregar, handleDevolver, handleTrocarChave, handleAlternarEncerrada, handleExcluir,
  } = useLicencas();
  // Excluir é `ADMIN` no servidor.
  const podeApagar = usePode('ADMIN');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Licenças</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            O contrato e a quantidade comprada. Cada uso é uma entrega — a um colaborador ou a um
            computador.
            <span className="text-text-secondary"> Posto de trabalho não recebe licença: o computador da mesa recebe.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => abrir('criar')}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <Plus size={14} /> Nova licença
          </button>
        </div>
      </div>

      {erroDoLink && (
        <p role="alert" className="mb-4 p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 font-mono text-xs flex justify-between gap-4">
          <span>Não foi possível abrir a licença do link: {erroDoLink}</span>
          <button type="button" onClick={fechar} className="uppercase tracking-widest text-[10px] hover:underline">Dispensar</button>
        </p>
      )}

      <AlertasLicenca alertas={alertas.rows} total={alertas.total} contagem={alertas.contagem} onIrPara={irParaAlerta} />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, licenciado, categoria, fabricante ou pedido..."
        filtros={
          <>
            <StatusFiltro valor={status} onChange={changeStatus} />
            <CategoriaFiltro tipo="LICENSE" valor={categoryId} onChange={changeCategoria} />
          </>
        }
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <LicencaTable
        licencas={licencas}
        ocupado={ocupado}
        onAbrir={(licenca) => abrir('detalhe', licenca)}
        onEditar={(licenca) => abrir('editar', licenca)}
        onEntregar={(licenca) => abrir('entregar', licenca)}
        onAlternarEncerrada={(licenca) => void handleAlternarEncerrada(licenca)}
        onExcluir={podeApagar ? (licenca) => void handleExcluir(licenca) : undefined}
        vazio={
          // Carregando e erro antes do vazio: sem isto, a primeira carga e um
          // servidor fora do ar diziam "nenhuma cadastrada" (`EstadoDaLista`).
          <EstadoDaLista carregando={carregando} erro={erro}>
            {search ? (
              <span>Nenhuma licença encontrada para "{search}".</span>
            ) : status || categoryId ? (
              <span>Nenhuma licença com este filtro.</span>
            ) : (
              <>
                <span>Nenhuma licença cadastrada.</span>
                <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                  Uma licença é um contrato com uma quantidade comprada. Cadastre-a com o total e
                  entregue a colaboradores ou computadores até ele acabar.
                </span>
              </>
            )}
          </EstadoDaLista>
        }
      />

      {modal === 'criar' && (
        <LicencaFormModal licenca={null} onClose={fechar} onSubmit={handleCriar} />
      )}

      {modal === 'editar' && licencaAberta && (
        <LicencaFormModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEditar} />
      )}

      {modal === 'entregar' && licencaAberta && (
        <EntregaLicencaModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEntregar} />
      )}

      {modal === 'detalhe' && licencaAberta && (
        <LicencaDetalheModal
          // Outra licença é outra janela: página e busca não passam de uma para a outra.
          key={licencaAberta.id}
          licenca={licencaAberta}
          buscaInicial={buscaDoLink}
          ocupado={ocupado}
          onClose={fechar}
          onEntregar={(licenca) => abrir('entregar', licenca)}
          onEditar={(licenca) => abrir('editar', licenca)}
          onAlternarEncerrada={(licenca) => void handleAlternarEncerrada(licenca)}
          onExcluir={podeApagar ? (licenca) => void handleExcluir(licenca) : undefined}
          onDevolver={handleDevolver}
          onTrocarChave={handleTrocarChave}
        />
      )}
    </div>
  );
}
