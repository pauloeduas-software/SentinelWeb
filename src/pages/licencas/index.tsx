import { Plus } from 'lucide-react';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import EstadoDaLista from '../../components/EstadoDaLista';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
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
    modal, licencaAberta, buscaDoLink, veioDoLink, erroDoLink, abrir, fechar, ocupado,
    handleCriar, handleEditar, handleEntregar, handleDevolver, handleTrocarChave, handleAlternarEncerrada, handleExcluir,
  } = useLicencas();
  // Cadastrar, editar, encerrar e excluir são `SUPERVISOR` no servidor: licença é
  // contrato e dinheiro (AV). O Técnico entrega, devolve e troca a chave.
  const podeGerir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho
        titulo="Licenças"
        subtitulo="O contrato e a quantidade comprada. Cada uso é uma entrega, a um colaborador ou a um computador."
        acao={podeGerir && <Button onClick={() => abrir('criar')}><Plus /> Nova licença</Button>}
      />

      {erroDoLink && (
        <Aviso className="mb-4 flex items-center justify-between gap-4">
          <span>Não foi possível abrir a licença do link: {erroDoLink}</span>
          <button type="button" onClick={fechar} className="text-xs hover:underline">Dispensar</button>
        </Aviso>
      )}

      <AlertasLicenca alertas={alertas.rows} total={alertas.total} contagem={alertas.contagem} onIrPara={irParaAlerta} />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, licenciado ou pedido..."
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
        onEditar={podeGerir ? (licenca) => abrir('editar', licenca) : undefined}
        onEntregar={(licenca) => abrir('entregar', licenca)}
        onAlternarEncerrada={podeGerir ? (licenca) => void handleAlternarEncerrada(licenca) : undefined}
        onExcluir={podeGerir ? (licenca) => void handleExcluir(licenca) : undefined}
        vazio={
          // Carregando e erro antes do vazio: sem isto, a primeira carga e um
          // servidor fora do ar diziam "nenhuma cadastrada" (`EstadoDaLista`).
          <EstadoDaLista carregando={carregando} erro={erro}>
            {search ? (
              <span>Nenhuma licença encontrada para "{search}".</span>
            ) : status || categoryId ? (
              <span>Nenhuma licença com este filtro.</span>
            ) : (
              <span>Nenhuma licença cadastrada.</span>
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
          veioDoLink={veioDoLink}
          ocupado={ocupado}
          onClose={fechar}
          onEntregar={(licenca) => abrir('entregar', licenca)}
          onEditar={podeGerir ? (licenca) => abrir('editar', licenca) : undefined}
          onAlternarEncerrada={podeGerir ? (licenca) => void handleAlternarEncerrada(licenca) : undefined}
          onExcluir={podeGerir ? (licenca) => void handleExcluir(licenca) : undefined}
          onDevolver={handleDevolver}
          onTrocarChave={handleTrocarChave}
        />
      )}
    </div>
  );
}
