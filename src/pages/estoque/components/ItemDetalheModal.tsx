import { History, Info, Monitor, Pencil, Power, PowerOff, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import HistoricoItem from './HistoricoItem';
import EntregasAbertas from './EntregasAbertas';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import JanelaDeDetalhe from '../../../components/JanelaDeDetalhe';
import { POR_PAGINA } from '../../../hooks/useListaNaUrl';
import ListToolbar from '../../../components/ListToolbar';
import { ContagemDaAba } from '../../../components/ui/tabs';
import { Aviso } from '../../../components/ui/aviso';
import { PontoDeStatus } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Dado, GradeDeDados } from '../../../components/ui/dado';
import {
  useStockCheckoutsQuery, useStockHistoryQuery, useStockItemQuery,
} from '../../../queries/stock.queries';
import type { ItemDeEstoque } from '../../../types/stock.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { classeDaConta, ehComponente, ehConsumivel, motivoParaNaoEntregar, resumoDaContagem } from '../helpers/estoque.helper';

// O DETALHE DO ITEM: a conta e as ações em cima; nas abas, os campos do cadastro,
// quem está com ele agora e o histórico — as duas listas de 15 em 15. É o
// detalhe da licença (`LicencaDetalheModal.tsx`), com quantidade (AE).
//
// "COM QUEM ESTÁ" É ONDE A DEVOLUÇÃO ACONTECE — o único lugar: as fichas do
// posto e do colaborador mostram o que está com eles e apontam para cá. No
// COMPONENTE (AI) a lista é "Em quais computadores", e a devolução é o Retirar;
// a aba Componentes do computador aponta para cá do mesmo jeito.

interface ItemDetalheModalProps {
  item: ItemDeEstoque;
  ocupado: boolean;
  onClose: () => void;
  onEntregar: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  /** Desativar e ativar — o mesmo botão, pelo estado do item. `SUPERVISOR` no servidor (AV); ausente, o botão some. */
  onAlternarAtivo?: (item: ItemDeEstoque) => void;
  /** Excluir é `SUPERVISOR` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (item: ItemDeEstoque) => void;
  /** `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu certo. */
  onDevolver: (entregaId: string, qty: number, checkinAt: string) => Promise<boolean>;
  /** A busca de "Com quem está" já preenchida — o link de uma ficha traz o nome de quem está com ele. */
  buscaInicial?: string;
  /** Chegou por um link, que leva à devolução: abre em "Com quem está". */
  veioDoLink?: boolean;
}

export default function ItemDetalheModal({
  item, ocupado, onClose, onEntregar, onEditar, onAlternarAtivo, onExcluir, onDevolver, buscaInicial = '', veioDoLink = false,
}: ItemDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz a conta fresca logo em seguida.
  const { data: detalhe, error: erroDoDetalhe } = useStockItemQuery(item.id);

  const [paginaDasEntregas, setPaginaDasEntregas] = useState(1);
  const [busca, setBusca] = useState(buscaInicial);
  const buscaAdiada = useDebouncedValue(busca);
  // O consumível (AJ) não fica com ninguém: nem busca "Com quem está".
  const entregas = useStockCheckoutsQuery(ehConsumivel(item) ? null : item.id, {
    page: paginaDasEntregas, perPage: POR_PAGINA, q: buscaAdiada || undefined,
  });

  const [paginaDoHistorico, setPaginaDoHistorico] = useState(1);
  const historico = useStockHistoryQuery(item.id, { page: paginaDoHistorico, perPage: POR_PAGINA });

  const atual = detalhe ?? item;
  const motivoSemEntrega = motivoParaNaoEntregar(atual);
  const componente = ehComponente(atual);
  // O consumível (AJ) não fica com ninguém: a entrega tira do total, e o
  // histórico é o único lugar onde ela aparece.
  const consumivel = ehConsumivel(atual);

  const mudarBusca = (valor: string) => {
    setBusca(valor);
    setPaginaDasEntregas(1);
  };

  // A página que deixou de existir volta para a última — a entrega voltou
  // inteira, aqui ou por outra pessoa —, senão a lista abre vazia dizendo que
  // ninguém está com o item. Ajuste DURANTE o render, guardado pela condição,
  // como na lista.
  const ultimaPaginaDasEntregas = entregas.data
    ? Math.max(1, Math.ceil(entregas.data.total / POR_PAGINA))
    : paginaDasEntregas;
  if (paginaDasEntregas > ultimaPaginaDasEntregas) setPaginaDasEntregas(ultimaPaginaDasEntregas);

  const totalDoHistorico = historico.data?.total ?? 0;

  const dados = (
    <>
      {erroDoDetalhe && <Aviso>Não foi possível atualizar o item: {erroDoDetalhe.message}</Aviso>}
      <GradeDeDados>
        <Dado rotulo="Categoria">{atual.category.name}</Dado>
        <Dado rotulo="Localização">{atual.location?.name}</Dado>
        <Dado rotulo="Notas" largo>{atual.notes}</Dado>
      </GradeDeDados>
    </>
  );

  const comQuemEsta = (
    <>
      <ListToolbar
        search={busca}
        onSearchChange={mudarBusca}
        placeholder={componente ? 'Buscar por etiqueta ou nome do computador…' : 'Buscar por colaborador ou posto…'}
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
            : buscaAdiada ? `Ninguém com "${buscaAdiada}" está com este item.` : undefined
        }
        ocupado={ocupado}
        onDevolver={onDevolver}
      />
    </>
  );

  const historicoDoItem = (
    <>
      {/* O paginador só quando há mais de uma página: com três eventos, "1–3 de 3"
          é ruído. */}
      {totalDoHistorico > POR_PAGINA && (
        <ListToolbar
          page={paginaDoHistorico}
          perPage={POR_PAGINA}
          total={totalDoHistorico}
          onPageChange={setPaginaDoHistorico}
        />
      )}
      <HistoricoItem eventos={historico.data?.rows ?? []} carregando={historico.isPending} erro={historico.error?.message ?? null} />
    </>
  );

  return (
    <JanelaDeDetalhe
      titulo={atual.name}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <PontoDeStatus tom={atual.isActive ? 'sucesso' : 'aviso'}>{atual.isActive ? 'Ativo' : 'Desativado'}</PontoDeStatus>
          <span className={atual.disponivel < 0 ? classeDaConta(atual) : ''}>{resumoDaContagem(atual)}</span>
        </span>
      }
      // As ações da lista, com as mesmas regras: o desativado não entrega, e se
      // ativa pelo mesmo botão.
      acoes={
        <>
          {atual.isActive && (
            <Button
              size="sm"
              onClick={() => onEntregar(atual)}
              disabled={motivoSemEntrega !== null}
              title={motivoSemEntrega ?? undefined}
            >
              <UserPlus /> Entregar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onEditar(atual)}><Pencil /> Editar</Button>
          <AcoesDaLinha
            nome={atual.name}
            acoes={[
              onAlternarAtivo && {
                rotulo: atual.isActive ? 'Desativar' : 'Ativar',
                icone: atual.isActive ? PowerOff : Power,
                onClick: () => onAlternarAtivo(atual),
                disabled: ocupado,
              },
              onExcluir && {
                rotulo: 'Excluir',
                icone: Trash2,
                onClick: () => onExcluir(atual),
                disabled: ocupado,
                perigo: true,
              },
            ]}
          />
        </>
      }
      // Quem chega por um link vem atrás de quem está com ele.
      abaInicial={veioDoLink && !consumivel ? 'posse' : 'dados'}
      abas={[
        { id: 'dados', rotulo: <><Info /> Detalhes</>, conteudo: dados },
        ...(consumivel ? [] : [{
          id: 'posse',
          // Sem o número durante a busca: ele conta a lista filtrada, não as entregas do item.
          rotulo: (
            <>
              {componente ? <Monitor /> : <Users />} {componente ? 'Em quais computadores' : 'Com quem está'}
              {!buscaAdiada && <ContagemDaAba>{entregas.data?.total}</ContagemDaAba>}
            </>
          ),
          conteudo: comQuemEsta,
        }]),
        { id: 'historico', rotulo: <><History /> Histórico</>, conteudo: historicoDoItem },
      ]}
      onClose={onClose}
    />
  );
}
