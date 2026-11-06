import type { ComponentProps, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import SugestaoCard from './SugestaoCard';
import { CartaoVazio } from '../../../components/ListaVazia';
import ListToolbar from '../../../components/ListToolbar';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import { comFiltros } from '../../../hooks/useVoltaComFiltros';

// A FILA DE SUGESTÕES: cartões, e não tabela, porque cada um traz a evidência e a
// decisão; a barra e a página são as de toda lista.

type PropsDoCartao = ComponentProps<typeof SugestaoCard>;

interface Props {
  sugestoes: readonly PropsDoCartao['sugestao'][];
  carregando: boolean;
  erro: string | null;
  ocupado: boolean;
  acao: ReactNode;
  onAceitar: PropsDoCartao['onAceitar'];
  onRecusar: PropsDoCartao['onRecusar'];
}

export default function SugestoesLista({ sugestoes, carregando, erro, ocupado, acao, onAceitar, onRecusar }: Props) {
  const lista = useListaLocalNaUrl(sugestoes, (sugestao) => JSON.stringify(sugestao));

  return (
    <>
      <ListToolbar
        search={lista.search}
        onSearchChange={lista.changeSearch}
        placeholder="Buscar por máquina ou ativo…"
        acao={acao}
        page={lista.page}
        perPage={lista.perPage}
        total={lista.total}
        onPageChange={lista.setPage}
      />

      {lista.total === 0 ? (
        <CartaoVazio
          icone={Inbox}
          carregando={carregando}
          erro={erro}
          nome="sugestão"
          genero="f"
          busca={lista.search}
          frase="Nada esperando decisão."
        >
          <span className="text-xs">A varredura roda de hora em hora.</span>
        </CartaoVazio>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.visiveis.map((sugestao) => (
            <SugestaoCard key={sugestao.id} sugestao={sugestao} volta={comFiltros(lista.parametros, '/descobertas').state} ocupado={ocupado} onAceitar={onAceitar} onRecusar={onRecusar} />
          ))}
        </div>
      )}
    </>
  );
}
