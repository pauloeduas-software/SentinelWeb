import { KeyRound, Plus } from 'lucide-react';
import CartoesDeContagem from '../../components/CartoesDeContagem';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import AlertasLicenca from './components/AlertasLicenca';
import EntregaLicencaModal from './components/EntregaLicencaModal';
import LicencaDetalheModal from './components/LicencaDetalheModal';
import LicencaFormModal from './components/LicencaFormModal';
import LicencaTable from './components/LicencaTable';
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
    licencas, total, carregando, erro, page, perPage, setPage, search, buscaFeita, changeSearch,
    categoryId, changeCategoria, status, changeStatus, contagens,
    alertas, erroDosAlertas,
    modal, licencaAberta, buscaDoLink, veioDoLink, erroDoLink, abrir, fechar, ocupado,
    handleCriar, handleEditar, handleEntregar, handleDevolver, handleTrocarChave, handleAlternarEncerrada, handleExcluir,
  } = useLicencas();
  // Cadastrar, editar, encerrar e excluir são `SUPERVISOR` no servidor: licença é
  // contrato e dinheiro (AV). O Técnico entrega, devolve e troca a chave.
  const podeGerir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Licenças" />

      {erroDoLink && (
        <Aviso className="mb-4" onDispensar={fechar}>Não foi possível abrir a licença do link: {erroDoLink}</Aviso>
      )}

      <CartoesDeContagem contagens={contagens} escolhido={status} onEscolher={changeStatus} />

      {erroDosAlertas && <Aviso className="mb-4">Não foi possível conferir os prazos: {erroDosAlertas}</Aviso>}
      <AlertasLicenca alertas={alertas.rows} total={alertas.total} />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, licenciado ou pedido…"
        filtros={<CategoriaFiltro tipo="LICENSE" valor={categoryId} onChange={changeCategoria} />}
        // Cadastrar é `SUPERVISOR`.
        acao={podeGerir && <Button onClick={() => abrir('criar')}><Plus /> Nova licença</Button>}
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
          <ListaVazia
            icone={KeyRound}
            carregando={carregando}
            erro={erro}
            nome="licença"
            genero="f"
            busca={buscaFeita}
            filtrada={Boolean(status || categoryId)}
            onCadastrar={podeGerir ? () => abrir('criar') : undefined}
          />
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
