import {
  History, Monitor, Pencil, Power, PowerOff, Trash2, UserPlus, Users,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import EntregaModal from '../components/EntregaModal';
import EntregasAbertas from '../components/EntregasAbertas';
import HistoricoItem from '../components/HistoricoItem';
import ItemFormModal from '../components/ItemFormModal';
import { ehComponente, ehConsumivel, motivoParaNaoEntregar } from '../helpers/estoque.helper';
import IdentificacaoDoItem from './components/IdentificacaoDoItem';
import { useFichaDoItem } from './hooks/useFichaDoItem';
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

// A FICHA DO ITEM — `/estoque/:id`: a conta e as ações em cima; nas abas, quem está com
// ele agora e o histórico. É a ficha da licença (`licencas/ficha`), com quantidade (AE).
//
// "COM QUEM ESTÁ" É ONDE A DEVOLUÇÃO ACONTECE — o único lugar: as fichas do posto e do
// colaborador mostram o que está com eles e apontam para cá. No COMPONENTE (AI) a lista
// é "Computadores", e a devolução é o Retirar; a aba Componentes do computador
// aponta para cá do mesmo jeito.
//
// Markup e mais nada: estado e chamadas ficam no `useFichaDoItem`
// (docs/referencia/arquitetura.md).

export default function ItemFichaPage() {
  const { id = '' } = useParams<{ id: string }>();
  // Outro item é outra ficha: busca e página não passam de um para o outro.
  return <FichaDoItem key={id} id={id} />;
}

function FichaDoItem({ id }: { id: string }) {
  const {
    item, carregando, erro, erroDaAtualizacao, voltar, aba, setAba,
    entregas, paginaDasEntregas, setPaginaDasEntregas, busca, buscaAdiada, mudarBusca,
    historico, paginaDoHistorico, setPaginaDoHistorico,
    formulario, itemAberto, abrir, fechar, ocupado,
    handleEditar, handleEntregar, handleDevolver, handleAlternarAtivo, handleExcluir,
  } = useFichaDoItem(id);
  // Desativar e excluir são `SUPERVISOR` no servidor (AV). O Técnico edita, entrega e
  // devolve. Antes do `return` abaixo: hook depois de retorno condicional é o que as
  // regras do React proíbem.
  const podeDecidir = usePode('SUPERVISOR');
  const rotulo = rotuloDaVolta(voltar.para, 'Estoque');

  if (carregando || erro || !item) {
    return <FichaIndisponivel lista="Estoque" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Item não encontrado.'} />;
  }

  const motivoSemEntrega = motivoParaNaoEntregar(item);
  const componente = ehComponente(item);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho voltar={{ ...voltar, rotulo }} titulo={item.name} />

      <div className="space-y-6">
        <IdentificacaoDoItem
          item={item}
          // As ações da lista, com as mesmas regras: o desativado não entrega, e se
          // ativa pelo mesmo botão.
          acoes={(
            <>
              {item.isActive && (
                <Button
                  size="sm"
                  onClick={() => abrir('entregar', item)}
                  disabled={motivoSemEntrega !== null}
                  title={motivoSemEntrega ?? undefined}
                >
                  <UserPlus /> Entregar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => abrir('editar', item)}><Pencil /> Editar</Button>
              <AcoesDaLinha
                nome={item.name}
                acoes={[
                  podeDecidir && {
                    rotulo: item.isActive ? 'Desativar' : 'Ativar',
                    icone: item.isActive ? PowerOff : Power,
                    onClick: () => void handleAlternarAtivo(item),
                    disabled: ocupado,
                  },
                  podeDecidir && {
                    rotulo: 'Excluir',
                    icone: Trash2,
                    onClick: () => void handleExcluir(item),
                    disabled: ocupado,
                    perigo: true,
                  },
                ]}
              />
            </>
          )}
        />

        {erroDaAtualizacao && <Aviso>Não foi possível atualizar o item: {erroDaAtualizacao}</Aviso>}

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
          <TabsList>
            {!ehConsumivel(item) && (
              <TabsTrigger value="responsaveis">
                {componente ? <Monitor /> : <Users />} {componente ? 'Computadores' : 'Responsáveis'}
                {/* Do item, e não da lista: com a busca do link, a lista diz só o que ela achou. */}
                <ContagemDaAba>{item.entregasAbertas}</ContagemDaAba>
              </TabsTrigger>
            )}
            <TabsTrigger value="historico"><History /> Histórico <ContagemDaAba>{historico.data?.total}</ContagemDaAba></TabsTrigger>
          </TabsList>

          {!ehConsumivel(item) && (
            <TabsContent value="responsaveis" className="mt-4 space-y-4">
              <ListToolbar
                search={busca}
                onSearchChange={mudarBusca}
                placeholder={componente ? 'Buscar por etiqueta ou nome do computador…' : 'Buscar por responsável ou posto…'}
                page={paginaDasEntregas}
                perPage={POR_PAGINA}
                total={entregas.data?.total ?? 0}
                onPageChange={setPaginaDasEntregas}
              />
              <EntregasAbertas
                carregando={entregas.isPending}
                erro={entregas.error?.message ?? null}
                entregas={entregas.data?.rows ?? []}
                vazio={
                  componente
                    ? buscaAdiada
                      ? `Nenhum computador com "${buscaAdiada}" tem este componente.`
                      : 'Nenhum computador tem este componente agora.'
                    : buscaAdiada ? `Nenhum responsável com "${buscaAdiada}" neste item.` : undefined
                }
                ocupado={ocupado}
                onDevolver={handleDevolver}
              />
            </TabsContent>
          )}

          <TabsContent value="historico" className="mt-4 space-y-4">
            <HistoricoItem
              eventos={historico.data?.rows ?? []}
              carregando={historico.isPending}
              erro={historico.error?.message ?? null}
              pagina={{ page: paginaDoHistorico, total: historico.data?.total ?? 0, onPageChange: setPaginaDoHistorico }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {formulario === 'editar' && itemAberto && (
        <ItemFormModal item={itemAberto} onClose={fechar} onSubmit={handleEditar} />
      )}

      {formulario === 'entregar' && itemAberto && (
        <EntregaModal item={itemAberto} onClose={fechar} onSubmit={handleEntregar} />
      )}
    </div>
  );
}
