import { Plus } from 'lucide-react';
import ListToolbar from '../components/ListToolbar';
import AlertasLicenca from './components/AlertasLicenca';
import EntregaAssentoModal from './components/EntregaAssentoModal';
import LicencaDetalheModal from './components/LicencaDetalheModal';
import LicencaFormModal from './components/LicencaFormModal';
import LicencaTable from './components/LicencaTable';
import { useLicencas } from './hooks/useLicencas';

// AS LICENÇAS DE SOFTWARE (docs/FASE-6-PLANO-ITAM.md).
//
// O que a licença tem e o ativo não tem é ASSENTO: ela não é entregue, é
// consumida N vezes — e a pergunta que esta tela existe para responder é
// "quantos assentos sobraram e quem está com eles", com a resposta valendo em
// auditoria de fornecedor.
//
// Markup e mais nada: estado e chamadas ficam no `useLicencas`
// (docs/ARQUITETURA.md).
export default function LicencasPage() {
  const {
    licencas, total, page, perPage, setPage, search, changeSearch, view, changeView,
    alertas,
    modal, licencaAberta, abrir, fechar,
    handleCriar, handleEditar, handleEntregar, handleDevolver,
    handleExcluir, handleRestaurar,
  } = useLicencas();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Licenças</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            O que não é entregue, e sim consumido N vezes. Cada assento é uma linha que alguém
            ocupa — uma pessoa ou uma máquina.
            <span className="text-text-secondary"> Posto de trabalho não é alvo: o computador da mesa é.</span>
          </p>
        </div>
        <button
          onClick={() => abrir('criar')}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
        >
          <Plus size={14} /> Nova licença
        </button>
      </div>

      <AlertasLicenca alertas={alertas} />

      <ListToolbar
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, licenciado, fabricante ou pedido..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <LicencaTable
        licencas={licencas}
        view={view}
        onAbrir={(licenca) => abrir('detalhe', licenca)}
        onEditar={(licenca) => abrir('editar', licenca)}
        onEntregar={(licenca) => abrir('entregar', licenca)}
        onExcluir={(licenca) => void handleExcluir(licenca)}
        onRestaurar={(licenca) => void handleRestaurar(licenca)}
        vazio={
          search ? (
            <span>Nenhuma licença encontrada para "{search}".</span>
          ) : view === 'trashed' ? (
            <span>A lixeira de licenças está vazia.</span>
          ) : (
            <>
              <span>Nenhuma licença cadastrada.</span>
              <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                Uma licença é um contrato com N assentos. Cadastre-a com o total comprado e os
                assentos nascem junto, prontos para entregar.
              </span>
            </>
          )
        }
      />

      {modal === 'criar' && (
        <LicencaFormModal licenca={null} onClose={fechar} onSubmit={handleCriar} />
      )}

      {modal === 'editar' && licencaAberta && (
        <LicencaFormModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEditar} />
      )}

      {modal === 'entregar' && licencaAberta && (
        <EntregaAssentoModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEntregar} />
      )}

      {modal === 'detalhe' && licencaAberta && (
        <LicencaDetalheModal licenca={licencaAberta} onClose={fechar} onDevolver={handleDevolver} />
      )}
    </div>
  );
}
