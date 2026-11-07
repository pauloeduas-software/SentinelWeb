import {
  History, KeyRound, Pencil, Power, PowerOff, Trash2, UserPlus, Users,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import EntregaLicencaModal from '../components/EntregaLicencaModal';
import EntregasAbertas from '../components/EntregasAbertas';
import HistoricoLicenca from '../components/HistoricoLicenca';
import LicencaFormModal from '../components/LicencaFormModal';
import { motivoParaNaoEntregar } from '../helpers/licenca.helper';
import ChavesTab from './components/ChavesTab';
import IdentificacaoDaLicenca from './components/IdentificacaoDaLicenca';
import { useFichaDaLicenca } from './hooks/useFichaDaLicenca';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import ListToolbar from '../../../components/ListToolbar';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import { Aviso } from '../../../components/ui/aviso';
import { Button } from '../../../components/ui/button';
import {
  ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../../components/ui/tabs';
import { POR_PAGINA } from '../../../hooks/useListaNaUrl';
import { rotuloDaVolta } from '../../../hooks/useVoltaComFiltros';
import { usePode } from '../../../stores/auth.store';

// A FICHA DA LICENÇA — `/licencas/:id`: o status, a conta, os campos do cadastro e as
// ações em cima; nas abas, quem está com ela agora, as chaves e o histórico.
//
// É A ÚNICA TELA COM AS CHAVES DE PRODUTO: as da licença, na aba Chaves, e a de cada
// entrega, em "Com quem está" — todas escondidas até "Mostrar" (AC).
//
// Markup e mais nada: estado e chamadas ficam no `useFichaDaLicenca`
// (docs/referencia/arquitetura.md).

export default function LicencaFichaPage() {
  const { id = '' } = useParams<{ id: string }>();
  // Outra licença é outra ficha: busca e página não passam de uma para a outra.
  return <FichaDaLicenca key={id} id={id} />;
}

function FichaDaLicenca({ id }: { id: string }) {
  const {
    licenca, carregando, erro, erroDaAtualizacao, voltar, aba, setAba,
    entregas, paginaDasEntregas, setPaginaDasEntregas, busca, buscaAdiada, mudarBusca,
    historico, paginaDoHistorico, setPaginaDoHistorico,
    formulario, licencaAberta, abrir, fechar, ocupado,
    handleEditar, handleEntregar, handleDevolver, handleTrocarChave, handleAlternarEncerrada, handleExcluir,
  } = useFichaDaLicenca(id);
  // Editar, encerrar e excluir são `SUPERVISOR` no servidor: licença é contrato e
  // dinheiro (AV). O Técnico entrega, devolve e troca a chave. Antes do `return`
  // abaixo: hook depois de retorno condicional é o que as regras do React proíbem.
  const podeGerir = usePode('SUPERVISOR');
  const rotulo = rotuloDaVolta(voltar.para, 'Licenças');

  if (carregando || erro || !licenca) {
    return <FichaIndisponivel lista="Licenças" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Licença não encontrada.'} />;
  }

  const encerrada = licenca.status === 'ENCERRADA';
  const motivoSemEntrega = motivoParaNaoEntregar(licenca);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho voltar={{ ...voltar, rotulo }} titulo={licenca.name} />

      <div className="space-y-6">
        <IdentificacaoDaLicenca
          licenca={licenca}
          // As ações da lista, com as mesmas regras: a encerrada não entrega, e se
          // reabre pelo mesmo botão.
          acoes={(
            <>
              {!encerrada && (
                <Button
                  size="sm"
                  onClick={() => abrir('entregar', licenca)}
                  disabled={motivoSemEntrega !== null}
                  title={motivoSemEntrega ?? undefined}
                >
                  <UserPlus /> Entregar
                </Button>
              )}
              {podeGerir && (
                <Button variant="outline" size="sm" onClick={() => abrir('editar', licenca)}><Pencil /> Editar</Button>
              )}
              <AcoesDaLinha
                nome={licenca.name}
                acoes={[
                  podeGerir && {
                    rotulo: encerrada ? 'Reabrir' : 'Encerrar',
                    icone: encerrada ? Power : PowerOff,
                    onClick: () => void handleAlternarEncerrada(licenca),
                    disabled: ocupado,
                  },
                  podeGerir && {
                    rotulo: 'Excluir',
                    icone: Trash2,
                    onClick: () => void handleExcluir(licenca),
                    disabled: ocupado,
                    perigo: true,
                  },
                ]}
              />
            </>
          )}
        />

        {erroDaAtualizacao && <Aviso>Não foi possível atualizar a licença: {erroDaAtualizacao}</Aviso>}

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
          <TabsList>
            {/* `emUso`, e não o total da lista: com a busca do link, ele diria só quantos
                a busca achou, e não com quantos a licença está. */}
            <TabsTrigger value="posse"><Users /> Com quem está <ContagemDaAba>{licenca.emUso}</ContagemDaAba></TabsTrigger>
            {licenca.keys.length > 0 && (
              <TabsTrigger value="chaves"><KeyRound /> Chaves <ContagemDaAba>{licenca.keys.length}</ContagemDaAba></TabsTrigger>
            )}
            <TabsTrigger value="historico"><History /> Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="posse" className="mt-4 space-y-4">
            <ListToolbar
              search={busca}
              onSearchChange={mudarBusca}
              placeholder="Buscar por colaborador ou computador…"
              page={paginaDasEntregas}
              perPage={POR_PAGINA}
              total={entregas.data?.total ?? 0}
              onPageChange={setPaginaDasEntregas}
            />
            <EntregasAbertas
              carregando={entregas.isPending}
              erro={entregas.error?.message ?? null}
              entregas={entregas.data?.rows ?? []}
              chaves={licenca.keys}
              vazio={buscaAdiada ? `Ninguém com "${buscaAdiada}" está com esta licença.` : undefined}
              ocupado={ocupado}
              onDevolver={handleDevolver}
              onTrocarChave={handleTrocarChave}
            />
          </TabsContent>

          {licenca.keys.length > 0 && (
            <TabsContent value="chaves" className="mt-4">
              <ChavesTab chaves={licenca.keys} />
            </TabsContent>
          )}

          <TabsContent value="historico" className="mt-4 space-y-4">
            <HistoricoLicenca
              eventos={historico.data?.rows ?? []}
              carregando={historico.isPending}
              erro={historico.error?.message ?? null}
              pagina={{ page: paginaDoHistorico, total: historico.data?.total ?? 0, onPageChange: setPaginaDoHistorico }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {formulario === 'editar' && licencaAberta && (
        <LicencaFormModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEditar} />
      )}

      {formulario === 'entregar' && licencaAberta && (
        <EntregaLicencaModal licenca={licencaAberta} onClose={fechar} onSubmit={handleEntregar} />
      )}
    </div>
  );
}
